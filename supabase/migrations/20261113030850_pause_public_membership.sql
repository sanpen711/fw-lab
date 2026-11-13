-- Keep the old membership and order records available to the management app.
create table private.admin_appearance_tests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  level integer not null default 1 check (level between 1 and 9),
  theme text not null check (theme in ('rose_gold','black_gold','pink_starlight')),
  frame text not null check (frame in ('double','corners','ticket','laurel','fufu','orbit','ribbon','crown')),
  nickname_color text not null check (nickname_color in ('default','rose_gold','black_gold','pink_starlight')),
  title text not null check (char_length(title)<=8),
  card_layout text not null check (card_layout in ('classic','pass','folio','honor')),
  intro text not null check (char_length(intro)<=60),
  featured_post_id bigint references public.posts(id) on delete set null
);
alter table private.admin_appearance_tests enable row level security;

create function private.get_admin_appearance_test() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare settings jsonb;
begin
  if not public.is_admin() then raise exception '仅管理员可以使用装扮测试。' using errcode='42501'; end if;
  select to_jsonb(t)-'user_id' into settings from private.admin_appearance_tests t where t.user_id=auth.uid();
  return settings;
end;
$$;

create function private.save_admin_appearance_test(
  p_enabled boolean, p_level integer, p_theme text, p_frame text,
  p_nickname_color text, p_title text, p_card_layout text, p_intro text, p_featured_post_id bigint
) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if not public.is_admin() then raise exception '仅管理员可以使用装扮测试。' using errcode='42501'; end if;
  if p_featured_post_id is not null and not exists (
    select 1 from public.posts p where p.id=p_featured_post_id and p.user_id=me
      and not p.is_deleted and public.fw_content_visible('post',p.id::text)
  ) then raise exception '代表作只能选择自己可展示的广场帖子。'; end if;

  insert into private.admin_appearance_tests (
    user_id,enabled,level,theme,frame,nickname_color,title,card_layout,intro,featured_post_id
  ) values (
    me,p_enabled,p_level,p_theme,p_frame,p_nickname_color,btrim(p_title),p_card_layout,btrim(p_intro),p_featured_post_id
  ) on conflict (user_id) do update set enabled=excluded.enabled, level=excluded.level, theme=excluded.theme,
    frame=excluded.frame, nickname_color=excluded.nickname_color, title=excluded.title,
    card_layout=excluded.card_layout, intro=excluded.intro, featured_post_id=excluded.featured_post_id;
end;
$$;

create function public.admin_get_appearance_test() returns jsonb
language sql stable set search_path = '' as $$ select private.get_admin_appearance_test(); $$;
create function public.admin_save_appearance_test(
  p_enabled boolean, p_level integer, p_theme text, p_frame text,
  p_nickname_color text, p_title text, p_card_layout text, p_intro text, p_featured_post_id bigint
) returns void language sql set search_path = '' as $$
  select private.save_admin_appearance_test(p_enabled,p_level,p_theme,p_frame,p_nickname_color,p_title,p_card_layout,p_intro,p_featured_post_id);
