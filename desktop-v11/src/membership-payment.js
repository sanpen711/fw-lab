import {authStore} from './auth-store.js';
import {membershipStore} from './membership-store.js';
import {alipayPaymentUrl} from './membership-levels.js';

const listeners=new Set();
const state={userId:'',config:null,configLoading:false,busy:false,order:null,url:'',error:''};
let started=false,visible=false,timer=null,generation=0,configPromise=null;
const messages={PAYMENT_NOT_OPEN:'支付宝支付暂未开放，请稍后再试。',PLAN_OVER_PAYMENT_LIMIT:'这个套餐暂不支持支付宝付款，请选择其他套餐。',ORDER_NOT_PAYABLE:'订单已关闭或超过付款时限，请查询结果后重新下单。',ORDER_NOT_FOUND:'没有找到当前账号的订单。',LOGIN_REQUIRED:'登录状态已失效，请重新登录。',TOO_MANY_PENDING_ORDERS:'待支付订单较多，请先查询或完成现有订单。',PAYMENT_QUERY_UNAVAILABLE:'暂时无法确认付款结果，请稍后再次查询。',PAYMENT_ACCOUNT_MISMATCH:'付款配置已变更，请联系站点管理员。'};
function emit(){listeners.forEach(listener=>listener({...state}));}
const cacheKey=()=>`fw-membership-checkout:${state.userId}`;
function readCache(){try{return JSON.parse(localStorage.getItem(cacheKey())||'null');}catch{return null;}}
function saveCache(value){try{value?localStorage.setItem(cacheKey(),JSON.stringify(value)):localStorage.removeItem(cacheKey());}catch{/* In-memory order remains queryable if browser storage is unavailable. */}}
async function call(body){
  const {data,error}=await authStore.client.functions.invoke('membership-alipay',{body});
  if(error){let code='';try{code=(await error.context?.json())?.error||'';}catch{}throw new Error(messages[code]||'支付服务连接失败，请稍后重试。');}
  if(data?.error)throw new Error(messages[data.error]||'支付请求未完成，请稍后重试。');
  return data;
}
function pending(){return state.order?.status==='pending';}
function schedule(){
  clearTimeout(timer);timer=null;
  if(visible&&state.userId&&pending()&&!state.busy&&!document.hidden){const remaining=new Date(state.order.payment_expires_at).getTime()-Date.now();if(remaining>0)timer=setTimeout(()=>{if(new Date(state.order.payment_expires_at)<=new Date())emit();else query(state.order.order_no);},Math.min(5000,remaining));}
}
async function loadConfig(force=false){
  if(!state.userId||state.configLoading||configPromise||state.config&&!force)return configPromise;
  const token=generation;state.configLoading=true;emit();
  configPromise=(async()=>{try{const data=await call({action:'config'});if(token===generation){state.config=data;state.error='';}}catch(error){if(token===generation){state.config=null;state.error=error.message;}}finally{if(token===generation){configPromise=null;state.configLoading=false;emit();}}})();
  return configPromise;
}
async function accept(data,token){
  if(token!==generation)return;
  if(!data?.order?.order_no||!['pending','paid','closed','refunded','failed'].includes(data.order.status))throw new Error('订单状态读取失败，请重新查询。');
  const previous=state.order;
  state.order=data.order;state.url=data.payment_url?alipayPaymentUrl(data.payment_url):'';
  if(state.order.status==='pending')saveCache({order_no:state.order.order_no});else saveCache(null);
  if(state.order.status==='paid'||previous?.order_no!==state.order.order_no||previous?.status!==state.order.status)await membershipStore.load(true);
}
async function run(body,open=false){
  if(state.busy||!state.userId)return;const token=generation;
  state.busy=true;state.error='';clearTimeout(timer);emit();
  try{const data=await call(body);await accept(data,token);if(open&&token===generation&&state.url)await openCheckout(false);}
  catch(error){if(token===generation)state.error=error.message;}
  finally{if(token===generation){state.busy=false;emit();schedule();}}
}
async function openCheckout(render=true){
  if(!state.url||!state.config?.enabled)return;
  try{const url=alipayPaymentUrl(state.url);if(window.__TAURI__?.core?.invoke)await window.__TAURI__.core.invoke('desktop_open_alipay',{url});else{const win=window.open(url,'_blank','noopener,noreferrer');if(!win)state.error='请点击“打开支付宝付款页”；浏览器可能拦截了新窗口。';}}
  catch(error){state.error=error.message||'付款页未能打开，请重试。';}
  if(render)emit();
}
async function create(planId){
  if(state.busy)return;
  await loadConfig();if(state.busy)return;
  if(!state.config?.enabled){state.error='支付宝支付暂未开放，请稍后再试。';emit();return;}
  const plan=membershipStore.state.plans.find(row=>row.id===planId);
  if(!plan||plan.price_cents>state.config.max_amount_cents){state.error=messages.PLAN_OVER_PAYMENT_LIMIT;emit();return;}
  const cache=readCache();
  if(pending()||cache?.order_no){state.error='已有待确认订单，请先查询付款结果或继续支付。';if(cache?.order_no&&!state.order)await query(cache.order_no);emit();return;}
  if(cache?.request_id&&cache.plan_id!==planId){state.error='上次下单结果尚未确认，请选择原套餐重试，避免重复下单。';emit();return;}
  const requestId=cache?.request_id||crypto.randomUUID();
  saveCache({request_id:requestId,plan_id:planId});
  await run({action:'create',plan_id:planId,request_id:requestId},true);
}
async function query(orderNo=state.order?.order_no){if(orderNo)await run({action:'query',order_no:orderNo});}
async function resume(orderNo){await loadConfig();await run({action:'resume',order_no:orderNo},true);}
function setVisible(value){if(visible===value)return;visible=value;if(value){loadConfig();const cache=readCache();if(cache?.order_no&&!state.order&&!state.busy)query(cache.order_no);}schedule();}
function reset(id=''){
  clearTimeout(timer);generation++;configPromise=null;visible=false;
  Object.assign(state,{userId:id,config:null,configLoading:false,busy:false,order:null,url:'',error:''});emit();
}
export const membershipPayment={
  state,create,query,resume,openCheckout,loadConfig,setVisible,
  newOrder(){if(!pending()&&!state.busy){state.order=null;state.url='';state.error='';emit();}},
  start(){if(started)return;started=true;authStore.subscribe(auth=>{if(!auth.ready)return;const id=auth.user&&!auth.user.cached?String(auth.user.id):'';if(id!==state.userId){const previousKey=state.userId?cacheKey():'';reset(id);if(!id&&previousKey){try{localStorage.removeItem(previousKey);}catch{}}if(id&&visible)setVisible(true);}});document.addEventListener('visibilitychange',schedule);},
  subscribe(listener){listeners.add(listener);listener({...state});return()=>listeners.delete(listener);}
};
