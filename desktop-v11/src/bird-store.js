import {authStore} from './auth-store.js';

const client=authStore.client;
const listeners=new Set();
const state={loaded:false,loading:false,busy:false,error:'',posts:[],profiles:{},openPostId:''};
let channel=null;
let active=false;
let refreshTimer=null;

function snapshot(){return {...state,posts:state.posts.map(post=>({...post,images:[...(post.images||[])],comments:[...(post.comments||[])],reactions:[...(post.reactions||[])]})),profiles:{...state.profiles}};}
function emit(){const next=snapshot();listeners.forEach(listener=>listener(next));}
function fail(result,label){if(result?.error)throw new Error(`${label}：${result.error.message}`);return result?.data;}
function count(){if(window.__FW_DESKTOP_V11__)window.__FW_DESKTOP_V11__.contentRequests=(window.__FW_DESKTOP_V11__.contentRequests||0)+1;}
function currentUser(){const user=authStore.state.user;return user&&!user.cached?user:null;}
function requireUser(){const user=currentUser();if(!user)throw new Error('请先登录。');if(user.disabled)throw new Error('这个账号已被停用。');return user;}

async function load(force=false){
  if(state.loading||(!force&&state.loaded))return state.posts;state.loading=true;state.error='';emit();
  try{
    count();const posts=fail(await client.from('bird_posts').select('id,user_id,title,content,display_mode,pen_name,images,created_at,updated_at').or('is_deleted.eq.false,is_deleted.is.null').order('created_at',{ascending:false}).limit(100),'读取观鸟台失败')||[];const ids=posts.map(post=>post.id);
    let comments=[];let reactions=[];if(ids.length){count();comments=fail(await client.from('bird_comments').select('id,post_id,user_id,content,created_at').in('post_id',ids).or('is_deleted.eq.false,is_deleted.is.null').order('created_at',{ascending:true}),'读取观鸟评论失败')||[];count();const result=await client.from('bird_reactions').select('id,post_id,user_id,type,created_at').in('post_id',ids);reactions=result.error?[]:(result.data||[]);}
    const profileIds=Array.from(new Set(posts.filter(post=>post.display_mode==='profile').map(post=>post.user_id).concat(comments.map(comment=>comment.user_id)).filter(Boolean)));if(profileIds.length){count();const rows=fail(await client.from('profiles').select('id,nickname,avatar_url').in('id',profileIds),'读取观察员资料失败')||[];const map={...state.profiles};rows.forEach(row=>{map[String(row.id)]=row;});state.profiles=map;}
    const commentMap={};comments.forEach(row=>(commentMap[String(row.post_id)]??=[]).push(row));const reactionMap={};reactions.forEach(row=>(reactionMap[String(row.post_id)]??=[]).push(row));state.posts=posts.map(row=>({...row,images:Array.isArray(row.images)?row.images.filter(image=>image?.url):[],comments:commentMap[String(row.id)]||[],reactions:reactionMap[String(row.id)]||[]}));state.loaded=true;state.loading=false;emit();return state.posts;
  }catch(error){state.loaded=true;state.loading=false;state.error=error.message||'观鸟台读取失败。';emit();throw error;}
}

function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(active)load(true).catch(()=>{});},230);}
function activate(){active=true;if(!channel){channel=client.channel('desktop-v11-bird').on('postgres_changes',{event:'*',schema:'public',table:'bird_posts'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'bird_comments'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'bird_reactions'},schedule).subscribe();}return load();}
function deactivate(){active=false;clearTimeout(refreshTimer);if(channel){client.removeChannel(channel);channel=null;}}
function openPost(id){state.openPostId=String(id||'');emit();}
function closePost(){state.openPostId='';emit();}

