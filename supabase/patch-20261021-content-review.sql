-- Content review. Existing content is not retrospectively machine-reviewed.
-- Automatic review stays OFF until a provider has passed an integration test.
create schema if not exists private;
create table private.content_review_settings (
 id boolean primary key default true check(id), automatic_enabled boolean not null default false, reports_enabled boolean not null default false
);
insert into private.content_review_settings values(true,false,false);
create table private.content_review_targets (
 kind text primary key, table_name text not null unique, owner_column text not null,
 text_columns text[] not null
);
insert into private.content_review_targets values
 ('post','posts','user_id',array['content']),
 ('comment','comments','user_id',array['content']),
 ('bird_post','bird_posts','user_id',array['title','content','images']),
 ('bird_comment','bird_comments','user_id',array['content']),
 ('chat_message','chat_messages','user_id',array['content']),
 ('private_message','private_messages','sender_id',array['content']),
 ('room_message','chat_room_messages','user_id',array['content','media_path','sticker_url']),
 ('room','chat_rooms','owner_id',array['name','description']),
 ('poll','polls','user_id',array['title','conclusion']),
 ('poll_option','poll_options','user_id',array['label']),
 ('game_party','game_parties','captain_id',array['game_name','mode','note','server_name']),
 ('party_message','game_party_messages','user_id',array['content']),
 ('sticker','user_stickers','user_id',array['image_url']);
create table private.content_reviews (
 id bigint generated always as identity primary key, kind text not null, target_id text not null,
 owner_id uuid, revision uuid not null default gen_random_uuid(), snapshot jsonb not null,
 status text not null check(status in ('approved','pending','rejected')),
 source text not null, reason text not null, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(kind,target_id)
);
create index content_reviews_pending_idx on private.content_reviews(updated_at) where status='pending';
create table private.content_review_history (
 id bigint generated always as identity primary key, review_id bigint, kind text not null,
 target_id text not null, snapshot jsonb not null, action text not null, reason text not null,
 actor_id uuid, created_at timestamptz not null default now()
);
create table private.content_user_holds (
 user_id uuid primary key, state text not null check(state in ('pending','permanent','released')),
 reason text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Separate deduplicated active evidence from immutable report records.
create table private.content_report_evidence (
 reporter_id uuid not null, kind text not null, target_id text not null, owner_id uuid not null,
 active boolean not null default true, created_at timestamptz not null default now(),
 primary key(reporter_id,kind,target_id)
);
create index content_report_evidence_owner_idx on private.content_report_evidence(owner_id,reporter_id) where active;
alter table public.site_reports drop constraint site_reports_target_type_check;
alter table public.site_reports add constraint site_reports_target_type_check check(target_type in ('user','post','comment','bird_post','bird_comment','chat_message','private_message','room_message','room','poll','poll_option','game_party','party_message','sticker'));
revoke insert,update on public.site_reports from authenticated,anon;
alter table private.content_review_settings enable row level security;
alter table private.content_review_targets enable row level security;
alter table private.content_reviews enable row level security;
alter table private.content_review_history enable row level security;
alter table private.content_user_holds enable row level security;
alter table private.content_report_evidence enable row level security;
revoke all on private.content_review_settings,private.content_review_targets,private.content_reviews,
 private.content_review_history,private.content_user_holds,private.content_report_evidence from public,anon,authenticated;

create function public.fw_content_visible(p_kind text,p_id text) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.content_reviews where kind=p_kind and target_id=p_id and status<>'approved');
$$;
revoke all on function public.fw_content_visible(text,text) from public;
grant execute on function public.fw_content_visible(text,text) to anon,authenticated,service_role;

