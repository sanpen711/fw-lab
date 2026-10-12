import {authStore} from './auth-store.js';
import {desktopCache} from './desktop-persistent-cache.js';
desktopCache.remove('bird','public').catch(()=>{});
const client=authStore.client,listeners=new Set();
const state={rooms:[],filter:'all',offset:0,hasMore:false,loading:false,loaded:false,error:'',busy:false,selectedId:'',detail:null,detailLoading:false,detailError:'',connection:'',serverOffset:0};
let active=false,generation=0,openToken=0,listToken=0,eventsChannel=null,messageChannel=null,expiryTimer=null,reloadTimer=null;
const signed=new Map();
function currentUser(){const u=authStore.state.user;if(!u||u.cached)throw new Error('请先登录。');if(u.disabled)throw new Error('账号已停用。');return u;}
function snapshot(){return {...state,rooms:state.rooms.map(r=>({...r})),detail:state.detail&&{...state.detail,messages:[...(state.detail.messages||[])],members:[...(state.detail.members||[])],requests:[...(state.detail.requests||[])]}};}
function emit(){const s=snapshot();listeners.forEach(fn=>fn(s));}
function result(r){if(r.error)throw new Error(r.error.message||'房间读取失败。');if(r.data?.error)throw new Error(r.data.error);return r.data;}
async function rpc(name,args={}){if(window.__FW_DESKTOP_V11__)window.__FW_DESKTOP_V11__.contentRequests++;return result(await client.rpc(name,args));}
function serverTime(data){if(data?.server_time)state.serverOffset=new Date(data.server_time).getTime()-Date.now();}
function removeChannel(channel){if(channel)client.removeChannel(channel);}
function scheduleExpiry(){
 clearTimeout(expiryTimer);if(!active)return;
 const now=Date.now()+state.serverOffset,dates=state.rooms.map(r=>r.expires_at&&new Date(r.expires_at).getTime()).filter(Boolean);if(state.detail?.room.expires_at)dates.push(new Date(state.detail.room.expires_at).getTime());
 const earliest=Math.min(...dates);if(!Number.isFinite(earliest))return;
 expiryTimer=setTimeout(()=>{const current=Date.now()+state.serverOffset;if(state.detail?.room.expires_at&&new Date(state.detail.room.expires_at).getTime()<=current)closeRoom('房间已到期，聊天记录已清理。');loadRooms(state.filter).catch(()=>{});},Math.min(2147483647,Math.max(100,earliest-now+200)));
}
async function assets(messages,token){
 const paths=[...new Set(messages.map(m=>m.media_path).filter(Boolean))];const wanted=paths.filter(p=>!signed.has(p)||signed.get(p).expires<=Date.now());
 if(wanted.length){const r=await client.storage.from('room-media').createSignedUrls(wanted,300);if(r.error)throw new Error('房间图片读取失败，请刷新重试。');if(token!==openToken)return messages;
  (r.data||[]).forEach(row=>{if(row.signedUrl)signed.set(row.path,{url:row.signedUrl,expires:Date.now()+240000});});
 }
 return messages.map(m=>({...m,media_url:m.media_path?signed.get(m.media_path)?.url||'':''}));
}
async function loadRooms(filter=state.filter,more=false){
 currentUser();const g=generation,t=++listToken;const offset=more?state.offset:0;
 if(filter!==state.filter){state.rooms=[];state.loaded=false;state.filter=filter;}
 state.loading=true;state.error='';emit();
 try{const data=await rpc('fw_chat_room_list',{p_filter:filter,p_offset:offset});if(g!==generation||t!==listToken)return;serverTime(data);
  const rows=data?.rooms||[];state.rooms=more?Array.from(new Map([...state.rooms,...rows].map(row=>[String(row.id),row])).values()):rows;
  state.offset=offset+rows.length;state.hasMore=!!data?.has_more;state.loaded=true;
 }catch(e){if(g!==generation||t!==listToken)return;state.error=e.message;throw e;}
 finally{if(g===generation&&t===listToken){state.loading=false;emit();scheduleExpiry();}}
}
async function readRoom(id=state.selectedId,older=false){
 if(!id)return;currentUser();const g=generation,t=++openToken,changed=state.selectedId!==String(id);state.selectedId=String(id);state.detailLoading=true;state.detailError='';if(changed)state.detail=null;emit();
 try{
  const before=older?state.detail?.messages?.[0]?.id:null;const data=await rpc('fw_chat_room_read',{p_room_id:String(id),p_before_id:before||null});if(g!==generation||t!==openToken)return;serverTime(data);
  if(!data?.room)throw new Error('房间已经不存在。');
  data.messages=await assets(data.messages||[],t);if(g!==generation||t!==openToken)return;
  if(older&&state.detail?.room.id===data.room.id)data.messages=Array.from(new Map([...data.messages,...state.detail.messages].map(row=>[String(row.id),row])).values()).sort((a,b)=>Number(a.id)-Number(b.id));
  state.detail=data;
  const index=state.rooms.findIndex(r=>String(r.id)===String(id));if(index>=0)state.rooms[index]=data.room;
  if(active&&changed)subscribeMessages(id);
 }catch(e){if(g!==generation||t!==openToken)return;state.detail=null;state.detailError=e.message;removeChannel(messageChannel);messageChannel=null;signed.clear();throw e;}
 finally{if(g===generation&&t===openToken){state.detailLoading=false;emit();scheduleExpiry();}}
}
function closeRoom(message=''){openToken++;state.selectedId='';state.detail=null;state.detailLoading=false;state.detailError=message;removeChannel(messageChannel);messageChannel=null;signed.clear();emit();}
function refreshSoon(roomId=''){
 clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>{if(!active)return;loadRooms().catch(()=>{});if(state.selectedId&&(!roomId||String(roomId)===state.selectedId))readRoom().catch(()=>{});},160);
}
function subscribeMessages(id){
 removeChannel(messageChannel);const g=generation;let subscribed=false;
 messageChannel=client.channel(`desktop-chat-room-${id}-${g}`).on('postgres_changes',{event:'*',schema:'public',table:'chat_room_messages',filter:`room_id=eq.${id}`},()=>{if(active&&g===generation&&state.selectedId===String(id))readRoom().catch(()=>{});})
 .subscribe(status=>{if(g!==generation||!active)return;state.connection=status==='SUBSCRIBED'?'':status==='CHANNEL_ERROR'||status==='TIMED_OUT'?'实时连接中断，可点击刷新同步消息。':state.connection;if(status==='SUBSCRIBED'&&subscribed)readRoom().catch(()=>{});if(status==='SUBSCRIBED')subscribed=true;emit();});
}
function activate(){
 currentUser();active=true;const g=generation;let subscribed=false;
 if(!eventsChannel)eventsChannel=client.channel(`desktop-chat-rooms-${g}`).on('postgres_changes',{event:'*',schema:'public',table:'chat_rooms'},()=>refreshSoon())
 .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_room_events',filter:`user_id=eq.${currentUser().id}`},p=>{if(g!==generation||!active)return;const e=p.new||{};if(['closed','removed'].includes(e.kind)&&String(e.room_id)===state.selectedId)closeRoom(e.kind==='removed'?'你已被移出房间。':'房间已解散或到期。');refreshSoon(e.room_id);})
 .subscribe(status=>{if(!active||g!==generation)return;if(status==='SUBSCRIBED'&&subscribed)refreshSoon();if(status==='SUBSCRIBED')subscribed=true;});
 if(state.selectedId)subscribeMessages(state.selectedId);
 scheduleExpiry();return Promise.all([loadRooms(),state.selectedId?readRoom():Promise.resolve()]);
}
function deactivate(){active=false;clearTimeout(expiryTimer);clearTimeout(reloadTimer);removeChannel(eventsChannel);removeChannel(messageChannel);eventsChannel=null;messageChannel=null;}
async function mutate(action,id,payload={}){
 currentUser();if(state.busy)throw new Error('正在处理，请稍候。');const g=generation;state.busy=true;emit();
 try{const data=await rpc('fw_chat_room_action',{p_action:action,p_room_id:id||null,p_payload:payload});if(g!==generation)return;
  if(action==='dissolve'){closeRoom('房间已解散，聊天记录已清理。');client.functions.invoke('chat-room-maintenance',{body:{}}).catch(()=>{});}
  if(action==='leave')closeRoom('已退出房间。');
  if(action==='delete_message')client.functions.invoke('chat-room-maintenance',{body:{}}).catch(()=>{});
  await loadRooms().catch(()=>{});
  if(action==='create')await readRoom(data.room_id);
  else if(id&&state.selectedId===String(id)&&!['dissolve','leave'].includes(action))await readRoom(id);
  return data;
 }finally{if(g===generation){state.busy=false;emit();}}
}
async function imageFile(file){
 if(!file)return null;const type=file.type||(/\.gif$/i.test(file.name)?'image/gif':/\.png$/i.test(file.name)?'image/png':/\.webp$/i.test(file.name)?'image/webp':/\.jpe?g$/i.test(file.name)?'image/jpeg':'');
 if(!['image/jpeg','image/png','image/webp','image/gif'].includes(type))throw new Error('支持 JPG、PNG、WebP 和 GIF 图片。');
 if(type==='image/gif'){if(file.size>3*1024*1024)throw new Error('GIF 不能超过 3MB。');return new File([file],file.name||'image.gif',{type});}
 if(file.size>20*1024*1024)throw new Error('图片不能超过 20MB。');
 const url=URL.createObjectURL(file);try{const img=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('图片读取失败。'));img.src=url;});const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));if(!blob||blob.size>3*1024*1024)throw new Error('图片处理后仍过大，请换一张。');return new File([blob],'image.webp',{type:'image/webp'});}finally{URL.revokeObjectURL(url);}
}
async function send({text='',file=null,stickerUrl=''}){
 const u=currentUser(),id=state.selectedId,g=generation;if(!id||!state.detail?.room.joined)throw new Error('请先加入房间。');
 if(state.busy)throw new Error('正在发送，请稍候。');if(!String(text).trim()&&!file&&!stickerUrl)throw new Error('请先填写消息或选择图片、表情。');if(String(text).length>1000)throw new Error('消息最多 1000 字。');
 state.busy=true;emit();let path='';try{
  if(file){const prepared=await imageFile(file);if(g!==generation||id!==state.selectedId)throw new Error('房间已切换，请重新发送。');path=`${u.id}/rooms/${id}/${crypto.randomUUID()}.${prepared.type==='image/gif'?'gif':'webp'}`;const uploaded=await client.storage.from('room-media').upload(path,prepared,{upsert:false,contentType:prepared.type,cacheControl:'300'});if(uploaded.error)throw new Error('图片上传失败，请重试。');}
  if(g!==generation)throw new Error('登录状态已改变。');
  const data=await rpc('fw_chat_room_action',{p_action:'send',p_room_id:id,p_payload:{content:text,media_path:path||null,sticker_url:stickerUrl||null}});if(g===generation&&id===state.selectedId)await readRoom(id).catch(()=>{});return data;
 }catch(e){if(path)client.storage.from('room-media').remove([path]).catch(()=>{});throw e;}
 finally{if(g===generation){state.busy=false;emit();}}
}
let userId='';authStore.subscribe(auth=>{const next=String(auth.user?.id||'');if(next!==userId){userId=next;generation++;listToken++;openToken++;deactivate();signed.clear();Object.assign(state,{rooms:[],filter:'all',offset:0,hasMore:false,loading:false,loaded:false,error:'',busy:false,selectedId:'',detail:null,detailLoading:false,detailError:'',connection:''});emit();}});
export const chatRoomStore={state,activate,deactivate,loadRooms,readRoom,closeRoom,mutate,send,subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);}};
