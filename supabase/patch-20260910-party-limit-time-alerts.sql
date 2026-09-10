-- 下班开黑：每位队长最多保留 5 个房间、开玩时间改为自由文字、申请提醒按房间收口。
-- 可重复执行；保留旧创建函数签名兼容已经安装的客户端。

begin;

alter table public.game_parties
  add column if not exists starts_at_text text not null default '';

alter table public.game_parties drop constraint if exists game_parties_starts_at_text_check;
alter table public.game_parties
  add constraint game_parties_starts_at_text_check
  check (char_length(starts_at_text) <= 40);

create or replace function public.fw_create_game_party(
  p_game_name text,
  p_platform text,
  p_server_name text,
  p_mode text,
  p_starts_at timestamptz,
  p_capacity integer,
  p_note text,
  p_game_id text,
  p_requires_approval boolean,
  p_starts_at_text text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  party_id bigint;
  clean_game_id text := btrim(coalesce(p_game_id,''));
  clean_starts_at_text text := btrim(coalesce(p_starts_at_text,''));
begin
  if me is null or not public.is_not_banned() then raise exception '请先登录。'; end if;
  if char_length(btrim(coalesce(p_game_name,''))) not between 1 and 30 then raise exception '游戏名称需要填写，最多 30 个字。'; end if;
  if char_length(btrim(coalesce(p_platform,''))) > 20 then raise exception '平台最多 20 个字。'; end if;
  if char_length(btrim(coalesce(p_server_name,''))) > 30 then raise exception '大区或服务器最多 30 个字。'; end if;
  if char_length(btrim(coalesce(p_mode,''))) > 30 then raise exception '游戏模式最多 30 个字。'; end if;
  if char_length(clean_starts_at_text) > 40 then raise exception '开玩时间最多 40 个字。'; end if;
  if p_starts_at is not null and (p_starts_at < now()-interval '2 hours' or p_starts_at > now()+interval '30 days') then raise exception '开玩时间需在现在至 30 天内。'; end if;
  if p_capacity is not null and p_capacity not between 2 and 10 then raise exception '组队人数需在 2 到 10 人之间。'; end if;
  if char_length(clean_game_id) > 60 then raise exception '游戏 ID 最多 60 个字。'; end if;
  if char_length(coalesce(p_note,'')) > 200 then raise exception '补充说明最多 200 个字。'; end if;

  -- 锁定当前用户资料行，避免同一账号并发创建时绕过数量限制。
  perform id from public.profiles where id=me for update;
  if (
    select count(*)
    from public.game_parties
    where captain_id=me and status in ('open','full')
  ) >= 5 then
    raise exception '每个人最多可以创建 5 个组队房间。';
  end if;

  insert into public.game_parties(
    captain_id,game_name,platform,server_name,mode,starts_at,starts_at_text,capacity,note,requires_approval
  ) values(
    me,
    btrim(p_game_name),
    btrim(coalesce(p_platform,'')),
    btrim(coalesce(p_server_name,'')),
    btrim(coalesce(p_mode,'')),
    p_starts_at,
    clean_starts_at_text,
    coalesce(p_capacity,5),
    btrim(coalesce(p_note,'')),
    coalesce(p_requires_approval,true)
  ) returning id into party_id;

  insert into public.game_party_members(party_id,user_id,role,state)
  values(party_id,me,'captain','accepted');

  if clean_game_id<>'' then
    insert into public.game_party_contacts(party_id,user_id,game_id)
    values(party_id,me,clean_game_id);
  end if;
  return party_id;
end;
$$;

create or replace function public.fw_create_game_party(
  p_game_name text,
  p_platform text,
  p_server_name text,
  p_mode text,
  p_starts_at timestamptz,
  p_capacity integer,
  p_note text,
  p_game_id text,
  p_requires_approval boolean
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.fw_create_game_party(
    p_game_name,p_platform,p_server_name,p_mode,p_starts_at,p_capacity,p_note,p_game_id,p_requires_approval,''
  );
end;
$$;

-- 申请离开 pending 状态后，对应的队长提醒不再继续亮红点。
create or replace function public.fw_sync_game_party_application_notice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op='DELETE' then
    if old.state<>'pending' then return old; end if;
    update public.notifications
    set is_read=true
    where type='game_party_apply'
      and target_type='game_party'
      and target_id=old.party_id::text
      and actor_id=old.user_id
      and not is_read;
    return old;
  end if;

  if old.state='pending' and new.state is distinct from 'pending' then
    update public.notifications
    set is_read=true
    where type='game_party_apply'
      and target_type='game_party'
      and target_id=old.party_id::text
      and actor_id=old.user_id
      and not is_read;
  end if;
  return new;
end;
$$;

drop trigger if exists game_party_application_notice_sync on public.game_party_members;
create trigger game_party_application_notice_sync
  after update of state or delete on public.game_party_members
  for each row execute function public.fw_sync_game_party_application_notice();

-- 清理升级前已经失去对应 pending 申请的旧红点。
update public.notifications n
set is_read=true
where n.type='game_party_apply'
  and not n.is_read
  and not exists(
    select 1
    from public.game_party_members m
    where m.party_id::text=n.target_id
      and m.user_id=n.actor_id
      and m.state='pending'
  );

revoke all on function public.fw_create_game_party(text,text,text,text,timestamptz,integer,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.fw_create_game_party(text,text,text,text,timestamptz,integer,text,text,boolean,text) to authenticated;
revoke execute on function public.fw_sync_game_party_application_notice() from public,anon,authenticated;

commit;

notify pgrst,'reload schema';