async function compress(file){
  if(!file||!/^image\//i.test(file.type||''))throw new Error('请选择图片文件。');const url=URL.createObjectURL(file);
  try{const image=await new Promise((resolve,reject)=>{const node=new Image();node.onload=()=>resolve(node);node.onerror=()=>reject(new Error('图片读取失败。'));node.src=url;});const width=image.naturalWidth||image.width;const height=image.naturalHeight||image.height;const scale=Math.min(1,1280/Math.max(width,height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext('2d',{alpha:true});context.drawImage(image,0,0,canvas.width,canvas.height);let quality=.84;let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));while(blob&&blob.size>800*1024&&quality>.42){quality=Math.max(.42,quality-.08);blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));}if(!blob||blob.size>800*1024)throw new Error('图片压缩后仍超过 800KB，请换一张。');return{file:new File([blob],`fw_bird_${Date.now().toString(36)}.webp`,{type:'image/webp'}),width:canvas.width,height:canvas.height,ext:'webp'};}finally{URL.revokeObjectURL(url);}
}
async function uploadImages(files,userId){const images=[];for(const file of files){const prepared=await compress(file);const path=`${userId}/bird/image/${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}.${prepared.ext}`;const uploaded=await client.storage.from('chat-media').upload(path,prepared.file,{upsert:false,cacheControl:'3600',contentType:prepared.file.type});if(uploaded.error)throw new Error(`图片上传失败：${uploaded.error.message}`);const url=client.storage.from('chat-media').getPublicUrl(path).data.publicUrl;images.push({url,path,width:prepared.width,height:prepared.height});}return images;}
async function mutate(action){requireUser();if(state.busy)throw new Error('正在处理，请稍候。');state.busy=true;emit();try{const result=await action();await load(true);return result;}finally{state.busy=false;emit();}}
async function createPost({title,content,displayMode='profile',penName='',files=[]}){const user=requireUser();const cleanTitle=String(title||'').trim();const cleanContent=String(content||'').trim();const mode=['profile','anonymous','pen_name'].includes(displayMode)?displayMode:'profile';const alias=String(penName||'').trim();if(cleanTitle.length<2||cleanTitle.length>80)throw new Error('品种名需要 2–80 个字。');if(!cleanContent||cleanContent.length>5000)throw new Error('观察记录需要 1–5000 个字。');if(mode==='pen_name'&&(alias.length<2||alias.length>20))throw new Error('临时笔名需要 2–20 个字。');if(files.length>20)throw new Error('最多上传 20 张图片。');return mutate(async()=>{const images=await uploadImages(files,user.id);return fail(await client.from('bird_posts').insert({user_id:user.id,title:cleanTitle,content:cleanContent,display_mode:mode,pen_name:mode==='pen_name'?alias:null,images,is_deleted:false}).select('id').single(),'发布观察记录失败');});}
async function createComment(postId,content){const user=requireUser();const text=String(content||'').trim();if(!text||text.length>500)throw new Error('评论需要 1–500 个字。');return mutate(()=>client.from('bird_comments').insert({post_id:Number(postId),user_id:user.id,content:text,is_deleted:false}).select('id').single().then(result=>fail(result,'评论失败')));}
async function react(postId,type){const user=requireUser();if(!['valid','seen','tissue'].includes(type))throw new Error('未知互动类型。');const post=state.posts.find(row=>String(row.id)===String(postId));if(post?.reactions.some(row=>String(row.user_id)===String(user.id)&&row.type===type))throw new Error('你已经标记过这个品种了。');return mutate(()=>client.from('bird_reactions').insert({post_id:Number(postId),user_id:user.id,type}).select('id').single().then(result=>fail(result,'互动失败')));}
async function deletePost(id){return mutate(()=>client.rpc('fw_delete_own_bird_post',{p_post_id:Number(id)}).then(result=>{const data=fail(result,'删除观察记录失败');if(String(state.openPostId)===String(id))state.openPostId='';return data;}));}
async function deleteComment(id){return mutate(()=>client.rpc('fw_delete_own_bird_comment',{p_comment_id:Number(id)}).then(result=>fail(result,'删除评论失败')));}

authStore.subscribe(auth=>{if(!auth.ready)return;if(!auth.user){deactivate();state.loaded=false;state.posts=[];state.profiles={};state.openPostId='';emit();}else if(active)load(true).catch(()=>{});});
export const birdStore={state,activate,deactivate,load,openPost,closePost,createPost,createComment,react,deletePost,deleteComment,subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}};
