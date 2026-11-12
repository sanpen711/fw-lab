import {uiErrorMessage} from './ui-errors.js';
import {authStore} from './auth-store.js';
import {desktopCache} from './desktop-persistent-cache.js';
import {membershipStore} from './membership-store.js';
import {windowIsActive,onWindowAttention} from './window-attention.js';

const ECHO_TYPES=['like','comment','comment_reply'];
const PRIVATE_TYPE='private_message';
const PRIVATE_UNREAD_CACHE_VERSION=2;
const CHAT_PAGE_SIZE=200;
const PARTY_ALERT_TYPES=['game_party_apply','game_party_joined','game_party_accepted','game_party_rejected'];
const REPLY_READ_PREFIX='fw:desktop:v11:reply-read:';
const listeners=new Set();
const client=authStore.client;
const state={
  ready:false,busy:false,error:'',userId:'',badges:{echo:0,buddy:0,play:0},
  echo:{loaded:false,loading:false,rows:[],profiles:{}},
  buddy:{loaded:false,loading:false,tab:'messages',rows:[],profiles:{},conversations:[],latest:{},unread:{},search:[],searching:false},
  chat:emptyChat(),
  stickers:{loaded:false,loading:false,rows:[]}
};

let badgeChannel=null;
let chatSession=null;
let badgePromise=null;
let badgeTimer=null;
let badgeRefreshQueued=false;
let buddyTimer=null;
let echoTimer=null;
let buddyPromise=null;
let buddyRefreshQueued=false;
let echoProfilePromise=null;
let buddyProfilePromise=null;
let chatSessionSequence=0;
let pendingMessageSequence=0;
const privateReadPromises=new Map();
const privateReadQueued=new Set();
const privateReadMessages=new Map();
let privateReadRevision=0;
let privateUnreadReady=false;
let replyCache={userId:'',at:0,rows:[]};
let hydratedEchoUser='';
let hydratedBuddyUser='';
let hydratedStickersUser='';
let hydratedBadgesUser='';
let hydratedChatUser='';
let echoRequested=false;
let buddyRequested=false;
let stickersRequested=false;

function emit(){const snapshot={...state,badges:{...state.badges},echo:{...state.echo},buddy:{...state.buddy},chat:{...state.chat},stickers:{...state.stickers}};listeners.forEach(fn=>fn(snapshot));}
function countContent(){if(window.__FW_DESKTOP_V11__) window.__FW_DESKTOP_V11__.socialContentRequests=(window.__FW_DESKTOP_V11__.socialContentRequests||0)+1;}
function fail(result,label){if(result?.error) throw new Error(uiErrorMessage(result.error,`${label}，请稍后重试。`));return result?.data;}
function cacheUser(){return authStore.state.user||null;}
function currentUser(){return authStore.state.user && !authStore.state.user.cached ? authStore.state.user : null;}
function unique(values){return Array.from(new Set((values||[]).filter(Boolean).map(String)));}
function contentSignature(...values){try{return JSON.stringify(values);}catch{return'';}}
const PRIVATE_MESSAGE_FIELDS='id,conversation_id,sender_id,content,is_deleted,created_at,recalled_at';
const RECALL_WINDOW_MS=120000;
export function canRecallPrivateMessage(row,userId){
  return Boolean(row&&userId&&String(row.sender_id)===String(userId)&&!row.__pending&&!row.recalled_at&&!row.is_deleted&&
    Date.now()-new Date(row.created_at).getTime()<=RECALL_WINDOW_MS);
}

function emptyChat(){return{targetId:'',conversationId:null,profile:null,rows:[],loading:false,sending:false,hasMore:false,historyCursor:null,historyLoading:false,historyError:'',historyPage:0};}

async function hydrateBadgesCache(userId){
  if(!userId||hydratedBadgesUser===userId)return false;hydratedBadgesUser=userId;
  const cached=await desktopCache.read('badges',userId);const payload=cached?.payload;
  if(String(cacheUser()?.id)!==String(userId)||!payload?.badges)return false;
  state.badges={echo:Number(payload.badges.echo||0),buddy:privateUnreadReady?state.badges.buddy:payload.unreadVersion===PRIVATE_UNREAD_CACHE_VERSION?Number(payload.badges.buddy||0):0,play:Number(payload.badges.play||0)};emit();return true;
}
function persistBadgesCache(userId=cacheUser()?.id){if(!userId)return Promise.resolve(false);return desktopCache.write('badges',userId,{badges:state.badges,unreadVersion:PRIVATE_UNREAD_CACHE_VERSION});}
async function hydrateEchoCache(userId){
  if(!userId||hydratedEchoUser===userId)return false;hydratedEchoUser=userId;
  const cached=await desktopCache.read('echo',userId);const payload=cached?.payload;
  if(!payload||!Array.isArray(payload.rows))return false;
  state.echo={loaded:true,loading:false,rows:payload.rows.filter(row=>ECHO_TYPES.includes(row.type)).slice(0,100),profiles:payload.profiles&&typeof payload.profiles==='object'?payload.profiles:{}};emit();return true;
}
function persistEchoCache(userId=cacheUser()?.id){if(!userId)return Promise.resolve(false);return desktopCache.write('echo',userId,{rows:state.echo.rows.slice(0,100),profiles:state.echo.profiles});}
async function hydrateBuddyCache(userId){
  if(!userId||hydratedBuddyUser===userId)return false;hydratedBuddyUser=userId;
  const cached=await desktopCache.read('buddy',userId);const payload=cached?.payload;
  if(String(cacheUser()?.id)!==String(userId)||!payload||!Array.isArray(payload.rows))return false;
  state.buddy={...state.buddy,loaded:true,loading:false,rows:payload.rows,profiles:payload.profiles||{},conversations:payload.conversations||[],latest:payload.latest||{},unread:privateUnreadReady?state.buddy.unread:payload.unreadVersion===PRIVATE_UNREAD_CACHE_VERSION?payload.unread||{}:{},search:[],searching:false};emit();return true;
}
function persistBuddyCache(userId=cacheUser()?.id){
  if(!userId)return Promise.resolve(false);
  return desktopCache.write('buddy',userId,{rows:state.buddy.rows,profiles:state.buddy.profiles,conversations:state.buddy.conversations,latest:state.buddy.latest,unread:state.buddy.unread,unreadVersion:PRIVATE_UNREAD_CACHE_VERSION});
}
async function hydrateChatCache(session){
  const {userId,targetId}=session;
  hydratedChatUser=userId;
  const cached=await desktopCache.read('chat',userId,targetId);const payload=cached?.payload;
  if(!isCurrentChat(session))return false;
  if(!payload||!Array.isArray(payload.rows))return false;
  state.chat={...emptyChat(),targetId:String(targetId),conversationId:payload.conversationId||null,profile:state.buddy.profiles[targetId]||payload.profile||null,rows:payload.rows.filter(row=>!row.__pending).slice(-CHAT_PAGE_SIZE),loading:true};emit();return true;
}
function persistChatCache(userId=cacheUser()?.id){
  if(!userId||!state.chat.targetId)return Promise.resolve(false);
  const rows=state.chat.rows.filter(row=>!row.__pending);return desktopCache.write('chat',userId,{conversationId:state.chat.conversationId,profile:state.chat.profile,rows:rows.slice(-200)},state.chat.targetId);
}
async function hydrateStickersCache(userId){
  if(!userId||hydratedStickersUser===userId)return false;hydratedStickersUser=userId;
  const cached=await desktopCache.read('stickers',userId);const payload=cached?.payload;
  if(!payload||!Array.isArray(payload.rows))return false;
  state.stickers={loaded:true,loading:false,rows:payload.rows.slice(0,membershipStore.stickerLimit())};emit();return true;
}
function persistStickersCache(userId=cacheUser()?.id){if(!userId)return Promise.resolve(false);return desktopCache.write('stickers',userId,{rows:state.stickers.rows.slice(0,membershipStore.stickerLimit())});}

