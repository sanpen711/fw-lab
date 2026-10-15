-- All fixture rows and their associated auth/profile records are rolled back.
begin;
select set_config('fw.site_admin',gen_random_uuid()::text,true);
select set_config('fw.site_user',gen_random_uuid()::text,true);
select set_config('fw.site_notice',gen_random_uuid()::text,true);
select set_config('fw.site_draft',gen_random_uuid()::text,true);
select set_config('fw.site_activity',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
 select current_setting(setting)::uuid,'site-'||current_setting(setting)||'@example.invalid',jsonb_build_object('nickname','公告测试'||left(current_setting(setting),8))
 from unnest(array['fw.site_admin','fw.site_user']) setting;
update public.profiles set role='admin' where id=current_setting('fw.site_admin')::uuid;
select set_config('request.jwt.claim.sub',current_setting('fw.site_admin'),true);
set local role authenticated;
insert into public.site_announcements(id,title,body,is_published,is_pinned,published_at)
 values(current_setting('fw.site_notice')::uuid,'测试公告','测试正文',true,true,'2099-01-01');
insert into public.site_announcements(id,title,body) values(current_setting('fw.site_draft')::uuid,'未发布公告','草稿正文');
insert into public.site_activities(id,title,body,starts_at,ends_at,is_published)
 values(current_setting('fw.site_activity')::uuid,'测试活动','参与说明',now()-interval '1 day',now()+interval '1 day',true);
do $$begin
 if not exists(select 1 from public.site_announcements where id=current_setting('fw.site_notice')::uuid and published_at=now()) then raise exception 'Publish timestamp is client controlled';end if;
 begin
  insert into public.site_activities(title,body,starts_at,ends_at) values('无效时间','正文',now(),now()-interval '1 day');
  raise exception 'Invalid date range accepted';
 exception when check_violation then null;end;
 begin
  update public.site_activities set participation_url='javascript:alert(1)' where id=current_setting('fw.site_activity')::uuid;
  raise exception 'Unsafe protocol accepted';
 exception when check_violation then null;end;
 begin
  update public.site_activities set cover_path='activities/'||gen_random_uuid()||'/'||gen_random_uuid()||'.png' where id=current_setting('fw.site_activity')::uuid;
  raise exception 'Cover from another activity accepted';
 exception when check_violation then null;end;
end $$;
insert into storage.objects(bucket_id,name) values('activity-covers','activities/'||current_setting('fw.site_activity')||'/'||gen_random_uuid()||'.png');
reset role;
select set_config('request.jwt.claim.sub',current_setting('fw.site_user'),true);
set local role authenticated;
do $$declare n integer;begin
 if (select count(*) from public.site_announcements where id in(current_setting('fw.site_notice')::uuid,current_setting('fw.site_draft')::uuid))<>1 then raise exception 'Draft visibility leaked';end if;
 if not exists(select 1 from public.site_activities where id=current_setting('fw.site_activity')::uuid) then raise exception 'Published activity unreadable';end if;
 begin
  insert into public.site_announcements(title,body,is_published) values('伪造公告','正文',true);
  raise exception 'Ordinary user created official content';
 exception when insufficient_privilege then null;end;
 update public.site_announcements set body='篡改' where id=current_setting('fw.site_notice')::uuid;
 get diagnostics n=row_count;if n<>0 then raise exception 'Ordinary user changed notice';end if;
 update public.site_activities set is_published=false where id=current_setting('fw.site_activity')::uuid;
 get diagnostics n=row_count;if n<>0 then raise exception 'Ordinary user withdrew activity';end if;
 begin
  insert into storage.objects(bucket_id,name) values('activity-covers','activities/'||gen_random_uuid()||'/'||gen_random_uuid()||'.png');
  raise exception 'Ordinary user uploaded official cover';
 exception when insufficient_privilege then null;end;
 if has_table_privilege('authenticated','public.site_announcements','delete') or has_table_privilege('anon','public.site_activities','select') then raise exception 'Unexpected table privileges';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('fw.site_admin'),true);
set local role authenticated;
update public.site_announcements set is_published=true where id=current_setting('fw.site_draft')::uuid;
update public.site_announcements set deleted_at=now() where id=current_setting('fw.site_notice')::uuid;
update public.site_activities set is_published=false where id=current_setting('fw.site_activity')::uuid;
do $$begin
 begin
  update public.site_announcements set deleted_at=null,is_published=true where id=current_setting('fw.site_notice')::uuid;
  raise exception 'Deleted notice restored';
 exception when raise_exception then if sqlerrm<>'CONTENT_DELETED' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('fw.site_user'),true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.site_announcements where id=current_setting('fw.site_notice')::uuid) then raise exception 'Deleted notice visible';end if;
 if not exists(select 1 from public.site_announcements where id=current_setting('fw.site_draft')::uuid and published_at is not null) then raise exception 'Published draft not visible';end if;
 if exists(select 1 from public.site_activities where id=current_setting('fw.site_activity')::uuid) then raise exception 'Withdrawn activity visible';end if;
end $$;
reset role;
update public.profiles set is_banned=true where id=current_setting('fw.site_admin')::uuid;
select set_config('request.jwt.claim.sub',current_setting('fw.site_admin'),true);
set local role authenticated;
do $$begin
 begin
  insert into public.site_announcements(title,body) values('被封禁管理员','正文');
  raise exception 'Banned administrator wrote notice';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'site content permissions, validation and publication verified; fixtures rolled back' as verification;
