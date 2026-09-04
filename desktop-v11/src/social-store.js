import {authStore} from './auth-store.js';
import {desktopCache} from './desktop-persistent-cache.js';

const ECHO_TYPES=['like','same','tissue','comment','comment_reply','chat_agree','system'];
const PRIVATE_TYPE='private_message';
const REPLY_READ_PREFIX='fw:desktop:v11:reply-read:';
const listeners=new Set();
const client=authStore.client;
const state={
  ready:false,busy:false,error:'',userId:'',badges:{echo:0,buddy:0},
  echo:{loaded:false,loading:false,rows:[],profiles:{}},
  buddy:{loaded:false,loading:false,tab:'messages',rows:[],profiles:{},conversations:[],latest:{},unread:{},search:[],searching:false},
  chat:{targetId:'',conversationId:null,profile:null,rows:[],loading:false,sending:false},
  stickers:{loaded:false,loading:false,rows:[]}
};

let badgeChannel=null;
let chatChannel=null;
let badgePromise=null;
let badgeTimer=null;
let badgeRefreshQueued=false;
let buddyTimer=null;
let buddyPromise=null;
let buddyRefreshQueued=false;
let chatOpenToken=0;
let pendingMessageSequence=0;
const privateReadPromises=new Map();
const privateReadQueued=new Set();
let replyCache={userId:'',at:0,rows:[]};
let hydratedEchoUser='';
let hydratedBuddyUser='';
let hydratedStickersUser='';
let hydratedBadgesUser='';

function emit(){const snapshot={...state,badges:{...state.badges},echo:{...state.echo},buddy:{...state.buddy},chat:{...state.chat},stickers:{...state.stickers}};listeners.forEach(fn=>fn(snapshot));}
function countContent(){if(window.__FW_DESKTOP_V11__) window.__FW_DESKTOP_V11__.socialContentRequests=(window.__FW_DESKTOP_V11__.socialContentRequests||0)+1;}
function fail(result,label){if(result?.error) throw new Error(`${label}：${result.error.message}`);return result?.data;}
function currentUser(){return authStore.state.user && !authStore.state.user.cached ? authStore.state.user : null;}
function unique(values){return Array.from(new Set((values||[]).filter(Boolean).map(String)));}

async function hydrateBadgesCache(userId){
  if(!userId||hydratedBadgesUser===userId)return false;hydratedBadgesUser=userId;
  const cached=await desktopCache.read('badges',userId);const payload=cached?.payload;
  if(!payload?.badges)return false;
  state.badges={echo:Number(payload.badges.echo||0),buddy:Number(payload.badges.buddy||0)};emit();return true;
}
function persistBadgesCache(userId=currentUser()?.id){if(!userId)return Promise.resolve(false);return desktopCache.write('badges',userId,{badges:state.badges});}
async function hydrateEchoCache(userId){
  if(!userId||hydratedEchoUser===userId)return false;hydratedEchoUser=userId;
  const cached=await desktopCache.read('echo',userId);const payload=cached?.payload;
  if(!payload||!Array.isArray(payload.rows))return false;
  state.echo={loaded:true,loading:false,rows:payload.rows.slice(0,100),profiles:payload.profiles&&typeof payload.profiles==='object'?payload.profiles:{}};emit();return true;
}
function persistEchoCache(userId=currentUser()?.id){if(!userId)return Promise.resolve(false);return desktopCache.write('echo',userId,{rows:state.echo.rows.slice(0,100),profiles:state.echo.profiles});}
async function hydrateBuddyCache(userId){
  if(!userId||hydratedBuddyUser===userId)return false;hydratedBuddyUser=userId;
  const cached=await desktopCache.read('buddy',userId);const payload=cached?.payload;
  if(!payload||!Array.isArray(payload.rows))return false;
  state.buddy={...state.buddy,loaded:true,loading:false,rows:payload.rows,profiles:payload.profiles||{},conversations:payload.conversations||[],latest:payload.latest||{},unread:payload.unread||{},search:[],searching:false};emit();return true;
}
function persistBuddyCache(userId=currentUser()?.id){
  if(!userId)return Promise.resolve(false);
  return desktopCache.write('buddy',userId,{rows:state.buddy.rows,profiles:state.buddy.profiles,conversations:state.buddy.conversations,latest:state.buddy.latest,unread:state.buddy.unread});
}
async function hydrateChatCache(userId,targetId,openToken=chatOpenToken){
  const cached=await desktopCache.read('chat',userId,targetId);const payload=cached?.payload;
  if(openToken!==chatOpenToken||state.userId!==userId)return false;
  if(!payload||!Array.isArray(payload.rows))return false;
  state.chat={targetId:String(targetId),conversationId:payload.conversationId||null,profile:payload.profile||state.buddy.profiles[targetId]||null,rows:payload.rows.filter(row=>!row.__pending).slice(-200),loading:true,sending:false};emit();return true;
}
function persistChatCache(userId=currentUser()?.id){
  if(!userId||!state.chat.targetId)return Promise.resolve(false);
  const rows=state.chat.rows.filter(row=>!row.__pending);return desktopCache.write('chat',userId,{conversationId:state.chat.conversationId,profile:state.chat.profile,rows:rows.slice(-200)},state.chat.targetId);
}
async function hydrateStickersCache(userId){
  if(!userId||hydratedStickersUser===userId)return false;hydratedStickersUser=userId;
  const cached=await desktopCache.read('stickers',userId);const payload=cached?.payload;
  if(!payload||!Array.isArray(payload.rows))return false;
  state.stickers={loaded:true,loading:false,rows:payload.rows.slice(0,80)};emit();return true;
}
function persistStickersCache(userId=currentUser()?.id){if(!userId)return Promise.resolve(false);return desktopCache.write('stickers',userId,{rows:state.stickers.rows.slice(0,80)});}

