import {test,expect,Page} from '@playwright/test';

const me='00000000-0000-4000-8000-000000000081';
const user={id:me,aud:'authenticated',role:'authenticated',email:'shop-test@example.invalid',app_metadata:{provider:'email',providers:['email']},user_metadata:{nickname:'商城测试',lab_code:'FWSHOP1'},created_at:'2026-10-14T00:00:00Z'};
const pid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const paths=(n:number)=>[1,2,3,4].map(i=>`products/${pid(n)}/${pid(n*10+i)}.png`);
const products=[1,2,3,4].map(n=>({id:pid(n),title:['伏伏表情包贴纸','伏伏办公日常明信片','伏伏咖啡续命小卡','伏伏摸鱼便签'][n-1],price_cents:1000+(n-1)*290,image_paths:paths(n)}));

async function setup(page:Page,mode:'success'|'pending'|'error'|'price'='success'){
 if(process.env.FW_MEDIA_QA_FONT)await page.route('**/__shop-qa-font.otf',route=>route.fulfill({path:process.env.FW_MEDIA_QA_FONT!}));
 const controls:any={shipped:false,mode,order:null,requests:[],reads:0};
 await page.addInitScript(user=>{localStorage.setItem('fw-lab-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));(window as any).checkoutUrls=[];window.open=(url:any)=>{(window as any).checkoutUrls.push(String(url));return {} as any;};},user);
 await page.route('https://**.supabase.co/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;let data:any=[];const body=request.postData()?JSON.parse(request.postData()!):{};
  controls.requests.push({path,body,method:request.method()});
  if(path.includes('/storage/v1/object/public/shop-products/'))return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#f5f1ee"/><rect x="100" y="200" width="700" height="800" rx="40" fill="#fff" stroke="#e6dcd6"/><circle cx="450" cy="510" r="150" fill="#dadad6"/><ellipse cx="450" cy="710" rx="130" ry="145" fill="#eeeeea"/><circle cx="410" cy="500" r="10"/><circle cx="490" cy="500" r="10"/><path d="M410 550q40 40 80 0" fill="none" stroke="#444" stroke-width="8"/><rect x="370" y="820" width="160" height="45" rx="20" fill="#edbbc7"/></svg>`});
  if(path.endsWith('/auth/v1/user'))data=user;
  else if(path.endsWith('/auth/v1/logout'))data={};
  else if(path.endsWith('/fw_get_current_profile'))data=[{id:me,nickname:'商城测试',role:'user',lab_code:'FWSHOP1',is_banned:false}];
  else if(path.endsWith('/shop_products'))data=products.map((p:any,i)=>({...p,price_cents:controls.mode==='price'&&controls.reads>0&&i===0?1200:p.price_cents})),controls.reads++;
  else if(path.endsWith('/shop_orders')){if(controls.shipped&&controls.order)controls.order={...controls.order,fulfillment_status:'shipped',shipping_carrier:'顺丰速运',tracking_no:'SF123456789',shipped_at:new Date().toISOString()};data=controls.order?[controls.order]:[];}
  else if(path.endsWith('/shop-alipay')){
   if(body.action==='config')data={enabled:true,max_amount_cents:5000};
   else if(body.action==='create'){
    if(controls.mode==='price'&&body.expected_amount_cents===1000)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'PRODUCT_PRICE_CHANGED'})});
    if(controls.mode==='error')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'SERVICE_UNAVAILABLE'})});
    const p=products.find(p=>p.id===body.product_id)!;controls.order={id:pid(100),order_no:'FS'+'a'.repeat(32),product_id:p.id,product_title:p.title,product_images:p.image_paths,amount_cents:body.expected_amount_cents,status:'pending',payment_method:'alipay',payment_expires_at:new Date(Date.now()+600000).toISOString(),created_at:new Date().toISOString(),paid_at:null,fulfillment_status:'unfulfilled',shipping_carrier:null,tracking_no:null,shipped_at:null,recipient_name:body.recipient_name,recipient_phone:body.recipient_phone,recipient_address:body.recipient_address};
    data={order:controls.order,payment_url:'https://openapi.alipay.com/gateway.do?app_id=2021007104686921&method=alipay.trade.page.pay&sign=synthetic'};
   }else if(body.action==='recover')data={order:controls.order};
   else if(body.action==='query'){
    if(controls.mode==='success')controls.order={...controls.order,status:'paid',paid_at:new Date().toISOString()};
    data={order:controls.order};
   }else if(body.action==='resume')data={order:controls.order,payment_url:'https://openapi.alipay.com/gateway.do?app_id=2021007104686921&method=alipay.trade.page.pay&sign=synthetic'};
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/');if(process.env.FW_MEDIA_QA_FONT){await page.addStyleTag({content:'@font-face{font-family:ShopQA;src:url(/__shop-qa-font.otf)}body,input,button,textarea{font-family:ShopQA,sans-serif!important}'});await page.evaluate(()=>document.fonts.ready);}
 await page.locator('[data-nav="membership"]').click();await page.locator('[data-membership-tab="shop"]').click();
 await expect(page.locator('[data-shop-product]')).toHaveCount(4);
 return controls;
}
async function contact(page:Page){await page.locator('[name="recipient_name"]').fill('王小明');await page.locator('[name="recipient_phone"]').fill('13800000000');await page.locator('[name="recipient_address"]').fill('广东省深圳市南山区测试路一号三楼301室');}
const createRequests=(c:any)=>c.requests.filter((r:any)=>r.path.endsWith('/shop-alipay')&&r.body.action==='create');