create function private.content_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg private.content_review_targets; payload jsonb:=to_jsonb(new); old_payload jsonb; owner_id uuid; col text; changed boolean:=tg_op='INSERT';
begin
 select * into strict cfg from private.content_review_targets where table_name=tg_table_name;
 if tg_op='UPDATE' then
  old_payload:=to_jsonb(old);
  foreach col in array cfg.text_columns loop
   changed:=changed or payload->col is distinct from old_payload->col;
  end loop;
 end if;
 if not changed then return new; end if;
 owner_id:=nullif(payload->>cfg.owner_column,'')::uuid;
 if owner_id is null and cfg.kind='poll_option' then select user_id into owner_id from public.polls where id=(payload->>'poll_id')::bigint; end if;
 if auth.uid() is not null and not public.is_admin() and exists(
  select 1 from private.content_user_holds where user_id=auth.uid() and state in ('pending','permanent')
 ) then raise exception '账号已暂停发言，等待管理员审核。'; end if;
 if (select automatic_enabled from private.content_review_settings where id) then
  insert into private.content_reviews(kind,target_id,owner_id,snapshot,status,source,reason)
  values(cfg.kind,payload->>'id',owner_id,payload,'pending','automatic','等待自动审核')
  on conflict(kind,target_id) do update set owner_id=excluded.owner_id,snapshot=excluded.snapshot,
   revision=gen_random_uuid(),status='pending',source='automatic',reason='内容已修改，等待重新审核',updated_at=now();
  insert into private.content_review_history(review_id,kind,target_id,snapshot,action,reason,actor_id)
  select id,kind,target_id,snapshot,'submitted',reason,auth.uid() from private.content_reviews where kind=cfg.kind and target_id=payload->>'id';
 elsif exists(select 1 from private.content_reviews where kind=cfg.kind and target_id=payload->>'id' and status<>'approved') then
  -- Editing must never turn a hidden item back into public content.
  update private.content_reviews set snapshot=payload,revision=gen_random_uuid(),status='pending',
   reason='隐藏内容已修改，等待复核',updated_at=now() where kind=cfg.kind and target_id=payload->>'id';
 end if;
 return new;
end;$$;
revoke all on function private.content_write_guard() from public,anon,authenticated;
do $$declare t record;begin
 for t in select * from private.content_review_targets loop
  execute format('create trigger aa_content_write_guard before insert or update on public.%I for each row execute function private.content_write_guard()',t.table_name);
  execute format('create policy content_review_visibility on public.%I as restrictive for select to anon,authenticated using (public.is_admin() or public.fw_content_visible(%L,id::text))',t.table_name,t.kind);
 end loop;
end;$$;