function clearSocialState(){
  state.userId='';state.ready=true;state.error='';state.badges={echo:0,buddy:0};
  state.echo={loaded:false,loading:false,rows:[],profiles:{}};
  state.buddy={loaded:false,loading:false,tab:'messages',rows:[],profiles:{},conversations:[],latest:{},unread:{},search:[],searching:false};
  state.chat={targetId:'',conversationId:null,profile:null,rows:[],loading:false,sending:false};
  state.stickers={loaded:false,loading:false,rows:[]};
  hydratedEchoUser='';hydratedBuddyUser='';hydratedStickersUser='';hydratedBadgesUser='';teardownChannels();emit();
}

async function fetchProfiles(ids,existing={}){
  const missing=unique(ids).filter(id=>!existing[id]);
  if(!missing.length) return existing;
  countContent();
  const rows=fail(await client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id',missing),'读取研究员资料失败')||[];
  const map={...existing};rows.forEach(row=>{map[row.id]=row;});return map;
}

function scheduleBadges(){clearTimeout(badgeTimer);badgeTimer=setTimeout(()=>refreshBadges(true),180);}
function scheduleBuddyReload(){clearTimeout(buddyTimer);buddyTimer=setTimeout(()=>loadBuddy(true),180);}

async function refreshBadges(force=false){
  const user=currentUser();
  if(!user?.id){state.badges={echo:0,buddy:0};emit();return state.badges;}
  if(!force&&hydratedBadgesUser!==user.id)await hydrateBadgesCache(user.id);
  if(badgePromise){if(force)badgeRefreshQueued=true;return badgePromise;}
  badgePromise=(async()=>{
    const [echoResult,privateResult,requestResult]=await Promise.all([
      client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('is_read',false).in('type',ECHO_TYPES),
      client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('is_read',false).eq('type',PRIVATE_TYPE),
      client.from('friendships').select('id',{count:'exact',head:true}).eq('receiver_id',user.id).eq('status','pending')
    ]);
    if(state.userId!==user.id) return state.badges;
    state.badges={echo:Number(echoResult.count||0),buddy:Number(privateResult.count||0)+Number(requestResult.count||0)};
    emit();persistBadgesCache(user.id).catch(()=>{});return state.badges;
  })().catch(()=>state.badges).finally(()=>{badgePromise=null;if(badgeRefreshQueued){badgeRefreshQueued=false;queueMicrotask(()=>refreshBadges(false));}});
  return badgePromise;
}

function teardownChannels(){
  clearTimeout(badgeTimer);clearTimeout(buddyTimer);badgeRefreshQueued=false;buddyRefreshQueued=false;chatOpenToken+=1;privateReadPromises.clear();privateReadQueued.clear();
  if(badgeChannel){client.removeChannel(badgeChannel);badgeChannel=null;}
  if(chatChannel){client.removeChannel(chatChannel);chatChannel=null;}
}

function startBadgeChannel(userId){
  if(badgeChannel) client.removeChannel(badgeChannel);
  badgeChannel=client.channel(`desktop-v11-unread-${userId}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`user_id=eq.${userId}`},payload=>{
      if(state.userId!==userId)return;
      const row=payload?.new||payload?.old||{};scheduleBadges();
      if(payload?.eventType==='INSERT'&&row.type===PRIVATE_TYPE&&state.buddy.loaded){
        const actorId=String(row.actor_id||'');const active=actorId&&String(state.chat.targetId)===actorId;
        if(actorId){
          const unread={...state.buddy.unread,[actorId]:active?0:Number(state.buddy.unread[actorId]||0)+1};
          const preview={id:`notice-${row.target_id||row.id}`,sender_id:actorId,content:row.content||'',created_at:row.created_at};
          state.buddy={...state.buddy,unread,latest:{...state.buddy.latest,[actorId]:preview}};emit();persistBuddyCache(userId).catch(()=>{});
          if(active)markPrivateRead(actorId).catch(()=>{});
        }
      }
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'friendships',filter:`receiver_id=eq.${userId}`},()=>{if(state.userId!==userId)return;scheduleBadges();if(state.buddy.loaded)scheduleBuddyReload();})
    .on('postgres_changes',{event:'*',schema:'public',table:'friendships',filter:`requester_id=eq.${userId}`},()=>{if(state.userId!==userId)return;if(state.buddy.loaded)scheduleBuddyReload();})
    .subscribe();
}

function replyReadSet(userId){try{return new Set(JSON.parse(localStorage.getItem(REPLY_READ_PREFIX+userId)||'[]').map(String));}catch{return new Set();}}
function saveReplyRead(userId,set){try{localStorage.setItem(REPLY_READ_PREFIX+userId,JSON.stringify(Array.from(set).slice(-500)));}catch{}}
const fallbackId=id=>`reply-${id}`;

async function replyFallback(userId,force=false){
  if(!force&&replyCache.userId===userId&&Date.now()-replyCache.at<15000) return replyCache.rows;
  try{
    countContent();
    const own=await client.from('comments').select('id').eq('user_id',userId).or('is_deleted.eq.false,is_deleted.is.null').order('created_at',{ascending:false}).limit(220);
    if(own.error) throw own.error;
    const ownIds=(own.data||[]).map(row=>row.id).filter(Boolean);
    const filter=`reply_to_user_id.eq.${userId}${ownIds.length?',parent_comment_id.in.('+ownIds.join(',')+')':''}`;
    countContent();
    const replies=await client.from('comments').select('id,post_id,user_id,parent_comment_id,reply_to_user_id,content,is_deleted,created_at').or(filter).neq('user_id',userId).or('is_deleted.eq.false,is_deleted.is.null').order('created_at',{ascending:false}).limit(160);
    if(replies.error) throw replies.error;
    const ownSet=new Set(ownIds.map(String));
    const read=replyReadSet(userId);
    const rows=(replies.data||[]).filter(row=>row&&!row.is_deleted&&String(row.user_id)!==String(userId)&&(String(row.reply_to_user_id||'')===String(userId)||(!row.reply_to_user_id&&ownSet.has(String(row.parent_comment_id))))).map(row=>({
      id:fallbackId(row.id),actor_id:row.user_id,type:'comment_reply',target_type:'comment',target_id:row.id,content:row.content||'回复了你的评论',is_read:read.has(String(row.id))||Date.now()-new Date(row.created_at||0).getTime()>259200000,created_at:row.created_at,__post_id:row.post_id,__reply_fallback:true
    }));
    replyCache={userId,at:Date.now(),rows};return rows;
  }catch{return replyCache.userId===userId?replyCache.rows:[];}
}

async function resolveReplyPosts(rows){
  const ids=unique(rows.filter(row=>row.type==='comment_reply'&&!row.__post_id&&row.target_id).map(row=>row.target_id));
  if(!ids.length) return rows;
  countContent();
  const result=await client.from('comments').select('id,post_id').in('id',ids);
  if(result.error) return rows;
  const map={};(result.data||[]).forEach(row=>{map[String(row.id)]=row.post_id;});
  return rows.map(row=>row.type==='comment_reply'&&map[String(row.target_id)]?{...row,__post_id:map[String(row.target_id)]}:row);
}

async function loadEcho(force=false){
  const user=currentUser();
  if(!user?.id){state.echo={loaded:true,loading:false,rows:[],profiles:{}};emit();return;}
  if(!force&&!state.echo.loaded){const hit=await hydrateEchoCache(user.id);if(hit){loadEcho(true).catch(()=>{});return state.echo.rows;}}
  if(state.echo.loading||(!force&&state.echo.loaded)) return state.echo.rows;
  state.echo={...state.echo,loading:true};emit();
  try{
    countContent();
    let rows=fail(await client.from('notifications').select('id,actor_id,type,target_type,target_id,content,is_read,created_at').eq('user_id',user.id).in('type',ECHO_TYPES).order('created_at',{ascending:false}).limit(100),'读取回声失败')||[];
    rows=await resolveReplyPosts(rows);
    const formalTargets=new Set(rows.filter(row=>row.type==='comment_reply'&&row.target_id).map(row=>String(row.target_id)));
    const fallback=(await replyFallback(user.id,force)).filter(row=>!formalTargets.has(String(row.target_id)));
    rows=rows.concat(fallback).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,100);
    const profiles=await fetchProfiles(rows.map(row=>row.actor_id),state.echo.profiles);
    state.echo={loaded:true,loading:false,rows,profiles};emit();persistEchoCache(user.id).catch(()=>{});
    const unread=rows.filter(row=>!row.is_read).map(row=>row.id);
    if(unread.length) await markEchoRead(unread);
    return state.echo.rows;
  }catch(error){state.echo={...state.echo,loaded:true,loading:false};state.error=error.message||'回声读取失败';emit();return state.echo.rows;}
}

async function markEchoRead(ids){
  const user=currentUser();if(!user?.id) return;
  const wanted=unique(ids);if(!wanted.length) return;
  const wantedSet=new Set(wanted);
  state.echo={...state.echo,rows:state.echo.rows.map(row=>wantedSet.has(String(row.id))?{...row,is_read:true}:row)};
  state.badges={...state.badges,echo:0};emit();persistEchoCache(user.id).catch(()=>{});persistBadgesCache(user.id).catch(()=>{});
  const fallback=wanted.filter(id=>id.startsWith('reply-')).map(id=>id.slice(6));
  if(fallback.length){const read=replyReadSet(user.id);fallback.forEach(id=>read.add(String(id)));saveReplyRead(user.id,read);}
  const database=wanted.filter(id=>/^\d+$/.test(id)).map(Number);
  if(database.length) await client.from('notifications').update({is_read:true}).eq('user_id',user.id).in('id',database);
  await refreshBadges(true);
}

function otherId(row,userId){return String(row.requester_id)===String(userId)?String(row.receiver_id):String(row.requester_id);}

async function loadBuddy(force=false){
  const user=currentUser();
  if(!user?.id){state.buddy={...state.buddy,loaded:true,loading:false,rows:[],profiles:{},conversations:[],latest:{},unread:{}};emit();return;}
  if(!force&&!state.buddy.loaded){const hit=await hydrateBuddyCache(user.id);if(hit){loadBuddy(true).catch(()=>{});return state.buddy.rows;}}
  if(buddyPromise){if(force)buddyRefreshQueued=true;return buddyPromise;}
  if(!force&&state.buddy.loaded) return state.buddy.rows;
  state.buddy={...state.buddy,loading:true};emit();
  buddyPromise=(async()=>{try{
    countContent();
    const friendships=fail(await client.from('friendships').select('id,requester_id,receiver_id,status,created_at,updated_at').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`).order('updated_at',{ascending:false}),'读取搭子列表失败')||[];
    const profiles=await fetchProfiles(friendships.flatMap(row=>[row.requester_id,row.receiver_id]),state.buddy.profiles);
    const accepted=friendships.filter(row=>row.status==='accepted');
    const buddyIds=accepted.map(row=>otherId(row,user.id));
    let unread={};let conversations=[];let latest={};
    if(buddyIds.length){
      countContent();
      const notices=await client.from('notifications').select('id,actor_id').eq('user_id',user.id).eq('is_read',false).eq('type',PRIVATE_TYPE).in('actor_id',buddyIds);
      (notices.data||[]).forEach(row=>{const key=String(row.actor_id||'');if(key) unread[key]=(unread[key]||0)+1;});
      countContent();
      const conv=await client.from('conversations').select('id,user_one_id,user_two_id,updated_at').or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`).order('updated_at',{ascending:false});
      if(conv.error) throw conv.error;conversations=conv.data||[];
      const convToBuddy={};conversations.forEach(row=>{const oid=String(row.user_one_id)===String(user.id)?String(row.user_two_id):String(row.user_one_id);if(buddyIds.includes(oid)) convToBuddy[String(row.id)]=oid;});
      const convIds=Object.keys(convToBuddy).map(Number);
      if(convIds.length){
        countContent();
        const messages=await client.from('private_messages').select('id,conversation_id,sender_id,content,is_deleted,created_at').in('conversation_id',convIds).eq('is_deleted',false).order('created_at',{ascending:false}).limit(Math.max(160,convIds.length*8));
        if(messages.error) throw messages.error;
        (messages.data||[]).forEach(row=>{const oid=convToBuddy[String(row.conversation_id)];if(oid&&!latest[oid]) latest[oid]=row;});
      }
    }
    if(state.userId!==user.id)return state.buddy.rows;
    state.buddy={...state.buddy,loaded:true,loading:false,rows:friendships,profiles,conversations,latest,unread};emit();persistBuddyCache(user.id).catch(()=>{});return state.buddy.rows;
  }catch(error){if(state.userId===user.id){state.buddy={...state.buddy,loaded:true,loading:false};state.error=error.message||'搭子读取失败';emit();}return state.buddy.rows;}
  finally{buddyPromise=null;if(buddyRefreshQueued){buddyRefreshQueued=false;queueMicrotask(()=>loadBuddy(true));}}})();
  return buddyPromise;
}

function setBuddyTab(tab){
  const nextTab=['messages','friends','new'].includes(tab)?tab:'messages';
  if(chatChannel){client.removeChannel(chatChannel);chatChannel=null;}chatOpenToken+=1;
  state.chat={targetId:'',conversationId:null,profile:null,rows:[],loading:false,sending:false};
  state.buddy={...state.buddy,tab:nextTab,search:[]};emit();
}

async function searchProfiles(query){
  const keyword=String(query||'').trim();if(keyword.length<2) throw new Error('至少输入 2 个字符；邮箱需要输入完整邮箱。');
  state.buddy={...state.buddy,searching:true,search:[]};emit();
  try{countContent();const rows=fail(await client.rpc('fw_search_profiles',{search_text:keyword}),'搜索失败')||[];state.buddy={...state.buddy,searching:false,search:rows};emit();return rows;}
  catch(error){state.buddy={...state.buddy,searching:false};emit();throw error;}
}

async function runBuddyMutation(name,args){state.busy=true;emit();try{const data=fail(await client.rpc(name,args),'操作失败');await loadBuddy(true);await refreshBadges(true);return data;}finally{state.busy=false;emit();}}
async function sendFriendRequest(userId){return runBuddyMutation('fw_send_friend_request',{target_user_id:userId});}
async function respondFriendship(id,accept){return runBuddyMutation('fw_respond_friendship',{target_friendship_id:Number(id),accept_request:Boolean(accept)});}
async function removeFriendship(id){return runBuddyMutation('fw_remove_friendship',{target_friendship_id:Number(id)});}

async function markPrivateRead(actorId){
  const user=currentUser();if(!user?.id||!actorId) return;
  const key=String(actorId);const existing=privateReadPromises.get(key);if(existing){privateReadQueued.add(key);return existing;}
  const previousUnread=Number(state.buddy.unread[key]||0);
  if(previousUnread>0){state.buddy={...state.buddy,unread:{...state.buddy.unread,[key]:0}};state.badges={...state.badges,buddy:Math.max(0,state.badges.buddy-previousUnread)};emit();persistBuddyCache(user.id).catch(()=>{});persistBadgesCache(user.id).catch(()=>{});}
  const promise=client.from('notifications').update({is_read:true}).eq('user_id',user.id).eq('is_read',false).eq('type',PRIVATE_TYPE).eq('actor_id',key).then(result=>{if(result?.error)scheduleBadges();}).finally(()=>{if(privateReadPromises.get(key)===promise)privateReadPromises.delete(key);if(privateReadQueued.delete(key))queueMicrotask(()=>markPrivateRead(key));});
  privateReadPromises.set(key,promise);return promise;
}

function mergeMessages(...groups){
  const byId=new Map();groups.flat().filter(row=>row&&!row.is_deleted).forEach(row=>byId.set(String(row.id),row));
  return Array.from(byId.values()).sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0)||String(a.id).localeCompare(String(b.id),undefined,{numeric:true})).slice(-200);
}
function mergeRealtimeMessage(row){
  let rows=state.chat.rows;
  if(!String(row.id).startsWith('pending-')){const pendingIndex=rows.findIndex(item=>item.__pending&&String(item.sender_id)===String(row.sender_id)&&item.content===row.content);if(pendingIndex>=0)rows=rows.filter((_,index)=>index!==pendingIndex);}
  return mergeMessages(rows,row);
}
function reconcileSentMessage(conversationId,targetId){
  if(!Number.isFinite(Number(conversationId))||Number(conversationId)<=0)return;
  countContent();client.from('private_messages').select('id,conversation_id,sender_id,content,is_deleted,created_at').eq('conversation_id',conversationId).eq('is_deleted',false).order('id',{ascending:false}).limit(1).then(result=>{
    const row=result?.data?.[0];if(result?.error||!row)return;
    state.buddy={...state.buddy,latest:{...state.buddy.latest,[targetId]:row}};
    if(String(state.chat.targetId)===String(targetId)&&Number(state.chat.conversationId)===Number(conversationId)){state.chat={...state.chat,rows:mergeRealtimeMessage(row)};persistChatCache().catch(()=>{});}emit();persistBuddyCache().catch(()=>{});
  }).catch(()=>{});
}
function subscribeChat(conversationId){
  if(chatChannel) client.removeChannel(chatChannel);
  chatChannel=client.channel(`desktop-v11-chat-${conversationId}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'private_messages',filter:`conversation_id=eq.${conversationId}`},payload=>{
      const row=payload.new;if(!row||row.is_deleted||state.chat.conversationId!==conversationId)return;
      if(!state.chat.rows.some(item=>String(item.id)===String(row.id))){
        const targetId=String(state.chat.targetId);const user=currentUser();const incoming=user&&String(row.sender_id)!==String(user.id);const previousUnread=Number(state.buddy.unread[targetId]||0);
        state.chat={...state.chat,rows:mergeRealtimeMessage(row)};
        state.buddy={...state.buddy,latest:{...state.buddy.latest,[targetId]:row},unread:incoming?{...state.buddy.unread,[targetId]:0}:state.buddy.unread};
        if(incoming&&previousUnread>0)state.badges={...state.badges,buddy:Math.max(0,state.badges.buddy-previousUnread)};
        emit();persistChatCache().catch(()=>{});persistBuddyCache().catch(()=>{});if(incoming)markPrivateRead(targetId).catch(()=>{});
      }
    }).subscribe();
}

