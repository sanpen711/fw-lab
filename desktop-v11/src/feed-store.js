import {authStore} from './auth-store.js';
import {desktopCache} from './desktop-persistent-cache.js';

const listeners=new Set();
const client=authStore.client;
const state={loaded:false,loading:false,busy:false,error:'',posts:[],profiles:{},openPostId:'',reply:null};
const SQUARE_CACHE_FRESH_MS=60*1000;
const POST_TEXT_LIMIT=500;
const COMMENT_TEXT_LIMIT=180;
const STORED_CONTENT_LIMIT=4000;
let squareChannel=null;
let refreshTimer=null;
let active=false;
let hydratedCacheKey='';
let lastSyncedAt=0;
let loadPromise=null;
let profileRefreshPromise=null;
let refreshQueued=false;
let lastAuthUserId='';
let profileGeneration=0;

function snapshot(){return {...state,posts:state.posts.map(post=>({...post,comments:[...(post.comments||[])],reactions:[...(post.reactions||[])]})),profiles:{...state.profiles},reply:state.reply&&{...state.reply}};}
function emit(scope='all'){const next=snapshot();listeners.forEach(listener=>listener(next,scope));}
function fail(result,label){if(result?.error)throw new Error(`${label}：${result.error.message}`);return result?.data;}
function countContent(){if(window.__FW_DESKTOP_V11__)window.__FW_DESKTOP_V11__.contentRequests=(window.__FW_DESKTOP_V11__.contentRequests||0)+1;}
function user(){const current=authStore.state.user;return current&&!current.cached?current:null;}
function requireUser(){const current=user();if(!current)throw new Error('请先登录。');if(current.disabled)throw new Error('这个账号已被停用。');return current;}
function unique(values){return Array.from(new Set((values||[]).filter(Boolean).map(String)));}
function encodeMarker(kind,url){return `[[${kind}:${btoa(String(url||''))}]]`;}
function composeContent(text,{imageUrl='',mediaUrl='',mediaKind='',stickerUrls=[]}={}){
  const parts=[];const clean=String(text||'').trim();if(clean)parts.push(clean);
  (stickerUrls||[]).slice(0,1).forEach(url=>{if(url)parts.push(encodeMarker('FW_USER_STICKER',url));});
  const url=mediaUrl||imageUrl;if(url)parts.push(encodeMarker(mediaKind==='video'?'FW_MEDIA_VIDEO':'FW_MEDIA_IMAGE',url));
  return parts.join('\n').trim();
}
function checkedText(value,limit,label){const text=String(value||'').trim();if(text.length>limit)throw new Error(`${label}最多 ${limit} 字。`);return text;}
// 缓存可以使用启动时从本机恢复的账号；只有发帖等写操作才必须等待联网确认。
// 之前复用了 user()，会把 cached:true 的本机账号误判成 public，导致重启后读错缓存键。
function squareCacheUser(){return authStore.state.user?.id||'public';}
function isSquareFresh(){return lastSyncedAt>0&&Date.now()-lastSyncedAt<SQUARE_CACHE_FRESH_MS;}
function contentSignature(posts,profiles){try{return JSON.stringify([posts,profiles]);}catch{return'';}}
function validSquareCache(cached){return cached?.payload&&Array.isArray(cached.payload.posts);}
async function readSquareCache(cacheUser){
  const primary=await desktopCache.read('square',cacheUser);if(validSquareCache(primary))return primary;
  // 1.1.20 在账号联网确认前可能把同一份公开广场内容写入 public，升级后兼容读取一次。
  if(cacheUser!=='public'){const fallback=await desktopCache.read('square','public');if(validSquareCache(fallback))return fallback;}
  return null;
}
async function hydrateSquareCache(){
  const cacheUser=squareCacheUser();if(hydratedCacheKey===cacheUser)return false;hydratedCacheKey=cacheUser;lastSyncedAt=0;
  const cached=await readSquareCache(cacheUser);const payload=cached?.payload;if(!payload)return false;
  state.posts=payload.posts.slice(0,100);state.profiles=payload.profiles&&typeof payload.profiles==='object'?payload.profiles:{};state.loaded=true;state.loading=false;state.error='';lastSyncedAt=Number(cached.savedAt||0);emit();return true;
}
function persistSquareCache(){
  const cacheUser=squareCacheUser();return desktopCache.write('square',cacheUser,{posts:state.posts.slice(0,100),profiles:state.profiles});
}

