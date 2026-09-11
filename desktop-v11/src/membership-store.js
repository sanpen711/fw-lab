import {authStore} from './auth-store.js';

const client=authStore.client;
const listeners=new Set();
const DEFAULT_PLANS=[
  {id:'monthly',name:'月度会员',duration_months:1,price_cents:200,compare_at_price_cents:990,is_recommended:false,sort_order:1},
  {id:'quarterly',name:'季度会员',duration_months:3,price_cents:2500,compare_at_price_cents:2970,is_recommended:false,sort_order:2},
  {id:'yearly',name:'年度会员',duration_months:12,price_cents:8800,compare_at_price_cents:11880,is_recommended:true,sort_order:3}
];
const state={userId:'',loaded:false,loading:false,error:'',plans:[...DEFAULT_PLANS],membership:null,orders:[]};
let started=false;
let loadPromise=null;

function snapshot(){return {...state,plans:[...state.plans],membership:state.membership?{...state.membership}:null,orders:[...state.orders]};}
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
  if(!user?.id){state.userId='';state.loaded=true;state.loading=false;state.error='';state.membership=null;state.orders=[];state.plans=[...DEFAULT_PLANS];emit();return snapshot();}
  if(loadPromise)return loadPromise;
  if(!force&&state.loaded&&state.userId===String(user.id))return snapshot();
  state.userId=String(user.id);state.loading=true;state.error='';emit();
  loadPromise=(async()=>{
    try{
      const [plansResult,membershipResult,ordersResult]=await Promise.all([
        client.from('membership_plans').select('id,name,duration_months,price_cents,compare_at_price_cents,is_recommended,sort_order').eq('is_active',true).order('sort_order',{ascending:true}),
        client.from('memberships').select('user_id,plan_id,status,starts_at,expires_at,source,updated_at').eq('user_id',user.id).maybeSingle(),
        client.from('membership_orders').select('id,order_no,plan_id,amount_cents,payment_method,status,created_at,paid_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20)
      ]);
      const plans=fail(plansResult,'读取会员套餐失败')||[];
      state.plans=plans.length?plans:[...DEFAULT_PLANS];
      state.membership=fail(membershipResult,'读取会员状态失败')||null;
      state.orders=fail(ordersResult,'读取会员订单失败')||[];
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
    if(!user){state.userId='';state.loaded=true;state.loading=false;state.error='';state.membership=null;state.orders=[];state.plans=[...DEFAULT_PLANS];emit();return;}
    const changed=state.userId!==String(user.id);
    if(changed){state.userId=String(user.id);state.loaded=false;state.membership=null;state.orders=[];emit();}
    load(changed).catch(()=>{});
  });
}

export const membershipStore={
  state,
  start,
  load,
  isActive,
  stickerLimit(){return isActive()?160:80;},
  partyLimit(){return isActive()?15:5;},
  subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}
};
