-- An administrator can act on a serious report immediately, before five reports.
create function public.admin_content_review_flag_report(p_report_id bigint,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.site_reports;cfg private.content_review_targets;doc jsonb;begin
 if not public.is_admin() then raise exception 'Only admin can escalate reports';end if;
 if char_length(btrim(p_reason))<2 then raise exception '请填写处理原因。';end if;
 if p_report_id>=0 then raise exception '旧房间消息请使用原有删除功能。';end if;
 select * into strict r from public.site_reports where id=-p_report_id;
 if r.target_type='user' then raise exception '用户举报请在用户管理处理。';end if;
 select * into strict cfg from private.content_review_targets where kind=r.target_type;
 perform pg_advisory_xact_lock(hashtextextended('content-report:'||r.target_user_id::text,0));
 execute format('select to_jsonb(t) from public.%I t where id::text=$1',cfg.table_name) into doc using r.target_id;
 if doc is null then raise exception '原内容已不存在。';end if;
 insert into private.content_reviews(kind,target_id,owner_id,snapshot,status,source,reason)
 values(r.target_type,r.target_id,r.target_user_id,doc,'pending','admin',left(p_reason,500))
 on conflict(kind,target_id) do update set snapshot=excluded.snapshot,status='pending',source='admin',reason=excluded.reason,revision=gen_random_uuid(),updated_at=now();
 insert into private.content_review_history(review_id,kind,target_id,snapshot,action,reason,actor_id)
 select id,kind,target_id,snapshot,'admin_hidden',reason,auth.uid() from private.content_reviews where kind=r.target_type and target_id=r.target_id;
end;$$;
revoke all on function public.admin_content_review_flag_report(bigint,text) from public,anon;
grant execute on function public.admin_content_review_flag_report(bigint,text) to authenticated;
-- Evidence and review history can be inspected/exported without exposing it publicly.
create function public.admin_content_review_history(p_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Only admin can read evidence';end if;
 return jsonb_build_object('history',coalesce((select jsonb_agg(to_jsonb(t)) from (select * from private.content_review_history where review_id=p_id order by id)t),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(to_jsonb(s)) from public.site_reports s join private.content_reviews r on r.kind=s.target_type and r.target_id=s.target_id where r.id=p_id),'[]'::jsonb));
end;$$;
revoke all on function public.admin_content_review_history(bigint) from public,anon;
grant execute on function public.admin_content_review_history(bigint) to authenticated;
notify pgrst,'reload schema';

create policy room_media_admin_review on storage.objects for select to authenticated using(bucket_id='room-media' and (select public.is_admin()));
