import {authStore} from './auth-store.js';
import {membershipStore} from './membership-store.js';
import {alipayPaymentUrl} from './membership-levels.js';

const REQUEST_TIMEOUT=15000,POLL_INTERVAL=5000,AUTO_CHECK_LIMIT=3;
const listeners=new Set();
const state={userId:'',config:null,configLoading:false,busy:false,checking:false,action:'',order:null,url:'',error:'',paused:false,pauseReason:'',lastCheckedAt:''};
let started=false,visible=false,timer=null,generation=0,configPromise=null,configController=null,operation=null,automaticChecks=0,expiryCheckedOrder='';
const messages={PAYMENT_NOT_OPEN:'支付宝支付暂未开放，请稍后再试。',PLAN_OVER_PAYMENT_LIMIT:'这个套餐暂不支持支付宝付款，请选择其他套餐。',ORDER_NOT_PAYABLE:'订单已关闭或超过付款时限，请查询结果后重新下单。',ORDER_NOT_FOUND:'没有找到当前账号的订单。',LOGIN_REQUIRED:'登录状态已失效，请重新登录。',TOO_MANY_PENDING_ORDERS:'待支付订单较多，请先查询或完成现有订单。',PAYMENT_QUERY_UNAVAILABLE:'暂时无法确认付款结果，请稍后再次查询。',PAYMENT_ACCOUNT_MISMATCH:'付款配置已变更，请联系站点管理员。'};
function emit(){listeners.forEach(listener=>listener({...state}));}
const cacheKey=()=>`fw-membership-checkout:${state.userId}`;
function readCache(){try{return JSON.parse(localStorage.getItem(cacheKey())||'null');}catch{return null;}}
function saveCache(value){try{value?localStorage.setItem(cacheKey(),JSON.stringify(value)):localStorage.removeItem(cacheKey());}catch{/* Keep the in-memory order if storage is unavailable. */}}
function pending(){return state.order?.status==='pending';}
function saveOrder(){saveCache(pending()?{order_no:state.order.order_no,paused:state.paused,pause_reason:state.pauseReason}:null);}
async function call(body,controller=new AbortController()){
  let timedOut=false,timeoutId,onAbort;
  const timeoutMessage=body.action==='query'?'查询超时，暂未确认付款结果。请手动查询，不要重复付款。':body.action==='create'?'下单结果暂未确认，请重试原套餐，避免重复下单。':'支付服务响应超时，请稍后重试。';
  const aborted=new Promise((_,reject)=>{
    onAbort=()=>reject(timedOut?new Error(timeoutMessage):new DOMException('查询已停止','AbortError'));
    controller.signal.addEventListener('abort',onAbort,{once:true});
    if(controller.signal.aborted)onAbort();
    timeoutId=setTimeout(()=>{timedOut=true;controller.abort();},REQUEST_TIMEOUT);
  });
  const response=(async()=>{
    const {data,error}=await authStore.client.functions.invoke('membership-alipay',{body,signal:controller.signal});
    if(error){let code='';try{code=(await error.context?.json())?.error||'';}catch{}throw new Error(messages[code]||'支付服务连接失败，请稍后重试。');}
    if(data?.error)throw new Error(messages[data.error]||'支付请求未完成，请稍后重试。');
    return data;
  })();
  try{return await Promise.race([response,aborted]);}
  finally{clearTimeout(timeoutId);controller.signal.removeEventListener('abort',onAbort);}
}
function stopBackground(){
  if(!operation?.background)return;
  const previous=operation;operation=null;if(previous.expiry)expiryCheckedOrder='';previous.controller.abort();state.checking=false;state.action='';
}
function schedule(){
  clearTimeout(timer);timer=null;
  if(!visible||!state.userId||!pending()||operation||document.hidden)return;
  const remaining=new Date(state.order.payment_expires_at).getTime()-Date.now();
  if(!Number.isFinite(remaining))return;
  if(remaining<=0){
    if(expiryCheckedOrder===state.order.order_no)return;
    expiryCheckedOrder=state.order.order_no;state.paused=true;state.pauseReason='expired';saveOrder();emit();
    query(state.order.order_no,{background:true,expiry:true});return;
  }
  // Pausing stops regular polling, but keeps one final check at the deadline.
  timer=setTimeout(()=>{if(new Date(state.order.payment_expires_at)<=new Date())schedule();else query(state.order.order_no,{background:true});},state.paused?remaining:Math.min(POLL_INTERVAL,remaining));
}
async function loadConfig(force=false){
  if(!state.userId||state.configLoading||configPromise||state.config&&!force)return configPromise;
  const token=generation,controller=new AbortController();configController=controller;state.configLoading=true;emit();
  configPromise=(async()=>{try{const data=await call({action:'config'},controller);if(token===generation){state.config=data;state.error='';}}catch(error){if(token===generation){state.config=null;state.error=error.message;}}finally{if(token===generation){configPromise=null;configController=null;state.configLoading=false;emit();}}})();
  return configPromise;
}
function accept(data,request){
  if(request.token!==generation||operation!==request)return;
  if(!data?.order?.order_no||!['pending','paid','closed','refunded','failed'].includes(data.order.status))throw new Error('订单状态读取失败，请重新查询。');
  const previous=state.order;
  state.order=data.order;
  if(previous?.order_no!==state.order.order_no){state.url='';automaticChecks=0;expiryCheckedOrder='';state.lastCheckedAt='';}
  if(data.payment_url)state.url=alipayPaymentUrl(data.payment_url);
  if(!pending())state.url='';
  if(request.body.action==='query'){
    state.lastCheckedAt=new Date().toISOString();
    if(pending()){
      if(request.expiry){state.paused=true;state.pauseReason='expired';}
      else if(!request.background||++automaticChecks>=AUTO_CHECK_LIMIT){state.paused=true;state.pauseReason='unpaid';}
    }
  }
  if(!pending()){state.paused=false;state.pauseReason='';}
  saveOrder();
  // Reading membership/history must not hold the checkout button indefinitely.
  if(state.order.status==='paid'||previous?.order_no!==state.order.order_no||previous?.status!==state.order.status)membershipStore.load(true).catch(()=>{});
}
async function run(body,{open=false,background=false,expiry=false}={}){
  if(operation||!state.userId)return;
  const request={body,token:generation,controller:new AbortController(),background,expiry};operation=request;
  state.busy=!background;state.checking=background;state.action=body.action;state.error='';clearTimeout(timer);emit();
  try{
    const data=await call(body,request.controller);
    if(request.token!==generation||operation!==request)return;
    accept(data,request);
    if(open&&state.url)await openCheckout(false);
  }catch(error){if(request.token===generation&&operation===request){state.error=error.message;if(pending()){state.paused=true;state.pauseReason=expiry?'expired':'error';saveOrder();}}}
  finally{if(request.token===generation&&operation===request){operation=null;state.busy=false;state.checking=false;state.action='';emit();schedule();}}
}
async function openCheckout(render=true){
  if(!state.url||!state.config?.enabled||!pending()||new Date(state.order.payment_expires_at)<=new Date())return;
  const token=generation,orderNo=state.order.order_no;
  try{
    const url=alipayPaymentUrl(state.url);
    if(window.__TAURI__?.core?.invoke)await window.__TAURI__.core.invoke('desktop_open_alipay',{url});
    else if(!window.open(url,'_blank','noopener,noreferrer'))throw new Error('请点击“打开支付宝付款页”；浏览器可能拦截了新窗口。');
    if(token!==generation||orderNo!==state.order?.order_no)return;
    state.paused=false;state.pauseReason='';state.error='';automaticChecks=0;saveOrder();
  }catch(error){state.error=error.message||'付款页未能打开，请重试。';state.paused=true;state.pauseReason='error';saveOrder();}
  if(render){emit();schedule();}
}
async function create(planId){
  if(operation)return;
  await loadConfig();if(operation)return;
  if(!state.config?.enabled){state.error='支付宝支付暂未开放，请稍后再试。';emit();return;}
  const plan=membershipStore.state.plans.find(row=>row.id===planId);
  if(!plan||plan.price_cents>state.config.max_amount_cents){state.error=messages.PLAN_OVER_PAYMENT_LIMIT;emit();return;}
  const cache=readCache();
  if(pending()||cache?.order_no){state.error='已有待付款订单，请查询结果或继续原订单付款。';if(cache?.order_no&&!state.order)await query(cache.order_no,{background:true});emit();return;}
  if(cache?.request_id&&cache.plan_id!==planId){state.error='上次下单结果尚未确认，请选择原套餐重试，避免重复下单。';emit();return;}
  const requestId=cache?.request_id||crypto.randomUUID();
  saveCache({request_id:requestId,plan_id:planId});
  await run({action:'create',plan_id:planId,request_id:requestId},{open:true});
}
async function query(orderNo=state.order?.order_no,options={}){if(!options.background)stopBackground();if(orderNo)await run({action:'query',order_no:orderNo},options);}
async function resume(orderNo){stopBackground();await loadConfig();await run({action:'resume',order_no:orderNo},{open:true});}
function pause(){
  if(!pending()||operation&&operation.body.action!=='query')return;
  if(operation){const previous=operation;operation=null;previous.controller.abort();}
  state.busy=false;state.checking=false;state.action='';state.paused=true;state.pauseReason='user';state.error='';saveOrder();emit();schedule();
}
function setVisible(value){
  if(visible===value)return;visible=value;
  if(!value){stopBackground();schedule();return;}
  loadConfig();const cache=readCache();
  if(cache?.order_no&&!state.order&&!operation){state.paused=cache.paused===true;state.pauseReason=['user','unpaid','error','expired'].includes(cache.pause_reason)?cache.pause_reason:'';query(cache.order_no,{background:true});}
  schedule();
}
function reset(id=''){
  clearTimeout(timer);generation++;operation?.controller.abort();configController?.abort();operation=null;configPromise=null;configController=null;visible=false;automaticChecks=0;expiryCheckedOrder='';
  Object.assign(state,{userId:id,config:null,configLoading:false,busy:false,checking:false,action:'',order:null,url:'',error:'',paused:false,pauseReason:'',lastCheckedAt:''});emit();
}
export const membershipPayment={
  state,create,query,resume,openCheckout,loadConfig,setVisible,pause,
  newOrder(){if(!pending()&&!operation){state.order=null;state.url='';state.error='';state.paused=false;state.pauseReason='';state.lastCheckedAt='';emit();}},
  start(){if(started)return;started=true;authStore.subscribe(auth=>{if(!auth.ready)return;const id=auth.user&&!auth.user.cached?String(auth.user.id):'';if(id!==state.userId){const previousKey=state.userId?cacheKey():'';reset(id);if(!id&&previousKey){try{localStorage.removeItem(previousKey);}catch{}}if(id&&visible)setVisible(true);}});document.addEventListener('visibilitychange',()=>{if(document.hidden)stopBackground();schedule();});},
  subscribe(listener){listeners.add(listener);listener({...state});return()=>listeners.delete(listener);}
};
