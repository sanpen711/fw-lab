import { type CheckoutOrder, PaymentError } from './alipay.ts';

export type ShopOrder = Omit<CheckoutOrder,'plan_id'|'plan_name'|'duration_months'> & {
  product_id: string; product_title: string; product_images: string[];
  recipient_name: string; recipient_phone: string; recipient_address: string;
  fulfillment_status: string; shipping_carrier: string | null;
  tracking_no: string | null; shipped_at: string | null; created_at: string;
};

export function recipient(value: Record<string,unknown>) {
  const result = {
    name: typeof value.recipient_name === 'string' ? value.recipient_name.trim() : '',
    phone: typeof value.recipient_phone === 'string' ? value.recipient_phone.trim() : '',
    address: typeof value.recipient_address === 'string' ? value.recipient_address.trim() : '',
  };
  if (!result.name || [...result.name].length > 60 ||
    !/^\+?[0-9][0-9 -]{5,24}$/.test(result.phone) ||
    result.phone.replace(/\D/g,'').length < 7 || result.phone.replace(/\D/g,'').length > 15 ||
    [...result.address].length < 8 || [...result.address].length > 300 ||
    /[\x00-\x1f\x7f]/.test(result.name + result.phone + result.address)) {
    throw new PaymentError('INVALID_RECIPIENT');
  }
  return result;
}

export function asCheckoutOrder(row: ShopOrder): ShopOrder & CheckoutOrder {
  return {...row, plan_id: row.product_id, plan_name: row.product_title, duration_months: 0};
}

export function publicShopOrder(row: ShopOrder) {
  return Object.fromEntries([
    'id','order_no','product_id','product_title','product_images','amount_cents',
    'status','payment_method','payment_expires_at','paid_at','created_at',
    'recipient_name','recipient_phone','recipient_address','fulfillment_status',
    'shipping_carrier','tracking_no','shipped_at',
  ].map(key=>[key,row[key as keyof ShopOrder]]));
}
