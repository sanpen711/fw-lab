-- Execute as postgres. All synthetic users, orders, plans and memberships roll back.
begin;
select set_config('fw.alipay_test_user', gen_random_uuid()::text, true);
insert into auth.users(id, email, raw_user_meta_data)
select current_setting('fw.alipay_test_user')::uuid,
  'alipay-test-' || current_setting('fw.alipay_test_user') || '@example.invalid',
  jsonb_build_object('nickname', '支付测试' || left(current_setting('fw.alipay_test_user'), 8));
set local role service_role;
do $$
declare
  v_user uuid := current_setting('fw.alipay_test_user')::uuid;
  v_plan text := 'alipay_test_' || replace(v_user::text, '-', '');
  v_request uuid := gen_random_uuid();
  v_order public.membership_orders;
  v_again public.membership_orders;
  v_other public.membership_orders;
  v_expiry timestamptz;
  v_expected timestamptz;
  v_events bigint;
begin
  if has_function_privilege('anon', 'public.fw_create_alipay_membership_order(uuid,text,uuid,integer,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.fw_create_alipay_membership_order(uuid,text,uuid,integer,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.fw_apply_alipay_membership_result(text,text,integer,text,timestamptz,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.fw_apply_alipay_membership_result(text,text,integer,text,timestamptz,text)', 'EXECUTE') then
    raise exception 'Public payment mutation permission leaked';
  end if;
  if has_table_privilege('authenticated', 'public.membership_orders', 'INSERT')
    or has_table_privilege('authenticated', 'public.memberships', 'UPDATE') then
    raise exception 'Client can forge payments or memberships';
  end if;
  insert into public.membership_plans(id,name,duration_months,price_cents)
    values(v_plan, '测试月度', 1, 200), (v_plan || '_quarter', '测试季度', 3, 2500), (v_plan || '_year', '测试年度', 12, 8800);
  begin
    perform public.fw_create_alipay_membership_order(v_user, v_plan || '_year', gen_random_uuid(), 5000, '2021007104686921', '2088000000000001');
    raise exception 'Over-limit annual plan accepted';
  exception when raise_exception then
    if sqlerrm <> 'PLAN_OVER_PAYMENT_LIMIT' then raise; end if;
  end;
  v_order := public.fw_create_alipay_membership_order(v_user, v_plan, v_request, 5000, '2021007104686921', '2088000000000001');
  v_again := public.fw_create_alipay_membership_order(v_user, v_plan, v_request, 5000, '2021007104686921', '2088000000000001');
  if v_order.id <> v_again.id or v_order.amount_cents <> 200 or v_order.duration_months <> 1 then
    raise exception 'Checkout idempotency or snapshot failed';
  end if;
  begin
    perform public.fw_create_alipay_membership_order(v_user, v_plan || '_quarter', v_request, 5000, '2021007104686921', '2088000000000001');
    raise exception 'Conflicting checkout request accepted';
  exception when raise_exception then
    if sqlerrm <> 'CHECKOUT_REQUEST_CONFLICT' then raise; end if;
  end;
  update public.membership_plans set price_cents = 300, duration_months = 2, name = '后来修改的套餐' where id = v_plan;
  v_again := public.fw_create_alipay_membership_order(v_user, v_plan, v_request, 5000, '2021007104686921', '2088000000000001');
  if v_again.amount_cents <> 200 or v_again.duration_months <> 1 or v_again.plan_name <> '测试月度' then
    raise exception 'Plan change rewrote an existing order';
  end if;
  begin
    perform public.fw_apply_alipay_membership_result(v_order.order_no, '20261009000000000001', 1, 'TRADE_SUCCESS', now(), 'test-amount');
    raise exception 'Wrong payment amount accepted';
  exception when raise_exception then
    if sqlerrm <> 'PAYMENT_AMOUNT_MISMATCH' then raise; end if;
  end;
  if exists(select 1 from public.memberships where user_id = v_user)
    or exists(select 1 from public.membership_payment_events where order_id = v_order.id) then
    raise exception 'Failed payment partially applied';
  end if;
  perform public.fw_apply_alipay_membership_result(v_order.order_no, '20261009000000000001', 200, 'TRADE_SUCCESS', now(), 'test-paid');
  select expires_at into v_expiry from public.memberships where user_id = v_user;
  v_expected := ((now() at time zone 'Asia/Shanghai') + interval '1 month') at time zone 'Asia/Shanghai';
  if v_expiry <> v_expected or not exists(select 1 from public.membership_orders where id = v_order.id and status = 'paid') then
    raise exception 'Payment and snapshotted duration not committed together';
  end if;
  perform public.fw_apply_alipay_membership_result(v_order.order_no, '20261009000000000001', 200, 'TRADE_SUCCESS', now(), 'test-paid');
  perform public.fw_apply_alipay_membership_result(v_order.order_no, '20261009000000000001', 200, 'TRADE_FINISHED', now(), 'test-query-paid');
  if (select expires_at from public.memberships where user_id = v_user) <> v_expiry then raise exception 'Replay extended membership'; end if;
  select count(*) into v_events from public.membership_payment_events where order_id = v_order.id;
  if v_events <> 2 then raise exception 'Event deduplication failed'; end if;

  v_other := public.fw_create_alipay_membership_order(v_user, v_plan || '_quarter', gen_random_uuid(), 5000, '2021007104686921', '2088000000000001');
  perform public.fw_apply_alipay_membership_result(v_other.order_no, '20261009000000000002', 2500, 'TRADE_SUCCESS', now(), 'test-renewal');
  v_expected := ((v_expiry at time zone 'Asia/Shanghai') + interval '3 months') at time zone 'Asia/Shanghai';
  select expires_at into v_expiry from public.memberships where user_id = v_user;
  if v_expiry <> v_expected then raise exception 'Renewal did not append to current expiry'; end if;

  v_other := public.fw_create_alipay_membership_order(v_user, v_plan, gen_random_uuid(), 5000, '2021007104686921', '2088000000000001');
  begin
    perform public.fw_apply_alipay_membership_result(v_other.order_no, '20261009000000000001', 300, 'TRADE_SUCCESS', now(), 'test-reused-transaction');
    raise exception 'Provider transaction credited twice';
  exception when unique_violation then null;
  end;
  if (select expires_at from public.memberships where user_id = v_user) <> v_expiry
    or (select status from public.membership_orders where id = v_other.id) <> 'pending' then
    raise exception 'Failed transaction was not atomic';
  end if;
  begin
    perform public.fw_apply_alipay_membership_result(v_other.order_no, '20261009000000000003', 300, 'TRADE_SUCCESS', now(), 'test-paid');
    raise exception 'Provider event credited to another order';
  exception when raise_exception then
    if sqlerrm <> 'PAYMENT_EVENT_CONFLICT' then raise; end if;
  end;
  perform public.fw_apply_alipay_membership_result(v_other.order_no, '20261009000000000003', 300, 'TRADE_CLOSED', null, 'test-closed');
  if (select expires_at from public.memberships where user_id = v_user) <> v_expiry then raise exception 'Closed order changed membership'; end if;
  -- A genuine delayed success must still be honored after a closed result.
  perform public.fw_apply_alipay_membership_result(v_other.order_no, '20261009000000000003', 300, 'TRADE_SUCCESS', now(), 'test-late-paid');
  v_expected := ((v_expiry at time zone 'Asia/Shanghai') + interval '2 months') at time zone 'Asia/Shanghai';
  select expires_at into v_expiry from public.memberships where user_id = v_user;
  if v_expiry <> v_expected then raise exception 'Delayed paid order lost'; end if;
  perform public.fw_apply_alipay_membership_result(v_other.order_no, '20261009000000000003', 300, 'TRADE_CLOSED', null, 'test-paid-closed');
  if (select status from public.membership_orders where id = v_other.id) <> 'paid'
    or (select expires_at from public.memberships where user_id = v_user) <> v_expiry then
    raise exception 'Paid CLOSED result silently changed benefits';
  end if;

  update public.memberships set status = 'cancelled' where user_id = v_user;
  v_other := public.fw_create_alipay_membership_order(v_user, v_plan, gen_random_uuid(), 5000, '2021007104686921', '2088000000000001');
  update public.profiles set is_banned = true where id = v_user;
  begin
    perform public.fw_create_alipay_membership_order(v_user, v_plan, gen_random_uuid(), 5000, '2021007104686921', '2088000000000001');
    raise exception 'Banned account created checkout';
  exception when raise_exception then
    if sqlerrm <> 'ACCOUNT_UNAVAILABLE' then raise; end if;
  end;
  -- Already-issued payments are accounted for even if the account is later banned.
  perform public.fw_apply_alipay_membership_result(v_other.order_no, '20261009000000000004', 300, 'TRADE_SUCCESS', now(), 'test-cancelled');
  v_expected := ((now() at time zone 'Asia/Shanghai') + interval '2 months') at time zone 'Asia/Shanghai';
  if (select expires_at from public.memberships where user_id = v_user) <> v_expected
    or (select starts_at from public.memberships where user_id = v_user) <> now() then
    raise exception 'Cancelled membership appended stale future time';
  end if;
  update public.profiles set is_banned = false where id = v_user;
  for i in 1..5 loop
    perform public.fw_create_alipay_membership_order(v_user, v_plan, gen_random_uuid(), 5000, '2021007104686921', '2088000000000001');
  end loop;
  begin
    perform public.fw_create_alipay_membership_order(v_user, v_plan, gen_random_uuid(), 5000, '2021007104686921', '2088000000000001');
    raise exception 'Pending order limit bypassed';
  exception when raise_exception then
    if sqlerrm <> 'TOO_MANY_PENDING_ORDERS' then raise; end if;
  end;
end;
$$;
reset role;
rollback;
select 'PASS: payment permissions, price/duration snapshots, amount checks, idempotency, atomic activation, renewal, delayed payment and pending-order limit' as result;
