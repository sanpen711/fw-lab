export const SHOP_BUCKET='shop-products';
export const SHOP_ORDER_FIELDS='id,order_no,product_id,product_title,product_images,amount_cents,status,payment_method,payment_expires_at,paid_at,created_at,recipient_name,recipient_phone,recipient_address,fulfillment_status,shipping_carrier,tracking_no,shipped_at';
export function shopMoney(cents){return `¥${(Number(cents)/100).toFixed(2).replace(/\.00$/,'')}`;}
export function shopImage(path,base){return /^products\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(path||'')?`${base}/storage/v1/object/public/${SHOP_BUCKET}/${path}`:'';}
export function shopRecipient(value){
  const result={recipient_name:String(value.recipient_name||'').trim(),recipient_phone:String(value.recipient_phone||'').trim(),recipient_address:String(value.recipient_address||'').trim()};
  if(!result.recipient_name||[...result.recipient_name].length>60)throw new Error('请填写收货人姓名，最多60字。');
  const digits=result.recipient_phone.replace(/\D/g,'').length;
  if(!/^\+?[0-9][0-9 -]{5,24}$/.test(result.recipient_phone)||digits<7||digits>15)throw new Error('请填写有效的联系电话。');
  if([...result.recipient_address].length<8||[...result.recipient_address].length>300)throw new Error('请填写完整地址，包含省市区、街道和门牌号（8—300字）。');
  if(/[\x00-\x1f\x7f]/.test(Object.values(result).join('')))throw new Error('收货信息不能包含换行或特殊控制字符。');
  return result;
}
export function shopPrice(value){const text=String(value).trim();if(!/^\d{1,7}(\.\d{1,2})?$/.test(text))throw new Error('价格须为正数，最多两位小数。');const [yuan,fraction='']=text.split('.');const cents=Number(yuan)*100+Number(fraction.padEnd(2,'0'));if(cents<1||cents>100000000)throw new Error('价格须在0.01—1,000,000元之间。');return cents;}
export function shopStatus(order){return order.status==='paid'?(order.fulfillment_status==='shipped'?'已发货':'待发货'):({pending:'待付款',closed:'已关闭',refunded:'已退款'})[order.status]||'处理中';}
