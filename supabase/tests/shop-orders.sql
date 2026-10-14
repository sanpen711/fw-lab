-- Synthetic records exist only within this rolled-back transaction.
select set_config('fw.shop_user',gen_random_uuid()::text,true);
select set_config('fw.shop_other',gen_random_uuid()::text,true);
select set_config('fw.shop_admin',gen_random_uuid()::text,true);
select set_config('fw.shop_product',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting(setting)::uuid,'shop-'||current_setting(setting)||'@example.invalid',
 jsonb_build_object('nickname','商城测试'||left(current_setting(setting),8))
from unnest(array['fw.shop_user','fw.shop_other','fw.shop_admin']) setting;
update public.profiles set role='admin' where id=current_setting('fw.shop_admin')::uuid;
select set_config('request.jwt.claim.sub',current_setting('fw.shop_admin'),true);
set local role authenticated;
insert into public.shop_products(id,title,price_cents,image_paths)
 values(current_setting('fw.shop_product')::uuid,'测试贴纸',1000,
 array['products/'||current_setting('fw.shop_product')||'/'||gen_random_uuid()||'.png']);
reset role;
select set_config('request.jwt.claim.sub',current_setting('fw.shop_user'),true);
set local role authenticated;
do $$begin
  begin
    insert into public.shop_products(title,price_cents,image_paths) values('伪造商品',1,array['invalid']);
    raise exception 'Non-admin created product';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values('shop-products','products/'||gen_random_uuid()||'/'||gen_random_uuid()||'.png');
    raise exception 'Non-admin uploaded product image';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','public.fw_create_shop_order(uuid,uuid,uuid,integer,text,text,text,integer,text,text)','execute')
   or has_function_privilege('anon','public.fw_apply_shop_payment(text,text,integer,text,timestamptz,text)','execute')
   or has_column_privilege('authenticated','public.shop_orders','status','update')
   or has_column_privilege('authenticated','public.shop_orders','amount_cents','update')
   or has_table_privilege('authenticated','public.shop_orders','insert') then raise exception 'Client payment writes leaked'; end if;
end $$;
reset role;
set local role service_role;
do $$declare
 u uuid:=current_setting('fw.shop_user')::uuid;p uuid:=current_setting('fw.shop_product')::uuid;
 r uuid:=gen_random_uuid();o public.shop_orders;a public.shop_orders;
begin
 begin
  perform public.fw_create_shop_order(u,p,r,1000,'','','',5000,'2021007104686921','2088000000000001');
  raise exception 'Empty contact accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_RECIPIENT' then raise;end if;end;
 begin
  perform public.fw_create_shop_order(u,p,r,1,'测试','13800000000','测试省测试市测试路一号',5000,'2021007104686921','2088000000000001');
  raise exception 'Client changed price';
 exception when raise_exception then if sqlerrm<>'PRODUCT_PRICE_CHANGED' then raise;end if;end;
 o:=public.fw_create_shop_order(u,p,r,1000,'测试','13800000000','测试省测试市测试路一号',5000,'2021007104686921','2088000000000001');
 a:=public.fw_create_shop_order(u,p,r,1000,'测试','13800000000','测试省测试市测试路一号',5000,'2021007104686921','2088000000000001');
 if a.id<>o.id then raise exception 'Duplicate checkout';end if;
 perform set_config('fw.shop_order',o.id::text,true);
 begin
  perform public.fw_create_shop_order(u,p,r,1000,'另一个人','13800000000','测试省测试市测试路一号',5000,'2021007104686921','2088000000000001');
  raise exception 'Contact rewrite accepted';
 exception when raise_exception then if sqlerrm<>'CHECKOUT_REQUEST_CONFLICT' then raise;end if;end;
 update public.shop_products set title='改后的标题',price_cents=2000,is_active=false,deleted_at=now() where id=p;
 a:=public.fw_create_shop_order(u,p,r,1000,'测试','13800000000','测试省测试市测试路一号',5000,'2021007104686921','2088000000000001');
 if a.id<>o.id or a.product_title<>'测试贴纸' or a.amount_cents<>1000 then raise exception 'Historic snapshot changed';end if;
 begin
  perform public.fw_apply_shop_payment(o.order_no,'20261014000000000001',1,'TRADE_SUCCESS',now(),'wrong-amount');
  raise exception 'Wrong payment amount accepted';
 exception when raise_exception then if sqlerrm<>'PAYMENT_AMOUNT_MISMATCH' then raise;end if;end;
 if exists(select 1 from private.shop_payment_events where order_id=o.id) or
  (select status from public.shop_orders where id=o.id)<>'pending' then raise exception 'Partial payment write';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('fw.shop_admin'),true);
set local role authenticated;
do $$begin
 begin
  update public.shop_orders set fulfillment_status='shipped',shipping_carrier='顺丰',tracking_no='SF123456789' where id=current_setting('fw.shop_order')::uuid;
  raise exception 'Unpaid order shipped';
 exception when raise_exception then if sqlerrm<>'ORDER_NOT_SHIPPABLE' then raise;end if;end;
end $$;
reset role;
set local role service_role;
do $$declare o public.shop_orders;begin
 select * into o from public.shop_orders where id=current_setting('fw.shop_order')::uuid;
 perform public.fw_apply_shop_payment(o.order_no,'20261014000000000001',1000,'TRADE_CLOSED',null,'closed');
 perform public.fw_apply_shop_payment(o.order_no,'20261014000000000001',1000,'TRADE_SUCCESS',now(),'paid');
 perform public.fw_apply_shop_payment(o.order_no,'20261014000000000001',1000,'TRADE_SUCCESS',now(),'paid');
 if (select status from public.shop_orders where id=o.id)<>'paid' or
  (select count(*) from private.shop_payment_events where order_id=o.id)<>2 then raise exception 'Late payment or dedup failed';end if;
 if exists(select 1 from public.memberships where user_id=o.user_id) then raise exception 'Physical purchase activated membership';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('fw.shop_admin'),true);
set local role authenticated;
update public.shop_orders set fulfillment_status='shipped',shipping_carrier='顺丰速运',tracking_no='SF123456789'
 where id=current_setting('fw.shop_order')::uuid;
do $$begin
 if not exists(select 1 from public.shop_orders where id=current_setting('fw.shop_order')::uuid and shipped_at=now() and tracking_no='SF123456789') then raise exception 'Shipment was not saved';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('fw.shop_other'),true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.shop_orders where id=current_setting('fw.shop_order')::uuid) then raise exception 'Other user read recipient information';end if;
 if exists(select 1 from public.shop_products where id=current_setting('fw.shop_product')::uuid) then raise exception 'Deleted product is visible';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('fw.shop_user'),true);
set local role authenticated;
do $$declare n integer;begin
 if not exists(select 1 from public.shop_orders where id=current_setting('fw.shop_order')::uuid and recipient_name='测试' and tracking_no='SF123456789') then raise exception 'Buyer cannot read shipment';end if;
 update public.shop_orders set tracking_no='FORGED123' where id=current_setting('fw.shop_order')::uuid;
 get diagnostics n=row_count;if n<>0 then raise exception 'Buyer modified shipment';end if;
end $$;
reset role;
