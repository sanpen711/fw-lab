-- Products are administered through RLS. Clients cannot create or mark orders paid.
create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  price_cents integer not null check (price_cents between 1 and 100000000),
  image_paths text[] not null check (cardinality(image_paths) between 1 and 4
    and array_to_string(image_paths, ',') ~ ('^products/' || id::text || '/[a-f0-9-]{36}\.(jpg|png|webp)(,products/' || id::text || '/[a-f0-9-]{36}\.(jpg|png|webp)){0,3}$')),
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shop_products_visible_idx on public.shop_products(created_at desc, id)
  where is_active and deleted_at is null;
alter table public.shop_products enable row level security;
revoke all on public.shop_products from public, anon, authenticated;
grant select, insert, update on public.shop_products to authenticated;
grant all on public.shop_products to service_role;
create policy shop_products_read on public.shop_products for select to authenticated
  using ((is_active and deleted_at is null) or (select public.is_admin()));
create policy shop_products_insert on public.shop_products for insert to authenticated
  with check ((select public.is_admin()));
create policy shop_products_update on public.shop_products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique check (order_no ~ '^FS[0-9a-f]{32}$'),
  user_id uuid references public.profiles(id) on delete set null,
  product_id uuid not null references public.shop_products(id),
  product_title text not null,
  product_images text[] not null,
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  recipient_name text not null check (char_length(btrim(recipient_name)) between 1 and 60),
  recipient_phone text not null check (recipient_phone ~ '^\+?[0-9][0-9 -]{5,24}$'
    and char_length(regexp_replace(recipient_phone, '[^0-9]', '', 'g')) between 7 and 15),
  recipient_address text not null check (char_length(btrim(recipient_address)) between 8 and 300),
  status text not null default 'pending' check (status in ('pending','paid','closed','refunded')),
  payment_method text not null default 'alipay' check (payment_method = 'alipay'),
  checkout_request_id uuid not null,
  payment_app_id text not null,
  payment_seller_id text not null,
  payment_expires_at timestamptz not null,
  provider_transaction_id text unique,
  provider_checked_at timestamptz,
  paid_at timestamptz,
  closed_at timestamptz,
  fulfillment_status text not null default 'unfulfilled' check (fulfillment_status in ('unfulfilled','shipped')),
  shipping_carrier text,
  tracking_no text,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, checkout_request_id),
  constraint shop_shipment_check check (fulfillment_status <> 'shipped' or
    (status in ('paid','refunded') and paid_at is not null and shipped_at is not null
    and char_length(btrim(shipping_carrier)) between 1 and 40
    and tracking_no ~ '^[A-Za-z0-9][A-Za-z0-9-]{2,63}$'))
);
create index shop_orders_user_created_idx on public.shop_orders(user_id,created_at desc,id);
create index shop_orders_product_idx on public.shop_orders(product_id);
create index shop_orders_fulfillment_idx on public.shop_orders(status,fulfillment_status,created_at desc,id);
alter table public.shop_orders enable row level security;
revoke all on public.shop_orders from public, anon, authenticated;
grant select on public.shop_orders to authenticated;
grant update(fulfillment_status,shipping_carrier,tracking_no) on public.shop_orders to authenticated;
grant all on public.shop_orders to service_role;
create policy shop_orders_read on public.shop_orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy shop_orders_ship on public.shop_orders for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create table private.shop_payment_events (
  provider_event_id text primary key,
  order_id uuid not null references public.shop_orders(id),
  trade_status text not null,
  processed_at timestamptz not null default now()
);
create index shop_payment_events_order_idx on private.shop_payment_events(order_id);
alter table private.shop_payment_events enable row level security;
revoke all on private.shop_payment_events from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on private.shop_payment_events to service_role;

