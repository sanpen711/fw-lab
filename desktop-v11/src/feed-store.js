import {authStore} from './auth-store.js';

const listeners=new Set();
const client=authStore.client;
const state={loaded:false,loading:false,busy:false,error:'',posts:[],profiles:{},openPostId:'',reply:null};
let squareChannel=null;
let refreshTimer=null;
let active=false;

function snapshot(){return {...state,posts:state.posts.map(post=>({...post,comments:[...(post.comments||[])],reactions:[...(post.reactions||[])]})),profiles:{...state.profiles},reply:state.reply&&{...state.reply}};}
function emit(){const next=snapshot();listeners.forEach(listener=>listener(next));}
function fail(result,label){if(result?.error)throw new Error(`${label}：${result.error.message}`);return result?.data;}
function countContent(){if(window.__FW_DESKTOP_V11__)window.__FW_DESKTOP_V11__.contentRequests=(window.__FW_DESKTOP_V11__.contentRequests||0)+1;}
function user(){const current=authStore.state.user;return current&&!current.cached?current:null;}
function requireUser(){const current=user();if(!current)throw new Error('请先登录。');if(current.disabled)throw new Error('这个账号已被停用。');return current;}
function unique(values){return Array.from(new Set((values||[]).filter(Boolean).map(String)));}
function encodeMarker(kind,url){return `[[${kind}:${btoa(String(url||''))}]]`;}
function composeContent(text,{imageUrl='',stickerUrls=[]}={}){
  const parts=[];const clean=String(text||'').trim();if(clean)parts.push(clean);
  (stickerUrls||[]).slice(0,6).forEach(url=>{if(url)parts.push(encodeMarker('FW_USER_STICKER',url));});
  if(imageUrl)parts.push(encodeMarker('FW_MEDIA_IMAGE',imageUrl));
  return parts.join('\n').trim();
}

async function fetchProfiles(ids){
  const missing=unique(ids).filter(id=>!state.profiles[id]);if(!missing.length)return state.profiles;
  countContent();const rows=fail(await client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id',missing),'读取研究员资料失败')||[];
  const profiles={...state.profiles};rows.forEach(row=>{profiles[String(row.id)]=row;});state.profiles=profiles;return profiles;
}

async function readComments(postIds){
  if(!postIds.length)return[];
  countContent();let result=await client.from('comments').select('id,post_id,user_id,parent_comment_id,reply_to_comment_id,reply_to_user_id,content,created_at').in('post_id',postIds).or('is_deleted.eq.false,is_deleted.is.null').order('created_at',{ascending:true});
  if(result.error&&/reply_to_comment_id|reply_to_user_id|schema cache|column/i.test(String(result.error.message||''))){
    result=await client.from('comments').select('id,post_id,user_id,parent_comment_id,content,created_at').in('post_id',postIds).or('is_deleted.eq.false,is_deleted.is.null').order('created_at',{ascending:true});
  }
  return fail(result,'读取评论失败')||[];
}

async function load(force=false){
  if(state.loading||(!force&&state.loaded))return state.posts;
  state.loading=true;state.error='';emit();
  try{
    countContent();const posts=fail(await client.from('posts').select('id,user_id,content,status_tag,created_at').or('is_deleted.eq.false,is_deleted.is.null').order('created_at',{ascending:false}).limit(100),'读取精神广场失败')||[];
    const ids=posts.map(post=>post.id);
    const [comments,reactionResult]=await Promise.all([
      readComments(ids),
      ids.length?(countContent(),client.from('reactions').select('id,post_id,user_id,type,created_at').in('post_id',ids)):Promise.resolve({data:[],error:null})
    ]);
    const reactions=fail(reactionResult,'读取互动失败')||[];
    await fetchProfiles(posts.map(post=>post.user_id).concat(comments.map(comment=>comment.user_id)));
    const commentsByPost={};comments.forEach(comment=>(commentsByPost[String(comment.post_id)]??=[]).push(comment));
    const reactionsByPost={};reactions.forEach(reaction=>(reactionsByPost[String(reaction.post_id)]??=[]).push(reaction));
    state.posts=posts.map(post=>({...post,comments:commentsByPost[String(post.id)]||[],reactions:reactionsByPost[String(post.id)]||[]}));
    state.loaded=true;state.loading=false;emit();return state.posts;
  }catch(error){state.loading=false;state.loaded=true;state.error=error.message||'精神广场读取失败。';emit();throw error;}
}

function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(active)load(true).catch(()=>{});},220);}
function activate(){
  active=true;if(squareChannel)return load();
  squareChannel=client.channel('desktop-v11-square')
    .on('postgres_changes',{event:'*',schema:'public',table:'posts'},scheduleRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'comments'},scheduleRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'reactions'},scheduleRefresh)
    .subscribe();
  return load();
}
function deactivate(){active=false;clearTimeout(refreshTimer);if(squareChannel){client.removeChannel(squareChannel);squareChannel=null;}}

function openPost(postId){state.openPostId=String(postId||'');state.reply=null;emit();}
function closePost(){state.openPostId='';state.reply=null;emit();}
function setReply(comment){state.reply=comment?{postId:String(comment.post_id),targetCommentId:String(comment.id),rootCommentId:String(comment.parent_comment_id||comment.id),targetUserId:String(comment.user_id),name:state.profiles[String(comment.user_id)]?.nickname||'匿名回声'}:null;emit();}
function clearReply(){state.reply=null;emit();}

