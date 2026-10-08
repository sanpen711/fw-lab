import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app/buddy.js',import.meta.url),'utf8');
const badgeSource=fs.readFileSync(new URL('../app/buddy-read-tweaks.js',import.meta.url),'utf8');
function harness(messages=[],notifications=[]){
  const listeners=new Map(),logs=[],sends=[],state={user:{id:'me'},view:'buddy'};
  let readPause=null,conversationPause=null,failWrite=false,emptyWrite=false,sendError=null;
  const classes=()=>{const set=new Set();return {add:v=>set.add(v),remove:v=>set.delete(v),contains:v=>set.has(v),toggle(v,on){on?set.add(v):set.delete(v);}};};
  const box={innerHTML:'',dataset:{},scrollHeight:100,scrollTop:100,clientHeight:100};
  const input={value:'',focus(){}},button={disabled:false};
  const form={querySelector:s=>s.includes('input')?input:button};
  const list={innerHTML:'',querySelector(){return null;}},panel={};
  const view={classList:classes(),querySelector:()=>panel};
  const badge={classList:classes()},nav={classList:classes(),querySelector:()=>badge};
  const tabs=['messages','friends','new'].map(buddyTab=>({dataset:{buddyTab},classList:classes()}));
  const select=s=>({ '[data-app-view="buddy"]':view,'[data-buddy-chat-panel]':panel,'[data-buddy-list]':list,'[data-buddy-chat-messages]':box,'[data-buddy-chat-form]':form,'[data-buddy-chat-form] input':input,'[data-buddy-chat-title]':{},'[data-buddy-chat-sub]':{},'[data-app-nav="buddy"]':nav }[s]||null);
  const document={hidden:false,readyState:'loading',body:{classList:classes()},getElementById:()=>({}),querySelector:select,querySelectorAll:s=>s==='[data-buddy-tab]'?tabs:[],
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},dispatchEvent(event){(listeners.get(event.type)||[]).forEach(fn=>fn(event));}};
  const relations=[{id:1,requester_id:'me',receiver_id:'A',status:'accepted'},{id:2,requester_id:'me',receiver_id:'B',status:'accepted'}];
  const db={async rpc(name,args){
    if(name==='fw_get_or_create_conversation'){if(args.target_user_id==='A'&&conversationPause)await conversationPause;return {data:args.target_user_id==='A'?1:2};}
    if(name.startsWith('fw_send_private_message')){sends.push({name,...args});return sendError?{error:sendError}:{data:args.target_user_id==='A'?1:2};}
    if(name==='fw_mobile_buddy_inbox')return {data:['A','B'].map((user_id,i)=>{const rows=messages.filter(r=>r.conversation_id===i+1).sort((a,b)=>Number(b.id)-Number(a.id));return {user_id,message:rows[0]||null,unread:notifications.some(n=>n.user_id===state.user.id&&n.actor_id===user_id&&!n.is_read)};})};
    throw new Error(name);
  },from(table){
    const filters=[],orders=[];let update=null,limit=Infinity;
    const q={select(){return q;},update(v){update=v;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,values){filters.push(r=>values.map(String).includes(String(r[k])));return q;},or(value){if(value.startsWith('created_at.lt.')){const match=/created_at\.lt\.(.*),and\(created_at\.eq\..*,id\.lt\.(\d+)\)/.exec(value);assert.ok(match);filters.push(r=>r.created_at<match[1] || (r.created_at===match[1]&&Number(r.id)<Number(match[2])));}return q;},order(k,{ascending}){orders.push({k,ascending});return q;},limit(v){limit=v;return q;},async then(resolve,reject){try{
      if(table==='private_messages'&&readPause){const p=readPause;readPause=null;await p;}
      let rows=(table==='private_messages'?messages:table==='notifications'?notifications:table==='friendships'?relations:[]).filter(r=>filters.every(f=>f(r)));
      if(update){if(failWrite){resolve({error:{message:'offline'}});return;}if(emptyWrite)rows=[];rows.forEach(r=>Object.assign(r,update));}
      else rows.sort((a,b)=>{for(const {k,ascending} of orders){const cmp=k==='id'?Number(a[k])-Number(b[k]):String(a[k]).localeCompare(String(b[k]));if(cmp)return ascending?cmp:-cmp;}return 0;});
      resolve({data:rows.slice(0,limit).map(r=>({...r}))});
    }catch(e){reject(e);}}};return q;
  }};
  const fw={state,db:()=>({client:db}),refreshUser:async()=>state.user,waitForDb:async()=>true,$:select,$$:s=>document.querySelectorAll(s),esc:String,initials:()=>'',toast:v=>logs.push(v),setView:v=>state.view=v};
  const context={window:{FWApp:fw,fwDb:{client:db},addEventListener(){}},document,console:{warn(){}},localStorage:{getItem:()=>null,setItem(){}},CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail;}},setTimeout(){return 1;},clearTimeout(){},Date,Promise,Set,JSON};
  vm.createContext(context);vm.runInContext(source,context);vm.runInContext(badgeSource,context);context.window.FWAppBuddy.init();
  const submit=()=>document.dispatchEvent({type:'submit',target:{closest:s=>s==='[data-buddy-chat-form]'?form:null},preventDefault(){}});
  return {api:context.window.FWAppBuddy,badgeApi:context.window.FWAppBuddyUnread,box,list,state,document,logs,sends,input,submit,nav,context,fail:v=>failWrite=v,empty:v=>emptyWrite=v,pauseRead:p=>readPause=p,pauseConversation:p=>conversationPause=p,sendError:v=>sendError=v};
}
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};
const message=(id,conv=1,sender='A')=>({id:String(id),conversation_id:conv,sender_id:sender,content:'message-'+id,is_deleted:false,created_at:new Date(2026,0,1,0,0,id).toISOString()});
const notice=(id,target,actor='A',user='me')=>({id:String(id),target_id:String(target),actor_id:actor,user_id:user,type:'private_message',target_type:'private_message',is_read:false});
const rows=Array.from({length:305},(_,i)=>message(i+1));rows.push(message(800,2,'B'));
const notices=rows.map(r=>notice(r.id,r.id,r.sender_id));notices.push(notice(999,305,'A','someone-else'),notice(1000,306));
const h=harness(rows,notices);await h.api.load(true);assert.match(h.list.innerHTML,/data-buddy-open-chat="B"/,'quiet conversation remains visible');await h.api.openChat('A');
assert.ok(!h.box.innerHTML.includes('message-105<'));assert.match(h.box.innerHTML,/message-305</,'latest messages shown instead of earliest 200');
assert.equal(notices.filter(n=>n.actor_id==='A'&&n.user_id==='me'&&n.is_read).length,200);
assert.equal(notices.find(n=>n.id==='1000').is_read,false,'arrival outside snapshot is not consumed');assert.equal(notices.find(n=>n.id==='999').is_read,false);
assert.equal(await h.badgeApi.refresh(),true,'older unseen incoming messages retain badge');
await h.api.loadOlderMessages();assert.match(h.box.innerHTML,/message-1</);assert.equal(notices.filter(n=>n.actor_id==='A'&&n.user_id==='me'&&n.is_read).length,305);await h.api.loadMessages();assert.match(h.box.innerHTML,/message-1</,'refresh retains loaded history');
// Read failure, including a silent RLS zero-row write, never clears server unread.
for(const mode of ['fail','empty']){const ns=[notice(1,1)],x=harness([message(1)],ns);x[mode](true);await x.api.openChat('A');assert.equal(ns[0].is_read,false);assert.ok(x.logs.length);assert.equal(await x.badgeApi.refresh(),true);x[mode](false);await x.api.acknowledgeDisplayed();assert.equal(ns[0].is_read,true);assert.equal(await x.badgeApi.refresh(),false);}
// Read state from another device is authoritative, including a latest outgoing message.
const remote=[notice(1,1)],cross=harness([message(1),message(2,1,'me')],remote);assert.equal(await cross.badgeApi.refresh(),true);remote[0].is_read=true;assert.equal(await cross.badgeApi.refresh(),false);await cross.api.openChat('A');
// Delayed first conversation cannot replace the newly selected peer.
let release;const switching=harness([message(1),message(2,2,'B')]);switching.pauseConversation(new Promise(r=>release=r));const openA=switching.api.openChat('A');await settle();await switching.api.openChat('B');release();await openA;assert.equal(switching.api.getActiveTargetId(),'B');assert.match(switching.box.innerHTML,/message-2</);assert.ok(!switching.box.innerHTML.includes('message-1<'));
// A response arriving after the chat is closed cannot render or acknowledge it.
let resume;const ns=[notice(1,1)],closed=harness([message(1)],ns);await closed.api.load(true);closed.pauseRead(new Promise(r=>resume=r));const opening=closed.api.openChat('A');await settle();closed.api.closeChat();resume();await opening;assert.equal(ns[0].is_read,false);assert.equal(closed.api.getActiveTargetId(),'');
// Timeout does not invoke a second send via the legacy RPC.
const send=harness([message(1)]);await send.api.openChat('A');send.input.value='hello';send.sendError({code:'timeout',message:'timeout'});send.submit();await settle();assert.equal(send.sends.length,1);assert.equal(send.input.value,'hello');await send.api.openChat('B');assert.equal(send.input.value,'','draft is cleared when switching peer');
// Asynchronous IndexedDB cache must never overwrite a server snapshot or another peer.
for(const mode of ['server','switch','user']){
 const x=harness([message(1),message(2,2,'B')]);await x.api.openChat('A');let finish;x.context.window.FWMobileDataCache={getChat:()=>new Promise(r=>finish=r)};
 vm.runInContext(fs.readFileSync(new URL('../app/mobile-chat-idb-bridge.js',import.meta.url),'utf8'),x.context);x.document.dispatchEvent({type:'DOMContentLoaded'});x.context.window.FWMobileChatIDBBridge.showCached('A');
 if(mode==='switch')await x.api.openChat('B');if(mode==='user')x.state.user={id:'other'};
 finish({rows:[message(888)]});await settle();assert.ok(!x.box.innerHTML.includes('message-888'));
}
console.log('mobile buddy behavior checks passed (latest 200, exact reads, failures, cross-device state, switching, send timeout, cache isolation)');
// Old return timers cannot close a chat opened immediately after going back.
{
 const x=harness([message(1),message(2,2,'B')]),timers=[];await x.api.openChat('A');
 x.context.setTimeout=fn=>{timers.push(fn);return timers.length;};
 vm.runInContext(fs.readFileSync(new URL('../app/buddy-return-stability.js',import.meta.url),'utf8'),x.context);x.document.dispatchEvent({type:'DOMContentLoaded'});
 x.api.closeChat(true);await x.api.openChat('B');for(const fn of timers.splice(0))fn();
 assert.equal(x.api.getActiveTargetId(),'B');assert.equal(x.context.window.FWApp.state.view,'buddy');
}
// An image/video upload finishing after a peer switch cannot submit to that peer.
for(const video of [false,true]){
 const x=harness([message(1),message(2,2,'B')]);await x.api.openChat('A');let finish;
 const pending=new Promise(r=>finish=r);
 x.context.imageUploading=false;x.context.toast=v=>x.logs.push(v);x.context.getCurrentUser=async()=>x.state.user;
 x.context.compressChatImage=async()=>({file:{type:'image/jpeg'},type:'image/jpeg',ext:'jpg'});
 x.context.encodeStickerUrl=()=> 'encoded-image';x.context.$=s=>s==='[data-buddy-chat-form]'?{querySelector:()=>x.input,dispatchEvent:()=>x.submit()}:null;
 x.context.window.FWMobileMedia={isVideo:()=>video,uploadVideo:()=>pending};
 x.context.window.fwDb.client.storage={from:()=>({upload:()=>pending,getPublicUrl:()=>({data:{publicUrl:'image'}})})};
 const text=fs.readFileSync(new URL('../app/buddy-chat-tweaks.js',import.meta.url),'utf8');
 vm.runInContext(text.slice(text.indexOf('  async function uploadAndSendImage('),text.indexOf('  function syncChatMode(')),x.context);
 const uploading=x.context.uploadAndSendImage({type:video?'video/mp4':'image/jpeg'});await settle();await x.api.openChat('B');finish(video?{marker:'[[FW_MEDIA_VIDEO:YWJj]]'}:{error:null});await uploading;
 assert.equal(x.sends.length,0);assert.equal(x.input.value,'');assert.ok(x.logs.some(v=>v.includes('会话已切换')));
}
console.log('buddy return and upload switching checks passed');
