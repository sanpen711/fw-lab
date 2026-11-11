import {authStore} from './auth-store.js';
import {socialStore} from './social-store.js';

const client=authStore.client;

export function fileKind(file){
  const type=String(file?.type||'').toLowerCase();const name=String(file?.name||'').toLowerCase();
  if(type.startsWith('image/')||/\.(jpe?g|png|webp|gif)$/i.test(name))return'image';
  if(type.startsWith('video/')||/\.(mp4|mov|webm|m4v)$/i.test(name))return'video';
  return'';
}
function isGif(file){return /gif/i.test(String(file?.type||''))||/\.gif$/i.test(String(file?.name||''));}
function extension(file,fallback='bin'){
  const match=String(file?.name||'').match(/\.([a-z0-9]+)$/i);if(match)return match[1].toLowerCase()==='jpeg'?'jpg':match[1].toLowerCase();
  const type=String(file?.type||'').toLowerCase();if(type.includes('jpeg'))return'jpg';if(type.includes('png'))return'png';if(type.includes('webp'))return'webp';if(type.includes('gif'))return'gif';if(type.includes('mp4'))return'mp4';if(type.includes('quicktime'))return'mov';if(type.includes('webm'))return'webm';return fallback;
}
async function videoDuration(file){
  const url=URL.createObjectURL(file);
  try{return await new Promise((resolve,reject)=>{const video=document.createElement('video');const timer=setTimeout(()=>reject(new Error('视频读取超时，请换一个视频。')),10000);video.preload='metadata';video.onloadedmetadata=()=>{clearTimeout(timer);resolve(Number(video.duration||0));};video.onerror=()=>{clearTimeout(timer);reject(new Error('视频读取失败，请换一个视频。'));};video.src=url;});}
  finally{URL.revokeObjectURL(url);}
}
async function prepareImage(file){
  if(isGif(file)){if(file.size>3*1024*1024)throw new Error('GIF 不能超过 3MB。');return{file,kind:'image',ext:'gif'};}
  if(file.size<=800*1024)return{file,kind:'image',ext:extension(file,'jpg')};
  const url=URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{const node=new Image();node.onload=()=>resolve(node);node.onerror=()=>reject(new Error('图片读取失败，请换一张图片。'));node.src=url;});
    const width=image.naturalWidth||image.width;const height=image.naturalHeight||image.height;const scale=Math.min(1,1280/Math.max(width,height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext('2d',{alpha:true});if(!context)throw new Error('当前环境无法处理这张图片。');context.drawImage(image,0,0,canvas.width,canvas.height);
    let quality=.84;let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
    while(blob&&blob.size>800*1024&&quality>.42){quality=Math.max(.42,quality-.08);blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));}
    if(!blob||blob.size>800*1024)throw new Error('图片压缩后仍超过 800KB，请换一张图片。');
    return{file:new File([blob],`fw_media_${Date.now().toString(36)}.webp`,{type:'image/webp'}),kind:'image',ext:'webp'};
  }finally{URL.revokeObjectURL(url);}
}
async function prepareMedia(file){
  const kind=fileKind(file);if(!kind)throw new Error('只支持图片、GIF 或视频。');if(kind==='image')return prepareImage(file);
  if(file.size>20*1024*1024)throw new Error('视频不能超过 20MB。');const duration=await videoDuration(file);if(duration>31)throw new Error('视频请控制在 30 秒以内。');return{file,kind:'video',ext:extension(file,'mp4')};
}
async function uploadMedia(file,userId){
  const prepared=await prepareMedia(file);const path=`${userId}/private/${prepared.kind}/${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}.${prepared.ext}`;
  const uploaded=await client.storage.from('chat-media').upload(path,prepared.file,{upsert:false,cacheControl:'31536000',contentType:prepared.file.type||undefined});
  if(uploaded.error)throw new Error(`媒体上传失败：${uploaded.error.message}`);const url=client.storage.from('chat-media').getPublicUrl(path).data.publicUrl;if(!url)throw new Error('媒体地址生成失败。');return{url,kind:prepared.kind,path};
}

export async function sendPrivateMedia(file,userId,targetId){
  if(!userId||authStore.state.user?.cached)throw new Error('请先登录。');
  const media=await uploadMedia(file,userId);
  if(authStore.state.user?.id!==userId||socialStore.state.chat.targetId!==targetId){
    if(authStore.state.user?.id===userId)client.storage.from('chat-media').remove([media.path]).catch(()=>{});
    throw new Error('会话已切换，请回到原会话发送。');
  }
  const marker=media.kind==='video'?'FW_MEDIA_VIDEO':'FW_MEDIA_IMAGE';
  return socialStore.sendMessage(`[[${marker}:${btoa(media.url)}]]`);
}
