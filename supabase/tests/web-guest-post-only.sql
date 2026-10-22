-- Read-only assertions; run after web_guest_post_only_access is applied.
begin;
select set_config('fw.test.public_comment_counts',coalesce((
  select jsonb_object_agg(p.id::text,(select count(*) from public.comments c
    where c.post_id=p.id and c.is_deleted=false
      and public.fw_content_visible('comment',c.id::text)))::text
  from (select id from public.posts where is_deleted=false
    and public.fw_content_visible('post',id::text) order by id desc limit 100) p
),'{}'),true);
set local role anon;
do $$
declare actual jsonb;
begin
  if has_column_privilege('anon','public.comments','content','select')
    or has_column_privilege('anon','public.comments','user_id','select')
    or has_column_privilege('anon','public.comments','id','select')
    or has_column_privilege('anon','public.comments','created_at','select') then
    raise exception 'Guest comment details exposed';
  end if;
  if not has_column_privilege('anon','public.comments','post_id','select') then
    raise exception 'Guest counts cannot use the RLS-protected post_id';
  end if;
  if has_table_privilege('anon','public.comments','insert,update,delete,truncate') then
    raise exception 'Guest comment writes exposed';
  end if;
  if exists(select 1 from unnest(array['polls','poll_options','game_parties','membership_plans','shop_products']) t
    where has_table_privilege('anon','public.'||t,'select')) then
    raise exception 'Guest private section data exposed';
  end if;
  if has_function_privilege('anon','public.fw_poll_vote_stats()','execute') then
    raise exception 'Guest poll statistics exposed';
  end if;
  select coalesce(jsonb_object_agg(r.post_id::text,r.comment_count),'{}') into actual
  from public.fw_public_post_comment_counts(array(select id from public.posts
    where is_deleted=false and public.fw_content_visible('post',id::text)
    order by id desc limit 100)) r;
  if actual<>current_setting('fw.test.public_comment_counts')::jsonb then
    raise exception 'Public comment counts differ from visible comments';
  end if;
  if exists(select 1 from public.fw_public_post_comment_counts(array(select generate_series(1,101))::bigint[])) then
    raise exception 'Count RPC must limit each request to 100 post IDs';
  end if;
  begin
    perform content from public.comments limit 0;
    raise exception 'Guest read of comment text unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  perform content from public.comments limit 0;
  if not has_table_privilege('authenticated','public.comments','select,insert') then
    raise exception 'Signed-in comment access changed';
  end if;
  if not has_function_privilege('authenticated','public.fw_poll_vote_stats()','execute') then
    raise exception 'Signed-in poll statistics unavailable';
  end if;
end $$;
reset role;
rollback;
