import {authStore} from './auth-store.js';
import {onWindowAttention,windowIsActive} from './window-attention.js';

const client=authStore.client;
const listeners=new Set();
const state={levels:{},publicAppearances:{}};
const resolvedProfiles=new Set();
const queuedProfiles=new Set();
const recentProfiles=new Set();
let profileFlushPromise=null;
let currentUserId='';
let generation=0;
let started=false;

function snapshot(){return {levels:{...state.levels},publicAppearances:{...state.publicAppearances}};}
function emit(){const next=snapshot();listeners.forEach(listener=>listener(next));}
function currentUser(){const user=authStore.state.user;return user&&!user.cached?user:null;}

function refreshProfiles(){
  if(!currentUserId||!windowIsActive())return;
  recentProfiles.forEach(id=>{resolvedProfiles.delete(id);queuedProfiles.add(id);});
  if(queuedProfiles.size)queueProfileFlush();
}

function start(){
  if(started)return;
  started=true;
  authStore.subscribe(auth=>{
    if(!auth.ready)return;
    const id=String(currentUser()?.id||'');
    if(id===currentUserId)return;
    currentUserId=id;
    generation++;
    queuedProfiles.clear();
    resolvedProfiles.clear();
    recentProfiles.clear();
    state.levels={};state.publicAppearances={};
    if(id)ensureProfiles([id]);
    emit();
  });
  onWindowAttention(active=>{if(active)refreshProfiles();});
  setInterval(refreshProfiles,60_000);
}

async function flushProfiles(){
  const ids=Array.from(queuedProfiles).slice(0,200);ids.forEach(id=>queuedProfiles.delete(id));
  if(!ids.length)return snapshot();
  if(!currentUser()?.id){queuedProfiles.clear();return snapshot();}
  ids.forEach(id=>resolvedProfiles.add(id));
  const token=generation;
  const [result,levels]=await Promise.all([client.rpc('fw_get_membership_appearances',{p_user_ids:ids}),client.rpc('fw_get_membership_levels',{p_user_ids:ids})]);
  if(token!==generation)return snapshot();
  if(result.error||levels.error){ids.forEach(id=>resolvedProfiles.delete(id));throw new Error('读取会员标识失败。');}
  const levelMap=new Map((levels.data||[]).map(row=>[String(row.user_id),Number(row.level)||0]));
  const found=new Map((result.data||[]).map(row=>[String(row.user_id),row]));
  let changed=false;
  ids.forEach(id=>{const appearance=found.get(id)||null;const level=levelMap.get(id)||0;if(JSON.stringify(state.publicAppearances[id])!==JSON.stringify(appearance)||state.levels[id]!==level){state.publicAppearances[id]=appearance;state.levels[id]=level;changed=true;}});
  if(changed)emit();
  if(queuedProfiles.size)queueProfileFlush();
  return snapshot();
}

function queueProfileFlush(){
  if(profileFlushPromise)return profileFlushPromise;
  profileFlushPromise=Promise.resolve().then(flushProfiles).catch(()=>snapshot()).finally(()=>{profileFlushPromise=null;if(queuedProfiles.size)queueProfileFlush();});
  return profileFlushPromise;
}

function ensureProfiles(userIds=[]){
  if(!currentUser()?.id)return Promise.resolve(snapshot());
  for(const id of new Set(userIds.filter(Boolean).map(String))){
    if(!resolvedProfiles.has(id))queuedProfiles.add(id);
    recentProfiles.delete(id);
    recentProfiles.add(id);
  }
  while(recentProfiles.size>200)recentProfiles.delete(recentProfiles.values().next().value);
  return queuedProfiles.size?queueProfileFlush():Promise.resolve(snapshot());
}

function appearanceFor(userId){
  const appearance=state.publicAppearances[String(userId||'')];
  return appearance&&new Date(appearance.expires_at).getTime()>Date.now()?appearance:null;
}

export const profileAppearanceStore={
  start,ensureProfiles,appearanceFor,
  levelFor(userId){return Math.max(0,Math.min(9,Number(state.levels[String(userId)])||0));},
  themeFor(userId){return appearanceFor(userId)?.theme||'';},
  subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}
};
