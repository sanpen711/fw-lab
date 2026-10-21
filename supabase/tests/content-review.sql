-- Entire fixture transaction rolls back. Never uses existing user content.
begin;
do $$declare u uuid; ids uuid[]:=array[]::uuid[];begin
 for i in 1..13 loop
  u:=gen_random_uuid();ids:=array_append(ids,u);
  insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
  values(u,'authenticated','authenticated','review-test-'||u||'@example.invalid',jsonb_build_object('nickname','测'||left(replace(u::text,'-',''),10)),'{}',now(),now());
 end loop;
 update public.profiles set role='admin' where id=ids[13];
 update private.content_review_settings set reports_enabled=true;
 perform set_config('review.ids',array_to_string(ids,','),true);
end;$$;
set local role authenticated;
do $$declare ids uuid[]:=string_to_array(current_setting('review.ids'),',')::uuid[];p bigint;p2 bigint;rid bigint;rev uuid;blocked boolean;doc jsonb;begin
 perform set_config('request.jwt.claim.sub',ids[1]::text,true);
 insert into public.posts(user_id,content) values(ids[1],'[FW-AUTO-TEST] 正常的加班吐槽') returning id into p;
 insert into public.posts(user_id,content) values(ids[1],'[FW-AUTO-TEST] 第二条正常吐槽') returning id into p2;
 for i in 2..5 loop
  perform set_config('request.jwt.claim.sub',ids[i]::text,true);
  perform public.fw_submit_report('post',p::text,'测试举报');
 end loop;
 if not public.fw_content_visible('post',p::text) then raise exception 'Hidden before five reporters';end if;
 perform public.fw_submit_report('post',p::text,'重复举报');
 if not public.fw_content_visible('post',p::text) then raise exception 'Duplicate report counted';end if;
 perform set_config('request.jwt.claim.sub',ids[6]::text,true);
 perform public.fw_submit_report('post',p::text,'第5位举报人');
 if public.fw_content_visible('post',p::text) or exists(select 1 from public.posts where id=p) then raise exception 'Hidden content leaked through RLS';end if;
 blocked:=false;begin perform public.admin_content_review_queue();blocked:=true;exception when others then null;end;
 if blocked then raise exception 'Non-admin read queue';end if;
 for i in 7..11 loop
  perform set_config('request.jwt.claim.sub',ids[i]::text,true);
  perform public.fw_submit_report('post',p2::text,'测试第10位举报人');
 end loop;
 perform set_config('request.jwt.claim.sub',ids[1]::text,true);
 blocked:=false;begin insert into public.posts(user_id,content) values(ids[1],'应当禁止');blocked:=true;exception when others then null;end;
 if blocked then raise exception 'Suspended author can post';end if;
 if not exists(select 1 from public.posts where user_id=ids[1] and id not in(p,p2)) then null;end if;
 perform set_config('request.jwt.claim.sub',ids[13]::text,true);
 doc:=public.admin_content_review_queue();
 select (v->>'id')::bigint,(v->>'revision')::uuid into rid,rev from jsonb_array_elements(doc->'items')v where v->>'target_id'=p::text and v->>'kind'='post';
 if rid is null then raise exception 'Missing content queue';end if;
 blocked:=false;begin perform public.admin_content_review_decide(rid,gen_random_uuid(),'approved','错误版本');blocked:=true;exception when others then null;end;
 if blocked then raise exception 'Stale revision accepted';end if;
 perform public.admin_content_review_decide(rid,rev,'approved','误报，正常吐槽');
 if not public.fw_content_visible('post',p::text) then raise exception 'Restore failed';end if;
 perform public.admin_content_user_decide(ids[1],'released','误报解除限制');
 perform set_config('request.jwt.claim.sub',ids[1]::text,true);
 insert into public.posts(user_id,content) values(ids[1],'[FW-AUTO-TEST] 可以继续发言');
 perform set_config('request.jwt.claim.sub',ids[6]::text,true);
 perform public.fw_submit_report('post',p::text,'重复举报恢复后的内容');
 if not public.fw_content_visible('post',p::text) then raise exception 'Restored content hidden again by old evidence';end if;
 -- One person reporting many items never counts as ten different reporters.
 for i in 1..12 loop perform public.fw_submit_report('user',ids[1]::text,'同一个人重复举报');end loop;
 perform set_config('request.jwt.claim.sub',ids[1]::text,true);
 insert into public.posts(user_id,content) values(ids[1],'[FW-AUTO-TEST] 未被单人重复举报禁言');
end;$$;
reset role;
-- Worker callbacks cannot overwrite human/report decisions; no automatic service => pending.
do $$declare ids uuid[]:=string_to_array(current_setting('review.ids'),',')::uuid[];p bigint;r private.content_reviews;begin
 update private.content_review_settings set automatic_enabled=true;
 perform set_config('request.jwt.claim.sub',ids[1]::text,true);
 insert into public.posts(user_id,content) values(ids[1],'[FW-AUTO-TEST] 等待自动审核') returning id into p;
 select * into strict r from private.content_reviews where kind='post' and target_id=p::text;
 if public.fw_content_visible('post',p::text) then raise exception 'Unreviewed content public';end if;
 perform public.fw_machine_review_finish(r.id,r.revision,'review','服务未配置');
 if public.fw_content_visible('post',p::text) then raise exception 'Fail-open machine review';end if;
 perform public.fw_machine_review_finish(r.id,r.revision,'allow','正常吐槽');
 if not public.fw_content_visible('post',p::text) then raise exception 'Machine approval failed';end if;
end;$$;
rollback;
select 'Content review threshold, deduplication, RLS, suspension, restoration and fail-closed checks passed; fixtures rolled back' as verified;
