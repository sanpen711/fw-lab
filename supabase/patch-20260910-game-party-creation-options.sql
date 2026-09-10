-- 下班开黑：创建表单选填化、游戏模式自由填写、可配置免审核进队。
-- 保留八参数创建函数兼容已安装的 Windows 1.2.11 客户端。

alter table public.game_parties
  add column if not exists requires_approval boolean not null default true;

alter table public.game_parties
  alter column platform set default '',
  alter column mode set default '',
  alter column starts_at drop not null,
  alter column capacity set default 5;

alter table public.game_parties drop constraint if exists game_parties_platform_check;
alter table public.game_parties drop constraint if exists game_parties_mode_check;
alter table public.game_parties add constraint game_parties_platform_check check (char_length(platform) <= 20);
alter table public.game_parties add constraint game_parties_mode_check check (char_length(mode) <= 30);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'like','same','tissue','comment','comment_reply','private_message','friend_request','friend_accept','chat_agree','report','system',
  'game_party_apply','game_party_joined','game_party_accepted','game_party_rejected'
)) not valid;

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
declare
  me uuid := auth.uid();
  party_id bigint;
  clean_game_id text := btrim(coalesce(p_game_id,''));
begin
  if me is null or not public.is_not_banned() then raise exception '请先登录。'; end if;
  if char_length(btrim(coalesce(p_game_name,''))) not between 1 and 30 then raise exception '游戏名称需要填写，最多 30 个字。'; end if;
  if char_length(btrim(coalesce(p_platform,''))) > 20 then raise exception '平台最多 20 个字。'; end if;
  if char_length(btrim(coalesce(p_server_name,''))) > 30 then raise exception '大区或服务器最多 30 个字。'; end if;
  if char_length(btrim(coalesce(p_mode,''))) > 30 then raise exception '游戏模式最多 30 个字。'; end if;
  if p_starts_at is not null and (p_starts_at < now()-interval '2 hours' or p_starts_at > now()+interval '30 days') then raise exception '开玩时间需在现在至 30 天内。'; end if;
  if p_capacity is not null and p_capacity not between 2 and 10 then raise exception '组队人数需在 2 到 10 人之间。'; end if;
  if char_length(clean_game_id) > 60 then raise exception '游戏 ID 最多 60 个字。'; end if;
  if char_length(coalesce(p_note,'')) > 200 then raise exception '补充说明最多 200 个字。'; end if;
  if exists(
    select 1 from public.game_parties
    where captain_id=me
      and status in ('open','full')
      and coalesce(starts_at,created_at)>now()-interval '8 hours'
  ) then raise exception '你已经有一个仍在进行的组队房间。'; end if;

  insert into public.game_parties(
    captain_id,game_name,platform,server_name,mode,starts_at,capacity,note,requires_approval
  ) values(
    me,
    btrim(p_game_name),
    btrim(coalesce(p_platform,'')),
    btrim(coalesce(p_server_name,'')),
    btrim(coalesce(p_mode,'')),
    p_starts_at,
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
  p_game_id text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.fw_create_game_party(
    p_game_name,p_platform,p_server_name,p_mode,p_starts_at,p_capacity,p_note,p_game_id,true
  );
end;
$$;

create or replace function public.fw_apply_game_party(
  p_party_id bigint,
  p_game_id text,
  p_message text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  party public.game_parties;
  existing_state text;
  next_state text;
  clean_game_id text := btrim(coalesce(p_game_id,''));
begin
  if me is null or not public.is_not_banned() then raise exception '请先登录。'; end if;
  if char_length(clean_game_id) > 60 then raise exception '游戏 ID 最多 60 个字。'; end if;
  if char_length(coalesce(p_message,'')) > 100 then raise exception '加入说明最多 100 个字。'; end if;

  select * into party from public.game_parties where id=p_party_id for update;
  if party.id is null then raise exception '房间不存在。'; end if;
  if party.captain_id=me then return 'captain'; end if;
  if party.status not in ('open','full') then raise exception '这个房间已经结束。'; end if;
  if (select count(*) from public.game_party_members where party_id=p_party_id and state='accepted') >= party.capacity then raise exception '这个房间已经满员。'; end if;

  select state into existing_state from public.game_party_members where party_id=p_party_id and user_id=me;
  if existing_state='accepted' then return 'already_joined'; end if;
  next_state := case when party.requires_approval then 'pending' else 'accepted' end;

  insert into public.game_party_members(party_id,user_id,role,state,request_message)
  values(p_party_id,me,'member',next_state,btrim(coalesce(p_message,'')))
  on conflict(party_id,user_id) do update
    set state=excluded.state,request_message=excluded.request_message,updated_at=now();

  if clean_game_id<>'' then
    insert into public.game_party_contacts(party_id,user_id,game_id)
    values(p_party_id,me,clean_game_id)
    on conflict(party_id,user_id) do update set game_id=excluded.game_id,updated_at=now();
  else
    delete from public.game_party_contacts where party_id=p_party_id and user_id=me;
  end if;

  insert into public.notifications(user_id,actor_id,type,target_type,target_id,content)
  values(
    party.captain_id,
    me,
    case when party.requires_approval then 'game_party_apply' else 'game_party_joined' end,
    'game_party',
    p_party_id,
    case
      when btrim(coalesce(p_message,''))<>'' then left(btrim(p_message),80)
      when party.requires_approval then '申请加入你的开黑房间'
      else '已直接加入你的开黑房间'
    end
  );
  return case when party.requires_approval then 'sent' else 'joined' end;
end;
$$;

revoke all on function public.fw_create_game_party(text,text,text,text,timestamptz,integer,text,text,boolean) from public,anon,authenticated;
revoke all on function public.fw_create_game_party(text,text,text,text,timestamptz,integer,text,text) from public,anon,authenticated;
revoke all on function public.fw_apply_game_party(bigint,text,text) from public,anon,authenticated;
grant execute on function public.fw_create_game_party(text,text,text,text,timestamptz,integer,text,text,boolean) to authenticated;
grant execute on function public.fw_create_game_party(text,text,text,text,timestamptz,integer,text,text) to authenticated;
grant execute on function public.fw_apply_game_party(bigint,text,text) to authenticated;

notify pgrst,'reload schema';
