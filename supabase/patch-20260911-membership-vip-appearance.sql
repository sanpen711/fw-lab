create table if not exists public.membership_appearances (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'rose_gold'
    check (theme in ('rose_gold','black_gold','pink_starlight')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.membership_appearances enable row level security;
revoke all on table public.membership_appearances from public, anon, authenticated;

create or replace function public.fw_get_active_membership_styles(p_user_ids uuid[])
returns table(user_id uuid, theme text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then return; end if;
  if array_length(p_user_ids, 1) > 200 then raise exception 'Too many users requested'; end if;
  return query
  select m.user_id, coalesce(a.theme, 'rose_gold'::text)
  from public.memberships m
  left join public.membership_appearances a on a.user_id = m.user_id
  where m.user_id = any(p_user_ids)
    and m.status = 'active'
    and m.expires_at > now();
end;
$$;

revoke all on function public.fw_get_active_membership_styles(uuid[]) from public, anon, authenticated;
grant execute on function public.fw_get_active_membership_styles(uuid[]) to authenticated;

create or replace function public.fw_set_membership_theme(p_theme text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  normalized_theme text := lower(trim(coalesce(p_theme, '')));
begin
  if me is null then raise exception 'Authentication required'; end if;
  if normalized_theme not in ('rose_gold','black_gold','pink_starlight') then raise exception 'Unsupported membership theme'; end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = me and m.status = 'active' and m.expires_at > now()
  ) then raise exception 'Active membership required'; end if;

  insert into public.membership_appearances(user_id, theme, created_at, updated_at)
  values (me, normalized_theme, now(), now())
  on conflict (user_id) do update set theme=excluded.theme, updated_at=now();
  return normalized_theme;
end;
$$;

revoke all on function public.fw_set_membership_theme(text) from public, anon, authenticated;
grant execute on function public.fw_set_membership_theme(text) to authenticated;