async function fetchProfiles(ids,refresh=false){
  const generation=profileGeneration;const requested=unique(ids);const wanted=refresh?requested:requested.filter(id=>!state.profiles[id]);if(!wanted.length)return state.profiles;
  countContent();const rows=fail(await client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id',wanted),'读取研究员资料失败')||[];
  if(generation!==profileGeneration)return state.profiles;
  const profiles={...state.profiles};rows.forEach(row=>{profiles[String(row.id)]=row;});state.profiles=profiles;return profiles;
}

function visibleProfileIds(){return unique(state.posts.flatMap(post=>[post.user_id,...(post.comments||[]).flatMap(comment=>[comment.user_id,comment.reply_to_user_id])]));}
function refreshVisibleProfiles(){
  if(profileRefreshPromise)return profileRefreshPromise;
  const generation=profileGeneration;const ids=visibleProfileIds();if(!ids.length)return Promise.resolve(state.profiles);
  const previousSignature=contentSignature([],state.profiles);
  profileRefreshPromise=fetchProfiles(ids,true).then(async profiles=>{if(generation!==profileGeneration)return state.profiles;const changed=previousSignature!==contentSignature([],profiles);if(changed){await persistSquareCache();emit('content');}return profiles;}).catch(()=>state.profiles).finally(()=>{profileRefreshPromise=null;});
  return profileRefreshPromise;
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
  if(!force&&!state.loaded)await hydrateSquareCache();
  if(!force&&state.loaded&&isSquareFresh())return state.posts;
  if(loadPromise){if(force)refreshQueued=true;return loadPromise;}
  const showInitial=!state.loaded;const previousSignature=contentSignature(state.posts,state.profiles);
  state.loading=true;state.error='';if(showInitial)emit();
  loadPromise=(async()=>{try{
    countContent();const posts=fail(await client.from('posts').select('id,user_id,content,created_at').or('is_deleted.eq.false,is_deleted.is.null').order('created_at',{ascending:false}).limit(100),'读取精神广场失败')||[];
    const ids=posts.map(post=>post.id);
    const [comments,reactionResult]=await Promise.all([
      readComments(ids),
      ids.length?(countContent(),client.from('reactions').select('id,post_id,user_id,type,created_at').in('post_id',ids).eq('type','like')):Promise.resolve({data:[],error:null})
    ]);
    const reactions=fail(reactionResult,'读取互动失败')||[];
    await fetchProfiles(posts.map(post=>post.user_id).concat(comments.flatMap(comment=>[comment.user_id,comment.reply_to_user_id])),true);
    const commentsByPost={};comments.forEach(comment=>(commentsByPost[String(comment.post_id)]??=[]).push(comment));
    const reactionsByPost={};reactions.forEach(reaction=>(reactionsByPost[String(reaction.post_id)]??=[]).push(reaction));
    const nextPosts=posts.map(post=>({...post,comments:commentsByPost[String(post.id)]||[],reactions:reactionsByPost[String(post.id)]||[]}));
    const changed=previousSignature!==contentSignature(nextPosts,state.profiles);
    state.posts=nextPosts;state.loaded=true;state.loading=false;state.error='';lastSyncedAt=Date.now();await persistSquareCache();if(changed||showInitial)emit(showInitial?'all':'content');return state.posts;
  }catch(error){state.loading=false;state.loaded=true;state.error=error.message||'精神广场读取失败。';if(showInitial||!state.posts.length)emit();throw error;}
  finally{loadPromise=null;if(refreshQueued&&active){refreshQueued=false;queueMicrotask(()=>load(true).catch(()=>{}));}}})();
  return loadPromise;
}

function upsertPost(row){
  if(!row?.id)return false;const id=String(row.id);const current=state.posts.find(post=>String(post.id)===id);
  const next={...(current||{comments:[],reactions:[]}),id:row.id,user_id:row.user_id??current?.user_id,content:row.content??current?.content,created_at:row.created_at??current?.created_at};
  if(current&&current.user_id===next.user_id&&current.content===next.content&&current.created_at===next.created_at)return false;
  state.posts=[next,...state.posts.filter(post=>String(post.id)!==id)].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,100);return true;
}
function removePostLocal(postId){const id=String(postId||'');const before=state.posts.length;state.posts=state.posts.filter(post=>String(post.id)!==id);if(state.openPostId===id){state.openPostId='';state.reply=null;}return state.posts.length!==before;}
function upsertComment(row){
  if(!row?.id||!row.post_id)return false;let changed=false;const id=String(row.id);
  const next={id:row.id,post_id:row.post_id,user_id:row.user_id,parent_comment_id:row.parent_comment_id||null,reply_to_comment_id:row.reply_to_comment_id||null,reply_to_user_id:row.reply_to_user_id||null,content:row.content,created_at:row.created_at};
  state.posts=state.posts.map(post=>{if(String(post.id)!==String(row.post_id))return post;const current=(post.comments||[]).find(comment=>String(comment.id)===id);if(current&&contentSignature([current],{})===contentSignature([next],{}))return post;const comments=[...(post.comments||[]).filter(comment=>String(comment.id)!==id),next].sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));changed=true;return{...post,comments};});return changed;
}
function removeCommentLocal(commentId){const id=String(commentId||'');let changed=false;state.posts=state.posts.map(post=>{const comments=(post.comments||[]).filter(comment=>String(comment.id)!==id);if(comments.length===(post.comments||[]).length)return post;changed=true;return{...post,comments};});if(state.reply?.targetCommentId===id)state.reply=null;return changed;}
function upsertReaction(row){
  if(!row?.id||!row.post_id||row.type!=='like')return false;let changed=false;const id=String(row.id);
  const next={id:row.id,post_id:row.post_id,user_id:row.user_id,type:row.type,created_at:row.created_at};
  state.posts=state.posts.map(post=>{if(String(post.id)!==String(row.post_id))return post;const current=(post.reactions||[]).find(reaction=>String(reaction.id)===id);if(current&&contentSignature([current],{})===contentSignature([next],{}))return post;const reactions=[...(post.reactions||[]).filter(reaction=>String(reaction.id)!==id),next];changed=true;return{...post,reactions};});return changed;
}
function removeReactionLocal(reactionId){const id=String(reactionId||'');let changed=false;state.posts=state.posts.map(post=>{const reactions=(post.reactions||[]).filter(reaction=>String(reaction.id)!==id);if(reactions.length===(post.reactions||[]).length)return post;changed=true;return{...post,reactions};});return changed;}
async function commitContent(){lastSyncedAt=Date.now();await persistSquareCache();emit('content');}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(active)load(true).catch(()=>{});},220);}
async function applyRealtime(table,payload){
  try{
    const event=String(payload?.eventType||'').toUpperCase();const row=event==='DELETE'?payload?.old:payload?.new;let changed=false;
    if(table==='posts'){
      changed=event==='DELETE'||row?.is_deleted?removePostLocal(row?.id):upsertPost(row);
      if(changed&&event!=='DELETE'&&!row?.is_deleted)await fetchProfiles([row.user_id]);
    }else if(table==='comments'){
      changed=event==='DELETE'||row?.is_deleted?removeCommentLocal(row?.id):upsertComment(row);
      if(changed&&event!=='DELETE'&&!row?.is_deleted)await fetchProfiles([row.user_id,row.reply_to_user_id]);
    }else if(table==='reactions')changed=event==='DELETE'?removeReactionLocal(row?.id):upsertReaction(row);
    if(changed)await commitContent();
  }catch{scheduleRefresh();}
}
async function activate(){
  active=true;
  if(!squareChannel){
    squareChannel=client.channel('desktop-v11-square')
      .on('postgres_changes',{event:'*',schema:'public',table:'posts'},payload=>applyRealtime('posts',payload))
      .on('postgres_changes',{event:'*',schema:'public',table:'comments'},payload=>applyRealtime('comments',payload))
      .on('postgres_changes',{event:'*',schema:'public',table:'reactions'},payload=>applyRealtime('reactions',payload))
      .subscribe();
  }
  const cacheHit=await hydrateSquareCache();
  if(cacheHit||state.loaded){if(!isSquareFresh())load(true).catch(()=>{});else refreshVisibleProfiles().catch(()=>{});return state.posts;}
  return load();
}
function deactivate(){active=false;refreshQueued=false;clearTimeout(refreshTimer);if(squareChannel){client.removeChannel(squareChannel);squareChannel=null;}}

