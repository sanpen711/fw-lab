-- FW管理台 0.3：反馈仅做内部处理；管理员可安全增加或取消会员。

create or replace function public.admin_update_feedback_ticket(
  p_ticket_id bigint,
  p_status text,
  p_priority text,
  p_admin_reply text default '',
  p_internal_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket_user uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admin can update feedback tickets';
  end if;
  if p_status not in ('new','in_progress','waiting_user','resolved','closed') then
    raise exception 'Invalid feedback status';
  end if;
  if p_priority not in ('low','normal','medium','high') then
    raise exception 'Invalid feedback priority';
  end if;

  select f.user_id into ticket_user
  from public.feedback_tickets f
  where f.id = p_ticket_id
  for update;

  if not found then
    raise exception 'Feedback ticket not found';
  end if;

  update public.feedback_tickets
  set status = p_status,
      priority = p_priority,
      -- 反馈工单只供管理员内部处理，不再向用户回复或发送通知。
      admin_reply = null,
      internal_note = nullif(left(btrim(coalesce(p_internal_note,'')),500),''),
      updated_at = now(),
      handled_at = case when p_status in ('resolved','closed') then now() else null end,
      handled_by = auth.uid()
  where id = p_ticket_id;

  perform public.fw_log_moderation(
    'feedback',
    p_ticket_id::text,
    ticket_user,
    'feedback_update',
    '反馈状态更新为 ' || p_status,
    null,
    false,
    null
  );
end;
$$;

drop function if exists public.admin_list_memberships();
create function public.admin_list_memberships()
returns table(
  user_id uuid,
  nickname text,
  lab_code text,
  email_search text,
  is_test_account boolean,
  plan_id text,
  plan_name text,
  status text,
  starts_at timestamptz,
  expires_at timestamptz,
  source text,
  updated_at timestamptz,
  is_active boolean,
  remaining_days integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can read memberships';
  end if;

  return query
    select
      p.id,
      p.nickname,
      p.lab_code,
      p.email_search,
      p.is_test_account,
      m.plan_id,
      mp.name,
      case
        when m.user_id is null then 'none'::text
        when m.status = 'active' and m.expires_at <= now() then 'expired'::text
        else m.status
      end,
      m.starts_at,
      m.expires_at,
      m.source,
      m.updated_at,
      coalesce(m.status = 'active' and m.starts_at <= now() and m.expires_at > now(),false),
      case
        when m.status = 'active' and m.expires_at > now()
          then greatest(1,ceil(extract(epoch from (m.expires_at - now())) / 86400.0)::integer)
        else 0
      end
    from public.profiles p
    left join public.memberships m on m.user_id = p.id
    left join public.membership_plans mp on mp.id = m.plan_id
    order by
      case when m.status = 'active' and m.expires_at > now() then 0 else 1 end,
      m.expires_at desc nulls last,
      p.created_at desc
    limit 300;
end;
$$;

drop function if exists public.admin_grant_membership(uuid,integer,integer,text,text);
create function public.admin_grant_membership(
  p_user_id uuid,
  p_months integer default 0,
  p_days integer default 0,
  p_plan_id text default null,
  p_reason text default '管理员手动开通或续期会员'
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_membership public.memberships%rowtype;
  base_time timestamptz;
  new_start timestamptz;
  new_expiry timestamptz;
  effective_plan_id text;
  duration_text text;
begin
  if not public.is_admin() then
    raise exception 'Only admin can grant memberships';
  end if;
  if p_months < 0 or p_days < 0
     or (p_months = 0 and p_days = 0)
     or (p_months > 0 and p_days > 0)
     or p_months > 24
     or p_days > 730 then
    raise exception 'Membership duration must be 1-24 months or 1-730 days';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found';
  end if;

  if p_plan_id is not null and not exists (
    select 1 from public.membership_plans
    where id = p_plan_id and is_active = true
  ) then
    raise exception 'Membership plan not found or inactive';
  end if;

  select m.* into current_membership
  from public.memberships m
  where m.user_id = p_user_id;

  if current_membership.user_id is not null
     and current_membership.status = 'active'
     and current_membership.expires_at > now() then
    base_time := current_membership.expires_at;
    new_start := current_membership.starts_at;
  else
    base_time := now();
    new_start := now();
  end if;

  new_expiry := base_time + make_interval(months => p_months, days => p_days);
  effective_plan_id := coalesce(p_plan_id,current_membership.plan_id);
  duration_text := case when p_months > 0 then p_months::text || '个月' else p_days::text || '天' end;

  insert into public.memberships(
    user_id,plan_id,status,starts_at,expires_at,source,created_at,updated_at
  ) values(
    p_user_id,effective_plan_id,'active',new_start,new_expiry,'manual',now(),now()
  )
  on conflict(user_id) do update set
    plan_id = excluded.plan_id,
    status = 'active',
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at,
    source = 'manual',
    updated_at = now();

  perform public.fw_log_moderation(
    'membership',
    p_user_id::text,
    p_user_id,
    'grant_membership',
    left(coalesce(nullif(btrim(p_reason),''),'管理员手动开通或续期会员'),240),
    duration_text,
    false,
    new_expiry
  );

  return new_expiry;
end;
$$;

drop function if exists public.admin_cancel_membership(uuid,text);
create function public.admin_cancel_membership(
  p_user_id uuid,
  p_reason text default '管理员取消会员'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can cancel memberships';
  end if;

  update public.memberships
  set status = 'cancelled',
      updated_at = now()
  where user_id = p_user_id
    and status = 'active'
    and expires_at > now();

  if not found then
    raise exception 'No active membership found';
  end if;

  perform public.fw_log_moderation(
    'membership',
    p_user_id::text,
    p_user_id,
    'cancel_membership',
    left(coalesce(nullif(btrim(p_reason),''),'管理员取消会员'),240),
    null,
    false,
    null
  );
end;
$$;

revoke all on function public.admin_update_feedback_ticket(bigint,text,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_list_memberships() from public, anon, authenticated;
revoke all on function public.admin_grant_membership(uuid,integer,integer,text,text) from public, anon, authenticated;
revoke all on function public.admin_cancel_membership(uuid,text) from public, anon, authenticated;

grant execute on function public.admin_update_feedback_ticket(bigint,text,text,text,text) to authenticated;
grant execute on function public.admin_list_memberships() to authenticated;
grant execute on function public.admin_grant_membership(uuid,integer,integer,text,text) to authenticated;
grant execute on function public.admin_cancel_membership(uuid,text) to authenticated;

notify pgrst, 'reload schema';
