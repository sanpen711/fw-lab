export const POST_TEXT_LIMIT=300;
export const COMMENT_TEXT_LIMIT=300;
export const IMAGE_LIMIT=4;
export const MEDIA_ACCEPT='image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.mp4,.mov,.webm,.m4v';

export function mediaKind(file){
  const type=String(file?.type||'').toLowerCase(),name=String(file?.name||'');
  if(/\.(heic|heif|livp)$/i.test(name)||/image\/hei[cf]/.test(type))return'';
  if(/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(type)||/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(name))return'image';
  if(type.startsWith('video/')||/\.(mp4|mov|webm|m4v)$/i.test(name))return'video';
  return'';
}
export function webMediaUrl(value){try{const url=new URL(String(value||''));return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return'';}}
export function validateAttachments(items=[]){
  if(!Array.isArray(items))throw new Error('媒体列表无效。');
  const videos=items.filter(item=>item.kind==='video');
  if(videos.length>1)throw new Error('每次最多发送 1 个视频。');
  if(videos.length&&items.length>1)throw new Error('视频请单独发送，不能与图片或“我的表情”混发。');
  if(!videos.length&&items.length>IMAGE_LIMIT)throw new Error('图片、GIF 和“我的表情”合计最多 4 张。');
  for(const item of items){
    if(!['image','video','sticker'].includes(item.kind))throw new Error('只支持图片、GIF 或视频。实况照片请先存储为视频；HEIC 请转换为 JPG。');
    if(item.file){
      if(mediaKind(item.file)!==item.kind||!item.file.size)throw new Error('文件格式无效。实况照片请先存储为视频；HEIC 请转换为 JPG。');
      if(item.kind==='video'&&item.file.size>20*1024*1024)throw new Error('视频不能超过 20MB。');
      if(item.kind==='image'&&(/gif/i.test(item.file.type||'')||/\.gif$/i.test(item.file.name||''))&&item.file.size>3*1024*1024)throw new Error('GIF 不能超过 3MB。');
    }else if(!webMediaUrl(item.url))throw new Error('媒体地址无效，请重新选择。');
  }
  return items;
}
const markerKinds={image:'FW_MEDIA_IMAGE',sticker:'FW_USER_STICKER',video:'FW_MEDIA_VIDEO'};
export function composeContent(text,{attachments,imageUrl='',mediaUrl='',mediaKind='',stickerUrls=[]}={}){
  const items=attachments??[...stickerUrls.filter(Boolean).map(url=>({kind:'sticker',url})),...(mediaUrl||imageUrl?[{kind:mediaKind==='video'?'video':'image',url:mediaUrl||imageUrl}]:[])];
  validateAttachments(items);
  return [String(text||'').trim(),...items.map(item=>`[[${markerKinds[item.kind]}:${btoa(webMediaUrl(item.url))}]]`)].filter(Boolean).join('\n');
}
export function parseContent(value){
  const source=String(value||''),pattern=/\[\[(FW_MEDIA_IMAGE|FW_USER_STICKER|FW_MEDIA_VIDEO):([A-Za-z0-9+/=]+)\]\]/g;
  let cursor=0,match;const text=[],media=[];
  while((match=pattern.exec(source))){
    text.push(source.slice(cursor,match.index));let url='';try{url=webMediaUrl(atob(match[2]));}catch{}
    if(url)media.push({kind:match[1]==='FW_USER_STICKER'?'sticker':match[1]==='FW_MEDIA_VIDEO'?'video':'image',url});
    cursor=match.index+match[0].length;
  }
  text.push(source.slice(cursor));return{text:text.join('').trim(),media};
}
