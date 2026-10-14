import {authStore} from './auth-store.js';
import {shopPayment} from './shop-payment.js';
import {SHOP_ORDER_FIELDS,shopImage,shopMoney,shopRecipient,shopStatus} from './shop-model.js';
import {SUPABASE_URL} from './config.js';
import {escapeHtml as esc} from './member-identity.js';

const state={userId:'',products:[],orders:[],loading:false,ordersLoading:false,loaded:false,ordersLoaded:false,error:'',view:'catalog',product:null,image:0,page:0,hasNext:false,recipient:{recipient_name:'',recipient_phone:'',recipient_address:''}};
let started=false,visible=false,generation=0,render=()=>{},notify=()=>{};
const image=path=>shopImage(path,SUPABASE_URL);
const time=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'—';
async function loadProducts(force=false){
  if(!state.userId||state.loading||state.loaded&&!force)return;
  const token=generation;state.loading=true;state.error='';render();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const {data,error}=await authStore.client.from('shop_products').select('id,title,price_cents,image_paths').eq('is_active',true).is('deleted_at',null).order('created_at',{ascending:false}).limit(200).abortSignal(controller.signal);
    if(token!==generation)return;if(error)throw error;
    state.products=data||[];state.loaded=true;
    if(state.product){const updated=state.products.find(row=>row.id===state.product.id);if(updated)state.product=updated;}
  }catch{if(token===generation)state.error='商品读取失败，请点击刷新重试。';}
  finally{clearTimeout(timer);if(token===generation){state.loading=false;render();}}
}
async function loadOrders(force=false){
  if(!state.userId||state.ordersLoading||state.ordersLoaded&&!force)return;
  const token=generation;state.ordersLoading=true;state.error='';render();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const {data,error}=await authStore.client.from('shop_orders').select(SHOP_ORDER_FIELDS).eq('user_id',state.userId).order('created_at',{ascending:false}).order('id',{ascending:false}).range(state.page*20,state.page*20+20).abortSignal(controller.signal);
    if(token!==generation)return;if(error)throw error;
    state.orders=(data||[]).slice(0,20);state.hasNext=(data||[]).length>20;state.ordersLoaded=true;
  }catch{if(token===generation)state.error='订单读取失败，请点击刷新重试。';}
  finally{clearTimeout(timer);if(token===generation){state.ordersLoading=false;render();}}
}
function heading(){return `<header class="shop-heading"><div><small>伏伏周边</small><h3>把伏伏带回日常</h3></div><nav aria-label="周边商城栏目"><button type="button" data-shop-view="catalog" aria-pressed="${state.view!=='orders'}">商品</button><button type="button" data-shop-view="orders" aria-pressed="${state.view==='orders'}">我的周边订单</button><button type="button" data-shop-refresh ${state.loading||state.ordersLoading?'disabled':''}>刷新</button></nav></header>`;}
function catalog(){
  if(state.loading&&!state.loaded)return '<div class="state-card">正在读取商品…</div>';
  return state.products.length?`<div class="shop-product-grid">${state.products.map(p=>`<button type="button" class="shop-product-card" data-shop-product="${esc(p.id)}"><img src="${esc(image(p.image_paths?.[0]))}" alt="${esc(p.title)}" loading="lazy"><h4>${esc(p.title)}</h4><strong>${shopMoney(p.price_cents)}</strong></button>`).join('')}</div>`:'<div class="membership-empty"><b>暂无上架商品</b><span>新周边上架后会显示在这里。</span></div>';
}
function contactForm(){return `<fieldset class="shop-recipient"><legend>收货信息</legend><label>收货人姓名<input name="recipient_name" autocomplete="shipping name" required maxlength="60" value="${esc(state.recipient.recipient_name)}" placeholder="填写真实姓名"></label><label>联系电话<input name="recipient_phone" type="tel" autocomplete="shipping tel" required maxlength="26" value="${esc(state.recipient.recipient_phone)}" placeholder="手机号或固定电话"></label><label>详细地址<textarea name="recipient_address" autocomplete="shipping street-address" required minlength="8" maxlength="300" rows="3" placeholder="省、市、区/县、街道、小区及门牌号">${esc(state.recipient.recipient_address)}</textarea></label><small>请确认信息无误，付款后将按此地址发货。</small></fieldset>`;}
function paymentSection(product){
  const payment=shopPayment.state,order=payment.order,matches=order&&order.product_id===product.id;
  const pending=matches&&order.status==='pending',expired=pending&&new Date(order.payment_expires_at)<=new Date();
  if(matches&&order.status==='paid')return `<section class="shop-payment-state" role="status"><b>付款成功 · ${shopStatus(order)}</b><p>订单号 ${esc(order.order_no)}</p>${order.fulfillment_status==='shipped'?`<p>${esc(order.shipping_carrier)} · ${esc(order.tracking_no)}</p>`:'<p>订单已保存，可在我的周边订单查看发货信息。</p>'}<button type="button" class="secondary" data-shop-view="orders">查看订单</button></section>`;
  if(pending)return `<section class="shop-payment-state" role="status"><b>等待支付宝付款</b><p>订单号 ${esc(order.order_no)}</p><small>付款截止 ${esc(time(order.payment_expires_at))}</small><p>${esc(order.recipient_name)} · ${esc(order.recipient_phone)}<br>${esc(order.recipient_address)}</p><div class="shop-payment-actions"><button type="button" class="primary" data-shop-resume="${esc(order.order_no)}" ${payment.busy||expired?'disabled':''}>${expired?'付款时限已过':'继续支付宝付款'}</button><button type="button" class="secondary" data-shop-query="${esc(order.order_no)}" ${payment.busy?'disabled':''}>查询付款结果</button><button type="button" class="secondary" data-shop-pause ${payment.busy&&payment.action!=='query'?'disabled':''}>暂不支付</button></div><small>${payment.checking?'正在查询付款结果…':payment.paused?'尚未确认付款，请查询原订单，避免重复付款。':'付款后返回软件会自动查询。'}</small></section>`;
  const blocked=payment.configLoading||!payment.config?.enabled||product.price_cents>payment.config.max_amount_cents;
  return `<form data-shop-checkout="${esc(product.id)}">${contactForm()}<button type="submit" class="primary shop-pay" ${blocked||payment.busy?'disabled':''}>${payment.busy?'正在下单…':payment.configLoading?'正在确认支付状态…':!payment.config?.enabled?'支付宝支付暂未开放':product.price_cents>payment.config.max_amount_cents?'超过当前支付额度':'支付宝付款'}</button><p class="shop-payment-note">完成收货信息后前往支付宝收银台，付款结果由服务端确认。</p></form>`;
}
function detail(){
  const product=state.product;if(!product)return catalog();
  const order=shopPayment.state.order,snapshot=order?.product_id===product.id&&['pending','paid'].includes(order.status);
  const images=snapshot?order.product_images:product.image_paths,title=snapshot?order.product_title:product.title,price=snapshot?order.amount_cents:product.price_cents;
  state.image=Math.max(0,Math.min(state.image,(images?.length||1)-1));
  return `<button type="button" class="shop-back" data-shop-view="catalog">← 返回商品</button><article class="shop-detail"><div class="shop-gallery"><img class="shop-main-image" src="${esc(image(images?.[state.image]))}" alt="${esc(title)}"><div class="shop-thumbnails" aria-label="商品图片">${(images||[]).map((path,index)=>`<button type="button" data-shop-image="${index}" aria-label="第${index+1}张商品图" aria-pressed="${state.image===index}"><img src="${esc(image(path))}" alt=""></button>`).join('')}</div></div><div class="shop-detail-info"><h3>${esc(title)}</h3><div class="shop-detail-price"><span>售价</span><strong>${shopMoney(price)}</strong></div>${paymentSection(product)}${shopPayment.state.error?`<p class="membership-payment-error" role="alert">${esc(shopPayment.state.error)}</p>`:''}</div></article>`;
}
function orders(){
  if(state.ordersLoading&&!state.ordersLoaded)return '<div class="state-card">正在读取订单…</div>';
  return `<section class="shop-orders" aria-label="我的周边订单">${state.orders.length?state.orders.map(order=>`<article class="shop-order"><header><span>${esc(time(order.created_at))}</span><b class="shop-order-status">${shopStatus(order)}</b></header><div class="shop-order-main"><img src="${esc(image(order.product_images?.[0]))}" alt="${esc(order.product_title)}"><div><h4>${esc(order.product_title)}</h4><strong>${shopMoney(order.amount_cents)}</strong><small>订单号 ${esc(order.order_no)}</small><button type="button" data-shop-copy="${esc(order.order_no)}">复制订单号</button></div></div>${order.status==='paid'?`<div class="shop-shipping">${order.fulfillment_status==='shipped'?`<b>${esc(order.shipping_carrier)}</b><span>快递单号 ${esc(order.tracking_no)}</span><button type="button" data-shop-copy="${esc(order.tracking_no)}">复制单号</button><small>发货 ${esc(time(order.shipped_at))}</small>`:'<b>已付款，等待发货</b>'}</div>`:''}<details class="shop-address"><summary>收货信息</summary><p>${esc(order.recipient_name)} · ${esc(order.recipient_phone)}</p><p>${esc(order.recipient_address)}</p></details><footer>${order.status==='pending'?`<button type="button" class="primary compact" data-shop-order-open="${esc(order.order_no)}">${new Date(order.payment_expires_at)<=new Date()?'查看付款结果':'继续付款'}</button>`:''}<button type="button" class="secondary compact" data-shop-query="${esc(order.order_no)}" ${shopPayment.state.busy?'disabled':''}>查询订单</button></footer></article>`).join(''):'<div class="membership-empty"><b>暂无周边订单</b><span>购买的商品与快递单号会显示在这里。</span></div>'}<div class="shop-pagination"><button type="button" data-shop-page="-1" ${state.page===0||state.ordersLoading?'disabled':''}>上一页</button><span>第 ${state.page+1} 页</span><button type="button" data-shop-page="1" ${!state.hasNext||state.ordersLoading?'disabled':''}>下一页</button></div>${shopPayment.state.error?`<p class="membership-payment-error" role="alert">${esc(shopPayment.state.error)}</p>`:''}</section>`;
}
export function membershipShopContent(){return `<section class="membership-shop" aria-label="周边商城">${heading()}${state.error?`<p class="membership-payment-error" role="alert">${esc(state.error)}</p>`:''}${state.view==='orders'?orders():state.view==='detail'?detail():catalog()}</section>`;}
export const membershipShop={
  init(options){
    render=options.render;notify=options.toast;if(started)return;started=true;
    authStore.subscribe(auth=>{if(!auth.ready)return;const id=auth.user&&!auth.user.cached?String(auth.user.id):'';if(id===state.userId)return;generation++;visible=false;Object.assign(state,{userId:id,products:[],orders:[],loading:false,ordersLoading:false,loaded:false,ordersLoaded:false,error:'',view:'catalog',product:null,image:0,page:0,hasNext:false,recipient:{recipient_name:'',recipient_phone:'',recipient_address:''}});render();});
    shopPayment.start({refreshOrders:()=>loadOrders(true),refreshProducts:()=>loadProducts(true)});shopPayment.subscribe(()=>{if(visible)render();});
    document.addEventListener('input',event=>{if(event.target.closest('[data-shop-checkout]')&&event.target.name in state.recipient)state.recipient[event.target.name]=event.target.value;});
    document.addEventListener('submit',async event=>{const form=event.target.closest('[data-shop-checkout]');if(!form)return;event.preventDefault();if(shopPayment.state.busy)return;try{state.recipient=shopRecipient(Object.fromEntries(new FormData(form)));await shopPayment.create(state.product,state.recipient);}catch(error){notify(error.message);}});
    document.addEventListener('click',async event=>{
      const b=event.target.closest('button');if(!b||b.disabled)return;
      if(b.hasAttribute('data-shop-product')){state.product=state.products.find(p=>p.id===b.dataset.shopProduct);state.image=0;state.view='detail';shopPayment.newOrder();shopPayment.loadConfig();render();}
      if(b.hasAttribute('data-shop-view')){state.view=b.dataset.shopView;if(state.view==='orders')loadOrders(true);else loadProducts();render();}
      if(b.hasAttribute('data-shop-image')){state.image=Number(b.dataset.shopImage);render();}
      if(b.hasAttribute('data-shop-refresh')){shopPayment.loadConfig(true);state.view==='orders'?loadOrders(true):loadProducts(true);}
      if(b.hasAttribute('data-shop-resume'))await shopPayment.resume(b.dataset.shopResume);
      if(b.hasAttribute('data-shop-query')){await shopPayment.query(b.dataset.shopQuery);await loadOrders(true);}
      if(b.hasAttribute('data-shop-pause'))shopPayment.pause();
      if(b.hasAttribute('data-shop-copy')){try{await navigator.clipboard.writeText(b.dataset.shopCopy);notify('已复制。');}catch{notify('复制失败，请手动复制单号。');}}
      if(b.hasAttribute('data-shop-order-open')){const row=state.orders.find(o=>o.order_no===b.dataset.shopOrderOpen);if(!row)return;state.product={id:row.product_id,title:row.product_title,price_cents:row.amount_cents,image_paths:row.product_images};state.view='detail';state.image=0;render();await shopPayment.query(row.order_no);}
      if(b.hasAttribute('data-shop-page')){state.page+=Number(b.dataset.shopPage);await loadOrders(true);}
    });
    window.addEventListener('focus',()=>{if(visible){loadOrders(true);if(shopPayment.state.order?.status==='pending')shopPayment.query(undefined,{background:true});}});
  },
  setVisible(value){if(value===visible)return;visible=value;queueMicrotask(()=>{shopPayment.setVisible(visible);if(visible){loadProducts();if(state.view==='orders')loadOrders(true);}});},
};