create function private.content_record_report(p_reporter uuid,p_kind text,p_id text,p_owner uuid,p_snapshot jsonb,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare n integer; blocked boolean;
begin
 -- One lock per reported user serializes simultaneous reports across different content.
 perform pg_advisory_xact_lock(hashtextextended('content-report:'||p_owner::text,0));
 insert into private.content_report_evidence(reporter_id,kind,target_id,owner_id)
 values(p_reporter,p_kind,p_id,p_owner) on conflict do nothing;
 if not found then return; end if;
 if not (select reports_enabled from private.content_review_settings where id) then return; end if;
 select count(distinct reporter_id) into n from private.content_report_evidence where kind=p_kind and target_id=p_id and active;
 if p_kind<>'user' and n>=5 then
  insert into private.content_reviews(kind,target_id,owner_id,snapshot,status,source,reason)
  values(p_kind,p_id,p_owner,p_snapshot,'pending','reports','达到5个不同账号举报，暂时隐藏')
  on conflict(kind,target_id) do update set status='pending',source='reports',reason=excluded.reason,updated_at=now();
  if n=5 then
   insert into private.content_review_history(review_id,kind,target_id,snapshot,action,reason)
   select id,kind,target_id,snapshot,'report_hidden',reason from private.content_reviews where kind=p_kind and target_id=p_id;
   insert into public.notifications(user_id,type,target_type,target_id,content)
   values(p_owner,'system','content_review',p_id,'你的内容因达到举报阈值已暂时隐藏，正在等待管理员复核。');
   update public.notifications set content='相关内容正在审核。' where target_type=p_kind and target_id=p_id;
  end if;
 end if;
 select count(distinct reporter_id) into n from private.content_report_evidence where owner_id=p_owner and active;
 if n>=10 then
  select exists(select 1 from private.content_user_holds where user_id=p_owner and state in ('pending','permanent')) into blocked;
  if not blocked then
   insert into private.content_user_holds(user_id,state,reason) values(p_owner,'pending','达到10个不同账号举报，暂停发言等待审核')
   on conflict(user_id) do update set state='pending',reason=excluded.reason,updated_at=now();
   insert into public.notifications(user_id,type,target_type,target_id,content)
   values(p_owner,'system','content_review',p_owner::text,'你的账号已暂停发言，等待管理员复核；仍可浏览和申诉。');
  end if;
 end if;
end;$$;
revoke all on function private.content_record_report(uuid,text,text,uuid,jsonb,text) from public,anon,authenticated;

create or replace function public.fw_submit_report(p_target_type text,p_target_id text,p_reason text default '用户举报') returns bigint
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); cfg private.content_review_targets; doc jsonb; owner_id uuid; report_id bigint; clean_reason text:=left(btrim(coalesce(p_reason,'')),240);
begin
 if me is null or not public.is_not_banned() then raise exception '请先登录后再举报。'; end if;
 if char_length(clean_reason)<2 then raise exception '举报原因至少2个字。'; end if;
 if p_target_type='user' then
  select to_jsonb(p) into doc from public.profiles p where id::text=p_target_id;owner_id:=(doc->>'id')::uuid;
 else
  select * into cfg from private.content_review_targets where kind=p_target_type;
  if not found then raise exception '不支持这种举报类型。'; end if;
  execute format('select to_jsonb(t) from public.%I t where id::text=$1',cfg.table_name) into doc using p_target_id;
  owner_id:=(doc->>cfg.owner_column)::uuid;
  if owner_id is null and p_target_type='poll_option' then select user_id into owner_id from public.polls where id=(doc->>'poll_id')::bigint; end if;
  -- Do not expose private messages to outsiders through the report endpoint.
  if p_target_type='private_message' and not exists(select 1 from public.conversations c where c.id=(doc->>'conversation_id')::bigint and me in (c.user_one_id,c.user_two_id)) then raise exception '无权举报这条消息。'; end if;
  if p_target_type='room_message' and not private.chat_room_member((doc->>'room_id')::uuid) then raise exception '请先加入房间。'; end if;
  if p_target_type='party_message' and not exists(select 1 from public.game_party_members where party_id=(doc->>'party_id')::bigint and user_id=me and state='accepted') then raise exception '只有队伍成员可以举报留言。'; end if;
 end if;
 if owner_id is null or owner_id=me then raise exception '举报对象不存在，或不能举报自己。'; end if;
 perform pg_advisory_xact_lock(hashtextextended('content-report:'||owner_id::text,0));
 select id into report_id from public.site_reports where reporter_id=me and target_type=p_target_type and target_id=p_target_id;
 if found then return report_id; end if;
 insert into public.site_reports(reporter_id,target_type,target_id,target_user_id,target_display_name,target_preview,report_reason,status)
 values(me,p_target_type,p_target_id,owner_id,public.fw_public_name(owner_id),left(coalesce(doc->>'content',doc->>'title',doc->>'name',doc->>'label','用户资料'),220),clean_reason,'pending') returning id into report_id;
 perform private.content_record_report(me,p_target_type,p_target_id,owner_id,doc,clean_reason);
 return report_id;
end;$$;
revoke all on function public.fw_submit_report(text,text,text) from public,anon;
grant execute on function public.fw_submit_report(text,text,text) to authenticated;

create function public.admin_content_review_queue() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Only admin can read reviews'; end if;
 return jsonb_build_object('reports_enabled',(select reports_enabled from private.content_review_settings where id),'automatic_enabled',(select automatic_enabled from private.content_review_settings where id),
 'items',coalesce((select jsonb_agg(to_jsonb(t)) from (select r.*,public.fw_public_name(r.owner_id) as nickname,
 (select count(distinct e.reporter_id) from private.content_report_evidence e where e.kind=r.kind and e.target_id=r.target_id and active) as report_count
 from private.content_reviews r where status='pending' order by updated_at limit 300)t),'[]'::jsonb),
 'users',coalesce((select jsonb_agg(to_jsonb(t)) from (select h.*,public.fw_public_name(h.user_id) as nickname,
 (select count(distinct e.reporter_id) from private.content_report_evidence e where e.owner_id=h.user_id and active) as report_count
 from private.content_user_holds h where state in ('pending','permanent') order by updated_at limit 300)t),'[]'::jsonb));
end;$$;