function openPost(postId){state.openPostId=String(postId||'');state.reply=null;emit('detail');}
async function openPostById(postId){
  const id=String(postId||'').trim();if(!id)throw new Error('帖子已经不存在。');
  if(state.posts.some(row=>String(row.id)===id)){openPost(id);return state.posts.find(row=>String(row.id)===id);}
  countContent();const result=await client.from('posts').select('id,user_id,content,created_at').eq('id',id).or('is_deleted.eq.false,is_deleted.is.null').limit(1);const rows=fail(result,'读取帖子失败')||[];const post=rows[0];if(!post)throw new Error('帖子已经删除或不可查看。');
  const [comments,reactionResult]=await Promise.all([readComments([post.id]),(countContent(),client.from('reactions').select('id,post_id,user_id,type,created_at').eq('post_id',post.id).eq('type','like'))]);
  const reactions=fail(reactionResult,'读取互动失败')||[];await fetchProfiles([post.user_id,...comments.flatMap(row=>[row.user_id,row.reply_to_user_id])],true);
  const hydrated={...post,comments,reactions};state.posts=[hydrated,...state.posts.filter(row=>String(row.id)!==id)].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));state.openPostId=id;state.reply=null;await persistSquareCache();emit('all');return hydrated;
}
function closePost(){state.openPostId='';state.reply=null;emit('detail');}
function setReply(comment){state.reply=comment?{postId:String(comment.post_id),targetCommentId:String(comment.id),rootCommentId:String(comment.parent_comment_id||comment.id),targetUserId:String(comment.user_id),name:state.profiles[String(comment.user_id)]?.nickname||'匿名用户'}:null;emit('detail');}
function clearReply(){state.reply=null;emit('detail');}

