-- auth.users.email is varchar(255), while the RPC contract exposes email as text.
-- PL/pgSQL RETURN QUERY requires exact column types, so cast it explicitly.
create or replace function public.admin_list_feedback_tickets()
returns table(
  id bigint,
  user_id uuid,
  nickname text,
  email text,
  category text,
  content text,
  version text,
  platform text,
  status text,
  priority text,
  admin_reply text,
  internal_note text,
  created_at timestamptz,
  updated_at timestamptz,
  handled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can read feedback tickets';
  end if;

  return query
    select
      f.id,
      f.user_id,
      p.nickname,
      u.email::text,
      f.category,
      f.content,
      f.version,
      f.platform,
      f.status,
      f.priority,
      f.admin_reply,
      f.internal_note,
      f.created_at,
      f.updated_at,
      f.handled_at
    from public.feedback_tickets f
    left join public.profiles p on p.id = f.user_id
    left join auth.users u on u.id = f.user_id
    order by
      case f.priority when 'high' then 1 when 'medium' then 2 when 'normal' then 3 else 4 end,
      case f.status when 'new' then 1 when 'in_progress' then 2 when 'waiting_user' then 3 else 4 end,
      f.created_at desc
    limit 300;
end;
$$;

revoke all on function public.admin_list_feedback_tickets() from public, anon, authenticated;
grant execute on function public.admin_list_feedback_tickets() to authenticated;

-- The management client already supports searching by account, but the old RPC
-- omitted the email_search column. Return it only through the admin-checked RPC.
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
  email_search text
)
language sql
security definer
set search_path = ''
as $$
  select
    p.id,
    p.nickname,
    p.avatar_url,
    p.role,
    p.is_banned,
    p.lab_code,
    p.muted_until,
    p.created_at,
    p.email_search
  from public.profiles p
  where public.is_admin()
  order by p.created_at desc
  limit 300;
$$;

revoke all on function public.admin_list_profiles() from public, anon, authenticated;
grant execute on function public.admin_list_profiles() to authenticated;

notify pgrst, 'reload schema';