create function private.shop_touch() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'shop_products' then
    if old.deleted_at is not null then raise exception 'PRODUCT_DELETED'; end if;
    if new.deleted_at is not null then new.deleted_at := now(); new.is_active := false; end if;
  else
    if (new.shipping_carrier,new.tracking_no,new.fulfillment_status) is distinct from
       (old.shipping_carrier,old.tracking_no,old.fulfillment_status) then
      if old.status <> 'paid' or new.fulfillment_status <> 'shipped' then raise exception 'ORDER_NOT_SHIPPABLE'; end if;
      new.shipping_carrier := btrim(new.shipping_carrier);
      new.tracking_no := btrim(new.tracking_no);
      new.shipped_at := coalesce(old.shipped_at,now());
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.shop_touch() from public,anon,authenticated;
create trigger shop_products_touch before update on public.shop_products for each row execute function private.shop_touch();
create trigger shop_orders_touch before update on public.shop_orders for each row execute function private.shop_touch();

create function public.fw_create_shop_order(
  p_user_id uuid,p_product_id uuid,p_request_id uuid,p_expected_amount_cents integer,
  p_recipient_name text,p_recipient_phone text,p_recipient_address text,
  p_max_amount_cents integer,p_app_id text,p_seller_id text
) returns public.shop_orders language plpgsql security invoker set search_path = '' as $$
declare v_product public.shop_products; v_order public.shop_orders; v_banned boolean;
begin
  if p_request_id is null or p_product_id is null or p_user_id is null or p_max_amount_cents < 1
    or p_max_amount_cents is null or p_expected_amount_cents is null
    or p_app_id is null or p_app_id !~ '^[0-9]{16}$'
    or p_seller_id is null or p_seller_id !~ '^2088[0-9]{12}$' then raise exception 'INVALID_REQUEST'; end if;
  p_recipient_name := btrim(coalesce(p_recipient_name,''));
  p_recipient_phone := btrim(coalesce(p_recipient_phone,''));
  p_recipient_address := btrim(coalesce(p_recipient_address,''));
  if char_length(p_recipient_name) not between 1 and 60
    or p_recipient_phone !~ '^\+?[0-9][0-9 -]{5,24}$'
    or char_length(regexp_replace(p_recipient_phone,'[^0-9]','','g')) not between 7 and 15
    or char_length(p_recipient_address) not between 8 and 300 then raise exception 'INVALID_RECIPIENT'; end if;
  select is_banned into v_banned from public.profiles where id=p_user_id for update;
  if not found or v_banned then raise exception 'ACCOUNT_UNAVAILABLE'; end if;
  select * into v_order from public.shop_orders where user_id=p_user_id and checkout_request_id=p_request_id;
  if found then
    if v_order.product_id <> p_product_id or v_order.amount_cents <> p_expected_amount_cents
      or v_order.recipient_name <> p_recipient_name or v_order.recipient_phone <> p_recipient_phone
      or v_order.recipient_address <> p_recipient_address or v_order.payment_app_id <> p_app_id
      or v_order.payment_seller_id <> p_seller_id then raise exception 'CHECKOUT_REQUEST_CONFLICT'; end if;
    if v_order.amount_cents > p_max_amount_cents then raise exception 'PRODUCT_OVER_PAYMENT_LIMIT'; end if;
    return v_order;
  end if;
  select * into v_product from public.shop_products where id=p_product_id and is_active and deleted_at is null for share;
  if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  if v_product.price_cents <> p_expected_amount_cents then raise exception 'PRODUCT_PRICE_CHANGED'; end if;
  if v_product.price_cents > p_max_amount_cents then raise exception 'PRODUCT_OVER_PAYMENT_LIMIT'; end if;
  if (select count(*) from public.shop_orders where user_id=p_user_id and status='pending' and payment_expires_at>now()) >= 5
    then raise exception 'TOO_MANY_PENDING_ORDERS'; end if;
  insert into public.shop_orders(order_no,user_id,product_id,product_title,product_images,amount_cents,
    recipient_name,recipient_phone,recipient_address,checkout_request_id,payment_app_id,payment_seller_id,payment_expires_at)
  values ('FS'||replace(gen_random_uuid()::text,'-',''),p_user_id,v_product.id,v_product.title,v_product.image_paths,
    v_product.price_cents,p_recipient_name,p_recipient_phone,p_recipient_address,p_request_id,p_app_id,p_seller_id,now()+interval '10 minutes')
  returning * into v_order;
  return v_order;
