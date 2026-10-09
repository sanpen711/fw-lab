-- Payment writes are restricted to the service role. Edge Functions must verify
-- the Alipay signature, application, seller and amount before applying a result.
alter table public.membership_orders
  add column duration_months integer,
  add column plan_name text,
  add column checkout_request_id uuid,
  add column payment_app_id text,
  add column payment_seller_id text,
  add column provider_checked_at timestamptz,
  add constraint membership_orders_duration_check
    check (duration_months is null or duration_months between 1 and 24);

create unique index membership_orders_checkout_request_idx
  on public.membership_orders(user_id, checkout_request_id)
  where checkout_request_id is not null;
create unique index membership_orders_alipay_transaction_idx
  on public.membership_orders(provider_transaction_id)
  where payment_method = 'alipay' and provider_transaction_id is not null;

create function public.fw_create_alipay_membership_order(
  p_user_id uuid, p_plan_id text, p_request_id uuid,
  p_max_amount_cents integer, p_app_id text, p_seller_id text
)
returns public.membership_orders
language plpgsql security invoker set search_path = ''
as $$
declare
  v_plan public.membership_plans;
  v_order public.membership_orders;
  v_banned boolean;
begin
  if p_user_id is null or p_request_id is null or p_plan_id is null
    or p_max_amount_cents is null or p_max_amount_cents < 1
    or p_app_id is null or p_app_id !~ '^[0-9]{16}$'
    or p_seller_id is null or p_seller_id !~ '^2088[0-9]{12}$' then
    raise exception 'INVALID_CHECKOUT_CONFIG';
  end if;

  -- Serialize creation and renewal for the same user, including admin grants.
  select is_banned into v_banned from public.profiles
    where id = p_user_id for update;
  if not found or v_banned then raise exception 'ACCOUNT_UNAVAILABLE'; end if;

  select * into v_order from public.membership_orders
    where user_id = p_user_id and checkout_request_id = p_request_id;
  if found then
    if v_order.plan_id <> p_plan_id or v_order.payment_method <> 'alipay'
      or v_order.payment_app_id <> p_app_id or v_order.payment_seller_id <> p_seller_id then
      raise exception 'CHECKOUT_REQUEST_CONFLICT';
    end if;
    if v_order.amount_cents > p_max_amount_cents then raise exception 'PLAN_OVER_PAYMENT_LIMIT'; end if;
    return v_order;
  end if;

  select * into v_plan from public.membership_plans where id = p_plan_id and is_active;
  if not found then raise exception 'PLAN_UNAVAILABLE'; end if;
  if v_plan.price_cents < 1 or v_plan.price_cents > p_max_amount_cents then
    raise exception 'PLAN_OVER_PAYMENT_LIMIT';
  end if;
  if (select count(*) from public.membership_orders
    where user_id = p_user_id and status = 'pending' and payment_expires_at > now()) >= 5 then
    raise exception 'TOO_MANY_PENDING_ORDERS';
  end if;

  insert into public.membership_orders(
    order_no, user_id, plan_id, amount_cents, payment_method,
    duration_months, plan_name, checkout_request_id, payment_app_id,
    payment_seller_id, payment_expires_at
  ) values (
    'FW' || replace(gen_random_uuid()::text, '-', ''), p_user_id,
    v_plan.id, v_plan.price_cents, 'alipay', v_plan.duration_months,
    v_plan.name, p_request_id, p_app_id, p_seller_id, now() + interval '10 minutes'
  ) returning * into v_order;
  return v_order;
end;
$$;

