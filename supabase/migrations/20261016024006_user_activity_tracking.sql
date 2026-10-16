-- Activity is measured from foreground use, never from Auth token renewal.
create table private.user_activity (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_active_at timestamptz not null default clock_timestamp()
);
alter table private.user_activity enable row level security;
revoke all on table private.user_activity from public, anon, authenticated;
comment on table private.user_activity is 'Server-timed foreground user activity; no login/session history backfill.';

create function private.record_user_activity()
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); stamp timestamptz := clock_timestamp();
begin
  if me is null or not exists (
    select 1 from public.profiles p where p.id=me and not coalesce(p.is_banned,false)
  ) then
    raise exception '请先登录有效账号。' using errcode='42501';
  end if;
  insert into private.user_activity as activity(user_id,last_active_at)
    values(me,stamp)
    on conflict(user_id) do update set last_active_at=excluded.last_active_at
    where activity.last_active_at < excluded.last_active_at - interval '1 minute';
end;
$$;
revoke all on function private.record_user_activity() from public, anon, authenticated;
grant execute on function private.record_user_activity() to authenticated;

create function public.fw_record_user_activity()
returns void language sql security invoker set search_path = ''
as $$ select private.record_user_activity(); $$;
revoke all on function public.fw_record_user_activity() from public, anon, authenticated;
grant execute on function public.fw_record_user_activity() to authenticated;

CREATE OR REPLACE FUNCTION private.admin_list_profiles_with_activity()
 RETURNS TABLE(id uuid, nickname text, avatar_url text, role text, is_banned boolean, lab_code text, muted_until timestamp with time zone, created_at timestamp with time zone, email_search text, last_sign_in_at timestamp with time zone, is_test_account boolean, post_count bigint, comment_count bigint, report_count bigint, moderation_count bigint, last_active_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      (select count(*) from public.moderation_logs x where x.target_user_id = p.id )::bigint as moderation_count,
      activity.last_active_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join private.user_activity activity on activity.user_id = p.id
    order by p.created_at desc
    limit 300;
end;
$function$
;
revoke all on function private.admin_list_profiles_with_activity() from public, anon, authenticated;
grant execute on function private.admin_list_profiles_with_activity() to authenticated;
grant usage on schema private to authenticated;

-- Preserve the RPC name and all existing fields for older management clients.
drop function public.admin_list_profiles();
create function public.admin_list_profiles()
returns table(id uuid, nickname text, avatar_url text, role text, is_banned boolean, lab_code text, muted_until timestamp with time zone, created_at timestamp with time zone, email_search text, last_sign_in_at timestamp with time zone, is_test_account boolean, post_count bigint, comment_count bigint, report_count bigint, moderation_count bigint, last_active_at timestamp with time zone)
language sql security invoker set search_path = ''
as $$ select * from private.admin_list_profiles_with_activity(); $$;
revoke all on function public.admin_list_profiles() from public, anon, authenticated;
grant execute on function public.admin_list_profiles() to authenticated;
notify pgrst, 'reload schema';
