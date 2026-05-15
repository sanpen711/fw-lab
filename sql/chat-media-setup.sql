-- F.w 研究所：聊天图片 / 视频媒体存储初始化 SQL
-- 用途：支持聊天输入框旁边「＋」发送图片、GIF、视频。
-- 运行位置：Supabase SQL Editor。

-- 创建公开 chat-media 存储桶。
-- 注意：视频最大 20MB，所以 bucket file_size_limit 设为 20MB。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ];

-- Storage 权限：公开读取；登录用户只能上传/管理自己文件夹下的媒体。
drop policy if exists "chat_media_public_read" on storage.objects;
create policy "chat_media_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'chat-media');

drop policy if exists "chat_media_insert_own_folder" on storage.objects;
create policy "chat_media_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "chat_media_update_own_folder" on storage.objects;
create policy "chat_media_update_own_folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'chat-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'chat-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "chat_media_delete_own_folder" on storage.objects;
create policy "chat_media_delete_own_folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