test('商城卡片与四张详情图片均为3∶4，小窗口无横向裁切',async({page})=>{
 await setup(page);
 for(const width of [1066,760]){await page.setViewportSize({width,height:width===760?560:728});const img=page.locator('[data-shop-product] img').first();const rect=await img.boundingBox();expect(Math.abs(rect!.width/rect!.height-.75)).toBeLessThan(.01);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:`/workspace/scratch/8b50cbe6da25/audit/shop-client-grid-${width}.png`});}
 await page.locator('[data-shop-product]').first().click();await expect(page.locator('[data-shop-image]')).toHaveCount(4);await page.locator('[data-shop-image="3"]').click();await expect(page.locator('[data-shop-image="3"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('.shop-main-image')).toHaveAttribute('src',new RegExp(pid(14)));expect(await page.locator('.shop-detail').evaluate(n=>n.scrollWidth-n.clientWidth)).toBeLessThanOrEqual(1);
});
test('收货信息完整有效才下单，付款成功有订单号并显示快递信息',async({page})=>{
 const c=await setup(page);await page.locator('[data-shop-product]').first().click();await page.locator('.shop-pay').click();expect(createRequests(c)).toHaveLength(0);
 await contact(page);await page.locator('[name="recipient_phone"]').fill('123');await page.locator('.shop-pay').click();await expect(page.locator('[data-toast]')).toContainText('有效的联系电话');expect(createRequests(c)).toHaveLength(0);
 await page.locator('[name="recipient_phone"]').fill('13800000000');await page.locator('.shop-pay').click();await expect(page.locator('.shop-payment-state')).toContainText('FS'+'a'.repeat(32));
 expect(createRequests(c)).toHaveLength(1);expect(createRequests(c)[0].body).toMatchObject({product_id:pid(1),expected_amount_cents:1000,recipient_name:'王小明',recipient_phone:'13800000000',recipient_address:'广东省深圳市南山区测试路一号三楼301室'});
 await expect.poll(()=>page.evaluate(()=>(window as any).checkoutUrls.length)).toBe(1);await page.locator('[data-shop-query]').click();await expect(page.locator('.shop-payment-state')).toContainText('付款成功');await page.locator('[data-shop-view="orders"]').first().click();await expect(page.locator('.shop-order-status')).toHaveText('待发货');
 c.shipped=true;await page.locator('[data-shop-refresh]').click();await expect(page.locator('.shop-order-status')).toHaveText('已发货');await expect(page.locator('.shop-shipping')).toContainText('顺丰速运');await expect(page.locator('.shop-shipping')).toContainText('SF123456789');await page.locator('.shop-address summary').click();await expect(page.locator('.shop-address')).toContainText('王小明');await expect(page.locator('.shop-address')).toContainText('三楼301室');
 const caches=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('fw-shop-checkout')).map(k=>localStorage.getItem(k)).join(''));expect(caches).not.toContain('王小明');expect(caches).not.toContain('13800000000');
 await page.screenshot({path:'/workspace/scratch/8b50cbe6da25/audit/shop-client-shipped.png'});
});
test('下单失败保留收货草稿，重试复用请求号且不把地址写入本地缓存',async({page})=>{
 const c=await setup(page,'error');await page.locator('[data-shop-product]').first().click();await contact(page);await page.locator('.shop-pay').click();await expect(page.locator('.membership-payment-error')).toContainText('连接失败');await expect(page.locator('[name="recipient_name"]')).toHaveValue('王小明');
 const request=createRequests(c)[0].body.request_id;c.mode='pending';await page.locator('.shop-pay').click();await expect(page.locator('.shop-payment-state')).toContainText('等待支付宝付款');expect(createRequests(c)[1].body.request_id).toBe(request);
 const cache=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('fw-shop-checkout')).map(k=>localStorage.getItem(k)).join(''));expect(cache).not.toContain('13800000000');expect(cache).not.toContain('测试路');
 await page.locator('[data-shop-pause]').click();await expect(page.locator('.shop-payment-state')).toContainText('尚未确认付款');expect(createRequests(c)).toHaveLength(2);
});
test('后台改价要求重新确认，按刷新后的价格创建订单',async({page})=>{
 const c=await setup(page,'price');await page.locator('[data-shop-product]').first().click();await contact(page);await page.locator('.shop-pay').click();await expect(page.locator('.membership-payment-error')).toContainText('价格已更新');await expect(page.locator('.shop-detail-price')).toContainText('¥12');await page.locator('.shop-pay').click();await expect(page.locator('.shop-payment-state')).toContainText('等待支付宝付款');expect(createRequests(c)[1].body.expected_amount_cents).toBe(1200);expect(createRequests(c)[1].body.request_id).not.toBe(createRequests(c)[0].body.request_id);
});
test('切换栏目保留未提交地址，退出登录后清空商城草稿和订单',async({page})=>{
 await setup(page);await page.locator('[data-shop-product]').first().click();await contact(page);await page.locator('[data-membership-tab="appearance"]').click();await page.locator('[data-membership-tab="shop"]').click();await expect(page.locator('[name="recipient_name"]')).toHaveValue('王小明');
 await page.evaluate(async()=>{const {authStore}=await import('/src/auth-store.js');await authStore.client.auth.signOut();});await expect(page.locator('#app')).toBeHidden();const html=await page.locator('[data-membership-content]').innerHTML();expect(html).not.toContain('王小明');expect(html).not.toContain('13800000000');
});