async function openChat(targetId){
  const user=currentUser();if(!user?.id) throw new Error('请先登录。');
  const wantedTarget=String(targetId);const openToken=++chatOpenToken;
  if(chatChannel){client.removeChannel(chatChannel);chatChannel=null;}
  const cacheHit=await hydrateChatCache(user.id,wantedTarget,openToken);
  if(openToken!==chatOpenToken)return;
  if(!cacheHit){state.chat={targetId:wantedTarget,conversationId:null,profile:state.buddy.profiles[wantedTarget]||null,rows:[],loading:true,sending:false};emit();}
  try{
    const profiles=await fetchProfiles([wantedTarget],state.buddy.profiles);if(openToken!==chatOpenToken)return;state.buddy={...state.buddy,profiles};
    countContent();
    const convId=Number(fail(await client.rpc('fw_get_or_create_conversation',{target_user_id:wantedTarget}),'打开私聊失败'));if(openToken!==chatOpenToken)return;
    if(!Number.isFinite(convId)||convId<=0) throw new Error('私聊会话创建失败。');
    state.chat={...state.chat,targetId:wantedTarget,conversationId:convId,profile:profiles[wantedTarget]||null,loading:true};subscribeChat(convId);emit();
    countContent();
    const rows=fail(await client.from('private_messages').select('id,conversation_id,sender_id,content,is_deleted,created_at').eq('conversation_id',convId).eq('is_deleted',false).order('created_at',{ascending:false}).limit(200),'读取私聊失败')||[];
    if(openToken!==chatOpenToken)return;
    state.chat={targetId:wantedTarget,conversationId:convId,profile:profiles[wantedTarget]||null,rows:mergeMessages(rows.slice().reverse(),state.chat.rows),loading:false,sending:false};emit();persistChatCache(user.id).catch(()=>{});
    markPrivateRead(wantedTarget).catch(()=>{});
  }catch(error){if(openToken!==chatOpenToken)return;state.chat={...state.chat,loading:false};emit();if(!cacheHit)throw error;}
}

