-- Retire only the former news namespace and its dedicated media paths.
lock table public.bird_posts in access exclusive mode;
revoke insert,update on public.bird_posts,public.bird_comments,public.bird_reactions from public,anon,authenticated;
insert into private.chat_room_media_gc(bucket,path)
select 'chat-media',name from storage.objects where bucket_id='chat-media' and split_part(name,'/',2)='bird'
on conflict do nothing;
delete from public.bird_posts;
alter policy chat_media_insert_own_folder on storage.objects with check(bucket_id='chat-media' and (select auth.uid())::text=(storage.foldername(name))[1] and coalesce((storage.foldername(name))[2],'')<>'bird');
alter policy chat_media_update_own_folder on storage.objects with check(bucket_id='chat-media' and (select auth.uid())::text=(storage.foldername(name))[1] and coalesce((storage.foldername(name))[2],'')<>'bird');
notify pgrst,'reload schema';