end; $$;

create function public.fw_apply_shop_payment(
  p_order_no text,p_trade_no text,p_amount_cents integer,p_trade_status text,p_paid_at timestamptz,p_event_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_order public.shop_orders; v_event_order uuid;
begin
  if p_trade_no is null or p_trade_no !~ '^[0-9]{10,64}$' or p_event_id is null
    or char_length(p_event_id) not between 1 and 160 or p_amount_cents is null
    or p_trade_status is null or p_trade_status not in ('TRADE_SUCCESS','TRADE_FINISHED','TRADE_CLOSED')
    then raise exception 'INVALID_PAYMENT_RESULT'; end if;
  select * into v_order from public.shop_orders where order_no=p_order_no for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.amount_cents <> p_amount_cents then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  if v_order.provider_transaction_id is not null and v_order.provider_transaction_id <> p_trade_no
    then raise exception 'PAYMENT_TRANSACTION_MISMATCH'; end if;
  select order_id into v_event_order from private.shop_payment_events where provider_event_id=p_event_id;
  if found and v_event_order <> v_order.id then raise exception 'PAYMENT_EVENT_CONFLICT'; end if;
  if p_trade_status in ('TRADE_SUCCESS','TRADE_FINISHED') then
    if v_order.status='refunded' then raise exception 'ORDER_ALREADY_REFUNDED'; end if;
    if v_order.status <> 'paid' then
      if p_paid_at is null or p_paid_at < v_order.created_at-interval '5 minutes' or p_paid_at>now()+interval '5 minutes'
        then raise exception 'INVALID_PAYMENT_TIME'; end if;
      update public.shop_orders set status='paid',paid_at=p_paid_at,closed_at=null,provider_transaction_id=p_trade_no where id=v_order.id;
    end if;
  elsif v_order.status='pending' then
    update public.shop_orders set status='closed',closed_at=now(),provider_transaction_id=p_trade_no where id=v_order.id;
  end if;
  insert into private.shop_payment_events(provider_event_id,order_id,trade_status) values(p_event_id,v_order.id,p_trade_status)
    on conflict(provider_event_id) do update set provider_event_id=excluded.provider_event_id
    where private.shop_payment_events.order_id=excluded.order_id returning order_id into v_event_order;
  if not found then raise exception 'PAYMENT_EVENT_CONFLICT'; end if;
  return jsonb_build_object('order_no',v_order.order_no,'status',(select status from public.shop_orders where id=v_order.id));
end; $$;
revoke all on function public.fw_create_shop_order(uuid,uuid,uuid,integer,text,text,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.fw_apply_shop_payment(text,text,integer,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.fw_create_shop_order(uuid,uuid,uuid,integer,text,text,text,integer,text,text) to service_role;
grant execute on function public.fw_apply_shop_payment(text,text,integer,text,timestamptz,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('shop-products','shop-products',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy shop_images_admin_read on storage.objects for select to authenticated
 using(bucket_id='shop-products' and (select public.is_admin()));
create policy shop_images_admin_insert on storage.objects for insert to authenticated
 with check(bucket_id='shop-products' and (select public.is_admin())
   and name ~ '^products/[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$');
-- Failed uploads can be removed, while product deletion preserves historic order images.
create policy shop_images_admin_delete on storage.objects for delete to authenticated
 using(bucket_id='shop-products' and (select public.is_admin()));
notify pgrst, 'reload schema';
