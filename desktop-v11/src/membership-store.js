import {authStore} from './auth-store.js';

const client=authStore.client;
const listeners=new Set();
const DEFAULT_PLANS=[
  {id:'monthly',name:'月度会员',duration_months:1,price_cents:200,compare_at_price_cents:990,is_recommended:false,sort_order:1},
  {id:'quarterly',name:'季度会员',duration_months:3,price_cents:2500,compare_at_price_cents:2970,is_recommended:false,sort_order:2},
  {id:'yearly',name:'年度会员',duration_months:12,price_cents:8800,compare_at_price_cents:11880,is_recommended:true,sort_order:3}
];
const THEMES=new Set(['rose_gold','black_gold','pink_starlight']);
const state={userId:'',loaded:false,loading:false,error:'',plans:[...DEFAULT_PLANS],membership:null,orders:[],theme:'rose_gold',publicStyles:{}};
let started=false;
let loadPromise=null;
const resolvedProfiles=new Set();
const queuedProfiles=new Set();
let profileFlushPromise=null;

function snapshot(){return {...state,plans:[...state.plans],membership:state.membership?{...state.membership}:null,orders:[...state.orders],publicStyles:{...state.publicStyles}};}
function emit(){const next=snapshot();listeners.forEach(listener=>listener(next));}
function currentUser(){const user=authStore.state.user;return user&&!user.cached?user:null;}
function fail(result,label){if(result?.error)throw new Error(`${label}：${result.error.message}`);return result?.data;}

function isActive(membership=state.membership){
  if(!membership||membership.status!=='active'||!membership.expires_at)return false;
  const expires=new Date(membership.expires_at).getTime();
  return Number.isFinite(expires)&&expires>Date.now();
}

async function load(force=false){
  const user=currentUser();
  if(!user?.id){state.userId='';state.loaded=true;state.loading=false;state.error='';state.membership=null;state.orders=[];state.theme='rose_gold';state.publicStyles={};resolvedProfiles.clear();emit();return snapshot();}
  if(loadPromise)return loadPromise;
  if(!force&&state.loaded&&state.userId===String(user.id))return snapshot();
  state.userId=String(user.id);state.loading=true;state.error='';emit();
  loadPromise=(async()=>{
    try{
      const [plansResult,membershipResult,ordersResult,appearanceResult]=await Promise.all([
        client.from('membership_plans').select('id,name,duration_months,price_cents,compare_at_price_cents,is_recommended,sort_order').eq('is_active',true).order('sort_order',{ascending:true}),
        client.from('memberships').select('user_id,plan_id,status,starts_at,expires_at,source,updated_at').eq('user_id',user.id).maybeSingle(),
        client.from('membership_orders').select('id,order_no,plan_id,amount_cents,payment_method,status,created_at,paid_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20),
        client.rpc('fw_get_active_membership_styles',{p_user_ids:[user.id]})
      ]);
      const plans=fail(plansResult,'读取会员套餐失败')||[];
      state.plans=plans.length?plans:[...DEFAULT_PLANS];
      state.membership=fail(membershipResult,'读取会员状态失败')||null;
      state.orders=fail(ordersResult,'读取会员订单失败')||[];
      const appearance=fail(appearanceResult,'读取会员装扮失败')||[];
      state.theme=THEMES.has(appearance[0]?.theme)?appearance[0].theme:'rose_gold';
      state.publicStyles[String(user.id)]=isActive(state.membership)?state.theme:'';
      resolvedProfiles.add(String(user.id));
      state.loaded=true;state.loading=false;state.error='';emit();return snapshot();
    }catch(error){
      state.loaded=true;state.loading=false;state.error=error.message||'会员信息读取失败。';state.plans=state.plans.length?state.plans:[...DEFAULT_PLANS];emit();return snapshot();
    }finally{loadPromise=null;}
  })();
  return loadPromise;
}

function start(){
  if(started)return;started=true;
  authStore.subscribe(auth=>{
    if(!auth.ready)return;
    const user=auth.user&&!auth.user.cached?auth.user:null;
    if(!user){state.userId='';state.loaded=true;state.loading=false;state.error='';state.membership=null;state.orders=[];state.theme='rose_gold';state.publicStyles={};resolvedProfiles.clear();emit();return;}
    const changed=state.userId!==String(user.id);
    if(changed){state.userId=String(user.id);state.loaded=false;state.membership=null;state.orders=[];state.theme='rose_gold';state.publicStyles={};resolvedProfiles.clear();emit();}
    load(changed).catch(()=>{});
  });
}

async function flushProfiles(){
  const ids=Array.from(queuedProfiles).slice(0,200);ids.forEach(id=>queuedProfiles.delete(id));
  if(!ids.length)return snapshot();
  if(!currentUser()?.id){queuedProfiles.clear();return snapshot();}
  ids.forEach(id=>resolvedProfiles.add(id));
  const result=await client.rpc('fw_get_active_membership_styles',{p_user_ids:ids});
  if(result.error){ids.forEach(id=>resolvedProfiles.delete(id));throw new Error(`读取会员标识失败：${result.error.message}`);}
  const found=new Map((result.data||[]).map(row=>[String(row.user_id),THEMES.has(row.theme)?row.theme:'rose_gold']));
  let changed=false;
  ids.forEach(id=>{const next=found.get(id)||'';if(state.publicStyles[id]!==next){state.publicStyles[id]=next;changed=true;}});
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
  [...new Set(userIds.filter(Boolean).map(String))].forEach(id=>{if(!resolvedProfiles.has(id))queuedProfiles.add(id);});
  return queuedProfiles.size?queueProfileFlush():Promise.resolve(snapshot());
}

async function setTheme(theme){
  const normalized=String(theme||'').trim();if(!THEMES.has(normalized))throw new Error('不支持这个会员装扮。');
  if(!isActive())throw new Error('开通会员后才能使用专属装扮。');
  const result=await client.rpc('fw_set_membership_theme',{p_theme:normalized});fail(result,'保存会员装扮失败');
  state.theme=normalized;if(state.userId){state.publicStyles[state.userId]=normalized;resolvedProfiles.add(state.userId);}emit();return snapshot();
}

export const membershipStore={
  state,
  start,
  load,
  ensureProfiles,
  setTheme,
  isActive,
  themeFor(userId){return state.publicStyles[String(userId||'')]||'';},
  stickerLimit(){return isActive()?160:80;},
  partyLimit(){return isActive()?15:5;},
  subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}
};