create function public.admin_content_review_decide(p_id bigint,p_revision uuid,p_decision text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r private.content_reviews; cfg private.content_review_targets; reporter uuid; original_exists boolean;
begin
 if not public.is_admin() then raise exception 'Only admin can decide reviews'; end if;
 if p_decision not in ('approved','rejected') or char_length(btrim(p_reason))<2 then raise exception '请选择处理结果并填写原因。'; end if;
 select * into strict r from private.content_reviews where id=p_id;
 if r.status<>'pending' or r.revision<>p_revision then raise exception '内容已修改或已经处理，请刷新后审核。'; end if;
 perform pg_advisory_xact_lock(hashtextextended('content-report:'||r.owner_id::text,0));
 select * into strict r from private.content_reviews where id=p_id for update;
 if r.status<>'pending' or r.revision<>p_revision then raise exception '内容已变化，请刷新。'; end if;
 select * into strict cfg from private.content_review_targets where kind=r.kind;
 -- A removed original must not be silently restored from an old snapshot.
 if p_decision='approved' then
  execute format('select exists(select 1 from public.%I where id::text=$1)',cfg.table_name) into original_exists using r.target_id;
  if not original_exists then raise exception '原内容已删除，不能恢复。'; end if;
 end if;
 update private.content_reviews set status=p_decision,reason=left(p_reason,500),updated_at=now() where id=p_id;
 insert into private.content_review_history(review_id,kind,target_id,snapshot,action,reason,actor_id)
 values(r.id,r.kind,r.target_id,r.snapshot,p_decision,p_reason,auth.uid());
 if p_decision='approved' then update private.content_report_evidence set active=false where kind=r.kind and target_id=r.target_id; end if;
 for reporter in select distinct reporter_id from public.site_reports where target_type=r.kind and target_id=r.target_id and status='pending' loop
  insert into public.notifications(user_id,type,target_type,target_id,content) values(reporter,'system','content_review',r.target_id,'你举报的内容已完成核查，感谢反馈。');
 end loop;
 update public.site_reports set status=case when p_decision='approved' then 'ignored' else 'resolved' end,handled_at=now(),handled_by=auth.uid() where target_type=r.kind and target_id=r.target_id and status='pending';
 insert into public.notifications(user_id,type,target_type,target_id,content)
 values(r.owner_id,'system','content_review',r.target_id,case when p_decision='approved' then '内容复核通过，已恢复展示：' else '内容审核未通过，已移除展示：' end||left(p_reason,240));
 perform public.fw_log_moderation(r.kind,r.target_id,r.owner_id,'review_'||p_decision,p_reason,null,false,null);
end;$$;

create function public.admin_content_user_decide(p_user_id uuid,p_decision text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Only admin can decide user reviews'; end if;
 if p_decision not in ('released','permanent') or char_length(btrim(p_reason))<2 then raise exception '请选择处理结果并填写原因。'; end if;
 perform pg_advisory_xact_lock(hashtextextended('content-report:'||p_user_id::text,0));
 update private.content_user_holds set state=p_decision,reason=p_reason,updated_at=now() where user_id=p_user_id;
 if not found then raise exception '没有待处理的发言限制。'; end if;
 if p_decision='released' then update private.content_report_evidence set active=false where owner_id=p_user_id; end if;
 insert into public.notifications(user_id,type,target_type,target_id,content) values(p_user_id,'system','content_review',p_user_id::text,
 case when p_decision='released' then '账号发言限制已解除：' else '账号已被永久禁言：' end||left(p_reason,240));
 perform public.fw_log_moderation('user',p_user_id::text,p_user_id,'review_'||p_decision,p_reason,null,false,null);
end;$$;
revoke all on function public.admin_content_review_queue(),public.admin_content_review_decide(bigint,uuid,text,text),public.admin_content_user_decide(uuid,text,text) from public,anon;
grant execute on function public.admin_content_review_queue(),public.admin_content_review_decide(bigint,uuid,text,text),public.admin_content_user_decide(uuid,text,text) to authenticated;

notify pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.fw_get_membership_appearances(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, theme text, frame text, nickname_color text, title text, card_layout text, intro text, featured_post_id bigint, featured_content text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception '请先登录。'; end if;
  if coalesce(array_length(p_user_ids,1),0)>200 then raise exception '一次最多读取 200 个身份。'; end if;
  return query select m.user_id,coalesce(a.theme,'rose_gold'),coalesce(a.frame,'double'),coalesce(a.nickname_color,'default'),coalesce(a.title,''),coalesce(a.card_layout,'classic'),coalesce(a.intro,''),p.id,p.content,m.expires_at
    from public.memberships m left join public.membership_appearances a on a.user_id=m.user_id
    left join public.posts p on p.id=a.featured_post_id and p.user_id=m.user_id and not p.is_deleted and public.fw_content_visible('post',p.id::text)
    where m.user_id=any(p_user_ids) and public.fw_has_active_membership(m.user_id);
end; $function$
;

CREATE OR REPLACE FUNCTION private.chat_room_member(p_room_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_banned)
 and exists(select 1 from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id where m.room_id=p_room_id and m.user_id=auth.uid() and public.fw_content_visible('room',r.id::text) and (r.expires_at is null or r.expires_at>now()));
$function$
;

CREATE OR REPLACE FUNCTION private.chat_room_list(p_filter text, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rows jsonb;
begin
 if auth.uid() is null or not public.is_not_banned() then raise exception '请先登录正常状态的账号。'; end if;
 if p_filter not in ('all','mine','owned','joined','pending') or p_offset<0 then raise exception '房间筛选参数无效。'; end if;
 select coalesce(jsonb_agg(private.chat_room_summary(r) order by r.created_at desc,r.id desc),'[]'::jsonb) into v_rows
 from (select r.* from public.chat_rooms r where public.fw_content_visible('room',r.id::text) and (r.expires_at is null or r.expires_at>now()) and (
 p_filter='all' or (p_filter in ('mine','owned') and r.owner_id=auth.uid()) or
 (p_filter in ('mine','joined') and r.owner_id<>auth.uid() and exists(select 1 from public.chat_room_members m where m.room_id=r.id and m.user_id=auth.uid())) or
 (p_filter in ('mine','pending') and exists(select 1 from public.chat_room_requests q where q.room_id=r.id and q.user_id=auth.uid() and q.status='pending')))
 order by r.created_at desc,r.id desc offset p_offset limit 31) r;
 return jsonb_build_object('rooms',case when jsonb_array_length(v_rows)>30 then v_rows-'30'::integer else v_rows end,'has_more',jsonb_array_length(v_rows)>30,'server_time',now());
end;$function$
;

CREATE OR REPLACE FUNCTION private.chat_room_read(p_room_id uuid, p_before_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room public.chat_rooms;v_messages jsonb;v_members jsonb;v_requests jsonb;
begin
 if auth.uid() is null or not public.is_not_banned() then raise exception '请先登录正常状态的账号。'; end if;
 select * into v_room from public.chat_rooms where id=p_room_id and public.fw_content_visible('room',id::text) and (expires_at is null or expires_at>now());
 if not found then raise exception '房间已解散或到期。'; end if;
 if not private.chat_room_member(p_room_id) then return jsonb_build_object('room',private.chat_room_summary(v_room),'messages','[]'::jsonb,'members','[]'::jsonb,'requests','[]'::jsonb,'has_more',false,'server_time',now()); end if;
 select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('author',jsonb_build_object('id',p.id,'nickname',p.nickname,'avatar_url',p.avatar_url)) order by m.id),'[]'::jsonb) into v_messages
 from (select * from public.chat_room_messages where room_id=p_room_id and public.fw_content_visible('room_message',id::text) and (p_before_id is null or id<p_before_id) order by id desc limit 100) m join public.profiles p on p.id=m.user_id;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'joined_at',m.joined_at,'nickname',p.nickname,'avatar_url',p.avatar_url,'is_owner',m.user_id=v_room.owner_id) order by m.joined_at),'[]'::jsonb) into v_members from public.chat_room_members m join public.profiles p on p.id=m.user_id where m.room_id=p_room_id;
 if v_room.owner_id=auth.uid() then select coalesce(jsonb_agg(jsonb_build_object('user_id',q.user_id,'nickname',p.nickname,'avatar_url',p.avatar_url,'created_at',q.created_at) order by q.created_at),'[]'::jsonb) into v_requests from public.chat_room_requests q join public.profiles p on p.id=q.user_id where q.room_id=p_room_id and q.status='pending'; end if;
 return jsonb_build_object('room',private.chat_room_summary(v_room),'messages',v_messages,'members',v_members,'requests',coalesce(v_requests,'[]'::jsonb),'has_more',jsonb_array_length(v_messages)=100,'server_time',now());
