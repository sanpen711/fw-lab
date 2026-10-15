alter table public.shop_orders drop constraint shop_shipment_check;
alter table public.shop_orders add constraint shop_shipment_check check (
  fulfillment_status <> 'shipped' or (
    status in ('paid','refunded') and paid_at is not null and shipped_at is not null
    and shipping_carrier is not null and tracking_no is not null
    and char_length(btrim(shipping_carrier)) between 1 and 40
    and tracking_no ~ '^[A-Za-z0-9][A-Za-z0-9-]{2,63}$'
  )
);
