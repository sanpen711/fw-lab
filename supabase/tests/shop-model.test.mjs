import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {recipient,asCheckoutOrder,publicShopOrder} from '../functions/_shared/shop.ts';
import {checkoutUrl,readPaymentSettings,makeAlipayClient,validateTrade} from '../functions/_shared/alipay.ts';
test('server shipping validation independently rejects partial and malformed contact',()=>{assert.throws(()=>recipient({recipient_name:'王',recipient_phone:'1',recipient_address:'地址'}),/INVALID_RECIPIENT/);assert.throws(()=>recipient({recipient_name:'王\n明',recipient_phone:'13800000000',recipient_address:'广东省深圳市南山区测试路1号'}),/INVALID_RECIPIENT/);assert.equal(recipient({recipient_name:' 王 ',recipient_phone:'13800000000',recipient_address:'广东省深圳市南山区测试路1号'}).name,'王');});
test('physical checkout uses the saved product price, dedicated callback and excludes address from Alipay URL',()=>{
 const pair=generateKeyPairSync('rsa',{modulusLength:2048});
 const env={ALIPAY_APP_PRIVATE_KEY:pair.privateKey.export({format:'pem',type:'pkcs8'}).toString(),ALIPAY_PUBLIC_KEY:pair.publicKey.export({format:'pem',type:'spki'}).toString(),ALIPAY_SELLER_ID:'2088000000000001',FW_ALIPAY_ENABLED:'true'};
 const settings=readPaymentSettings(k=>env[k]);
 const row={id:crypto.randomUUID(),order_no:'FS'+'a'.repeat(32),product_id:crypto.randomUUID(),product_title:'贴纸',amount_cents:1990,status:'pending',payment_method:'alipay',payment_expires_at:new Date(Date.now()+600000).toISOString(),payment_app_id:settings.appId,payment_seller_id:settings.sellerId,recipient_address:'广东省深圳市南山区测试路1号'};
 const order=asCheckoutOrder(row),url=new URL(checkoutUrl(makeAlipayClient(settings),order,'https://example.com/shop-alipay-notify'));
 const payload=JSON.parse(url.searchParams.get('biz_content'));assert.equal(payload.total_amount,'19.90');assert.equal(payload.subject,'FW研究所-贴纸');assert.equal(url.searchParams.get('notify_url'),'https://example.com/shop-alipay-notify');assert.ok(!url.toString().includes(encodeURIComponent(row.recipient_address)));
 const fields={out_trade_no:row.order_no,total_amount:'19.90',trade_no:'20261014000000000001',trade_status:'TRADE_SUCCESS'};
 assert.equal(validateTrade(fields,order,settings,false),1990);assert.throws(()=>validateTrade({...fields,total_amount:'0.01'},order,settings,false),/PAYMENT_AMOUNT_MISMATCH/);
 const exposed=publicShopOrder(row);assert.equal(exposed.recipient_address,row.recipient_address);assert.ok(!('payment_app_id' in exposed));assert.ok(!('plan_name' in exposed));
});
