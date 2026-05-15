-- F.w 研究所：用户自定义表情包初始化 SQL
-- 用途：支持表情面板里的 ♥ 我的表情。
-- 运行位置：Supabase SQL Editor。

-- 1. 创建公开 stickers 存储桶。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stickers',
  'stickers',
  true,
  1048576,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

-- 2. 创建用户表情包表。
create table if not exists public.user_stickers (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  storage_path text not null,
  file_name text,
  file_size integer default 0,
  mime_type text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_stickers_user_created
  on public.user_stickers(user_id, created_at desc)
  where is_deleted = false;

alter table public.user_stickers enable row level security;

-- 3. 表数据权限：用户只能管理自己的表情。
drop policy if exists "user_stickers_select_own" on public.user_stickers;
create policy "user_stickers_select_own"
  on public.user_stickers
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_stickers_insert_own" on public.user_stickers;
create policy "user_stickers_insert_own"
  on public.user_stickers
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_stickers_update_own" on public.user_stickers;
create policy "user_stickers_update_own"
  on public.user_stickers
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_stickers_delete_own" on public.user_stickers;
create policy "user_stickers_delete_own"
  on public.user_stickers
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- 4. Storage 权限：用户只能上传/管理自己文件夹下的表情。
drop policy if exists "stickers_public_read" on storage.objects;
create policy "stickers_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'stickers');

drop policy if exists "stickers_insert_own_folder" on storage.objects;
create policy "stickers_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'stickers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "stickers_update_own_folder" on storage.objects;
create policy "stickers_update_own_folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'stickers'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'stickers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "stickers_delete_own_folder" on storage.objects;
create policy "stickers_delete_own_folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'stickers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 5. 基础授权。
grant select, insert, update, delete on public.user_stickers to authenticated;
grant usage, select on sequence public.user_stickers_id_seq to authenticated;