create function public.fw_apply_alipay_membership_result(
  p_order_no text, p_trade_no text, p_amount_cents integer,
  p_trade_status text, p_paid_at timestamptz, p_event_id text
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_user_id uuid;
  v_order public.membership_orders;
  v_member public.memberships;
  v_start timestamptz;
  v_base timestamptz;
  v_expiry timestamptz;
  v_event_order uuid;
  v_event_status text := 'ignored';
begin
  if p_trade_no is null or p_trade_no !~ '^[0-9]{10,64}$'
    or p_event_id is null or char_length(p_event_id) not between 1 and 160
    or p_amount_cents is null or p_amount_cents < 1
    or p_trade_status is null or p_trade_status not in ('TRADE_SUCCESS','TRADE_FINISHED','TRADE_CLOSED') then
    raise exception 'INVALID_PAYMENT_RESULT';
  end if;
  select user_id into v_user_id from public.membership_orders where order_no = p_order_no;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  perform id from public.profiles where id = v_user_id for update;
  select * into v_order from public.membership_orders where order_no = p_order_no for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_method <> 'alipay' or v_order.duration_months is null
    or v_order.payment_app_id is null or v_order.payment_seller_id is null then
    raise exception 'ORDER_NOT_ALIPAY_CHECKOUT';
  end if;
  if v_order.amount_cents <> p_amount_cents then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  if v_order.provider_transaction_id is not null and v_order.provider_transaction_id <> p_trade_no then
    raise exception 'PAYMENT_TRANSACTION_MISMATCH';
  end if;
  select order_id into v_event_order from public.membership_payment_events
    where provider = 'alipay' and provider_event_id = p_event_id;
  if found and v_event_order is distinct from v_order.id then
    raise exception 'PAYMENT_EVENT_CONFLICT';
  end if;

  if p_trade_status in ('TRADE_SUCCESS','TRADE_FINISHED') then
    if v_order.status = 'refunded' then raise exception 'ORDER_ALREADY_REFUNDED'; end if;
    if v_order.status <> 'paid' then
      if p_paid_at is null or p_paid_at < v_order.created_at - interval '5 minutes'
        or p_paid_at > now() + interval '5 minutes' then raise exception 'INVALID_PAYMENT_TIME'; end if;
      select * into v_member from public.memberships where user_id = v_user_id for update;
      v_start := now();
      v_base := now();
      if found and v_member.status = 'active' and v_member.starts_at <= now() and v_member.expires_at > now() then
        v_start := v_member.starts_at;
        v_base := v_member.expires_at;
      end if;
      v_expiry := ((v_base at time zone 'Asia/Shanghai')
        + make_interval(months => v_order.duration_months)) at time zone 'Asia/Shanghai';
      insert into public.memberships(user_id, plan_id, status, starts_at, expires_at, source)
        values (v_user_id, v_order.plan_id, 'active', v_start, v_expiry, 'payment')
        on conflict(user_id) do update set
          plan_id = excluded.plan_id, status = excluded.status,
          starts_at = excluded.starts_at, expires_at = excluded.expires_at,
          source = excluded.source, updated_at = now();
      update public.membership_orders set status = 'paid', provider_transaction_id = p_trade_no,
        paid_at = p_paid_at, closed_at = null, updated_at = now()
        where id = v_order.id returning * into v_order;
      v_event_status := 'processed';
    end if;
  elsif v_order.status in ('pending','failed') then
    update public.membership_orders set status = 'closed', provider_transaction_id = p_trade_no,
      closed_at = now(), updated_at = now() where id = v_order.id returning * into v_order;
    v_event_status := 'processed';
  end if;
  -- A CLOSED result for a paid order can represent a refund. Refund policy is
  -- separate from membership activation; do not grant or silently revoke time.
  insert into public.membership_payment_events(provider, provider_event_id, order_id,
    process_status, payload, processed_at)
    values ('alipay', p_event_id, v_order.id, v_event_status,
      jsonb_build_object('out_trade_no', p_order_no, 'trade_no', p_trade_no,
        'amount_cents', p_amount_cents, 'trade_status', p_trade_status), now())
    on conflict(provider, provider_event_id) do update
      set provider_event_id = excluded.provider_event_id
      where public.membership_payment_events.order_id = excluded.order_id
    returning order_id into v_event_order;
  if not found then raise exception 'PAYMENT_EVENT_CONFLICT'; end if;
  return jsonb_build_object('order_no', v_order.order_no, 'status', v_order.status);
end;
$$;

revoke all on function public.fw_create_alipay_membership_order(uuid,text,uuid,integer,text,text) from public, anon, authenticated;
revoke all on function public.fw_apply_alipay_membership_result(text,text,integer,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.fw_create_alipay_membership_order(uuid,text,uuid,integer,text,text) to service_role;
grant execute on function public.fw_apply_alipay_membership_result(text,text,integer,text,timestamptz,text) to service_role;
notify pgrst, 'reload schema';
