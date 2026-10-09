-- Desktop membership identity and post tracking. Payment remains unchanged.
begin;

alter table public.membership_appearances
  add column if not exists frame text not null default 'double',
  add column if not exists nickname_color text not null default 'default',
  add column if not exists title text not null default '',
  add column if not exists card_layout text not null default 'classic',
  add column if not exists intro text not null default '',
  add column if not exists featured_post_id bigint references public.posts(id) on delete set null;

alter table public.membership_appearances
  add constraint membership_frame_check check (frame in ('double','corners','ticket')),
  add constraint membership_nickname_color_check check (nickname_color in ('default','rose_gold','black_gold','pink_starlight')),
  add constraint membership_title_check check (char_length(title)<=8),
  add constraint membership_card_layout_check check (card_layout in ('classic','pass')),
  add constraint membership_intro_check check (char_length(intro)<=60);
create index if not exists membership_featured_post_idx on public.membership_appearances(featured_post_id) where featured_post_id is not null;
alter table public.membership_appearances enable row level security;
revoke all on public.membership_appearances from public,anon,authenticated;

create or replace function public.fw_get_membership_appearances(p_user_ids uuid[])
returns table(user_id uuid,theme text,frame text,nickname_color text,title text,card_layout text,intro text,featured_post_id bigint,featured_content text,expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '请先登录。'; end if;
  if coalesce(array_length(p_user_ids,1),0)>200 then raise exception '一次最多读取 200 个身份。'; end if;
  return query select m.user_id,coalesce(a.theme,'rose_gold'),coalesce(a.frame,'double'),coalesce(a.nickname_color,'default'),coalesce(a.title,''),coalesce(a.card_layout,'classic'),coalesce(a.intro,''),p.id,p.content,m.expires_at
    from public.memberships m left join public.membership_appearances a on a.user_id=m.user_id
    left join public.posts p on p.id=a.featured_post_id and p.user_id=m.user_id and not p.is_deleted
    where m.user_id=any(p_user_ids) and public.fw_has_active_membership(m.user_id);
end; $$;

create or replace function public.fw_get_own_membership_appearance()
returns setof public.membership_appearances language sql stable security definer set search_path = '' as $$
  select a.* from public.membership_appearances a where a.user_id=auth.uid();
$$;

create or replace function public.fw_set_membership_appearance(p_theme text,p_frame text,p_nickname_color text,p_title text,p_card_layout text,p_intro text,p_featured_post_id bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_not_banned() then raise exception '请先登录。'; end if;
  if not public.fw_has_active_membership(me) then raise exception '会员有效期内才能保存身份设置。'; end if;
  if p_featured_post_id is not null and not exists(select 1 from public.posts where id=p_featured_post_id and user_id=me and not is_deleted) then raise exception '代表作只能选择自己仍可查看的广场帖子。'; end if;
  insert into public.membership_appearances(user_id,theme,frame,nickname_color,title,card_layout,intro,featured_post_id)
  values(me,p_theme,p_frame,p_nickname_color,btrim(coalesce(p_title,'')),p_card_layout,btrim(coalesce(p_intro,'')),p_featured_post_id)
  on conflict(user_id) do update set theme=excluded.theme,frame=excluded.frame,nickname_color=excluded.nickname_color,title=excluded.title,card_layout=excluded.card_layout,intro=excluded.intro,featured_post_id=excluded.featured_post_id,updated_at=now();
end; $$;

create table public.post_reading (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id bigint not null references public.posts(id) on delete cascade,
  following boolean not null default false,
  last_seen_comment_id bigint not null default 0,
  anchor_comment_id bigint,
  anchor_offset integer not null default 0 check(anchor_offset between -100000 and 100000),
  scroll_top integer not null default 0 check(scroll_top between 0 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,post_id)
);
create index post_reading_post_idx on public.post_reading(post_id);
alter table public.post_reading enable row level security;
revoke all on public.post_reading from public,anon,authenticated;
grant select,delete on public.post_reading to authenticated;
create policy post_reading_own_read on public.post_reading for select to authenticated using(user_id=(select auth.uid()));
create policy post_reading_own_delete on public.post_reading for delete to authenticated using(user_id=(select auth.uid()));

create or replace function public.fw_save_post_reading(p_post_id bigint,p_following boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); current_count integer;
begin
  if me is null or not public.is_not_banned() then raise exception '请先登录。'; end if;
  if p_following and not public.fw_has_active_membership(me) then raise exception '帖子自动追更需要有效会员。'; end if;
  if not exists(select 1 from public.posts where id=p_post_id and not is_deleted) then raise exception '帖子已删除或不可查看。'; end if;
  perform 1 from public.profiles where id=me for update;
  select count(*) into current_count from public.post_reading where user_id=me;
  if current_count>=500 and not exists(select 1 from public.post_reading where user_id=me and post_id=p_post_id) then raise exception '最多保留 500 条收藏或追更，请先移除一些。'; end if;
  insert into public.post_reading(user_id,post_id,following,last_seen_comment_id)
  values(me,p_post_id,p_following,(select coalesce(max(id),0) from public.comments where post_id=p_post_id and not is_deleted))
  on conflict(user_id,post_id) do update set following=excluded.following,updated_at=now();
end; $$;

create or replace function public.fw_update_post_reading(p_post_id bigint,p_seen_comment_id bigint,p_anchor_comment_id bigint,p_anchor_offset integer,p_scroll_top integer)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_not_banned() then raise exception '请先登录。'; end if;
  if not public.fw_has_active_membership(me) then raise exception '阅读位置与追更标记需要有效会员。'; end if;
  if not exists(select 1 from public.posts where id=p_post_id and not is_deleted) then raise exception '帖子已删除或不可查看。'; end if;
  if p_seen_comment_id>0 and not exists(select 1 from public.comments where id=p_seen_comment_id and post_id=p_post_id and not is_deleted) then raise exception '评论不属于当前帖子。'; end if;
  if p_anchor_comment_id is not null and not exists(select 1 from public.comments where id=p_anchor_comment_id and post_id=p_post_id and not is_deleted) then raise exception '阅读位置已经不存在。'; end if;
  update public.post_reading set last_seen_comment_id=greatest(last_seen_comment_id,coalesce(p_seen_comment_id,0)),anchor_comment_id=p_anchor_comment_id,anchor_offset=p_anchor_offset,scroll_top=p_scroll_top,updated_at=now() where user_id=me and post_id=p_post_id;
end; $$;

create or replace function public.fw_get_post_reading()
returns table(post_id bigint,following boolean,last_seen_comment_id bigint,anchor_comment_id bigint,anchor_offset integer,scroll_top integer,content text,post_created_at timestamptz,unread_count bigint,latest_comment_at timestamptz,available boolean)
language sql stable security definer set search_path = '' as $$
  select r.post_id,r.following,r.last_seen_comment_id,r.anchor_comment_id,r.anchor_offset,r.scroll_top,
    case when not p.is_deleted then p.content else '' end,p.created_at,
    case when r.following and not p.is_deleted and public.fw_has_active_membership(auth.uid()) then u.total else 0 end,
    case when not p.is_deleted then u.latest else null end,not p.is_deleted
  from public.post_reading r join public.posts p on p.id=r.post_id
  left join lateral (select count(*) filter(where c.id>r.last_seen_comment_id and c.user_id<>r.user_id) as total,max(c.created_at) as latest from public.comments c where c.post_id=r.post_id and not c.is_deleted) u on true
  where r.user_id=auth.uid() order by u.latest desc nulls last,r.created_at desc;
$$;

revoke all on function public.fw_get_membership_appearances(uuid[]),public.fw_get_own_membership_appearance(),public.fw_set_membership_appearance(text,text,text,text,text,text,bigint),public.fw_save_post_reading(bigint,boolean),public.fw_update_post_reading(bigint,bigint,bigint,integer,integer),public.fw_get_post_reading() from public,anon,authenticated;
grant execute on function public.fw_get_membership_appearances(uuid[]),public.fw_get_own_membership_appearance(),public.fw_set_membership_appearance(text,text,text,text,text,text,bigint),public.fw_save_post_reading(bigint,boolean),public.fw_update_post_reading(bigint,bigint,bigint,integer,integer),public.fw_get_post_reading() to authenticated;

-- All legacy overloads delegate to the ten-argument creator below.
CREATE OR REPLACE FUNCTION public.fw_create_game_party(p_game_name text, p_platform text, p_server_name text, p_mode text, p_starts_at timestamp with time zone, p_capacity integer, p_note text, p_game_id text, p_requires_approval boolean, p_starts_at_text text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  party_id bigint;
  room_limit integer := 15;
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

  if not public.fw_has_active_membership(me) then raise exception '只有会员能创建组队，普通用户可以加入。'; end if;
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

commit;
