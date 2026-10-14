import {test,expect,Page} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';

// Generate small, valid 3:4 PNGs without depending on remote assets.
function crc(bytes:Buffer){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function png(w:number,h:number){const chunk=(type:string,data:Buffer)=>{const t=Buffer.from(type),size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([size,t,data,checksum]);};const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;const scan=Buffer.alloc((w*3+1)*h,230);for(let y=0;y<h;y++)scan[y*(w*3+1)]=0;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);}
const imageDir=join(tmpdir(),'fw-shop-test-images');mkdirSync(imageDir,{recursive:true});const images=[1,2,3,4,5].map(n=>{const p=join(imageDir,`image-${n}.png`);writeFileSync(p,png(90,120));return p;});const wide=join(imageDir,'wide.png');writeFileSync(wide,png(120,90));
const me='00000000-0000-4000-8000-000000000091',p='00000000-0000-4000-8000-000000000001';
const user={id:me,email:'admin-shop-test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{nickname:'商城管理员'}};
async function setup(page:Page,{product=false,orders=false,fail=false}={}){
 if(process.env.FW_MEDIA_QA_FONT)await page.route('**/__shop-qa-font.otf',route=>route.fulfill({path:process.env.FW_MEDIA_QA_FONT!}));
 const c:any={products:product?[{id:p,title:'伏伏贴纸',price_cents:1000,image_paths:[`products/${p}/${p}.png`],is_active:true,deleted_at:null}]:[],orders:[],requests:[],fail};
 if(orders)c.orders=['pending','paid'].map((status,i)=>({id:`00000000-0000-4000-8000-00000000010${i}`,order_no:'FS'+String(i+1).repeat(32),product_id:p,product_title:'伏伏贴纸',product_images:[`products/${p}/${p}.png`],amount_cents:1000,status,fulfillment_status:'unfulfilled',recipient_name:'测试收货人',recipient_phone:'13800000000',recipient_address:'广东省深圳市南山区测试路1号301室',created_at:new Date().toISOString(),paid_at:status==='paid'?new Date().toISOString():null}));
 await page.addInitScript(user=>localStorage.setItem('fw-admin-desktop-auth',JSON.stringify({access_token:'admin-token',refresh_token:'refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),user);
 await page.route('https://**.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;const raw=req.postData()||'',body=raw.startsWith('{')||raw.startsWith('[')?JSON.parse(raw):{};c.requests.push({path,body,method:req.method()});let data:any=[];
  if(path.includes('/storage/v1/object/public/'))return route.fulfill({contentType:'image/png',body:png(90,120)});
  if(path.endsWith('/auth/v1/user'))data=user;
  else if(path.endsWith('/fw_get_current_profile'))data=[{id:me,nickname:'商城管理员',role:'admin',is_banned:false}];
  else if(path.includes('/storage/v1/object/'))data={Key:path.split('/shop-products/')[1]};
  else if(path.endsWith('/shop_products')){
   if(req.method()==='POST'){
    if(c.fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'模拟保存失败'})});
    const row={...(Array.isArray(body)?body[0]:body),deleted_at:null};c.products.push(row);data={id:row.id};
   }else if(req.method()==='PATCH'){const id=(url.searchParams.get('id')||'').replace('eq.','');const row=c.products.find((p:any)=>p.id===id);Object.assign(row,body);data={id};}
   else {const id=url.searchParams.get('id');const rows=c.products.filter((p:any)=>!p.deleted_at&&(!id||p.id===id.replace('eq.','')));data=id?rows:rows;}
  }else if(path.endsWith('/shop_orders')){
   if(req.method()==='PATCH'){const id=(url.searchParams.get('id')||'').replace('eq.',''),row=c.orders.find((o:any)=>o.id===id);Object.assign(row,body,{shipped_at:new Date().toISOString()});data={id};}else data=c.orders;
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/');if(process.env.FW_MEDIA_QA_FONT){await page.addStyleTag({content:'@font-face{font-family:ShopQA;src:url(/__shop-qa-font.otf)}body,input,button,textarea{font-family:ShopQA,sans-serif!important}'});await page.evaluate(()=>document.fonts.ready);}
 await page.locator('[data-nav="shop"]').click();await expect(page.locator('[data-shop-admin-new]')).toBeVisible();return c;
}
test('后台新增商品上传1—4张3∶4图，标题价格保存并可修改',async({page},testInfo)=>{
 const c=await setup(page);await page.setViewportSize({width:1080,height:720});await page.locator('[data-shop-admin-new]').click();await page.locator('[name="title"]').fill('伏伏表情包贴纸');await page.locator('[name="price"]').fill('19.90');await page.locator('[data-shop-admin-files]').setInputFiles(images.slice(0,4));await expect(page.locator('.shop-admin-images img')).toHaveCount(4);
 const r=await page.locator('.shop-admin-images img').first().boundingBox();expect(Math.abs(r!.width/r!.height-.75)).toBeLessThan(.01);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:testInfo.outputPath('shop-admin-editor-1080.png')});
 await page.locator('[data-shop-admin-form] [type="submit"]').click();await expect(page.locator('.shop-admin-product-list')).toContainText('伏伏表情包贴纸');expect(c.products[0].price_cents).toBe(1990);expect(c.products[0].image_paths).toHaveLength(4);
 await page.locator('[data-shop-admin-edit]').click();await page.locator('[name="price"]').fill('25');await page.locator('[data-shop-admin-form] [type="submit"]').click();await expect.poll(()=>c.products[0].price_cents).toBe(2500);
});
test('图片超限或比例不符整批拒绝，已有草稿与图片保留',async({page})=>{
 await setup(page);await page.locator('[data-shop-admin-new]').click();await page.locator('[name="title"]').fill('保留草稿');await page.locator('[data-shop-admin-files]').setInputFiles(images.slice(0,1));await expect(page.locator('.shop-admin-images img')).toHaveCount(1);await page.locator('[data-shop-admin-files]').setInputFiles(images.slice(1));await expect(page.locator('#toast')).toContainText('最多4张');await expect(page.locator('.shop-admin-images img')).toHaveCount(1);await page.locator('[data-shop-admin-files]').setInputFiles(wide);await expect(page.locator('#toast')).toContainText('3∶4');await expect(page.locator('[name="title"]')).toHaveValue('保留草稿');await expect(page.locator('.shop-admin-images img')).toHaveCount(1);
});
test('商品保存失败保留草稿，重试复用已上传图片',async({page})=>{
 const c=await setup(page,{fail:true});await page.locator('[data-shop-admin-new]').click();await page.locator('[name="title"]').fill('重试贴纸');await page.locator('[name="price"]').fill('10');await page.locator('[data-shop-admin-files]').setInputFiles(images[0]);await expect(page.locator('.shop-admin-images img')).toHaveCount(1);await page.locator('[data-shop-admin-form] [type="submit"]').click();await expect(page.locator('#toast')).toContainText('草稿已保留');await expect(page.locator('[name="title"]')).toHaveValue('重试贴纸');c.fail=false;await page.locator('[data-shop-admin-form] [type="submit"]').click();await expect(page.locator('.shop-admin-product-list')).toContainText('重试贴纸');expect(c.requests.filter((r:any)=>r.path.includes('/storage/v1/object/shop-products')&&r.method==='POST')).toHaveLength(1);
});
test('后台看到订单收货信息，未付款不能发货，已付款回填公司及单号',async({page},testInfo)=>{
 const c=await setup(page,{orders:true});await page.locator('[data-shop-admin-tab="orders"]').click();await expect(page.locator('.shop-admin-order-list article')).toHaveCount(2);const pending=page.locator('.shop-admin-order-list article').first(),paid=page.locator('.shop-admin-order-list article').nth(1);await pending.locator('summary').click();await expect(pending.locator('[data-shop-admin-ship]')).toHaveCount(0);await expect(pending).toContainText('不能发货');await paid.locator('summary').click();await expect(paid).toContainText('13800000000');await expect(paid).toContainText('301室');await paid.locator('[data-shop-admin-ship]').click();await page.locator('[name="shipping_carrier"]').fill('顺丰速运');await page.locator('[name="tracking_no"]').fill('SF123456789');await page.locator('#action-dialog [type="submit"]').click();await expect(paid).toContainText('SF123456789');expect(c.orders[1].fulfillment_status).toBe('shipped');await page.screenshot({path:testInfo.outputPath('shop-admin-shipment.png')});
});
test('删除商品移除列表但保留历史订单，图片不会被删除',async({page})=>{
 const c=await setup(page,{product:true,orders:true});await page.locator('[data-shop-admin-delete]').click();await page.locator('#action-dialog [type="submit"]').click();await expect(page.locator('.shop-admin-product-list article')).toHaveCount(0);await page.locator('[data-shop-admin-tab="orders"]').click();await expect(page.locator('.shop-admin-order-list article')).toHaveCount(2);expect(c.products[0].deleted_at).toBeTruthy();expect(c.requests.some((r:any)=>r.method==='DELETE')).toBe(false);
});