function clearSocialState(){
  state.userId='';state.ready=true;state.error='';state.badges={echo:0,buddy:0,play:0};
  state.echo={loaded:false,loading:false,rows:[],profiles:{}};
  state.buddy={loaded:false,loading:false,tab:'messages',rows:[],profiles:{},conversations:[],latest:{},unread:{},search:[],searching:false};
  state.chat=emptyChat();
  state.stickers={loaded:false,loading:false,rows:[]};
  hydratedEchoUser='';hydratedBuddyUser='';hydratedStickersUser='';hydratedBadgesUser='';hydratedChatUser='';teardownChannels();emit();
}

async function fetchProfiles(ids,existing={},refresh=false){
  const requested=unique(ids);const wanted=refresh?requested:requested.filter(id=>!existing[id]);
  if(!wanted.length) return existing;
  countContent();
  const rows=fail(await client.from('profiles').select('id,nickname,avatar_url,lab_code').in('id',wanted),'读取研究员资料失败')||[];
  const map={...existing};rows.forEach(row=>{map[row.id]=row;});return map;
}

function refreshEchoProfiles(){
  if(echoProfilePromise)return echoProfilePromise;
  const user=currentUser();const ids=unique(state.echo.rows.map(row=>row.actor_id));if(!user?.id||!ids.length)return Promise.resolve(state.echo.profiles);
  const previousSignature=contentSignature(state.echo.profiles);
  echoProfilePromise=fetchProfiles(ids,state.echo.profiles,true).then(async profiles=>{if(state.userId!==user.id)return state.echo.profiles;const changed=previousSignature!==contentSignature(profiles);if(changed){state.echo={...state.echo,profiles};await persistEchoCache(user.id);emit();}return profiles;}).catch(()=>state.echo.profiles).finally(()=>{echoProfilePromise=null;});
  return echoProfilePromise;
}

function refreshBuddyProfiles(){
  if(buddyProfilePromise)return buddyProfilePromise;
  const user=currentUser();const ids=unique(state.buddy.rows.flatMap(row=>[row.requester_id,row.receiver_id]).concat(state.chat.targetId||[]));if(!user?.id||!ids.length)return Promise.resolve(state.buddy.profiles);
  const previousSignature=contentSignature(state.buddy.profiles);
  buddyProfilePromise=fetchProfiles(ids,state.buddy.profiles,true).then(async profiles=>{if(state.userId!==user.id)return state.buddy.profiles;const changed=previousSignature!==contentSignature(profiles);if(changed){state.buddy={...state.buddy,profiles};if(state.chat.targetId&&profiles[state.chat.targetId])state.chat={...state.chat,profile:profiles[state.chat.targetId]};await persistBuddyCache(user.id);if(state.chat.targetId)await persistChatCache(user.id);emit();}return profiles;}).catch(()=>state.buddy.profiles).finally(()=>{buddyProfilePromise=null;});
  return buddyProfilePromise;
}

function scheduleBadges(){clearTimeout(badgeTimer);badgeTimer=setTimeout(()=>refreshBadges(true),180);}
function scheduleBuddyReload(){clearTimeout(buddyTimer);buddyTimer=setTimeout(()=>loadBuddy(true),180);}
function scheduleEchoReload(){clearTimeout(echoTimer);echoTimer=setTimeout(()=>loadEcho(true).catch(()=>{}),180);}

async function refreshBadges(force=false){
  const user=currentUser();
  if(!user?.id)return state.badges;
  if(!force&&hydratedBadgesUser!==user.id)await hydrateBadgesCache(user.id);
  if(badgePromise){if(force)badgeRefreshQueued=true;return badgePromise;}
  const revision=privateReadRevision;
  badgePromise=(async()=>{
    const [echoResult,privateResult,requestResult,partyResult]=await Promise.all([
      client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('is_read',false).in('type',ECHO_TYPES),
      client.rpc('fw_private_unread_counts'),
      client.from('friendships').select('id',{count:'exact',head:true}).eq('receiver_id',user.id).eq('status','pending'),
      client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('is_read',false).in('type',PARTY_ALERT_TYPES)
    ]);
    if(state.userId!==user.id)return state.badges;
    const next={
      echo:echoResult.error?state.badges.echo:Number(echoResult.count||0),
      buddy:state.badges.buddy,
      play:partyResult.error?state.badges.play:Number(partyResult.count||0)
    };
    let unreadChanged=false;
    if(!privateResult.error&&!requestResult.error&&revision===privateReadRevision&&!privateReadPromises.size){
      const unread=Object.fromEntries((privateResult.data||[]).map(row=>[String(row.actor_id),Number(row.unread)||0]));
      next.buddy=Object.values(unread).reduce((total,count)=>total+count,Number(requestResult.count||0));
      unreadChanged=contentSignature(state.buddy.unread)!==contentSignature(unread);
      if(unreadChanged)state.buddy={...state.buddy,unread};
      privateUnreadReady=true;
    }
    const changed=contentSignature(state.badges)!==contentSignature(next);
    state.badges=next;
    if(changed||unreadChanged)emit();
    persistBadgesCache(user.id).catch(()=>{});
    if(unreadChanged&&state.buddy.loaded)persistBuddyCache(user.id).catch(()=>{});
    return state.badges;
  })().catch(()=>state.badges).finally(()=>{
    badgePromise=null;
    if(badgeRefreshQueued){badgeRefreshQueued=false;queueMicrotask(()=>refreshBadges(false));}
  });
  return badgePromise;
}