$$;
revoke all on function private.get_admin_appearance_test(), public.admin_get_appearance_test(),
  private.save_admin_appearance_test(boolean,integer,text,text,text,text,text,text,bigint),
  public.admin_save_appearance_test(boolean,integer,text,text,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function private.get_admin_appearance_test(), public.admin_get_appearance_test(),
  private.save_admin_appearance_test(boolean,integer,text,text,text,text,text,text,bigint),
  public.admin_save_appearance_test(boolean,integer,text,text,text,text,text,text,bigint) to authenticated;

create or replace function public.fw_get_membership_appearances(p_user_ids uuid[])
returns table(user_id uuid, theme text, frame text, nickname_color text, title text, card_layout text, intro text,
  featured_post_id bigint, featured_content text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '请先登录。'; end if;
  if coalesce(array_length(p_user_ids,1),0)>200 then raise exception '一次最多读取 200 个身份。'; end if;
  return query select t.user_id,t.theme,t.frame,t.nickname_color,t.title,t.card_layout,t.intro,
    featured.id,featured.content,'9999-12-31 00:00:00+00'::timestamptz
  from private.admin_appearance_tests t
  join public.profiles owner on owner.id=t.user_id and owner.role='admin' and not owner.is_banned
  left join public.posts featured on featured.id=t.featured_post_id and featured.user_id=t.user_id
    and not featured.is_deleted and public.fw_content_visible('post',featured.id::text)
  where t.enabled and t.user_id=any(p_user_ids);
end;
$$;

create or replace function private.get_membership_levels(p_user_ids uuid[])
returns table(user_id uuid, level integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '请先登录。'; end if;
  if coalesce(array_length(p_user_ids,1),0)>200 then raise exception '一次最多读取 200 个身份。'; end if;
  return query select t.user_id,t.level from private.admin_appearance_tests t
    join public.profiles owner on owner.id=t.user_id and owner.role='admin' and not owner.is_banned
    where t.enabled and t.user_id=any(p_user_ids);
end;
$$;

create or replace function public.fw_get_active_membership_styles(p_user_ids uuid[])
returns table(user_id uuid, theme text)
language sql stable security definer set search_path = '' as $$
  select a.user_id,a.theme from public.fw_get_membership_appearances(p_user_ids) a;
$$;

-- Older clients lose access to membership features, while historical records and callbacks remain available.
create or replace function public.fw_has_active_membership(p_user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select false; $$;

revoke execute on function public.fw_set_membership_theme(text),
  public.fw_set_membership_appearance(text,text,text,text,text,text,bigint),
  private.set_membership_appearance(text,text,text,text,text,text,bigint) from public,anon,authenticated;

create or replace function public.fw_get_own_membership_appearance()
returns setof public.membership_appearances
language sql stable security definer set search_path = '' as $$
  select a.* from public.membership_appearances a where public.is_admin() and a.user_id=auth.uid();
$$;
create or replace function private.get_own_membership_growth()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then private.membership_growth_snapshot(auth.uid()) end;
$$;

alter policy memberships_read_own on public.memberships using ((select public.is_admin()));
alter policy membership_plans_read_active on public.membership_plans using ((select public.is_admin()));
alter policy membership_orders_read_own on public.membership_orders using ((select public.is_admin()));
alter policy shop_orders_read on public.shop_orders using ((select public.is_admin()));
alter policy shop_products_guest_read on public.shop_products using (false);
alter policy shop_products_read on public.shop_products using ((select public.is_admin()));

create function private.reject_paused_checkout() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'PAYMENT_NOT_OPEN' using errcode='P0001';
end;
$$;
create trigger membership_checkout_paused before insert on public.membership_orders
  for each row execute function private.reject_paused_checkout();
create trigger shop_checkout_paused before insert on public.shop_orders
  for each row execute function private.reject_paused_checkout();

create function private.enforce_sticker_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_deleted is distinct from false then return new; end if;
  if tg_op='UPDATE' then
    if old.user_id=new.user_id and old.is_deleted=false then return new; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fw-stickers:'||new.user_id::text,0));
  if exists (
    select 1 from public.user_stickers s where s.user_id=new.user_id and s.is_deleted=false offset 79
  ) then raise exception '我的表情最多保存 80 个。' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function private.reject_paused_checkout(), private.enforce_sticker_limit() from public,anon,authenticated;
create trigger sticker_limit_before_write before insert or update of is_deleted,user_id on public.user_stickers
  for each row execute function private.enforce_sticker_limit();

CREATE OR REPLACE FUNCTION public.fw_create_game_party(p_game_name text, p_platform text, p_server_name text, p_mode text, p_starts_at timestamp with time zone, p_capacity integer, p_note text, p_game_id text, p_requires_approval boolean, p_starts_at_text text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  party_id bigint;
  room_limit constant integer := 5;
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

  perform id from public.profiles where id=me for update;
  if (
    select count(*)
    from public.game_parties
    where captain_id=me and status in ('open','full')
  ) >= room_limit then
    raise exception '当前最多可以创建 % 个组队房间。',room_limit;
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
$function$;