function closeChat(){if(!state.chat.targetId&&!chatChannel)return;if(chatChannel){client.removeChannel(chatChannel);chatChannel=null;}chatOpenToken+=1;state.chat={targetId:'',conversationId:null,profile:null,rows:[],loading:false,sending:false};emit();}
function hasLink(text){return /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.(com|net|org|xyz|top|cn|cc|io|me|vip|club|site|info|online|shop|live|app)(\/|$|\s))/i.test(text||'');}
function stickerPayload(url){return `[[FW_USER_STICKER:${btoa(String(url||''))}]]`;}

async function sendMessage(text,{stickerUrl=''}={}){
  const targetId=state.chat.targetId;const content=stickerUrl?stickerPayload(stickerUrl):String(text||'').trim();
  if(!targetId) throw new Error('先选择一个搭子。');if(!content) return;
  if(!stickerUrl&&content.length>300) throw new Error('私聊最多 300 字。');if(!stickerUrl&&hasLink(content)) throw new Error('私聊暂不支持链接。');
  const user=currentUser();const previousLatest=state.buddy.latest[targetId]||null;const pendingId=`pending-${Date.now()}-${++pendingMessageSequence}`;const pending={id:pendingId,conversation_id:state.chat.conversationId,sender_id:user?.id,content,is_deleted:false,created_at:new Date().toISOString(),__pending:true};
  state.chat={...state.chat,sending:true,rows:mergeMessages(state.chat.rows,pending)};state.buddy={...state.buddy,latest:{...state.buddy.latest,[targetId]:pending}};emit();
  try{
    countContent();const convId=Number(fail(await client.rpc('fw_send_private_message_to_user',{target_user_id:targetId,message_text:content}),'发送失败'));
    if(String(state.chat.targetId)===String(targetId)&&Number.isFinite(convId)&&convId>0&&state.chat.conversationId!==convId){state.chat={...state.chat,conversationId:convId};subscribeChat(convId);}
    reconcileSentMessage(convId||state.chat.conversationId,targetId);
  }catch(error){if(String(state.chat.targetId)===String(targetId))state.chat={...state.chat,rows:state.chat.rows.filter(row=>String(row.id)!==pendingId)};if(String(state.buddy.latest[targetId]?.id)===pendingId)state.buddy={...state.buddy,latest:{...state.buddy.latest,[targetId]:previousLatest}};throw error;
  }finally{if(String(state.chat.targetId)===String(targetId))state.chat={...state.chat,sending:false};emit();persistChatCache().catch(()=>{});persistBuddyCache().catch(()=>{});}
  return targetId;
}

