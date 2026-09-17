-- FW管理台 0.2：完整内容管理、测试账号标记和用户详情统计。

alter table public.profiles
  add column if not exists is_test_account boolean not null default false;

create index if not exists profiles_is_test_account_idx
  on public.profiles(is_test_account)
  where is_test_account = true;

-- 自动化测试帖使用固定前缀；仅据此标记账号，不删除任何历史数据。
update public.profiles p
set is_test_account = true,
    updated_at = now()
where exists (
  select 1
  from public.posts x
  where x.user_id = p.id
    and x.content like '[FW-AUTO-TEST]%'
);

drop function if exists public.admin_list_profiles();
create function public.admin_list_profiles()
returns table(
  id uuid,
  nickname text,
  avatar_url text,
  role text,
  is_banned boolean,
  lab_code text,
  muted_until timestamptz,
  created_at timestamptz,
  email_search text,
  last_sign_in_at timestamptz,
  is_test_account boolean,
  post_count bigint,
  comment_count bigint,
  report_count bigint,
  moderation_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can read profiles';
  end if;

  return query
    select
      p.id,
      p.nickname,
      p.avatar_url,
      p.role,
      p.is_banned,
      p.lab_code,
      p.muted_until,
      p.created_at,
      p.email_search,
      u.last_sign_in_at,
      p.is_test_account,
      (
        (select count(*) from public.posts x where x.user_id = p.id) +
        (select count(*) from public.bird_posts x where x.user_id = p.id) +
        (select count(*) from public.polls x where x.user_id = p.id)
      )::bigint as post_count,
      (
        (select count(*) from public.comments x where x.user_id = p.id) +
        (select count(*) from public.bird_comments x where x.user_id = p.id) +
        (select count(*) from public.chat_messages x where x.user_id = p.id) +
        (select count(*) from public.game_party_messages x where x.user_id = p.id)
      )::bigint as comment_count,
      (
        (select count(*) from public.site_reports x where x.target_user_id = p.id) +
        (select count(*)
         from public.chat_message_reports x
         join public.chat_messages m on m.id = x.message_id
         where m.user_id = p.id)
      )::bigint as report_count,
      (select count(*) from public.moderation_logs x where x.target_user_id = p.id)::bigint as moderation_count
    from public.profiles p
    left join auth.users u on u.id = p.id
    order by p.created_at desc
    limit 300;
end;
$$;

drop function if exists public.admin_list_bird_posts();
create function public.admin_list_bird_posts()
returns table(
  id bigint,
  user_id uuid,
  nickname text,
  title text,
  content text,
  display_mode text,
  pen_name text,
  is_deleted boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can read bird posts';
  end if;
  return query
    select b.id,b.user_id,p.nickname,b.title,b.content,b.display_mode,b.pen_name,b.is_deleted,b.created_at
    from public.bird_posts b
    left join public.profiles p on p.id = b.user_id
    order by b.created_at desc
    limit 200;
end;
$$;

drop function if exists public.admin_list_bird_comments();
create function public.admin_list_bird_comments()
returns table(
  id bigint,
  post_id bigint,
  post_title text,
  user_id uuid,
  nickname text,
  content text,
  is_deleted boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can read bird comments';
  end if;
  return query
    select c.id,c.post_id,b.title,c.user_id,p.nickname,c.content,c.is_deleted,c.created_at
    from public.bird_comments c
    left join public.bird_posts b on b.id = c.post_id
    left join public.profiles p on p.id = c.user_id
    order by c.created_at desc
    limit 200;
end;
$$;

drop function if exists public.admin_list_polls();
create function public.admin_list_polls()
returns table(
  id bigint,
  user_id uuid,
  nickname text,
  title text,
  is_official boolean,
  ends_at timestamptz,
  closed_at timestamptz,
  conclusion text,
  is_deleted boolean,
  option_count bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can read polls';
  end if;
  return query
    select o.id,o.user_id,p.nickname,o.title,o.is_official,o.ends_at,o.closed_at,o.conclusion,o.is_deleted,
           (select count(*) from public.poll_options x where x.poll_id = o.id)::bigint,
           o.created_at
    from public.polls o
    left join public.profiles p on p.id = o.user_id
    order by o.created_at desc
    limit 200;
end;
$$;

drop function if exists public.admin_list_game_party_messages();
create function public.admin_list_game_party_messages()
returns table(
  id bigint,
  party_id bigint,
  game_name text,
  user_id uuid,
  nickname text,
  content text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can read game party messages';
  end if;
  return query
    select m.id,m.party_id,g.game_name,m.user_id,p.nickname,m.content,m.created_at
    from public.game_party_messages m
    left join public.game_parties g on g.id = m.party_id
    left join public.profiles p on p.id = m.user_id
    order by m.created_at desc
    limit 200;
end;
$$;

drop function if exists public.admin_moderate_bird_post(bigint,boolean,text,boolean);
create function public.admin_moderate_bird_post(
  p_id bigint,
  p_delete boolean default true,
  p_reason text default '树洞内容不适合公开展示',
  p_public_visible boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare owner_id uuid;
begin
  if not public.is_admin() then raise exception 'Only admin can moderate bird posts'; end if;
  select b.user_id into owner_id from public.bird_posts b where b.id = p_id;
  if not found then raise exception '树洞帖子不存在'; end if;
  update public.bird_posts set is_deleted = p_delete, updated_at = now() where id = p_id;
  perform public.fw_log_moderation('bird_post',p_id::text,owner_id,
    case when p_delete then 'delete_bird_post' else 'restore_bird_post' end,
    p_reason,null,p_public_visible,null);
end;
$$;

drop function if exists public.admin_moderate_bird_comment(bigint,boolean,text,boolean);
create function public.admin_moderate_bird_comment(
  p_id bigint,
  p_delete boolean default true,
  p_reason text default '树洞评论不适合公开展示',
  p_public_visible boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare owner_id uuid;
begin
  if not public.is_admin() then raise exception 'Only admin can moderate bird comments'; end if;
  select c.user_id into owner_id from public.bird_comments c where c.id = p_id;
  if not found then raise exception '树洞评论不存在'; end if;
  update public.bird_comments set is_deleted = p_delete where id = p_id;
  perform public.fw_log_moderation('bird_comment',p_id::text,owner_id,
    case when p_delete then 'delete_bird_comment' else 'restore_bird_comment' end,
    p_reason,null,p_public_visible,null);
end;
$$;

drop function if exists public.admin_moderate_poll(bigint,boolean,text,boolean);
create function public.admin_moderate_poll(
  p_id bigint,
  p_delete boolean default true,
  p_reason text default '投票内容不适合公开展示',
  p_public_visible boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare owner_id uuid;
begin
  if not public.is_admin() then raise exception 'Only admin can moderate polls'; end if;
  select o.user_id into owner_id from public.polls o where o.id = p_id;
  if not found then raise exception '投票不存在'; end if;
  update public.polls set is_deleted = p_delete where id = p_id;
  perform public.fw_log_moderation('poll',p_id::text,owner_id,
    case when p_delete then 'delete_poll' else 'restore_poll' end,
    p_reason,null,p_public_visible,null);
end;
$$;

drop function if exists public.admin_delete_game_party_message(bigint,text,boolean);
create function public.admin_delete_game_party_message(
  p_id bigint,
  p_reason text default '组队留言违规，管理员删除',
  p_public_visible boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare owner_id uuid;
begin
  if not public.is_admin() then raise exception 'Only admin can delete game party messages'; end if;
  select m.user_id into owner_id from public.game_party_messages m where m.id = p_id;
  if not found then raise exception '组队留言不存在'; end if;
  perform public.fw_log_moderation('game_party_message',p_id::text,owner_id,
    'delete_game_party_message',p_reason,null,p_public_visible,null);
  delete from public.game_party_messages where id = p_id;
end;
$$;

revoke all on function public.admin_list_profiles() from public, anon, authenticated;
revoke all on function public.admin_list_bird_posts() from public, anon, authenticated;
revoke all on function public.admin_list_bird_comments() from public, anon, authenticated;
revoke all on function public.admin_list_polls() from public, anon, authenticated;
revoke all on function public.admin_list_game_party_messages() from public, anon, authenticated;
revoke all on function public.admin_moderate_bird_post(bigint,boolean,text,boolean) from public, anon, authenticated;
revoke all on function public.admin_moderate_bird_comment(bigint,boolean,text,boolean) from public, anon, authenticated;
revoke all on function public.admin_moderate_poll(bigint,boolean,text,boolean) from public, anon, authenticated;
revoke all on function public.admin_delete_game_party_message(bigint,text,boolean) from public, anon, authenticated;

grant execute on function public.admin_list_profiles() to authenticated;
grant execute on function public.admin_list_bird_posts() to authenticated;
grant execute on function public.admin_list_bird_comments() to authenticated;
grant execute on function public.admin_list_polls() to authenticated;
grant execute on function public.admin_list_game_party_messages() to authenticated;
grant execute on function public.admin_moderate_bird_post(bigint,boolean,text,boolean) to authenticated;
grant execute on function public.admin_moderate_bird_comment(bigint,boolean,text,boolean) to authenticated;
grant execute on function public.admin_moderate_poll(bigint,boolean,text,boolean) to authenticated;
grant execute on function public.admin_delete_game_party_message(bigint,text,boolean) to authenticated;

notify pgrst, 'reload schema';
