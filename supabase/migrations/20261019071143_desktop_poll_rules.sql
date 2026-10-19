-- Configurable polls for the Windows client. Existing polls and legacy clients
-- retain 7-day/open-option behaviour; the v2 RPC defaults to closed additions.
alter table public.polls
  add column if not exists allow_user_options boolean not null default true;

create or replace function public.fw_create_poll_v2(
  p_title text,
  p_options text[],
  p_is_official boolean default false,
  p_duration_days integer default 7,
  p_allow_user_options boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.fw_require_poll_user();
  v_title text := btrim(coalesce(p_title, ''));
  v_options text[];
  v_daily_count integer := 0;
  v_poll_id bigint;
  v_is_admin boolean := false;
  v_day_start timestamptz := public.fw_poll_day_start();
begin
  select coalesce(array_agg(btrim(option_text) order by ord), array[]::text[])
  into v_options
  from unnest(coalesce(p_options, array[]::text[])) with ordinality as raw(option_text, ord)
  where btrim(coalesce(option_text, '')) <> '';

  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception '课题标题需要控制在 1 到 120 个字。';
  end if;

  if cardinality(v_options) not between 2 and 4 then
    raise exception '创建投票需要填写 2～4 个初始选项。';
  end if;

  if exists (
    select 1
    from unnest(v_options) as option_rows(option_label)
    group by lower(btrim(option_label))
    having count(*) > 1
  ) then
    raise exception '初始选项不能重复。';
  end if;

  if exists (
    select 1
    from unnest(v_options) as option_rows(option_label)
    where char_length(btrim(option_label)) > 80
  ) then
    raise exception '每个选项最多 80 个字。';
  end if;

  if p_duration_days is null or p_duration_days not in (1, 3, 7, 15, 30) then
    raise exception '投票时长请选择 1、3、7、15 或 30 天。';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fw_poll_create_' || v_uid::text, 0));

  select count(*)::integer
  into v_daily_count
  from public.polls
  where user_id = v_uid
    and is_deleted = false
    and created_at >= v_day_start
    and created_at < v_day_start + interval '1 day';

  if v_daily_count >= 3 then
    raise exception '每个用户每天最多发起 3 次投票。';
  end if;

  select exists (
    select 1
    from public.profiles
    where id = v_uid
      and role = 'admin'
      and is_banned = false
  ) into v_is_admin;

  if coalesce(p_is_official, false) and not v_is_admin then
    raise exception '只有管理员可以发布官方课题。';
  end if;

  insert into public.polls (user_id, title, is_official, ends_at, allow_user_options)
  values (v_uid, v_title, coalesce(p_is_official, false), now() + make_interval(days => p_duration_days), coalesce(p_allow_user_options, false))
  returning id into v_poll_id;

  insert into public.poll_options (poll_id, user_id, label, source)
  select v_poll_id, null, option_label, 'initial'
  from unnest(v_options) as option_rows(option_label);

  return v_poll_id;
end;
$$;

create or replace function public.fw_add_poll_option(
  p_poll_id bigint,
  p_label text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.fw_require_poll_user();
  v_label text := btrim(coalesce(p_label, ''));
  v_poll public.polls%rowtype;
  v_option_count integer := 0;
  v_option_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('fw_poll_option_' || p_poll_id::text)::bigint);

  select *
  into v_poll
  from public.polls
  where id = p_poll_id
    and is_deleted = false
  for update;

  if not found then
    raise exception '这个课题不存在。';
  end if;

  if v_poll.closed_at is not null or v_poll.ends_at <= now() then
    raise exception '这个课题已经截止，不能新增选项。';
  end if;

  if not v_poll.allow_user_options then
    raise exception '发起人未开放补充选项。';
  end if;

  if char_length(v_label) < 1 or char_length(v_label) > 80 then
    raise exception '新增选项需要控制在 1 到 80 个字。';
  end if;

  select count(*)::integer
  into v_option_count
  from public.poll_options
  where poll_id = p_poll_id;

  if v_option_count >= 20 then
    raise exception '每个投票最多 20 个选项。';
  end if;

  if exists (
    select 1
    from public.poll_options
    where poll_id = p_poll_id
      and source = 'user'
      and user_id = v_uid
  ) then
    raise exception '你已经为这个投票新增过 1 个选项。';
  end if;

  if exists (
    select 1
    from public.poll_options
    where poll_id = p_poll_id
      and lower(btrim(label)) = lower(v_label)
  ) then
    raise exception '这个选项已经存在。';
  end if;

  insert into public.poll_options (poll_id, user_id, label, source)
  values (p_poll_id, v_uid, v_label, 'user')
  returning id into v_option_id;

  return v_option_id;
end;
$$;

revoke all on function public.fw_create_poll_v2(text, text[], boolean, integer, boolean) from public, anon;
grant execute on function public.fw_create_poll_v2(text, text[], boolean, integer, boolean) to authenticated;
revoke all on function public.fw_add_poll_option(bigint, text) from public, anon;
grant execute on function public.fw_add_poll_option(bigint, text) to authenticated;

notify pgrst, 'reload schema';
