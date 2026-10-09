-- Run as postgres on the linked development database. Every change is rolled back.
begin;
select set_config('fw.test_member',gen_random_uuid()::text,true),set_config('fw.test_guest',gen_random_uuid()::text,true),set_config('fw.test_post','0',true),set_config('fw.test_comment','0',true),set_config('fw.test_party','0',true);
insert into auth.users(id,email,raw_user_meta_data)
select member_id,'membership-'||member_id||'@example.invalid',jsonb_build_object('nickname','测试'||left(member_id::text,8)) from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids
union all select guest_id,'guest-'||guest_id||'@example.invalid',jsonb_build_object('nickname','测试'||left(guest_id::text,8)) from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids;
insert into public.memberships(user_id,status,starts_at,expires_at,source) select member_id,'active',now()-interval '1 day',now()+interval '1 day','manual' from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids;
with p as (insert into public.posts(user_id,content) select member_id,'回滚事务中的会员验证帖子' from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids returning id) select set_config('fw.test_post',(select id::text from p),true);
select set_config('request.jwt.claim.sub',member_id::text,true) from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids;
set local role authenticated;
do $$ declare t record; a record; begin
  select * into t from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids;
  perform public.fw_set_membership_appearance('black_gold','ticket','rose_gold','准点下班','pass','测试介绍',t.post_id);
  select * into a from public.fw_get_membership_appearances(array[t.member_id]);
  if a.title<>'准点下班' or a.frame<>'ticket' or a.featured_post_id<>t.post_id then raise exception 'Identity roundtrip failed'; end if;
  perform public.fw_save_post_reading(t.post_id,true);
  perform set_config('fw.test_party',public.fw_create_game_party('事务组队','','','',null,5,'','',false,'今晚')::text,true);
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('fw.test_guest'),true);
with c as (insert into public.comments(post_id,user_id,content) select post_id,guest_id,'事务中的新评论' from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids returning id) select set_config('fw.test_comment',(select id::text from c),true);
select set_config('request.jwt.claim.sub',current_setting('fw.test_member'),true);
set local role authenticated;
do $$ declare t record; r record; begin
  select * into t from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids;select * into r from public.fw_get_post_reading() where post_id=t.post_id;
  if r.unread_count<>1 then raise exception 'Aggregated unread count failed'; end if;
  perform public.fw_update_post_reading(t.post_id,t.comment_id,t.comment_id,12,120);
  select * into r from public.fw_get_post_reading() where post_id=t.post_id;
  if r.unread_count<>0 or r.anchor_comment_id<>t.comment_id or r.scroll_top<>120 then raise exception 'Reading position failed'; end if;
  begin perform public.fw_set_membership_appearance('black_gold','ticket','default','超过八个字的称号测试','classic','',null);raise exception 'Invalid title accepted';exception when check_violation then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',guest_id::text,true) from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids;
set local role authenticated;
do $$ declare t record; n integer; begin
  select * into t from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids;
  if exists(select 1 from public.fw_get_own_membership_appearance()) then raise exception 'Own appearance leaked';end if;
  if exists(select 1 from public.fw_get_post_reading()) then raise exception 'Private tracking leaked';end if;
  begin perform public.fw_create_game_party('不应创建','','','',null,5,'','');raise exception 'Guest creator accepted';exception when raise_exception then if sqlerrm not like '只有会员%' then raise;end if;end;
  begin perform public.fw_create_game_party('不应创建','','','',null,5,'','',true);raise exception 'Guest legacy creator accepted';exception when raise_exception then if sqlerrm not like '只有会员%' then raise;end if;end;
  begin perform public.fw_save_post_reading(t.post_id,true);raise exception 'Guest follower accepted';exception when raise_exception then if sqlerrm not like '帖子自动追更%' then raise;end if;end;
  begin insert into public.game_parties(captain_id,game_name) values(t.guest_id,'直接写入');raise exception 'Direct party insert accepted';exception when insufficient_privilege then null;end;
  perform public.fw_save_post_reading(t.post_id,false);
  if public.fw_apply_game_party(t.party_id,'','')<>'joined' then raise exception 'Guest joining failed';end if;
  delete from public.post_reading where user_id=t.member_id;
  if (select count(*) from public.post_reading)<>1 then raise exception 'Own reading RLS failed';end if;
end $$;
reset role;
update public.memberships set expires_at=now()-interval '1 hour' where user_id=(select member_id from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids);
select set_config('request.jwt.claim.sub',member_id::text,true) from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids;
set local role authenticated;
do $$ declare t record; begin
  select * into t from (select current_setting('fw.test_member')::uuid member_id,current_setting('fw.test_guest')::uuid guest_id,current_setting('fw.test_post')::bigint post_id,current_setting('fw.test_comment')::bigint comment_id,current_setting('fw.test_party')::bigint party_id) test_ids;
  if exists(select 1 from public.fw_get_membership_appearances(array[t.member_id])) then raise exception 'Expired identity visible';end if;
  if not exists(select 1 from public.fw_get_own_membership_appearance() where title='准点下班') then raise exception 'Expired configuration lost';end if;
  if not exists(select 1 from public.fw_get_post_reading() where following and unread_count=0) then raise exception 'Expired tracking not paused';end if;
  begin perform public.fw_create_game_party('不应创建','','','',null,5,'','',true,'');raise exception 'Expired creator accepted';exception when raise_exception then if sqlerrm not like '只有会员%' then raise;end if;end;
  begin perform public.fw_set_membership_appearance('black_gold','double','default','','classic','',null);raise exception 'Expired appearance accepted';exception when raise_exception then if sqlerrm not like '会员有效期%' then raise;end if;end;
  perform public.fw_save_post_reading(t.post_id,false);
  delete from public.post_reading where post_id=t.post_id;
end $$;
reset role;
rollback;
select 'PASS: member/guest/expired permissions, legacy overloads, free bookmark, join, private RLS, identity and reading roundtrip; all test data rolled back' as result;
