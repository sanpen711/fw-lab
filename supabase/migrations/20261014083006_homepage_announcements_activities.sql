-- Official content: signed-in users read published rows; only administrators write.
create table public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  is_published boolean not null default false,
  is_pinned boolean not null default false,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.site_activities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  summary text not null default '' check (char_length(summary)<=200),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  cover_path text not null default '' check (cover_path='' or cover_path ~ ('^activities/'||id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at>starts_at),
  target_view text not null default '' check (target_view in ('','square','rooms','play','shop')),
  participation_url text not null default '' check (char_length(participation_url)<=2048 and (participation_url='' or (participation_url ~ '^https?://' and participation_url !~ '[[:space:][:cntrl:]]'))),
  is_published boolean not null default false,
  is_pinned boolean not null default false,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_view='' or participation_url='')
);
create index site_announcements_visible_idx on public.site_announcements(is_pinned desc,published_at desc,id desc) where is_published and deleted_at is null;
create index site_activities_visible_idx on public.site_activities(is_pinned desc,published_at desc,id desc) where is_published and deleted_at is null;
alter table public.site_announcements enable row level security;
alter table public.site_activities enable row level security;
revoke all on public.site_announcements,public.site_activities from public,anon,authenticated;
grant select,insert,update on public.site_announcements,public.site_activities to authenticated;
grant all on public.site_announcements,public.site_activities to service_role;
create policy site_announcements_read on public.site_announcements for select to authenticated using ((is_published and deleted_at is null) or (select public.is_admin()));
create policy site_announcements_insert on public.site_announcements for insert to authenticated with check ((select public.is_admin()));
create policy site_announcements_update on public.site_announcements for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy site_activities_read on public.site_activities for select to authenticated using ((is_published and deleted_at is null) or (select public.is_admin()));
create policy site_activities_insert on public.site_activities for insert to authenticated with check ((select public.is_admin()));
create policy site_activities_update on public.site_activities for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create function private.site_content_touch() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and old.deleted_at is not null then raise exception 'CONTENT_DELETED'; end if;
  new.updated_at:=now();
  if new.deleted_at is not null then new.deleted_at:=now();new.is_published:=false;end if;
  if new.is_published then
    if tg_op='INSERT' then new.published_at:=now();
    elsif not old.is_published then new.published_at:=now();
    else new.published_at:=old.published_at;end if;
  elsif tg_op='UPDATE' then new.published_at:=old.published_at;
  else new.published_at:=null;end if;
  return new;
end; $$;
revoke all on function private.site_content_touch() from public,anon,authenticated;
create trigger site_announcements_touch before insert or update on public.site_announcements for each row execute function private.site_content_touch();
create trigger site_activities_touch before insert or update on public.site_activities for each row execute function private.site_content_touch();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('activity-covers','activity-covers',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy activity_covers_admin_read on storage.objects for select to authenticated using (bucket_id='activity-covers' and (select public.is_admin()));
create policy activity_covers_admin_insert on storage.objects for insert to authenticated with check (bucket_id='activity-covers' and name ~ '^activities/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' and (select public.is_admin()));
create policy activity_covers_admin_delete on storage.objects for delete to authenticated using (bucket_id='activity-covers' and (select public.is_admin()));