end;$function$
;

create function private.capture_legacy_chat_report() returns trigger language plpgsql security definer set search_path='' as $$
declare doc jsonb; owner_id uuid;
begin
 select to_jsonb(m),m.user_id into doc,owner_id from public.chat_messages m where id=new.message_id;
 if owner_id is not null and owner_id<>new.reporter_id then
  perform private.content_record_report(new.reporter_id,'chat_message',new.message_id::text,owner_id,doc,coalesce(new.report_reason,new.reason,'用户举报'));
 end if;
 return new;
end;$$;
revoke all on function private.capture_legacy_chat_report() from public,anon,authenticated;
create trigger content_review_legacy_chat_report after insert on public.chat_message_reports for each row execute function private.capture_legacy_chat_report();
create function private.resolve_content_report_evidence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='ignored' and old.status is distinct from new.status then
  update private.content_report_evidence set active=false where reporter_id=new.reporter_id and kind=new.target_type and target_id=new.target_id;
 end if;
 return new;
end;$$;
revoke all on function private.resolve_content_report_evidence() from public,anon,authenticated;
create trigger content_review_report_resolved after update of status on public.site_reports for each row execute function private.resolve_content_report_evidence();
notify pgrst,'reload schema';

-- Service-only worker API. Random revisions prevent forged or stale callbacks.
create function public.fw_machine_review_read(p_id bigint,p_revision uuid) returns jsonb
language sql security definer set search_path='' as $$
 select to_jsonb(r) from private.content_reviews r where id=p_id and revision=p_revision and source='automatic' and status='pending';