async function loadStickers(force=false){
  const user=currentUser();if(!user?.id) return [];
  if(!force&&!state.stickers.loaded){const hit=await hydrateStickersCache(user.id);if(hit){loadStickers(true).catch(()=>{});return state.stickers.rows;}}
  if(state.stickers.loading||(!force&&state.stickers.loaded)) return state.stickers.rows;
  state.stickers={...state.stickers,loading:true};emit();
  try{countContent();const rows=fail(await client.from('user_stickers').select('id,image_url,file_name,file_size,mime_type,storage_path,created_at').eq('user_id',user.id).eq('is_deleted',false).order('created_at',{ascending:false}).limit(80),'读取我的表情失败')||[];state.stickers={loaded:true,loading:false,rows};emit();persistStickersCache(user.id).catch(()=>{});return rows;}
  catch(error){state.stickers={...state.stickers,loaded:true,loading:false};emit();if(state.stickers.rows.length)return state.stickers.rows;throw error;}
}

async function uploadSticker(file){
  const user=currentUser();if(!user?.id) throw new Error('请先登录。');
  if(!file?.size) throw new Error('没有选择图片。');
  if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) throw new Error('只支持 JPG、PNG、WebP、GIF 图片。');
  if(file.size>1048576) throw new Error('表情图片不能超过 1MB。');
  if(state.stickers.rows.length>=80) throw new Error('我的表情最多保存 80 个。');
  const safe=String(file.name||'sticker').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-60)||'sticker';
  const path=`${user.id}/${Date.now()}_${safe}`;
  state.stickers={...state.stickers,loading:true};emit();
  try{
    const uploaded=await client.storage.from('stickers').upload(path,file,{upsert:false,cacheControl:'3600',contentType:file.type});
    if(uploaded.error) throw uploaded.error;
    const imageUrl=client.storage.from('stickers').getPublicUrl(path).data.publicUrl;
    const saved=await client.from('user_stickers').insert({user_id:user.id,image_url:imageUrl,storage_path:path,file_name:file.name||safe,file_size:file.size,mime_type:file.type}).select('id,image_url,file_name,file_size,mime_type,storage_path,created_at').single();
    if(saved.error){await client.storage.from('stickers').remove([path]);throw saved.error;}
    state.stickers={loaded:true,loading:false,rows:[saved.data,...state.stickers.rows].slice(0,80)};emit();persistStickersCache(user.id).catch(()=>{});return saved.data;
  }catch(error){state.stickers={...state.stickers,loading:false};emit();throw new Error(`添加表情失败：${error.message||error}`);}
}

