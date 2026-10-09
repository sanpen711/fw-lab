import {authStore} from './auth-store.js';
import {membershipStore} from './membership-store.js';

const client=authStore.client;
const listeners=new Set();
const state={userId:'',loaded:false,loading:false,error:'',rows:[]};
let request=null,channel=null,refreshTimer=null,generation=0,started=false;
const positionWrites=new Map();
const snapshot=()=>({...state,rows:state.rows.map(row=>({...row}))});
const emit=()=>listeners.forEach(listener=>listener(snapshot()));
function me(){const user=authStore.state.user;return user&&!user.cached?user:null;}
function check(result){if(result.error)throw new Error(result.error.message);return result.data;}
function rowFor(id){return state.rows.find(row=>String(row.post_id)===String(id));}
function clear(){generation++;request=null;positionWrites.clear();clearTimeout(refreshTimer);if(channel)client.removeChannel(channel);channel=null;Object.assign(state,{userId:'',loaded:false,loading:false,error:'',rows:[]});emit();}
function schedule(payload){if(!membershipStore.isActive())return;const id=payload?.new?.post_id||payload?.old?.post_id||payload?.new?.id||payload?.old?.id;if(id&&!rowFor(id)?.following)return;clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>load(true).catch(()=>{}),350);}
function subscribeChanges(){
  const enabled=membershipStore.isActive()&&state.rows.some(row=>row.following);
  if(!enabled){clearTimeout(refreshTimer);if(channel)client.removeChannel(channel);channel=null;return;}
  if(channel)return;
  channel=client.channel(`desktop-post-reading-${state.userId}`).on('postgres_changes',{event:'*',schema:'public',table:'comments'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'posts'},schedule).subscribe();
}
async function load(force=false){
  const user=me();if(!user)return snapshot();if(request){const token=generation;await request;return force&&token===generation?load(true):snapshot();}if(!force&&state.loaded)return snapshot();
  const token=generation;state.loading=true;state.error='';emit();
  request=(async()=>{try{
    const rows=check(await client.rpc('fw_get_post_reading'))||[];
    if(token!==generation)return snapshot();state.rows=rows;state.loaded=true;subscribeChanges();
  }catch(error){if(token===generation)state.error=error.message||'收藏与追更读取失败。';}
  finally{if(token===generation){request=null;state.loading=false;emit();}}return snapshot();})();return request;
}
async function save(id,following){
  const user=me();if(!user)throw new Error('请先登录。');
  if(following&&!membershipStore.isActive())throw new Error('会员有效期内可自动追更，普通用户可以收藏帖子。');
  const token=generation;check(await client.rpc('fw_save_post_reading',{p_post_id:Number(id),p_following:following}));if(token===generation)await load(true);
}
async function remove(id){const token=generation;const user=me();if(!user)throw new Error('请先登录。');check(await client.from('post_reading').delete().eq('user_id',user.id).eq('post_id',id));if(token===generation){state.rows=state.rows.filter(row=>String(row.post_id)!==String(id));subscribeChanges();emit();}}
// Position-only writes do not rerender the reader. Never clear unread comments merely by opening a post.
async function position(id,value){
  const row=rowFor(id);if(!row||!membershipStore.isActive())return;
  Object.assign(row,{anchor_comment_id:value.anchor_comment_id,anchor_offset:value.anchor_offset,scroll_top:value.scroll_top});
  const token=generation,key=String(id),previous=positionWrites.get(key)||Promise.resolve();
  const write=previous.catch(()=>{}).then(async()=>{
    if(token!==generation)return;
    check(await client.rpc('fw_update_post_reading',{p_post_id:Number(id),p_seen_comment_id:Number(value.last_seen_comment_id||0),p_anchor_comment_id:value.anchor_comment_id||null,p_anchor_offset:Math.round(value.anchor_offset||0),p_scroll_top:Math.round(value.scroll_top||0)}));
    if(token===generation){const current=rowFor(id);if(current)current.last_seen_comment_id=Math.max(Number(current.last_seen_comment_id||0),Number(value.last_seen_comment_id||0));if(value.readChanged)await load(true);}
  });
  positionWrites.set(key,write);
  try{await write;}finally{if(positionWrites.get(key)===write)positionWrites.delete(key);}
}
function start(){
  if(started)return;started=true;
  authStore.subscribe(auth=>{if(!auth.ready)return;const user=me();if(String(user?.id||'')===state.userId)return;clear();if(user){state.userId=String(user.id);load(true).catch(()=>{});}});
  membershipStore.subscribe(subscribeChanges);
  window.addEventListener('focus',()=>{if(me()&&state.loaded)load(true).catch(()=>{});});
}
export const postReadingStore={state,start,load,save,remove,position,rowFor,unreadTotal(){return membershipStore.isActive()?state.rows.reduce((n,row)=>n+Number(row.unread_count||0),0):0;},subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}};
