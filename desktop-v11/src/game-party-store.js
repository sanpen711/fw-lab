import {authStore} from './auth-store.js';

const client=authStore.client;
const listeners=new Set();
const state={loaded:false,loading:false,busy:false,error:'',parties:[],profiles:{},members:[],contacts:[],messages:[],openPartyId:''};
let active=false;
let channel=null;
let refreshTimer=null;

function snapshot(){return {...state,parties:[...state.parties],profiles:{...state.profiles},members:[...state.members],contacts:[...state.contacts],messages:[...state.messages]};}
function emit(){const next=snapshot();listeners.forEach(listener=>listener(next));}
function fail(result,label){if(result?.error)throw new Error(`${label}：${result.error.message}`);return result?.data;}
function currentUser(){const user=authStore.state.user;return user&&!user.cached?user:null;}
function requireUser(){const user=currentUser();if(!user)throw new Error('请先登录。');if(user.disabled)throw new Error('这个账号已被停用。');return user;}
function count(){if(window.__FW_DESKTOP_V11__)window.__FW_DESKTOP_V11__.contentRequests=(window.__FW_DESKTOP_V11__.contentRequests||0)+1;}

async function load(force=false){
  if(state.loading||(!force&&state.loaded))return state.parties;
  const showInitial=!state.loaded;state.loading=true;state.error='';if(showInitial)emit();
  try{
    count();const parties=fail(await client.from('game_parties').select('id,captain_id,game_name,platform,server_name,mode,starts_at,capacity,member_count,note,status,created_at,updated_at').neq('status','cancelled').order('created_at',{ascending:false}).limit(100),'读取组队房间失败')||[];
    const partyIds=parties.map(row=>row.id);let members=[];let contacts=[];let messages=[];
    if(currentUser()&&partyIds.length){
      count();members=fail(await client.from('game_party_members').select('party_id,user_id,role,state,request_message,created_at,updated_at').in('party_id',partyIds),'读取组队状态失败')||[];
      count();contacts=fail(await client.from('game_party_contacts').select('party_id,user_id,game_id,updated_at').in('party_id',partyIds),'读取游戏 ID 失败')||[];
      if(state.openPartyId){count();messages=fail(await client.from('game_party_messages').select('id,party_id,user_id,content,created_at').eq('party_id',state.openPartyId).order('created_at',{ascending:true}).limit(200),'读取队伍聊天失败')||[];}
    }
    const profileIds=Array.from(new Set([...parties.map(row=>row.captain_id),...members.map(row=>row.user_id),...messages.map(row=>row.user_id)].filter(Boolean)));const profiles={...state.profiles};
    if(profileIds.length){count();const rows=fail(await client.from('profiles').select('id,nickname,avatar_url').in('id',profileIds),'读取队友资料失败')||[];rows.forEach(row=>{profiles[String(row.id)]=row;});}
    state.parties=parties;state.members=members;state.contacts=contacts;state.messages=messages;state.profiles=profiles;state.loaded=true;state.loading=false;if(state.openPartyId&&!parties.some(row=>String(row.id)===String(state.openPartyId)))state.openPartyId='';emit();return parties;
  }catch(error){state.loaded=true;state.loading=false;state.error=error.message||'组队房间读取失败。';emit();if(state.parties.length)return state.parties;throw error;}
}

function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(active)load(true).catch(()=>{});},220);}
function activate(){active=true;if(!channel){channel=client.channel('desktop-v11-game-parties').on('postgres_changes',{event:'*',schema:'public',table:'game_parties'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'game_party_members'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'game_party_messages'},schedule).subscribe();}return load();}
function deactivate(){active=false;clearTimeout(refreshTimer);if(channel){client.removeChannel(channel);channel=null;}}
function openParty(id){state.openPartyId=String(id||'');state.messages=[];emit();return state.openPartyId?load(true):Promise.resolve();}
function closePartyDetail(){state.openPartyId='';state.messages=[];emit();}
async function mutate(action){requireUser();if(state.busy)throw new Error('正在处理，请稍候。');state.busy=true;state.error='';emit();try{const result=await action();await load(true);return result;}finally{state.busy=false;emit();}}
async function createParty(data){return mutate(async()=>{const id=fail(await client.rpc('fw_create_game_party',{p_game_name:String(data.gameName||'').trim(),p_platform:String(data.platform||'').trim(),p_server_name:String(data.serverName||'').trim(),p_mode:String(data.mode||'').trim(),p_starts_at:data.startsAt,p_capacity:Number(data.capacity),p_note:String(data.note||'').trim(),p_game_id:String(data.gameId||'').trim()}),'创建组队失败');state.openPartyId=String(id||'');return id;});}
async function applyToParty(partyId,{gameId,message}){return mutate(async()=>fail(await client.rpc('fw_apply_game_party',{p_party_id:Number(partyId),p_game_id:String(gameId||'').trim(),p_message:String(message||'').trim()}),'申请加入失败'));}
async function decideApplication(partyId,userId,accept){return mutate(async()=>fail(await client.rpc('fw_decide_game_party',{p_party_id:Number(partyId),p_user_id:userId,p_accept:Boolean(accept)}),'处理申请失败'));}
async function leaveParty(partyId){return mutate(async()=>fail(await client.rpc('fw_leave_game_party',{p_party_id:Number(partyId)}),'退出组队失败'));}
async function closeParty(partyId){return mutate(async()=>fail(await client.rpc('fw_close_game_party',{p_party_id:Number(partyId)}),'关闭房间失败'));}
async function sendMessage(partyId,content){return mutate(async()=>fail(await client.rpc('fw_send_game_party_message',{p_party_id:Number(partyId),p_content:String(content||'').trim()}),'发送消息失败'));}

authStore.subscribe(auth=>{if(!auth.ready)return;state.members=[];state.contacts=[];state.messages=[];state.loaded=false;emit();if(active)load(true).catch(()=>{});});
export const gamePartyStore={state,activate,deactivate,load,openParty,closePartyDetail,createParty,applyToParty,decideApplication,leaveParty,closeParty,sendMessage,subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}};