async function deleteSticker(id){
  const user=currentUser();const row=state.stickers.rows.find(item=>String(item.id)===String(id));if(!row)return;
  const result=await client.from('user_stickers').update({is_deleted:true}).eq('id',row.id);if(result.error)throw new Error(`删除表情失败：${result.error.message}`);
  state.stickers={...state.stickers,rows:state.stickers.rows.filter(item=>String(item.id)!==String(id))};emit();if(user?.id)persistStickersCache(user.id).catch(()=>{});
  if(row.storage_path) client.storage.from('stickers').remove([row.storage_path]).catch(()=>{});
}

async function bootForUser(userId){
  if(state.userId===userId) return;
  teardownChannels();hydratedEchoUser='';hydratedBuddyUser='';hydratedStickersUser='';hydratedBadgesUser='';state.userId=userId;state.ready=true;startBadgeChannel(userId);emit();await hydrateBadgesCache(userId);await refreshBadges(true);
}

authStore.subscribe(auth=>{
  if(!auth.ready) return;
  if(!auth.user||auth.user.cached){if(!auth.user) clearSocialState();return;}
  bootForUser(auth.user.id);
});

export const socialStore={
  state,ECHO_TYPES,refreshBadges,loadEcho,markEchoRead,loadBuddy,setBuddyTab,searchProfiles,sendFriendRequest,respondFriendship,removeFriendship,openChat,closeChat,sendMessage,markPrivateRead,loadStickers,uploadSticker,deleteSticker,
  subscribe(listener){listeners.add(listener);listener({...state,badges:{...state.badges}});return()=>listeners.delete(listener);}
};
