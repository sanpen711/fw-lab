import {authStore} from './auth-store.js';

const client=authStore.client;
const listeners=new Set();
const DEFAULT_PLANS=[
  {id:'monthly',name:'月度会员',duration_months:1,price_cents:200,compare_at_price_cents:990,is_recommended:false,sort_order:1},
  {id:'quarterly',name:'季度会员',duration_months:3,price_cents:2500,compare_at_price_cents:2970,is_recommended:false,sort_order:2},
  {id:'yearly',name:'年度会员',duration_months:12,price_cents:8800,compare_at_price_cents:11880,is_recommended:true,sort_order:3}
];
const THEMES=new Set(['rose_gold','black_gold','pink_starlight']);
export const DEFAULT_APPEARANCE={theme:'rose_gold',frame:'double',nickname_color:'default',title:'',card_layout:'classic',intro:'',featured_post_id:null};
const state={userId:'',loaded:false,loading:false,error:'',plans:[...DEFAULT_PLANS],membership:null,orders:[],growth:null,levels:{},theme:'rose_gold',appearance:{...DEFAULT_APPEARANCE},publicStyles:{},publicAppearances:{}};
let started=false;
let loadPromise=null;
const resolvedProfiles=new Set();
const queuedProfiles=new Set();
let profileFlushPromise=null;
let generation=0;

function snapshot(){return {...state,plans:[...state.plans],membership:state.membership?{...state.membership}:null,orders:[...state.orders],growth:state.growth?{...state.growth}:null,levels:{...state.levels},appearance:{...state.appearance},publicStyles:{...state.publicStyles},publicAppearances:{...state.publicAppearances}};}
function emit(){const next=snapshot();listeners.forEach(listener=>listener(next));}
function currentUser(){const user=authStore.state.user;return user&&!user.cached?user:null;}
function fail(result,label){if(result?.error)throw new Error(`${label}：${result.error.message}`);return result?.data;}

function isActive(membership=state.membership){
  if(!membership||membership.status!=='active'||!membership.expires_at)return false;
  const expires=new Date(membership.expires_at).getTime();
  const starts=membership.starts_at?new Date(membership.starts_at).getTime():0;
  return Number.isFinite(expires)&&starts<=Date.now()&&expires>Date.now();
}

async function load(force=false){
  const user=currentUser();
  if(!user?.id){reset();return snapshot();}
  if(loadPromise)return loadPromise;
  if(!force&&state.loaded&&state.userId===String(user.id))return snapshot();
  state.userId=String(user.id);state.loading=true;state.error='';emit();
  const token=generation;
  loadPromise=(async()=>{
    try{
      const [plansResult,membershipResult,ordersResult,appearanceResult,ownAppearanceResult,growthResult]=await Promise.all([
        client.from('membership_plans').select('id,name,duration_months,price_cents,compare_at_price_cents,is_recommended,sort_order').eq('is_active',true).order('sort_order',{ascending:true}),
        client.from('memberships').select('user_id,plan_id,status,starts_at,expires_at,source,updated_at').eq('user_id',user.id).maybeSingle(),
        client.from('membership_orders').select('id,order_no,plan_id,plan_name,duration_months,amount_cents,payment_method,status,created_at,paid_at,payment_expires_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20),
        client.rpc('fw_get_membership_appearances',{p_user_ids:[user.id]}),
        client.rpc('fw_get_own_membership_appearance'),
        client.rpc('fw_get_own_membership_growth')
      ]);
      if(token!==generation)return snapshot();
      const plans=fail(plansResult,'读取会员套餐失败')||[];
      state.plans=plans.length?plans:[...DEFAULT_PLANS];
      state.membership=fail(membershipResult,'读取会员状态失败')||null;
      state.orders=fail(ordersResult,'读取会员订单失败')||[];
      state.growth=fail(growthResult,'读取会员等级失败');
      state.levels[String(user.id)]=Number(state.growth?.level)||0;
      const appearance=fail(appearanceResult,'读取会员装扮失败')||[];
      const own=fail(ownAppearanceResult,'读取身份设置失败')||[];
      state.appearance={...DEFAULT_APPEARANCE,...(own[0]||appearance[0]||{})};
      state.theme=state.appearance.theme;
      state.publicStyles[String(user.id)]=isActive(state.membership)?state.theme:'';
      state.publicAppearances[String(user.id)]=isActive(state.membership)?appearance[0]||{...state.appearance,expires_at:state.membership.expires_at}:null;
      resolvedProfiles.add(String(user.id));
      state.loaded=true;state.loading=false;state.error='';emit();return snapshot();
    }catch(error){
      if(token===generation){state.loaded=true;state.loading=false;state.error=error.message||'会员信息读取失败。';state.plans=state.plans.length?state.plans:[...DEFAULT_PLANS];emit();}return snapshot();
    }finally{if(token===generation)loadPromise=null;}
  })();
  return loadPromise;
}

function reset(userId=''){
  generation++;loadPromise=null;queuedProfiles.clear();resolvedProfiles.clear();
  Object.assign(state,{userId,loaded:!userId,loading:false,error:'',membership:null,orders:[],growth:null,levels:{},theme:'rose_gold',appearance:{...DEFAULT_APPEARANCE},publicStyles:{},publicAppearances:{}});emit();
}
function start(){
  if(started)return;started=true;
  authStore.subscribe(auth=>{
    if(!auth.ready)return;
    const user=auth.user&&!auth.user.cached?auth.user:null;
    if(!user){reset();return;}
    const changed=state.userId!==String(user.id);
    if(changed)reset(String(user.id));
    load(changed).catch(()=>{});
  });
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
  ids.forEach(id=>{const appearance=found.get(id)||null;const next=appearance?.theme||'';const level=levelMap.get(id)||0;if(JSON.stringify(state.publicAppearances[id])!==JSON.stringify(appearance)||state.levels[id]!==level){state.publicStyles[id]=next;state.publicAppearances[id]=appearance;state.levels[id]=level;changed=true;}});
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
  return setAppearance({...state.appearance,theme:normalized});
}

async function setAppearance(value){
  if(!isActive())throw new Error('会员有效期内才能保存身份设置。');
  const token=generation;
  fail(await client.rpc('fw_set_membership_appearance',{p_theme:value.theme,p_frame:value.frame,p_nickname_color:value.nickname_color,p_title:value.title,p_card_layout:value.card_layout,p_intro:value.intro,p_featured_post_id:value.featured_post_id||null}),'保存身份设置失败');
  if(token===generation)await load(true);
  return snapshot();
}
function appearanceFor(userId){
  const appearance=state.publicAppearances[String(userId||'')];
  return appearance&&new Date(appearance.expires_at).getTime()>Date.now()?appearance:null;
}

export const membershipStore={
  state,
  start,
  load,
  ensureProfiles,
  setTheme,
  setAppearance,
  appearanceFor,
  levelFor(userId){return Math.max(0,Math.min(9,Number(state.levels[String(userId)])||0));},
  isActive,
  themeFor(userId){return appearanceFor(userId)?.theme||'';},
  stickerLimit(){return isActive()?160:80;},
  canCreateParty(){return isActive();},
  partyLimit(){return isActive()?15:0;},
  subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}
};