function mediaKind(file){const type=String(file?.type||'').toLowerCase();const name=String(file?.name||'').toLowerCase();if(type.startsWith('image/')||/\.(jpe?g|png|webp|gif)$/i.test(name))return'image';if(type.startsWith('video/')||/\.(mp4|mov|webm|m4v)$/i.test(name))return'video';return'';}
async function compressImage(file){
  if(!file||mediaKind(file)!=='image')throw new Error('请选择图片文件。');
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
async function validateVideo(file){
  if(!file||mediaKind(file)!=='video')throw new Error('请选择视频文件。');if(file.size>20*1024*1024)throw new Error('视频不能超过 20MB。');
  const localUrl=URL.createObjectURL(file);
  try{const duration=await new Promise((resolve,reject)=>{const node=document.createElement('video');const timer=setTimeout(()=>reject(new Error('视频读取超时，请换一个视频。')),10000);node.preload='metadata';node.onloadedmetadata=()=>{clearTimeout(timer);resolve(Number(node.duration||0));};node.onerror=()=>{clearTimeout(timer);reject(new Error('视频读取失败，请换一个视频。'));};node.src=localUrl;});if(duration>31)throw new Error('视频请控制在 30 秒以内。');return file;}
  finally{URL.revokeObjectURL(localUrl);}
}
async function uploadMedia(file,kind='post'){
  if(!file?.size)return{url:'',kind:''};const current=requireUser();const type=mediaKind(file);if(!type)throw new Error('只支持图片、GIF 或视频。');const upload=type==='video'?await validateVideo(file):await compressImage(file);
  const ext=(upload.name?.match(/\.([a-z0-9]+)$/i)?.[1]||(type==='video'?'mp4':'jpg')).toLowerCase();const path=`${current.id}/${kind}/${type}/${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}.${ext}`;
  const result=await client.storage.from('chat-media').upload(path,upload,{upsert:false,cacheControl:'31536000',contentType:upload.type||(type==='video'?'video/mp4':'image/jpeg')});if(result.error)throw new Error(`媒体上传失败：${result.error.message}`);
  const url=client.storage.from('chat-media').getPublicUrl(path).data.publicUrl;if(!url)throw new Error('媒体地址生成失败。');return{url,kind:type};
}
async function uploadImage(file,kind='post'){const media=await uploadMedia(file,kind);if(media.kind&&media.kind!=='image')throw new Error('请选择图片文件。');return media.url;}

async function createPost({text,imageFile=null,stickerUrls=[]}){
  const current=requireUser();const clean=checkedText(text,POST_TEXT_LIMIT,'帖子文字');if(state.busy)throw new Error('正在处理，请稍候。');state.busy=true;emit('compose');
  try{
    const media=imageFile?.size?await uploadMedia(imageFile,'post'):{url:'',kind:''};const content=composeContent(clean,{mediaUrl:media.url,mediaKind:media.kind,stickerUrls});
    if(!content)throw new Error('先写点什么或添加图片、视频、表情。');if(content.length>STORED_CONTENT_LIMIT)throw new Error('附带的图片或表情信息过长，请重新选择。');
    const saved=fail(await client.from('posts').insert({user_id:current.id,content,is_deleted:false}).select('id,user_id,content,created_at').single(),'发布失败');
    const changed=upsertPost(saved);await fetchProfiles([current.id]);if(changed)await commitContent();return saved;
  }finally{state.busy=false;emit('compose');}
}

async function createComment({postId,text,imageFile=null,stickerUrls=[]}){
  const current=requireUser();const post=state.posts.find(row=>String(row.id)===String(postId));if(!post)throw new Error('帖子已经不存在。');
  const clean=checkedText(text,COMMENT_TEXT_LIMIT,'评论文字');if(state.busy)throw new Error('正在处理，请稍候。');state.busy=true;emit('detail');
  try{
    const media=imageFile?.size?await uploadMedia(imageFile,'comment'):{url:'',kind:''};let content=composeContent(clean,{mediaUrl:media.url,mediaKind:media.kind,stickerUrls});
    if(!content)throw new Error('先写点回复内容或添加图片、视频、表情。');if(content.length>STORED_CONTENT_LIMIT)throw new Error('附带的图片或表情信息过长，请重新选择。');
    const reply=state.reply&&String(state.reply.postId)===String(postId)?state.reply:null;
    const row={post_id:post.id,user_id:current.id,content,is_deleted:false};
    if(reply){row.parent_comment_id=Number(reply.rootCommentId);row.reply_to_comment_id=Number(reply.targetCommentId);row.reply_to_user_id=reply.targetUserId;}
    const saved=fail(await client.from('comments').insert(row).select('id,post_id,user_id,parent_comment_id,reply_to_comment_id,reply_to_user_id,content,created_at').single(),'评论失败');
    state.reply=null;const changed=upsertComment(saved);await fetchProfiles([current.id,saved.reply_to_user_id]);if(changed)await commitContent();return saved;
  }finally{state.busy=false;emit('detail');}
}

async function toggleReaction(postId,type){
  const current=requireUser();const allowed=['like'];if(!allowed.includes(type))throw new Error('未知互动类型。');
  const post=state.posts.find(row=>String(row.id)===String(postId));if(!post)throw new Error('帖子已经不存在。');
  const existing=(post.reactions||[]).find(row=>String(row.user_id)===String(current.id)&&row.type===type);
  let changed=false;
  if(existing){fail(await client.from('reactions').delete().eq('id',existing.id).eq('user_id',current.id),'撤回互动失败');changed=removeReactionLocal(existing.id);}
  else{const saved=fail(await client.from('reactions').insert({post_id:post.id,user_id:current.id,type}).select('id,post_id,user_id,type,created_at').single(),'互动失败');changed=upsertReaction(saved);}
  if(changed)await commitContent();return !existing;
}

async function deletePost(postId){requireUser();fail(await client.rpc('fw_delete_own_post',{p_post_id:Number(postId)}),'删除帖子失败');if(removePostLocal(postId))await commitContent();}
async function deleteComment(commentId){requireUser();fail(await client.rpc('fw_delete_own_comment',{p_comment_id:Number(commentId)}),'删除评论失败');if(removeCommentLocal(commentId))await commitContent();}
async function report(targetType,targetId,reason){requireUser();const text=String(reason||'').trim();if(text.length<2)throw new Error('请至少写 2 个字的举报原因。');fail(await client.rpc('fw_submit_report',{p_target_type:targetType,p_target_id:String(targetId),p_reason:text}),'提交举报失败');}

authStore.subscribe(auth=>{
  const nextUserId=String(auth.user?.id||'');const switched=Boolean(nextUserId&&((lastAuthUserId&&nextUserId!==lastAuthUserId)||(hydratedCacheKey&&hydratedCacheKey!==nextUserId)));lastAuthUserId=nextUserId;
  if(switched){profileGeneration+=1;state.loaded=false;state.loading=false;state.posts=[];state.profiles={};state.openPostId='';state.reply=null;hydratedCacheKey='';lastSyncedAt=0;emit();if(active)load(false).catch(()=>{});}
  if(!auth.ready)return;
  if(!auth.user){profileGeneration+=1;deactivate();state.loaded=false;state.loading=false;state.posts=[];state.profiles={};state.openPostId='';state.reply=null;hydratedCacheKey='';lastSyncedAt=0;emit();}
});

export const feedStore={state,activate,deactivate,load,openPost,openPostById,closePost,setReply,clearReply,createPost,createComment,toggleReaction,deletePost,deleteComment,report,uploadImage,uploadMedia,composeContent,subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}};
