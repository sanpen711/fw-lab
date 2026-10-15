import {SHOP_BUCKET,SHOP_ORDER_FIELDS,shopImage,shopMoney,shopPrice,shopStatus} from '../../desktop-v11/src/shop-model.js';
import {SUPABASE_URL} from './config.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'—';
const image=path=>shopImage(path,SUPABASE_URL);
let client,render,toast,admin,openDialog,generation=0;
const state={products:[],orders:[],tab:'products',page:0,hasNext:false,loading:false,busy:false,processingImages:false,error:'',selected:'',draft:null};
function clearDraft(){for(const img of state.draft?.images||[])if(img.file)URL.revokeObjectURL(img.url);state.draft=null;}
function freshDraft(){clearDraft();state.draft={id:crypto.randomUUID(),title:'',price:'',is_active:true,images:[],existing:false};}
function check(result){if(result.error)throw new Error(result.error.message);return result.data;}
async function load(){
  if(!admin()||state.loading)return;
  const token=generation;state.loading=true;state.error='';render();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const [products,orders]=await Promise.all([
      client.from('shop_products').select('*').is('deleted_at',null).order('created_at',{ascending:false}).limit(200).abortSignal(controller.signal),
      client.from('shop_orders').select(SHOP_ORDER_FIELDS).order('created_at',{ascending:false}).order('id',{ascending:false}).range(state.page*50,state.page*50+50).abortSignal(controller.signal),
    ]);
    if(token!==generation)return;state.products=check(products)||[];const rows=check(orders)||[];state.orders=rows.slice(0,50);state.hasNext=rows.length>50;
  }catch(error){if(token===generation)state.error=`商城读取失败：${error.message||'请重试'}`;}
  finally{clearTimeout(timer);if(token===generation){state.loading=false;render();}}
}
function productEditor(){
  const d=state.draft;if(!d)return '<div class="empty-state">选择商品编辑，或点击新增商品。</div>';
  return `<form class="shop-admin-editor" data-shop-admin-form><h3>${d.existing?'编辑商品':'新增商品'}</h3><label class="field">商品标题<input name="title" value="${esc(d.title)}" required maxlength="80"></label><label class="field">售价（元）<input name="price" value="${esc(d.price)}" inputmode="decimal" required placeholder="例如10或19.90"></label><label class="shop-admin-checkbox"><input name="is_active" type="checkbox" ${d.is_active?'checked':''}> 保存后上架</label><div class="shop-admin-images">${d.images.map((img,i)=>`<div><img src="${esc(img.url)}" alt="商品图${i+1}"><button type="button" data-shop-admin-remove="${i}" aria-label="移除第${i+1}张图">×</button></div>`).join('')}</div><label class="field">商品图片（${d.images.length}/4）<input type="file" data-shop-admin-files accept="image/jpeg,image/png,image/webp" multiple ${d.images.length>=4||state.busy?'disabled':''}></label><p class="help-text">上传1—4张3∶4竖图，推荐900×1200。支持JPG、PNG、WebP，每张最多5MB；按上传顺序展示。</p><div class="detail-actions"><button class="button" type="button" data-shop-admin-cancel ${state.busy?'disabled':''}>取消</button><button class="button primary" type="submit" ${state.busy?'disabled':''}>${state.busy?'正在保存…':'保存商品'}</button></div></form>`;
}
function products(){return `<div class="shop-admin-workspace"><section class="panel"><div class="panel-heading"><div><h2>商品管理</h2><p>上架商品同步到用户的周边商城</p></div><button class="button primary compact" type="button" data-shop-admin-new ${state.busy?'disabled':''}>新增商品</button></div><div class="shop-admin-product-list">${state.products.map(p=>`<article><img src="${esc(image(p.image_paths[0]))}" alt="${esc(p.title)}"><div><h3>${esc(p.title)}</h3><strong>${shopMoney(p.price_cents)}</strong><small>${p.is_active?'上架中':'已下架'} · ${p.image_paths.length}张图片</small></div><div><button class="button compact" type="button" data-shop-admin-edit="${p.id}" ${state.busy?'disabled':''}>编辑</button><button class="button danger compact" type="button" data-shop-admin-delete="${p.id}" ${state.busy?'disabled':''}>删除</button></div></article>`).join('')||'<div class="empty-state">暂无商品，点击新增商品上传。</div>'}</div></section><section class="panel shop-admin-editor-panel">${productEditor()}</section></div>`;}
function orders(){return `<section class="panel"><div class="panel-heading"><div><h2>周边订单</h2><p>核对付款与收货信息后发货，每页50笔</p></div></div><div class="shop-admin-order-list">${state.orders.map(o=>`<article><header><b>${esc(o.order_no)}</b><span class="badge ${o.status==='paid'?'active':'pending'}">${shopStatus(o)}</span></header><div class="shop-admin-order-product"><img src="${esc(image(o.product_images[0]))}" alt=""><div><strong>${esc(o.product_title)}</strong><p>${shopMoney(o.amount_cents)} · 创建 ${esc(fmt(o.created_at))}</p>${o.paid_at?`<p>付款 ${esc(fmt(o.paid_at))}</p>`:''}</div></div><details ${state.selected===o.id?'open':''} data-shop-admin-address="${o.id}"><summary>收货信息与发货</summary><dl><div><dt>收货人</dt><dd>${esc(o.recipient_name)}</dd></div><div><dt>联系电话</dt><dd>${esc(o.recipient_phone)}</dd></div><div><dt>详细地址</dt><dd>${esc(o.recipient_address)}</dd></div></dl>${o.fulfillment_status==='shipped'?`<p class="shop-admin-tracking">${esc(o.shipping_carrier)} · ${esc(o.tracking_no)}<br>发货 ${esc(fmt(o.shipped_at))}</p>`:''}${o.status==='paid'?`<button type="button" class="button primary compact" data-shop-admin-ship="${o.id}">${o.fulfillment_status==='shipped'?'修改快递单号':'填写快递单号并发货'}</button>`:'<p class="help-text">尚未确认付款，不能发货。</p>'}</details></article>`).join('')||'<div class="empty-state">暂无周边订单。</div>'}</div><div class="shop-admin-pagination"><button class="button compact" data-shop-admin-page="-1" ${state.page===0||state.loading?'disabled':''}>上一页</button><span>第${state.page+1}页</span><button class="button compact" data-shop-admin-page="1" ${!state.hasNext||state.loading?'disabled':''}>下一页</button></div></section>`;}
async function filesSelected(files){
  const d=state.draft,token=generation;if(!d||state.busy||state.processingImages)return;
  const batch=[...files];if(!batch.length)return;
  if(d.images.length+batch.length>4){toast('商品最多4张图片，请减少本次选择。',true);return;}
  const prepared=[];
  state.processingImages=true;
  const input=document.querySelector('[data-shop-admin-files]');if(input)input.disabled=true;
  try{
    for(const file of batch){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5242880)throw new Error('图片须为JPG、PNG或WebP，每张最多5MB。');
      const bitmap=await createImageBitmap(file);const ratioValid=Math.abs(bitmap.width*4-bitmap.height*3)<=4;bitmap.close();
      if(!ratioValid)throw new Error('请先把图片裁切为3∶4竖图，例如900×1200。');
      prepared.push({file,url:URL.createObjectURL(file),path:`products/${d.id}/${crypto.randomUUID()}.${({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[file.type]}`});
    }
    if(token!==generation||state.draft!==d){for(const img of prepared)URL.revokeObjectURL(img.url);return;}
    if(d.images.length+prepared.length>4)throw new Error('商品最多4张图片。');
    d.images.push(...prepared);
  }catch(error){for(const img of prepared)URL.revokeObjectURL(img.url);toast(error.message||'图片无法读取，请重新导出。',true);}
  finally{if(token===generation){state.processingImages=false;render();}}
}
async function save(){
  if(state.busy||state.processingImages||!state.draft||!admin())return;
  const d=state.draft,token=generation;let cents;
  try{cents=shopPrice(d.price);if(!d.title.trim()||[...d.title.trim()].length>80)throw new Error('标题须为1—80字。');if(d.images.length<1||d.images.length>4)throw new Error('请上传1—4张商品图片。');}catch(error){toast(error.message,true);return;}
  state.busy=true;render();const uploaded=[];let writeStarted=false;
  try{
    for(const img of d.images){if(!img.file||img.uploaded)continue;check(await client.storage.from(SHOP_BUCKET).upload(img.path,img.file,{contentType:img.file.type,upsert:false,cacheControl:'31536000'}));uploaded.push(img.path);img.uploaded=true;if(token!==generation)throw new Error('管理员登录状态已改变，请重新登录后操作。');}
    const values={title:d.title.trim(),price_cents:cents,is_active:d.is_active,image_paths:d.images.map(i=>i.path)};
    writeStarted=true;
    const result=d.existing?await client.from('shop_products').update(values).eq('id',d.id).is('deleted_at',null).select('id').single():await client.from('shop_products').insert({id:d.id,...values}).select('id').single();
    if(result.error){
      const reconciliation=await client.from('shop_products').select('id,title,price_cents,image_paths,is_active').eq('id',d.id).maybeSingle();
      const committed=reconciliation.data;
      if(reconciliation.error||!committed||committed.title!==values.title||committed.price_cents!==values.price_cents||committed.is_active!==values.is_active||JSON.stringify(committed.image_paths)!==JSON.stringify(values.image_paths))check(result);
    }
    if(token!==generation)return;clearDraft();toast('商品已保存。');await load();
  }catch(error){
    // After an attempted write, a lost response might hide a committed product.
    // Keep its immutable images and reuse them when the administrator retries.
    if(uploaded.length&&!writeStarted){const removed=await client.storage.from(SHOP_BUCKET).remove(uploaded).catch(()=>({error:true}));if(!removed.error)for(const img of d.images)if(uploaded.includes(img.path))img.uploaded=false;}
    if(token===generation)toast(`保存失败，草稿已保留：${error.message}`,true);
  }
  finally{if(token===generation){state.busy=false;render();}}
}
export const shopAdmin={
  load,
  reset(){generation++;clearDraft();Object.assign(state,{products:[],orders:[],loading:false,busy:false,processingImages:false,error:'',tab:'products',page:0,hasNext:false,selected:''});},
  content(){return `<div class="filter-row"><button class="filter-button ${state.tab==='products'?'active':''}" data-shop-admin-tab="products">商品管理</button><button class="filter-button ${state.tab==='orders'?'active':''}" data-shop-admin-tab="orders">周边订单</button><button class="button compact" type="button" data-shop-admin-refresh ${state.loading?'disabled':''}>刷新商城</button></div>${state.error?`<div class="shop-admin-error" role="alert">${esc(state.error)}</div>`:''}${state.loading&&!state.products.length&&!state.orders.length?'<div class="empty-state">正在读取商城…</div>':state.tab==='products'?products():orders()}`;},
  init(options){({client,render,toast,admin,openDialog}=options);
    document.addEventListener('input',event=>{if(!state.draft||!event.target.closest('[data-shop-admin-form]'))return;const field=event.target.name;if(['title','price','is_active'].includes(field))state.draft[field]=field==='is_active'?event.target.checked:event.target.value;});
    document.addEventListener('change',event=>{if(event.target.matches('[data-shop-admin-files]'))filesSelected(event.target.files);});
    document.addEventListener('submit',event=>{if(event.target.matches('[data-shop-admin-form]')){event.preventDefault();save();}});
    document.addEventListener('toggle',event=>{if(event.target.matches?.('[data-shop-admin-address]')&&event.target.open)state.selected=event.target.dataset.shopAdminAddress;},true);
    document.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b||b.disabled||!admin())return;
      if(b.hasAttribute('data-shop-admin-new')){freshDraft();render();}
      if(b.hasAttribute('data-shop-admin-cancel')){clearDraft();render();}
      if(b.hasAttribute('data-shop-admin-remove')&&!state.busy){const [img]=state.draft.images.splice(Number(b.dataset.shopAdminRemove),1);if(img?.file)URL.revokeObjectURL(img.url);render();}
      if(b.hasAttribute('data-shop-admin-edit')){const p=state.products.find(p=>p.id===b.dataset.shopAdminEdit);if(p){clearDraft();state.draft={id:p.id,title:p.title,price:(p.price_cents/100).toFixed(2),is_active:p.is_active,images:p.image_paths.map(path=>({path,url:image(path)})),existing:true};render();}}
      if(b.hasAttribute('data-shop-admin-tab')){state.tab=b.dataset.shopAdminTab;render();}
      if(b.hasAttribute('data-shop-admin-refresh'))load();
      if(b.hasAttribute('data-shop-admin-page')){state.page+=Number(b.dataset.shopAdminPage);load();}
      if(b.hasAttribute('data-shop-admin-delete')){const p=state.products.find(p=>p.id===b.dataset.shopAdminDelete);if(!p)return;openDialog({title:'删除商品',description:'商品将从商城移除，历史订单及商品图继续保留。',body:`<p>${esc(p.title)} · ${shopMoney(p.price_cents)}</p>`,submitLabel:'删除商品',danger:true,onSubmit:async()=>{check(await client.from('shop_products').update({deleted_at:new Date().toISOString(),is_active:false}).eq('id',p.id).is('deleted_at',null).select('id').single());if(state.draft?.id===p.id)clearDraft();await load();}});}
      if(b.hasAttribute('data-shop-admin-ship')){const o=state.orders.find(o=>o.id===b.dataset.shopAdminShip);if(!o||o.status!=='paid')return;openDialog({title:'填写发货信息',description:`订单 ${o.order_no}`,body:`<p>${esc(o.recipient_name)} · ${esc(o.recipient_phone)}<br>${esc(o.recipient_address)}</p><label class="field">快递公司<input name="shipping_carrier" value="${esc(o.shipping_carrier||'')}" required maxlength="40" placeholder="例如顺丰速运"></label><label class="field">快递单号<input name="tracking_no" value="${esc(o.tracking_no||'')}" required maxlength="64" pattern="[A-Za-z0-9][A-Za-z0-9-]{2,63}"></label>`,submitLabel:'保存发货信息',onSubmit:async data=>{const carrier=String(data.get('shipping_carrier')||'').trim(),tracking=String(data.get('tracking_no')||'').trim();if(!carrier||!/^([A-Za-z0-9][A-Za-z0-9-]{2,63})$/.test(tracking))throw new Error('请填写快递公司和有效单号。');check(await client.from('shop_orders').update({shipping_carrier:carrier,tracking_no:tracking,fulfillment_status:'shipped'}).eq('id',o.id).eq('status','paid').select('id').single());await load();}});}
    });
  },
};