async function compressImage(file){
  if(!file||!/^image\//i.test(file.type||''))throw new Error('请选择图片文件。');
  const gif=/gif/i.test(file.type||'')||/\.gif$/i.test(file.name||'');if(gif){if(file.size>3*1024*1024)throw new Error('GIF 不能超过 3MB。');return file;}
  if(file.size<=800*1024)return file;
  const localUrl=URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{const node=new Image();node.onload=()=>resolve(node);node.onerror=()=>reject(new Error('图片读取失败。'));node.src=localUrl;});
    const scale=Math.min(1,1280/Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((image.naturalWidth||image.width)*scale));canvas.height=Math.max(1,Math.round((image.naturalHeight||image.height)*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!blob)return file;
    return new File([blob],String(file.name||'image').replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
  }finally{URL.revokeObjectURL(localUrl);}
}

async function uploadImage(file,kind='post'){
  if(!file?.size)return'';const current=requireUser();const upload=await compressImage(file);
  const ext=(upload.name?.match(/\.([a-z0-9]+)$/i)?.[1]||'jpg').toLowerCase();const path=`${current.id}/${kind}/image/${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}.${ext}`;
  const result=await client.storage.from('chat-media').upload(path,upload,{upsert:false,cacheControl:'31536000',contentType:upload.type||'image/jpeg'});if(result.error)throw new Error(`图片上传失败：${result.error.message}`);
  const url=client.storage.from('chat-media').getPublicUrl(path).data.publicUrl;if(!url)throw new Error('图片地址生成失败。');return url;
}

async function createPost({text,status='今日无效',imageFile=null,stickerUrls=[]}){
  const current=requireUser();if(state.busy)throw new Error('正在处理，请稍候。');state.busy=true;emit();
  try{
    const imageUrl=imageFile?.size?await uploadImage(imageFile,'post'):'';const content=composeContent(text,{imageUrl,stickerUrls});
    if(!content)throw new Error('先写点什么或添加图片、表情。');if(content.length>500)throw new Error('文字和媒体标记合计不能超过 500 字，请减少内容或表情。');
    const saved=fail(await client.from('posts').insert({user_id:current.id,content,status_tag:status||'今日无效',is_deleted:false}).select('id').single(),'发布失败');
    await load(true);return saved;
  }finally{state.busy=false;emit();}
}

async function createComment({postId,text,imageFile=null,stickerUrls=[]}){
  const current=requireUser();const post=state.posts.find(row=>String(row.id)===String(postId));if(!post)throw new Error('帖子已经不存在。');
  if(state.busy)throw new Error('正在处理，请稍候。');state.busy=true;emit();
  try{
    const imageUrl=imageFile?.size?await uploadImage(imageFile,'comment'):'';let content=composeContent(text,{imageUrl,stickerUrls});
    if(!content)throw new Error('先写点回复内容或添加图片、表情。');if(content.length>300)throw new Error('评论和媒体标记合计不能超过 300 字。');
    const reply=state.reply&&String(state.reply.postId)===String(postId)?state.reply:null;
    const row={post_id:post.id,user_id:current.id,content,is_deleted:false};
    if(reply){row.parent_comment_id=Number(reply.rootCommentId);row.reply_to_comment_id=Number(reply.targetCommentId);row.reply_to_user_id=reply.targetUserId;}
    let result=await client.from('comments').insert(row).select('id').single();
    if(result.error&&reply&&/reply_to_comment_id|schema cache|column/i.test(String(result.error.message||''))){delete row.reply_to_comment_id;result=await client.from('comments').insert(row).select('id').single();}
    const saved=fail(result,'评论失败');state.reply=null;
    const recipient=reply?.targetUserId||post.user_id;if(recipient&&String(recipient)!==String(current.id))client.from('notifications').insert({user_id:recipient,actor_id:current.id,type:reply?'comment_reply':'comment',target_type:reply?'comment':'post',target_id:reply?saved.id:post.id,content:`${reply?'回复了你的评论':'评论了你的帖子'}：${String(text||'图片或表情').replace(/\s+/g,' ').slice(0,80)}`,is_read:false}).then(()=>{}).catch(()=>{});
    await load(true);return saved;
  }finally{state.busy=false;emit();}
}

async function toggleReaction(postId,type){
  const current=requireUser();const allowed=['like','same','tissue'];if(!allowed.includes(type))throw new Error('未知互动类型。');
  const post=state.posts.find(row=>String(row.id)===String(postId));if(!post)throw new Error('帖子已经不存在。');
  const existing=(post.reactions||[]).find(row=>String(row.user_id)===String(current.id)&&row.type===type);
  if(existing)fail(await client.from('reactions').delete().eq('id',existing.id).eq('user_id',current.id),'撤回互动失败');
  else fail(await client.from('reactions').insert({post_id:post.id,user_id:current.id,type}),'互动失败');
  await load(true);return !existing;
}

async function deletePost(postId){requireUser();fail(await client.rpc('fw_delete_own_post',{p_post_id:Number(postId)}),'删除帖子失败');if(String(state.openPostId)===String(postId))state.openPostId='';await load(true);}
async function deleteComment(commentId){requireUser();fail(await client.rpc('fw_delete_own_comment',{p_comment_id:Number(commentId)}),'删除评论失败');await load(true);}
async function report(targetType,targetId,reason){requireUser();const text=String(reason||'').trim();if(text.length<2)throw new Error('请至少写 2 个字的举报原因。');fail(await client.rpc('fw_submit_report',{p_target_type:targetType,p_target_id:String(targetId),p_reason:text}),'提交举报失败');}

authStore.subscribe(auth=>{if(!auth.ready)return;if(!auth.user){deactivate();state.loaded=false;state.posts=[];state.profiles={};state.openPostId='';state.reply=null;emit();}});

export const feedStore={state,activate,deactivate,load,openPost,closePost,setReply,clearReply,createPost,createComment,toggleReaction,deletePost,deleteComment,report,uploadImage,composeContent,subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}};