function teardownChannels(){
  clearTimeout(badgeTimer);clearTimeout(buddyTimer);clearTimeout(echoTimer);badgeRefreshQueued=false;buddyRefreshQueued=false;discardChatSession();privateReadPromises.clear();privateReadQueued.clear();privateReadMessages.clear();privateReadRevision++;privateUnreadReady=false;
  if(badgeChannel){client.removeChannel(badgeChannel);badgeChannel=null;}
}

function startBadgeChannel(userId){
  if(badgeChannel) client.removeChannel(badgeChannel);
  badgeChannel=client.channel(`desktop-v11-unread-${userId}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`user_id=eq.${userId}`},payload=>{
      if(state.userId!==userId)return;
      const row=payload?.new||payload?.old||{};scheduleBadges();
      if(ECHO_TYPES.includes(row.type)&&state.echo.loaded)scheduleEchoReload();
      if(payload?.eventType==='INSERT'&&row.type===PRIVATE_TYPE&&row.actor_id){
        const actorId=String(row.actor_id);
        const messageId=row.target_type==='private_message'?Number(row.target_id):0;
        if(chatSession?.targetId===actorId&&messageId>0)queueMissingMessage(chatSession,messageId);
        const preview={id:`notice-${row.target_id||row.id}`,sender_id:actorId,content:row.content||'',created_at:row.created_at};
        if(state.buddy.loaded&&updateBuddyPreview(actorId,preview)){emit();persistBuddyCache(userId).catch(()=>{});}
      }
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'private_messages'},payload=>{
      if(state.userId!==userId||!payload.new?.recalled_at)return;
      applyPrivateRecall(payload.new);
      if(state.buddy.loaded)scheduleBuddyReload();
      scheduleBadges();
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'friendships',filter:`receiver_id=eq.${userId}`},()=>{if(state.userId!==userId)return;scheduleBadges();if(state.buddy.loaded)scheduleBuddyReload();})
    .on('postgres_changes',{event:'*',schema:'public',table:'friendships',filter:`requester_id=eq.${userId}`},()=>{if(state.userId!==userId)return;if(state.buddy.loaded)scheduleBuddyReload();})
    .subscribe(status=>{
      if(status==='SUBSCRIBED'&&state.userId===userId)scheduleBadges();
    });
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
  echoRequested=true;
  const identity=cacheUser();
  if(!identity?.id)return state.echo.rows;
  if(!force&&!state.echo.loaded){const hit=await hydrateEchoCache(identity.id);if(hit){if(currentUser()?.id)loadEcho(true).catch(()=>{});return state.echo.rows;}}
  const user=currentUser();
  if(!user?.id){if(!state.echo.loaded&&!state.echo.loading){state.echo={...state.echo,loading:true};emit();}return state.echo.rows;}
  if(state.echo.loading)return state.echo.rows;
  if(!force&&state.echo.loaded){refreshEchoProfiles().catch(()=>{});return state.echo.rows;}
  const showInitial=!state.echo.loaded;const previousSignature=contentSignature(state.echo.rows,state.echo.profiles);
  state.echo={...state.echo,loading:true};if(showInitial)emit();
  try{
    countContent();
    let rows=fail(await client.from('notifications').select('id,actor_id,type,target_type,target_id,content,is_read,created_at').eq('user_id',user.id).in('type',ECHO_TYPES).order('created_at',{ascending:false}).limit(100),'读取回声失败')||[];
    rows=await resolveReplyPosts(rows);
    const formalTargets=new Set(rows.filter(row=>row.type==='comment_reply'&&row.target_id).map(row=>String(row.target_id)));
    const fallback=(await replyFallback(user.id,force)).filter(row=>!formalTargets.has(String(row.target_id)));
    rows=rows.concat(fallback).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,100);
    const profiles=await fetchProfiles(rows.map(row=>row.actor_id),state.echo.profiles,true);if(state.userId!==user.id)return state.echo.rows;const changed=previousSignature!==contentSignature(rows,profiles);
    state.echo={loaded:true,loading:false,rows,profiles};await persistEchoCache(user.id);if(changed||showInitial)emit();
    return state.echo.rows;
  }catch(error){state.echo={...state.echo,loaded:true,loading:false};state.error=error.message||'回声读取失败';if(showInitial)emit();return state.echo.rows;}
}

async function markEchoRead(ids){
  const user=currentUser();if(!user?.id) return;
  const wanted=unique(ids);if(!wanted.length) return;
  const wantedSet=new Set(wanted);
  const databaseReadCount=state.echo.rows.filter(row=>!row.is_read&&wantedSet.has(String(row.id))&&/^\d+$/.test(String(row.id))).length;
  state.echo={...state.echo,rows:state.echo.rows.map(row=>wantedSet.has(String(row.id))?{...row,is_read:true}:row)};
  state.badges={...state.badges,echo:Math.max(0,Number(state.badges.echo||0)-databaseReadCount)};emit();persistEchoCache(user.id).catch(()=>{});persistBadgesCache(user.id).catch(()=>{});
  const fallback=wanted.filter(id=>id.startsWith('reply-')).map(id=>id.slice(6));
  if(fallback.length){const read=replyReadSet(user.id);fallback.forEach(id=>read.add(String(id)));saveReplyRead(user.id,read);}
  const database=wanted.filter(id=>/^\d+$/.test(id)).map(Number);
  if(database.length) await client.from('notifications').update({is_read:true}).eq('user_id',user.id).in('id',database);
  await refreshBadges(true);
}

async function markAllEchoRead(){
  const user=currentUser();if(!user?.id)return;
  const fallback=state.echo.rows.filter(row=>!row.is_read&&String(row.id).startsWith('reply-')).map(row=>String(row.id).slice(6));
  if(fallback.length){const read=replyReadSet(user.id);fallback.forEach(id=>read.add(id));saveReplyRead(user.id,read);}
  state.echo={...state.echo,rows:state.echo.rows.map(row=>({...row,is_read:true}))};state.badges={...state.badges,echo:0};emit();
  persistEchoCache(user.id).catch(()=>{});persistBadgesCache(user.id).catch(()=>{});
  const result=await client.from('notifications').update({is_read:true}).eq('user_id',user.id).eq('is_read',false).in('type',ECHO_TYPES);
  if(result.error){await Promise.allSettled([loadEcho(true),refreshBadges(true)]);throw new Error(`全部已读失败：${result.error.message}`);}
  await refreshBadges(true);
}

function otherId(row,userId){return String(row.requester_id)===String(userId)?String(row.receiver_id):String(row.requester_id);}

async function loadBuddy(force=false){
  buddyRequested=true;
  const identity=cacheUser();
  if(!identity?.id)return state.buddy.rows;
  if(!force&&!state.buddy.loaded){const hit=await hydrateBuddyCache(identity.id);if(hit){if(currentUser()?.id)loadBuddy(true).catch(()=>{});return state.buddy.rows;}}
  const user=currentUser();
  if(!user?.id){if(!state.buddy.loaded&&!state.buddy.loading){state.buddy={...state.buddy,loading:true};emit();}return state.buddy.rows;}
  if(buddyPromise){if(force)buddyRefreshQueued=true;return buddyPromise;}
  if(!force&&state.buddy.loaded){refreshBuddyProfiles().catch(()=>{});return state.buddy.rows;}
  const showInitial=!state.buddy.loaded;const previewsAtStart=state.buddy.latest;
  state.buddy={...state.buddy,loading:true};if(showInitial)emit();
  buddyPromise=(async()=>{try{
    countContent();
    const friendships=fail(await client.from('friendships').select('id,requester_id,receiver_id,status,created_at,updated_at').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`).order('updated_at',{ascending:false}),'读取搭子列表失败')||[];
    const profiles=await fetchProfiles(friendships.flatMap(row=>[row.requester_id,row.receiver_id]),state.buddy.profiles,true);
    const accepted=friendships.filter(row=>row.status==='accepted');
    const buddyIds=accepted.map(row=>otherId(row,user.id));
    let conversations=[];let latest={};
    if(buddyIds.length){
      countContent();
      const conv=await client.from('conversations').select('id,user_one_id,user_two_id,updated_at').or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`).order('updated_at',{ascending:false});
      if(conv.error) throw conv.error;conversations=conv.data||[];
      const convToBuddy={};conversations.forEach(row=>{const oid=String(row.user_one_id)===String(user.id)?String(row.user_two_id):String(row.user_one_id);if(buddyIds.includes(oid)) convToBuddy[String(row.id)]=oid;});
      const convIds=Object.keys(convToBuddy).map(Number);
      if(convIds.length){
        countContent();
        const messages=await client.from('private_messages').select(PRIVATE_MESSAGE_FIELDS).in('conversation_id',convIds).eq('is_deleted',false).order('created_at',{ascending:false}).limit(Math.max(160,convIds.length*8));
        if(messages.error) throw messages.error;
        (messages.data||[]).forEach(row=>{const oid=convToBuddy[String(row.conversation_id)];if(oid&&!latest[oid]) latest[oid]=row;});
      }
    }
    if(state.userId!==user.id)return state.buddy.rows;
    for(const buddyId of buddyIds){
      const live=state.buddy.latest[buddyId];
      if(live&&preferPreview(live,latest[buddyId]))latest[buddyId]=live;
      else if(!live&&previewsAtStart[buddyId])delete latest[buddyId];
    }
    const changed=contentSignature(state.buddy.rows,state.buddy.profiles,state.buddy.conversations,state.buddy.latest)
      !==contentSignature(friendships,profiles,conversations,latest);
    state.buddy={...state.buddy,loaded:true,loading:false,rows:friendships,profiles,conversations,latest};
    if(changed||showInitial)emit();
    await persistBuddyCache(user.id);
    return state.buddy.rows;
  }catch(error){if(state.userId===user.id){state.buddy={...state.buddy,loaded:true,loading:false};state.error=error.message||'搭子读取失败';if(showInitial)emit();}return state.buddy.rows;}
  finally{buddyPromise=null;if(buddyRefreshQueued){buddyRefreshQueued=false;queueMicrotask(()=>loadBuddy(true));}}})();
  return buddyPromise;
}

function setBuddyTab(tab){
  const nextTab=['messages','friends','new'].includes(tab)?tab:'messages';
  if(state.buddy.tab===nextTab&&!state.buddy.search.length)return;
  if(state.buddy.tab!==nextTab){discardChatSession();state.chat=emptyChat();}
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

function canReadPrivate(actorId){
  const box=document.querySelector('[data-chat-messages]');
  return Boolean(actorId&&String(state.chat.targetId)===String(actorId)&&box?.dataset.target===String(actorId)&&
    !state.chat.loading&&windowIsActive()&&document.querySelector('#app')?.dataset.view==='buddy'&&
    box.clientHeight&&box.scrollHeight-box.scrollTop-box.clientHeight<70);
}
async function markPrivateRead(actorId){
  const user=currentUser();
  if(!user?.id||!canReadPrivate(actorId)||chatSession?.missingIds.size)return;
  const key=String(actorId);
  const newest=state.chat.rows.findLast(row=>!row.__pending&&row.created_at);
  if(!newest||privateReadMessages.get(key)===String(newest.id))return;
  const existing=privateReadPromises.get(key);
  if(existing){privateReadQueued.add(key);return existing;}

  const previousUnread=Number(state.buddy.unread[key]||0);
  privateReadRevision++;
  const promise=client.from('notifications').update({is_read:true})
    .eq('user_id',user.id).eq('is_read',false).eq('type',PRIVATE_TYPE).eq('actor_id',key)
    .lte('created_at',newest.created_at)
    .then(result=>{
      if(result.error)throw result.error;
      if(state.userId===user.id){
        privateReadMessages.set(key,String(newest.id));
        if(state.buddy.loaded)persistBuddyCache(user.id).catch(()=>{});
      }
    }).catch(()=>{
      if(state.userId!==user.id||!previousUnread)return;
      state.buddy={...state.buddy,unread:{...state.buddy.unread,[key]:previousUnread}};
      state.badges={...state.badges,buddy:state.badges.buddy+previousUnread};
      emit();
    }).finally(()=>{
      if(privateReadPromises.get(key)!==promise)return;
      privateReadPromises.delete(key);
      privateReadRevision++;
      scheduleBadges();
      if(privateReadQueued.delete(key)&&privateReadMessages.get(key)===String(newest.id)){
        queueMicrotask(()=>markPrivateRead(key));
      }
    });
  privateReadPromises.set(key,promise);
  if(previousUnread){
    const unread={...state.buddy.unread};
    delete unread[key];
    state.buddy={...state.buddy,unread};
    state.badges={...state.badges,buddy:Math.max(0,state.badges.buddy-previousUnread)};
    emit();
  }
  return promise;
}

function mergeMessages(...groups){
  const byId=new Map();
  groups.flat().filter(row=>row&&!row.is_deleted).forEach(row=>{
    const key=String(row.id);
    if(!byId.get(key)?.recalled_at||row.recalled_at)byId.set(key,row);
  });
  return Array.from(byId.values()).sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0)||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
}
function messageId(row){return Number(String(row?.id||'').replace(/^notice-/,''))||0;}

function preferPreview(candidate,previous){
  if(!previous)return true;
  if(previous.__pending&&!candidate.__pending&&candidate.sender_id===previous.sender_id&&candidate.content===previous.content)return true;
  const candidateId=messageId(candidate),previousId=messageId(previous);
  if(candidateId&&candidateId===previousId){
    if(Boolean(candidate.recalled_at)!==Boolean(previous.recalled_at))return Boolean(candidate.recalled_at);
    return String(previous.id).startsWith('notice-')&&!String(candidate.id).startsWith('notice-');
  }
  const time=Date.parse(candidate.created_at)-Date.parse(previous.created_at);
  return time>0||(time===0&&candidateId>previousId);
}

function updateBuddyPreview(targetId,row){
  if(!preferPreview(row,state.buddy.latest[targetId]))return false;
  state.buddy={...state.buddy,latest:{...state.buddy.latest,[targetId]:row}};
  return true;
}

function mergePrivateRows(existing,incoming){
  const seen=new Set(existing.map(row=>String(row.id)));
  const pending=existing.filter(row=>row.__pending);
  const confirmed=new Set();
  for(const row of incoming){
    if(row.is_deleted||row.recalled_at||seen.has(String(row.id)))continue;
    const match=pending.find(item=>!confirmed.has(item.id)&&item.sender_id===row.sender_id&&item.content===row.content);
    if(match)confirmed.add(match.id);
    seen.add(String(row.id));
  }
  return mergeMessages(existing.filter(row=>!confirmed.has(row.id)),incoming);
}

function applyPrivateRecall(row){
  if(!row?.recalled_at)return;
  const owner=currentUser()?.id;
  if(!owner)return;
  const conversation=state.buddy.conversations.find(item=>String(item.id)===String(row.conversation_id));
  const open=String(state.chat.conversationId)===String(row.conversation_id);
  const target=open?state.chat.targetId:conversation
    ?String(String(conversation.user_one_id)===String(owner)?conversation.user_two_id:conversation.user_one_id)
    :'';
  const matches=item=>item&&[String(row.id),'notice-'+row.id].includes(String(item.id));

  if(open&&state.chat.rows.some(matches)){
    state.chat={...state.chat,rows:mergeMessages(state.chat.rows,row)};
    persistChatCache(owner).catch(()=>{});
  }else if(target&&!open){
    desktopCache.read('chat',owner,target).then(cached=>{
      if(state.userId!==owner||state.chat.targetId===target||!cached?.payload?.rows?.some(matches))return;
      const payload=cached.payload;
      return desktopCache.write('chat',owner,{...payload,rows:mergeMessages(payload.rows,row)},target);
    }).catch(()=>{});
  }
  if(target&&matches(state.buddy.latest[target])){
    state.buddy={...state.buddy,latest:{...state.buddy.latest,[target]:row}};
    persistBuddyCache(owner).catch(()=>{});
  }
  emit();
}

async function recallMessage(id){
  const owner=currentUser()?.id;
  const message=state.chat.rows.find(row=>String(row.id)===String(id));
  if(!canRecallPrivateMessage(message,owner))throw new Error('只能在 2 分钟内撤回自己发送的消息。');
  const recalled=fail(await client.rpc('fw_recall_private_message',{p_message_id:id}),'撤回失败');
  if(currentUser()?.id===owner)applyPrivateRecall(recalled);
}

function isCurrentChat(session){
  return Boolean(session&&chatSession===session&&String(cacheUser()?.id||'')===session.userId);
}

function discardChatSession(){
  const previous=chatSession;
  chatSession=null;
  if(!previous)return;
  clearTimeout(previous.noticeTimer);
  clearTimeout(previous.joinTimer);
  if(previous.channel)client.removeChannel(previous.channel);
}

function applyChatRows(session,rows){
  if(!isCurrentChat(session)||!rows.length)return;
  const visible=rows.filter(row=>!session.hiddenIds.has(messageId(row)));
  const existing=state.chat.rows;
  const byId=new Map(existing.map(row=>[String(row.id),row]));
  const changes=visible.filter(row=>{
    const previous=byId.get(String(row.id));
    return !previous||(!previous.recalled_at||row.recalled_at)&&
      (previous.content!==row.content||previous.recalled_at!==row.recalled_at||previous.is_deleted!==row.is_deleted);
  });
  const latest=visible.filter(row=>!row.is_deleted).reduce((best,row)=>preferPreview(row,best)?row:best,null);
  const previewChanged=latest&&updateBuddyPreview(session.targetId,latest);
  if(changes.length)state.chat={...state.chat,rows:mergePrivateRows(existing,changes)};
  if(changes.length||previewChanged)emit();
  if(changes.length)persistChatCache(session.userId).catch(()=>{});
  if(previewChanged)persistBuddyCache(session.userId).catch(()=>{});
}

function reconcileSentMessage(conversationId,targetId,userId){
  if(!Number.isFinite(Number(conversationId))||Number(conversationId)<=0)return;
  countContent();
  client.from('private_messages').select(PRIVATE_MESSAGE_FIELDS).eq('conversation_id',conversationId).eq('is_deleted',false)
    .order('id',{ascending:false}).limit(1).then(result=>{
      const row=result?.data?.[0];
      if(currentUser()?.id!==userId||result?.error||!row)return;
      if(chatSession?.targetId===targetId&&chatSession.conversationId===Number(conversationId))applyChatRows(chatSession,[row]);
      else if(updateBuddyPreview(targetId,row)){emit();persistBuddyCache(userId).catch(()=>{});}
    }).catch(()=>{});
}

function queueMissingMessage(session,id){
  if(!isCurrentChat(session)||session.hiddenIds.has(id)||state.chat.rows.some(row=>messageId(row)===id))return;
  session.missingIds.add(id);
  scheduleMissingMessages(session);
}

function scheduleMissingMessages(session,delay=120){
  if(session.noticeTimer)return;
  session.noticeTimer=setTimeout(()=>{
    session.noticeTimer=null;
    if(!isCurrentChat(session)||!session.missingIds.size)return;
    refreshChat().catch(()=>{
      if(isCurrentChat(session)&&session.missingIds.size&&++session.noticeFailures<3){
        scheduleMissingMessages(session,500*session.noticeFailures);
      }
    });
  },delay);
}

async function syncChatMessages(session,verifyRecent,ids){
  // Only advance the cursor after a REST read. A newer realtime event may
  // arrive even though an earlier one was missed while the channel rejoined.
  const {conversationId,cursor}=session;
  const query=()=>client.from('private_messages').select(PRIVATE_MESSAGE_FIELDS)
    .eq('conversation_id',conversationId).eq('is_deleted',false);
  const olderIds=ids.filter(id=>id<=cursor);
  if(olderIds.length){
    countContent();
    const rows=fail(await query().in('id',olderIds),'同步私聊失败')||[];
    if(!isCurrentChat(session))return;
    applyChatRows(session,rows);
  }
  // On reconnect, also check a small overlap for missed recalls.
  const recent=state.chat.rows.filter(row=>!row.__pending&&messageId(row)<=cursor).slice(-50);
  let after=verifyRecent&&recent.length?Math.min(...recent.map(messageId))-1:cursor;
  while(isCurrentChat(session)){
    countContent();
    const rows=fail(await query().gt('id',after).order('id',{ascending:true}).limit(CHAT_PAGE_SIZE),'同步私聊失败')||[];
    if(!isCurrentChat(session))return;
    applyChatRows(session,rows);
    const last=rows.reduce((max,row)=>Math.max(max,messageId(row)),after);
    session.cursor=Math.max(session.cursor,last);
    if(rows.length<CHAT_PAGE_SIZE||last<=after)break;
    after=last;
  }
  ids.forEach(id=>session.missingIds.delete(id));
  session.noticeFailures=0;
  requestAnimationFrame(()=>{if(isCurrentChat(session))markPrivateRead(session.targetId);});
}

function refreshChat({verifyRecent=false}={}){
  const session=chatSession;
  if(!isCurrentChat(session)||!currentUser()?.id)return Promise.resolve();
  session.verifyRecent||=verifyRecent;
  session.refreshQueued=true;
  if(!session.ready)return session.opening||openChat(session.targetId);
  if(!session.syncing){
    session.syncing=(async()=>{
      while(isCurrentChat(session)&&session.refreshQueued){
        session.refreshQueued=false;
        const verify=session.verifyRecent;
        session.verifyRecent=false;
        await syncChatMessages(session,verify,[...session.missingIds]);
      }
    })().finally(()=>{session.syncing=null;});
  }
  return session.syncing;
}

function subscribeChat(session){
  if(session.channel)client.removeChannel(session.channel);
  const {conversationId}=session;
  const channel=client.channel(`desktop-v11-chat-${conversationId}-${++chatSessionSequence}`);
  session.channel=channel;
  const current=()=>isCurrentChat(session)&&session.channel===channel;
  const catchUp=()=>{
    if(!current()||(!session.ready&&!session.fetching))return;
    clearTimeout(session.joinTimer);
    session.joinTimer=setTimeout(()=>{
      if(current())refreshChat({verifyRecent:session.ready}).catch(()=>{});
    },80);
  };
  channel.on('postgres_changes',{event:'INSERT',schema:'public',table:'private_messages',filter:`conversation_id=eq.${conversationId}`},payload=>{
    const row=payload.new;
    if(!current()||!row||row.is_deleted||Number(row.conversation_id)!==conversationId)return;
    session.missingIds.delete(messageId(row));
    applyChatRows(session,[row]);
    if(String(row.sender_id)!==session.userId)requestAnimationFrame(()=>{if(current())markPrivateRead(session.targetId);});
  }).on('system',{},payload=>{
    if(payload.extension==='postgres_changes'&&payload.status==='ok')catchUp();
  }).subscribe(status=>{if(status==='SUBSCRIBED')catchUp();});
}

function refreshChatProfile(session){
  const {targetId,userId}=session;
  fetchProfiles([targetId],{},true).then(profiles=>{
    if(!isCurrentChat(session))return;
    const profile=profiles[targetId];
    if(!profile||contentSignature(profile)===contentSignature(state.chat.profile))return;
    state.buddy={...state.buddy,profiles:{...state.buddy.profiles,[targetId]:profile}};
    state.chat={...state.chat,profile};
    emit();
    persistBuddyCache(userId).catch(()=>{});
    if(session.ready)persistChatCache(userId).catch(()=>{});
  }).catch(()=>{});
}

async function openChat(targetId){
  const identity=cacheUser();
  if(!identity?.id)throw new Error('请先登录。');
  const wantedTarget=String(targetId),userId=String(identity.id);
  if(isCurrentChat(chatSession)&&chatSession.targetId===wantedTarget){
    if(chatSession.opening)return chatSession.opening;
    if(chatSession.ready){
      if(chatSession.missingIds.size)refreshChat().catch(()=>{});
      return state.chat.rows;
    }
    if(!currentUser())return state.chat.rows;
  }
  discardChatSession();
  const session={userId,targetId:wantedTarget,channel:null,conversationId:null,opening:null,fetching:false,ready:false,
    cursor:0,refreshQueued:false,verifyRecent:false,syncing:null,missingIds:new Set(),hiddenIds:new Set(),noticeTimer:null,joinTimer:null,noticeFailures:0};
  chatSession=session;
  session.opening=(async()=>{
    const cacheHit=await hydrateChatCache(session);
    if(!isCurrentChat(session))return;
    if(!cacheHit){
      state.chat={...emptyChat(),targetId:wantedTarget,profile:state.buddy.profiles[wantedTarget]||null,loading:true};
      emit();
    }
    if(!currentUser()?.id)return state.chat.rows;
    refreshChatProfile(session);
    try{
      countContent();
      const convId=Number(fail(await client.rpc('fw_get_or_create_conversation',{target_user_id:wantedTarget}),'打开私聊失败'));
      if(!isCurrentChat(session))return;
      if(!Number.isFinite(convId)||convId<=0)throw new Error('私聊会话创建失败。');
      session.conversationId=convId;
      state.chat={...state.chat,conversationId:convId};
      subscribeChat(session);
      countContent();
      session.fetching=true;
      const rows=fail(await client.from('private_messages').select(PRIVATE_MESSAGE_FIELDS).eq('conversation_id',convId)
        .eq('is_deleted',false).order('id',{ascending:false}).limit(CHAT_PAGE_SIZE+1),'读取私聊失败')||[];
      if(!isCurrentChat(session))return;
      const page=rows.slice(0,CHAT_PAGE_SIZE);
      session.cursor=messageId(page[0]);
      session.ready=true;
      const visible=page.filter(row=>!session.hiddenIds.has(messageId(row)));
      state.chat={...state.chat,rows:mergePrivateRows(state.chat.rows,visible),loading:false,
        hasMore:rows.length>CHAT_PAGE_SIZE,historyCursor:page.at(-1)?.id||null};
      for(const row of state.chat.rows){if(!row.__pending)session.missingIds.delete(messageId(row));}
      if(visible[0])updateBuddyPreview(wantedTarget,visible[0]);
      emit();
      persistChatCache(userId).catch(()=>{});
      if(state.buddy.loaded)persistBuddyCache(userId).catch(()=>{});
      requestAnimationFrame(()=>{if(isCurrentChat(session))markPrivateRead(wantedTarget);});
      if(session.refreshQueued||session.missingIds.size)refreshChat().catch(()=>{});
    }catch(error){
      if(!isCurrentChat(session))return;
      state.chat={...state.chat,loading:false};
      emit();
      if(!cacheHit)throw error;
    }finally{session.fetching=false;}
  })().finally(()=>{session.opening=null;});
  return session.opening;
}

async function loadEarlierChat(){
  const user=currentUser(),chat=state.chat,session=chatSession;
  if(!user?.id||!chat.targetId||!chat.conversationId||chat.loading||chat.historyLoading||!chat.hasMore||chat.historyCursor==null)return;
  const {targetId,conversationId,historyCursor}=chat;
  const current=()=>isCurrentChat(session)&&state.chat.targetId===targetId&&state.chat.conversationId===conversationId;
  state.chat={...chat,historyLoading:true,historyError:''};emit();
  try{
    countContent();const rows=fail(await client.from('private_messages').select(PRIVATE_MESSAGE_FIELDS).eq('conversation_id',conversationId).eq('is_deleted',false).lt('id',historyCursor).order('id',{ascending:false}).limit(CHAT_PAGE_SIZE+1),'读取更早消息失败')||[];
    if(!current())return;
    const page=rows.slice(0,CHAT_PAGE_SIZE);
    const visible=page.filter(row=>!session.hiddenIds.has(messageId(row)));
    state.chat={...state.chat,rows:mergeMessages(state.chat.rows,visible),hasMore:rows.length>CHAT_PAGE_SIZE,historyCursor:page.at(-1)?.id||historyCursor,historyLoading:false,historyError:'',historyPage:state.chat.historyPage+1};emit();persistChatCache(user.id).catch(()=>{});
  }catch(error){if(current()){state.chat={...state.chat,historyLoading:false,historyError:'更早的消息暂时读取失败，请重试。'};emit();}}
}

function closeChat(){if(!state.chat.targetId&&!chatSession)return;discardChatSession();state.chat=emptyChat();emit();}
function hasLink(text){return /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.(com|net|org|xyz|top|cn|cc|io|me|vip|club|site|info|online|shop|live|app)(\/|$|\s))/i.test(text||'');}
function stickerPayload(url){return `[[FW_USER_STICKER:${btoa(String(url||''))}]]`;}

async function sendMessage(text,{stickerUrl=''}={}){
  const targetId=state.chat.targetId;const content=stickerUrl?stickerPayload(stickerUrl):String(text||'').trim();
  if(!targetId) throw new Error('先选择一个搭子。');if(!content) return;
  if(!stickerUrl&&content.length>300) throw new Error('私聊最多 300 字。');if(!stickerUrl&&hasLink(content)) throw new Error('私聊暂不支持链接。');
  const user=currentUser();if(!user?.id)throw new Error('请先登录。');
  const previousLatest=state.buddy.latest[targetId]||null;const pendingId=`pending-${Date.now()}-${++pendingMessageSequence}`;const pending={id:pendingId,conversation_id:state.chat.conversationId,sender_id:user?.id,content,is_deleted:false,created_at:new Date().toISOString(),__pending:true};
  state.chat={...state.chat,sending:true,rows:mergeMessages(state.chat.rows,pending)};state.buddy={...state.buddy,latest:{...state.buddy.latest,[targetId]:pending}};emit();
  try{
    countContent();const convId=Number(fail(await client.rpc('fw_send_private_message_to_user',{target_user_id:targetId,message_text:content}),'发送失败'));
    if(currentUser()?.id!==user.id)return;
    if(chatSession?.targetId===targetId&&Number.isFinite(convId)&&convId>0&&state.chat.conversationId!==convId){
      state.chat={...state.chat,conversationId:convId};
      chatSession.conversationId=convId;
      chatSession.ready=true;
      subscribeChat(chatSession);
    }
    reconcileSentMessage(convId||pending.conversation_id,targetId,user.id);
  }catch(error){
    if(currentUser()?.id===user.id){
      if(String(state.chat.targetId)===String(targetId))state.chat={...state.chat,rows:state.chat.rows.filter(row=>String(row.id)!==pendingId)};
      if(String(state.buddy.latest[targetId]?.id)===pendingId)state.buddy={...state.buddy,latest:{...state.buddy.latest,[targetId]:previousLatest}};
    }
    throw error;
  }finally{
    if(currentUser()?.id===user.id){
      if(String(state.chat.targetId)===String(targetId))state.chat={...state.chat,sending:false};
      emit();persistChatCache().catch(()=>{});persistBuddyCache().catch(()=>{});
    }
  }
  return targetId;
}

async function loadStickers(force=false){
  stickersRequested=true;const identity=cacheUser();if(!identity?.id)return state.stickers.rows;
  if(!force&&!state.stickers.loaded){const hit=await hydrateStickersCache(identity.id);if(hit){if(currentUser()?.id)loadStickers(true).catch(()=>{});return state.stickers.rows;}}
  const user=currentUser();if(!user?.id){if(!state.stickers.loaded&&!state.stickers.loading){state.stickers={...state.stickers,loading:true};emit();}return state.stickers.rows;}
  if(state.stickers.loading||(!force&&state.stickers.loaded)) return state.stickers.rows;
  const showInitial=!state.stickers.loaded;const previousSignature=contentSignature(state.stickers.rows);state.stickers={...state.stickers,loading:true};if(showInitial)emit();
  try{countContent();const rows=fail(await client.from('user_stickers').select('id,image_url,file_name,file_size,mime_type,storage_path,created_at').eq('user_id',user.id).eq('is_deleted',false).order('created_at',{ascending:false}).limit(membershipStore.stickerLimit()),'读取我的表情失败')||[];if(state.userId!==user.id)return state.stickers.rows;const changed=previousSignature!==contentSignature(rows);state.stickers={loaded:true,loading:false,rows};await persistStickersCache(user.id);if(changed||showInitial)emit();return rows;}
  catch(error){state.stickers={...state.stickers,loaded:true,loading:false};if(showInitial)emit();if(state.stickers.rows.length)return state.stickers.rows;throw error;}
}

async function uploadSticker(file){
  const user=currentUser();if(!user?.id) throw new Error('请先登录。');
  if(!file?.size) throw new Error('没有选择图片。');
  if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) throw new Error('只支持 JPG、PNG、WebP、GIF 图片。');
  if(file.size>1048576) throw new Error('表情图片不能超过 1MB。');
  const limit=membershipStore.stickerLimit();if(state.stickers.rows.length>=limit) throw new Error(`我的表情最多保存 ${limit} 个。`);
  const safe=String(file.name||'sticker').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-60)||'sticker';
  const path=`${user.id}/${Date.now()}_${safe}`;
  state.stickers={...state.stickers,loading:true};emit();
  try{
    const uploaded=await client.storage.from('stickers').upload(path,file,{upsert:false,cacheControl:'3600',contentType:file.type});
    if(uploaded.error) throw uploaded.error;
    const imageUrl=client.storage.from('stickers').getPublicUrl(path).data.publicUrl;
    const saved=await client.from('user_stickers').insert({user_id:user.id,image_url:imageUrl,storage_path:path,file_name:file.name||safe,file_size:file.size,mime_type:file.type}).select('id,image_url,file_name,file_size,mime_type,storage_path,created_at').single();
    if(saved.error){await client.storage.from('stickers').remove([path]);throw saved.error;}
    state.stickers={loaded:true,loading:false,rows:[saved.data,...state.stickers.rows].slice(0,limit)};emit();persistStickersCache(user.id).catch(()=>{});return saved.data;
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
  const cachedOwners=[hydratedEchoUser,hydratedBuddyUser,hydratedStickersUser,hydratedBadgesUser,hydratedChatUser].filter(Boolean);const switching=Boolean((state.userId&&state.userId!==userId)||cachedOwners.some(owner=>owner!==userId));const chatTarget=switching?'':state.chat.targetId;
  teardownChannels();
  if(switching){state.echo={loaded:false,loading:false,rows:[],profiles:{}};state.buddy={loaded:false,loading:false,tab:'messages',rows:[],profiles:{},conversations:[],latest:{},unread:{},search:[],searching:false};state.chat=emptyChat();state.stickers={loaded:false,loading:false,rows:[]};}
  if(!state.echo.loaded)state.echo={...state.echo,loading:false};if(!state.buddy.loaded)state.buddy={...state.buddy,loading:false};if(!state.stickers.loaded)state.stickers={...state.stickers,loading:false};
  hydratedEchoUser='';hydratedBuddyUser='';hydratedStickersUser='';hydratedBadgesUser='';hydratedChatUser='';state.userId=userId;state.ready=true;startBadgeChannel(userId);emit();await hydrateBadgesCache(userId);
  const tasks=[refreshBadges(true)];if(echoRequested)tasks.push(loadEcho(true));if(buddyRequested)tasks.push(loadBuddy(true));if(stickersRequested)tasks.push(loadStickers(true));if(chatTarget)tasks.push(openChat(chatTarget));await Promise.allSettled(tasks);
}

authStore.subscribe(auth=>{
  if(auth.user?.id&&auth.user.cached){hydrateBadgesCache(auth.user.id).catch(()=>{});return;}
  if(!auth.ready)return;
  if(!auth.user){clearSocialState();return;}
  bootForUser(auth.user.id).catch(()=>{});
});

let lastStickerLimit=membershipStore.stickerLimit();
membershipStore.subscribe(()=>{
  const nextLimit=membershipStore.stickerLimit();if(nextLimit===lastStickerLimit)return;lastStickerLimit=nextLimit;
  if(stickersRequested&&currentUser()?.id)loadStickers(true).catch(()=>{});
});

export const socialStore={
  state,ECHO_TYPES,refreshBadges,loadEcho,markEchoRead,markAllEchoRead,loadBuddy,setBuddyTab,searchProfiles,sendFriendRequest,respondFriendship,removeFriendship,openChat,refreshChat,loadEarlierChat,closeChat,sendMessage,recallMessage,markPrivateRead,loadStickers,uploadSticker,deleteSticker,
  subscribe(listener){listeners.add(listener);listener({...state,badges:{...state.badges}});return()=>listeners.delete(listener);}
};

onWindowAttention(active=>{if(active)requestAnimationFrame(()=>markPrivateRead(state.chat.targetId).catch(()=>{}));});

window.addEventListener('fw:content-review-change',event=>{
  const change=event.detail;
  if(change.kind!=='private_message')return;
  const id=Number(change.target_id),session=chatSession;
  if(!id)return;
  if(change.visible){
    if(session?.hiddenIds.delete(id))queueMissingMessage(session,id);
    return;
  }
  const rows=state.chat.rows.filter(row=>messageId(row)!==id);
  const preview=Object.entries(state.buddy.latest).find(([,row])=>messageId(row)===id);
  if(session&&(rows.length!==state.chat.rows.length||session.missingIds.has(id)||preview?.[0]===session.targetId)){
    session.hiddenIds.add(id);
    session.missingIds.delete(id);
    state.chat={...state.chat,rows};
    persistChatCache().catch(()=>{});
  }
  if(preview){
    const latest={...state.buddy.latest};
    delete latest[preview[0]];
    state.buddy={...state.buddy,latest};
    persistBuddyCache().catch(()=>{});
    scheduleBuddyReload();
  }
  if(preview||rows===state.chat.rows)emit();
});