$$;
create function public.fw_machine_review_finish(p_id bigint,p_revision uuid,p_decision text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r private.content_reviews;
begin
 if p_decision not in ('allow','review','reject') then raise exception 'Invalid decision'; end if;
 select * into r from private.content_reviews where id=p_id for update;
 if not found or r.revision<>p_revision or r.source<>'automatic' or r.status<>'pending' then raise exception 'Stale review'; end if;
 update private.content_reviews set status=case p_decision when 'allow' then 'approved' when 'reject' then 'rejected' else 'pending' end,
  reason=left(p_reason,500),updated_at=now() where id=p_id;
 insert into private.content_review_history(review_id,kind,target_id,snapshot,action,reason)
 values(r.id,r.kind,r.target_id,r.snapshot,'machine_'||p_decision,left(p_reason,500));
 insert into public.notifications(user_id,type,target_type,target_id,content) values(r.owner_id,'system','content_review',r.target_id,
 case p_decision when 'allow' then '你提交的内容已通过审核。' when 'reject' then '你提交的内容未通过审核：' else '你提交的内容正在等待人工复核：' end||case when p_decision='allow' then '' else left(p_reason,240) end);
end;$$;
revoke all on function public.fw_machine_review_read(bigint,uuid),public.fw_machine_review_finish(bigint,uuid,text,text) from public,anon,authenticated;
grant execute on function public.fw_machine_review_read(bigint,uuid),public.fw_machine_review_finish(bigint,uuid,text,text) to service_role;
create function private.content_review_dispatch() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.source='automatic' and new.status='pending' and (tg_op='INSERT' or new.revision is distinct from old.revision) then
  perform net.http_post(url:='https://ekbovsmxbiplhyrzxoyw.supabase.co/functions/v1/fw-content-review',
   headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',new.id,'revision',new.revision),timeout_milliseconds:=2000);
 end if;
 return new;
exception when others then
 -- Dispatch failure is fail-closed: item stays hidden in the human queue.
 return new;
end;$$;
revoke all on function private.content_review_dispatch() from public,anon,authenticated;
create trigger content_review_dispatch after insert or update on private.content_reviews for each row execute function private.content_review_dispatch();
create function private.content_notification_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.fw_content_visible(new.target_type,new.target_id::text) then new.content:='相关内容正在审核。';end if;
 return new;
end;$$;
revoke all on function private.content_notification_guard() from public,anon,authenticated;
create trigger aa_content_notification_guard before insert on public.notifications for each row execute function private.content_notification_guard();
notify pgrst,'reload schema';
