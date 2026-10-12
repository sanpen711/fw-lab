-- Independent chat rooms; password hashes never enter the exposed schema.
create schema if not exists private;
create table public.chat_rooms (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 40), description text not null default '' check(char_length(description)<=200),
 join_mode text not null default 'direct' check(join_mode in ('direct','approval')), has_password boolean not null default false,
 retention_days integer not null default 7 check(retention_days in (0,3,7,30)), expires_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.chat_room_members (
 room_id uuid not null references public.chat_rooms(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 joined_at timestamptz not null default now(), primary key(room_id,user_id)
);
create table public.chat_room_requests (
 room_id uuid not null references public.chat_rooms(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','rejected')), created_at timestamptz not null default now(), primary key(room_id,user_id)
);
create table public.chat_room_messages (
 id bigint generated always as identity primary key, room_id uuid not null references public.chat_rooms(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade, content text not null default '' check(char_length(content)<=1000),
 media_path text, sticker_url text, created_at timestamptz not null default now(),
 check(char_length(btrim(content))>0 or media_path is not null or sticker_url is not null)
);
create table public.chat_room_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 room_id uuid not null, kind text not null, created_at timestamptz not null default now()
);
create table private.chat_room_passwords(room_id uuid primary key references public.chat_rooms(id) on delete cascade,password_hash text not null);
create table private.chat_room_join_attempts(room_id uuid not null references public.chat_rooms(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,failures integer not null default 0,last_at timestamptz not null default now(),primary key(room_id,user_id));
create table private.chat_room_media_gc(bucket text not null,path text not null,queued_at timestamptz not null default now(),primary key(bucket,path));
create table private.chat_room_cleanup_tokens(token uuid primary key default gen_random_uuid(),expires_at timestamptz not null default now()+interval '2 minutes');
create index chat_rooms_owner_idx on public.chat_rooms(owner_id,created_at desc);
create index chat_rooms_expiry_idx on public.chat_rooms(expires_at) where expires_at is not null;
create index chat_room_members_user_idx on public.chat_room_members(user_id,room_id);
create index chat_room_requests_user_idx on public.chat_room_requests(user_id,status,room_id);
create index chat_room_requests_pending_idx on public.chat_room_requests(room_id) where status='pending';
create index chat_room_messages_room_idx on public.chat_room_messages(room_id,id desc);
create index chat_room_messages_user_idx on public.chat_room_messages(user_id);
create index chat_room_messages_media_idx on public.chat_room_messages(media_path) where media_path is not null;
create index chat_room_events_user_idx on public.chat_room_events(user_id,created_at desc);

create function private.chat_room_member(p_room_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_banned)
 and exists(select 1 from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id where m.room_id=p_room_id and m.user_id=auth.uid() and (r.expires_at is null or r.expires_at>now()));
$$;
create function private.chat_room_path_member(p_path text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or split_part(p_path,'/',2)<>'rooms' or split_part(p_path,'/',3)!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 return private.chat_room_member(split_part(p_path,'/',3)::uuid);
end;$$;

alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_room_requests enable row level security;
alter table public.chat_room_messages enable row level security;
alter table public.chat_room_events enable row level security;
alter table private.chat_room_passwords enable row level security;
alter table private.chat_room_join_attempts enable row level security;
alter table private.chat_room_media_gc enable row level security;
alter table private.chat_room_cleanup_tokens enable row level security;
revoke all on public.chat_rooms,public.chat_room_members,public.chat_room_requests,public.chat_room_messages,public.chat_room_events from public,anon,authenticated;
revoke all on private.chat_room_passwords,private.chat_room_join_attempts,private.chat_room_media_gc,private.chat_room_cleanup_tokens from public,anon,authenticated;
grant select on public.chat_rooms,public.chat_room_members,public.chat_room_requests,public.chat_room_messages,public.chat_room_events to authenticated;
create policy chat_rooms_visible on public.chat_rooms for select to authenticated using ((select auth.uid()) is not null and (select public.is_not_banned()) and (expires_at is null or expires_at>now()));
create policy chat_members_visible on public.chat_room_members for select to authenticated using (private.chat_room_member(room_id));
create policy chat_requests_visible on public.chat_room_requests for select to authenticated using ((select auth.uid())=user_id or exists(select 1 from public.chat_rooms r where r.id=room_id and r.owner_id=(select auth.uid())));
create policy chat_messages_visible on public.chat_room_messages for select to authenticated using (private.chat_room_member(room_id));
create policy chat_events_own on public.chat_room_events for select to authenticated using (user_id=(select auth.uid()));

create function private.chat_room_summary(p_room public.chat_rooms) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p_room.id,'owner_id',p_room.owner_id,'name',p_room.name,'description',p_room.description,'join_mode',p_room.join_mode,'has_password',p_room.has_password,'retention_days',p_room.retention_days,'expires_at',p_room.expires_at,'created_at',p_room.created_at,'updated_at',p_room.updated_at,
 'owner', (select jsonb_build_object('id',p.id,'nickname',p.nickname,'avatar_url',p.avatar_url) from public.profiles p where p.id=p_room.owner_id),
 'member_count',(select count(*) from public.chat_room_members m where m.room_id=p_room.id),
 'joined',exists(select 1 from public.chat_room_members m where m.room_id=p_room.id and m.user_id=auth.uid()),
 'is_owner',p_room.owner_id=auth.uid(),'request_status',(select q.status from public.chat_room_requests q where q.room_id=p_room.id and q.user_id=auth.uid()),
 'pending_count',case when p_room.owner_id=auth.uid() then (select count(*) from public.chat_room_requests q where q.room_id=p_room.id and q.status='pending') else 0 end);
$$;
create function private.chat_room_list(p_filter text,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;
begin
 if auth.uid() is null or not public.is_not_banned() then raise exception '请先登录正常状态的账号。'; end if;
 if p_filter not in ('all','mine','owned','joined','pending') or p_offset<0 then raise exception '房间筛选参数无效。'; end if;
 select coalesce(jsonb_agg(private.chat_room_summary(r) order by r.created_at desc,r.id desc),'[]'::jsonb) into v_rows
 from (select r.* from public.chat_rooms r where (r.expires_at is null or r.expires_at>now()) and (
 p_filter='all' or (p_filter in ('mine','owned') and r.owner_id=auth.uid()) or
 (p_filter in ('mine','joined') and r.owner_id<>auth.uid() and exists(select 1 from public.chat_room_members m where m.room_id=r.id and m.user_id=auth.uid())) or
 (p_filter in ('mine','pending') and exists(select 1 from public.chat_room_requests q where q.room_id=r.id and q.user_id=auth.uid() and q.status='pending')))
 order by r.created_at desc,r.id desc offset p_offset limit 31) r;
 return jsonb_build_object('rooms',case when jsonb_array_length(v_rows)>30 then v_rows-'30'::integer else v_rows end,'has_more',jsonb_array_length(v_rows)>30,'server_time',now());
end;$$;
create function private.chat_room_read(p_room_id uuid,p_before_id bigint) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_room public.chat_rooms;v_messages jsonb;v_members jsonb;v_requests jsonb;
begin
 if auth.uid() is null or not public.is_not_banned() then raise exception '请先登录正常状态的账号。'; end if;
 select * into v_room from public.chat_rooms where id=p_room_id and (expires_at is null or expires_at>now());
 if not found then raise exception '房间已解散或到期。'; end if;
 if not private.chat_room_member(p_room_id) then return jsonb_build_object('room',private.chat_room_summary(v_room),'messages','[]'::jsonb,'members','[]'::jsonb,'requests','[]'::jsonb,'has_more',false,'server_time',now()); end if;
 select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('author',jsonb_build_object('id',p.id,'nickname',p.nickname,'avatar_url',p.avatar_url)) order by m.id),'[]'::jsonb) into v_messages
 from (select * from public.chat_room_messages where room_id=p_room_id and (p_before_id is null or id<p_before_id) order by id desc limit 100) m join public.profiles p on p.id=m.user_id;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'joined_at',m.joined_at,'nickname',p.nickname,'avatar_url',p.avatar_url,'is_owner',m.user_id=v_room.owner_id) order by m.joined_at),'[]'::jsonb) into v_members from public.chat_room_members m join public.profiles p on p.id=m.user_id where m.room_id=p_room_id;
 if v_room.owner_id=auth.uid() then select coalesce(jsonb_agg(jsonb_build_object('user_id',q.user_id,'nickname',p.nickname,'avatar_url',p.avatar_url,'created_at',q.created_at) order by q.created_at),'[]'::jsonb) into v_requests from public.chat_room_requests q join public.profiles p on p.id=q.user_id where q.room_id=p_room_id and q.status='pending'; end if;
 return jsonb_build_object('room',private.chat_room_summary(v_room),'messages',v_messages,'members',v_members,'requests',coalesce(v_requests,'[]'::jsonb),'has_more',jsonb_array_length(v_messages)=100,'server_time',now());
end;$$;
create function private.chat_room_event(p_user uuid,p_room uuid,p_kind text) returns void language sql security definer set search_path='' as $$insert into public.chat_room_events(user_id,room_id,kind) values(p_user,p_room,p_kind);$$;
create function private.chat_room_delete_queue() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.chat_room_media_gc(bucket,path) select 'room-media',name from storage.objects where bucket_id='room-media' and split_part(name,'/',2)='rooms' and split_part(name,'/',3)=old.id::text on conflict do nothing;
 insert into public.chat_room_events(user_id,room_id,kind) select user_id,old.id,'closed' from (select user_id from public.chat_room_members where room_id=old.id union select user_id from public.chat_room_requests where room_id=old.id) u join public.profiles p on p.id=u.user_id;
 return old;
end;$$;
create trigger chat_room_before_delete before delete on public.chat_rooms for each row execute function private.chat_room_delete_queue();
create function private.chat_message_delete_queue() returns trigger language plpgsql security definer set search_path='' as $$begin if old.media_path is not null then insert into private.chat_room_media_gc(bucket,path) values('room-media',old.media_path) on conflict do nothing; end if;return old;end;$$;
create trigger chat_message_before_delete before delete on public.chat_room_messages for each row execute function private.chat_message_delete_queue();

create function private.chat_room_action(p_action text,p_room_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_room public.chat_rooms;v_name text;v_description text;v_password text;v_days integer;v_mode text;v_hash text;v_target uuid;v_message public.chat_room_messages;v_failures integer;v_last timestamptz;v_password_mode text;
begin
 if v_user is null or not public.is_not_banned() then raise exception '请先登录正常状态的账号。'; end if;
 if p_action in ('create','send') and exists(select 1 from public.profiles where id=v_user and muted_until>now()) then raise exception '账号正在禁言中，暂时不能发布。'; end if;
 if p_action='create' then
  v_name:=btrim(coalesce(p_payload->>'name',''));v_description:=btrim(coalesce(p_payload->>'description',''));v_mode:=coalesce(p_payload->>'join_mode','direct');v_days:=coalesce((p_payload->>'retention_days')::integer,7);v_password:=coalesce(p_payload->>'password','');
  if char_length(v_name) not between 2 and 40 or char_length(v_description)>200 or v_mode not in ('direct','approval') or v_days not in (0,3,7,30) then raise exception '请检查房间名称、简介、加入方式和保存期限。'; end if;
  if v_password<>'' and char_length(v_password) not between 4 and 24 then raise exception '房间密码需要 4–24 位。'; end if;
  insert into public.chat_rooms(owner_id,name,description,join_mode,has_password,retention_days,expires_at) values(v_user,v_name,v_description,v_mode,v_password<>'',v_days,case when v_days=0 then null else now()+make_interval(days=>v_days) end) returning * into v_room;
  insert into public.chat_room_members(room_id,user_id) values(v_room.id,v_user);
  if v_password<>'' then insert into private.chat_room_passwords values(v_room.id,extensions.crypt(v_password,extensions.gen_salt('bf',8))); end if;
  return jsonb_build_object('room_id',v_room.id,'status','joined');
 end if;
 select * into v_room from public.chat_rooms where id=p_room_id for update;
 if not found or (v_room.expires_at is not null and v_room.expires_at<=now()) then raise exception '房间已解散或到期。'; end if;
 if p_action='join' then
  if exists(select 1 from public.chat_room_members where room_id=p_room_id and user_id=v_user) then return jsonb_build_object('status','joined','room_id',p_room_id); end if;
  if v_room.has_password then
   select failures,last_at into v_failures,v_last from private.chat_room_join_attempts where room_id=p_room_id and user_id=v_user;
   if v_failures>=5 and v_last>now()-interval '1 minute' then return jsonb_build_object('error','密码尝试过多，请一分钟后重试。'); end if;
   v_password:=coalesce(p_payload->>'password','');select password_hash into v_hash from private.chat_room_passwords where room_id=p_room_id;
   if char_length(v_password) not between 4 and 24 or v_hash is null or extensions.crypt(v_password,v_hash)<>v_hash then
    insert into private.chat_room_join_attempts(room_id,user_id,failures,last_at) values(p_room_id,v_user,1,now()) on conflict(room_id,user_id) do update set failures=case when private.chat_room_join_attempts.last_at<now()-interval '1 minute' then 1 else private.chat_room_join_attempts.failures+1 end,last_at=now();
    return jsonb_build_object('error','房间密码不正确。');
   end if;
   delete from private.chat_room_join_attempts where room_id=p_room_id and user_id=v_user;
  end if;
  if v_room.join_mode='approval' then
   insert into public.chat_room_requests(room_id,user_id,status) values(p_room_id,v_user,'pending') on conflict(room_id,user_id) do update set status='pending',created_at=now();
   perform private.chat_room_event(v_room.owner_id,p_room_id,'request');return jsonb_build_object('status','pending','room_id',p_room_id);
  end if;
  insert into public.chat_room_members(room_id,user_id) values(p_room_id,v_user) on conflict do nothing;delete from public.chat_room_requests where room_id=p_room_id and user_id=v_user;
  perform private.chat_room_event(v_room.owner_id,p_room_id,'member');return jsonb_build_object('status','joined','room_id',p_room_id);
 elsif p_action='cancel_request' then
  delete from public.chat_room_requests where room_id=p_room_id and user_id=v_user;perform private.chat_room_event(v_room.owner_id,p_room_id,'request');return jsonb_build_object('status','cancelled');
 elsif p_action='leave' then
  if v_user=v_room.owner_id then raise exception '房主请使用解散房间。'; end if;
  delete from public.chat_room_members where room_id=p_room_id and user_id=v_user;delete from public.chat_room_requests where room_id=p_room_id and user_id=v_user;
  perform private.chat_room_event(v_room.owner_id,p_room_id,'member');return jsonb_build_object('status','left');
 elsif p_action='send' then
  if not private.chat_room_member(p_room_id) then raise exception '请先加入房间。'; end if;
  if char_length(coalesce(p_payload->>'content',''))>1000 then raise exception '消息最多 1000 字。'; end if;
  if nullif(p_payload->>'media_path','') is not null then
   if split_part(p_payload->>'media_path','/',1)<>v_user::text or split_part(p_payload->>'media_path','/',2)<>'rooms' or split_part(p_payload->>'media_path','/',3)<>p_room_id::text or not exists(select 1 from storage.objects where bucket_id='room-media' and name=p_payload->>'media_path') then raise exception '图片不存在或无权使用。'; end if;
  end if;
  if nullif(p_payload->>'sticker_url','') is not null and (p_payload->>'sticker_url' not like 'https://ekbovsmxbiplhyrzxoyw.supabase.co/storage/v1/object/public/stickers/%' or char_length(p_payload->>'sticker_url')>2048) then raise exception '表情地址无效。'; end if;
  insert into public.chat_room_messages(room_id,user_id,content,media_path,sticker_url) values(p_room_id,v_user,btrim(coalesce(p_payload->>'content','')),nullif(p_payload->>'media_path',''),nullif(p_payload->>'sticker_url','')) returning * into v_message;
  return jsonb_build_object('message_id',v_message.id);
 elsif p_action='delete_message' then
  select * into v_message from public.chat_room_messages where id=(p_payload->>'message_id')::bigint and room_id=p_room_id;
  if not found then raise exception '消息已经不存在。'; end if;
  if not private.chat_room_member(p_room_id) or (v_message.user_id<>v_user and v_room.owner_id<>v_user) then raise exception '只能删除自己的消息，房主可以管理房间消息。'; end if;
  delete from public.chat_room_messages where id=v_message.id;return jsonb_build_object('status','deleted');
 end if;
 if v_room.owner_id<>v_user then raise exception '只有房主可以进行这个操作。'; end if;
 if p_action in ('accept','reject') then
  v_target:=(p_payload->>'user_id')::uuid;
  if not exists(select 1 from public.chat_room_requests where room_id=p_room_id and user_id=v_target and status='pending') then raise exception '申请已经处理。'; end if;
  if p_action='accept' then
   if not exists(select 1 from public.profiles where id=v_target and not is_banned) then raise exception '申请账号已停用。'; end if;
   insert into public.chat_room_members(room_id,user_id) values(p_room_id,v_target) on conflict do nothing;delete from public.chat_room_requests where room_id=p_room_id and user_id=v_target;
  else update public.chat_room_requests set status='rejected' where room_id=p_room_id and user_id=v_target; end if;
  perform private.chat_room_event(v_target,p_room_id,p_action);return jsonb_build_object('status',p_action);
 elsif p_action='kick' then
  v_target:=(p_payload->>'user_id')::uuid;if v_target=v_user then raise exception '不能移出房主。'; end if;
  delete from public.chat_room_members where room_id=p_room_id and user_id=v_target;delete from public.chat_room_requests where room_id=p_room_id and user_id=v_target;
  perform private.chat_room_event(v_target,p_room_id,'removed');return jsonb_build_object('status','removed');
 elsif p_action='settings' then
  v_name:=btrim(coalesce(p_payload->>'name',v_room.name));v_description:=btrim(coalesce(p_payload->>'description',v_room.description));v_mode:=coalesce(p_payload->>'join_mode',v_room.join_mode);v_password_mode:=coalesce(p_payload->>'password_mode','keep');v_password:=coalesce(p_payload->>'password','');
  if char_length(v_name) not between 2 and 40 or char_length(v_description)>200 or v_mode not in ('direct','approval') or v_password_mode not in ('keep','set','clear') then raise exception '房间设置无效。'; end if;
  if v_password_mode='set' then
   if char_length(v_password) not between 4 and 24 then raise exception '房间密码需要 4–24 位。'; end if;
   insert into private.chat_room_passwords values(p_room_id,extensions.crypt(v_password,extensions.gen_salt('bf',8))) on conflict(room_id) do update set password_hash=excluded.password_hash;v_room.has_password:=true;
  elsif v_password_mode='clear' then delete from private.chat_room_passwords where room_id=p_room_id;v_room.has_password:=false; end if;
  if coalesce(p_payload->>'extend_days','keep')<>'keep' then
   v_days:=(p_payload->>'extend_days')::integer;if v_days not in (0,3,7,30) then raise exception '保存期限无效。'; end if;
   if v_days=0 then v_room.expires_at:=null;v_room.retention_days:=0;
   elsif v_room.expires_at is not null then v_room.expires_at:=greatest(now(),v_room.expires_at)+make_interval(days=>v_days);v_room.retention_days:=v_days;
   else raise exception '永久房间无需延长。';end if;
  end if;
  update public.chat_rooms set name=v_name,description=v_description,join_mode=v_mode,has_password=v_room.has_password,retention_days=v_room.retention_days,expires_at=v_room.expires_at,updated_at=now() where id=p_room_id;
  insert into public.chat_room_events(user_id,room_id,kind) select user_id,p_room_id,'settings' from public.chat_room_members where room_id=p_room_id;
  return jsonb_build_object('status','saved');
 elsif p_action='dissolve' then delete from public.chat_rooms where id=p_room_id;return jsonb_build_object('status','dissolved');
 end if;
 raise exception '未知房间操作。';
end;$$;

create function public.fw_chat_room_list(p_filter text default 'all',p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select private.chat_room_list(p_filter,p_offset);$$;
create function public.fw_chat_room_read(p_room_id uuid,p_before_id bigint default null) returns jsonb language sql security invoker set search_path='' as $$select private.chat_room_read(p_room_id,p_before_id);$$;
create function public.fw_chat_room_action(p_action text,p_room_id uuid default null,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.chat_room_action(p_action,p_room_id,p_payload);$$;
revoke all on function public.fw_chat_room_list(text,integer),public.fw_chat_room_read(uuid,bigint),public.fw_chat_room_action(text,uuid,jsonb) from public,anon;
revoke all on function private.chat_room_member(uuid),private.chat_room_path_member(text),private.chat_room_summary(public.chat_rooms),private.chat_room_list(text,integer),private.chat_room_read(uuid,bigint),private.chat_room_action(text,uuid,jsonb),private.chat_room_event(uuid,uuid,text),private.chat_room_delete_queue(),private.chat_message_delete_queue() from public,anon,authenticated,service_role;
grant usage on schema private to authenticated,service_role;
grant execute on function private.chat_room_member(uuid),private.chat_room_path_member(text),private.chat_room_list(text,integer),private.chat_room_read(uuid,bigint),private.chat_room_action(text,uuid,jsonb) to authenticated;
grant execute on function public.fw_chat_room_list(text,integer),public.fw_chat_room_read(uuid,bigint),public.fw_chat_room_action(text,uuid,jsonb) to authenticated;

-- Bucket creation itself is performed through the Storage API.
create policy room_media_read on storage.objects for select to authenticated using(bucket_id='room-media' and private.chat_room_path_member(name));
create policy room_media_insert on storage.objects for insert to authenticated with check(bucket_id='room-media' and (storage.foldername(name))[1]=(select auth.uid())::text and private.chat_room_path_member(name));
create policy room_media_delete on storage.objects for delete to authenticated using(bucket_id='room-media' and (storage.foldername(name))[1]=(select auth.uid())::text and private.chat_room_path_member(name));

create function private.chat_room_expire() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.chat_rooms where expires_at<=now();
 delete from public.chat_room_events where created_at<now()-interval '7 days';
 delete from private.chat_room_cleanup_tokens where expires_at<=now();
 insert into private.chat_room_media_gc(bucket,path) select 'room-media',o.name from storage.objects o where o.bucket_id='room-media' and o.created_at<now()-interval '1 hour' and not exists(select 1 from public.chat_room_messages m where m.media_path=o.name) on conflict do nothing;
end;$$;
create function private.chat_room_gc_claim(p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$declare v_token uuid;begin delete from private.chat_room_cleanup_tokens where token=p_token and expires_at>now() returning token into v_token;return v_token is not null;end;$$;
create function private.chat_room_gc_jobs() returns jsonb language plpgsql security definer set search_path='' as $$declare v_jobs jsonb;begin perform private.chat_room_expire();select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_jobs from (select bucket,path from private.chat_room_media_gc order by queued_at limit 200) q;return v_jobs;end;$$;
create function private.chat_room_gc_ack(p_bucket text,p_paths text[]) returns void language sql security definer set search_path='' as $$delete from private.chat_room_media_gc where bucket=p_bucket and path=any(p_paths);$$;
create function public.fw_chat_gc_claim(p_token uuid) returns boolean language sql security invoker set search_path='' as $$select private.chat_room_gc_claim(p_token);$$;
create function public.fw_chat_gc_jobs() returns jsonb language sql security invoker set search_path='' as $$select private.chat_room_gc_jobs();$$;
create function public.fw_chat_gc_ack(p_bucket text,p_paths text[]) returns void language sql security invoker set search_path='' as $$select private.chat_room_gc_ack(p_bucket,p_paths);$$;
revoke all on function private.chat_room_expire(),private.chat_room_gc_claim(uuid),private.chat_room_gc_jobs(),private.chat_room_gc_ack(text,text[]),public.fw_chat_gc_claim(uuid),public.fw_chat_gc_jobs(),public.fw_chat_gc_ack(text,text[]) from public,anon,authenticated,service_role;
grant execute on function private.chat_room_gc_claim(uuid),private.chat_room_gc_jobs(),private.chat_room_gc_ack(text,text[]),public.fw_chat_gc_claim(uuid),public.fw_chat_gc_jobs(),public.fw_chat_gc_ack(text,text[]) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create function private.chat_room_request_cleanup() returns bigint language plpgsql security definer set search_path='' as $$declare v_token uuid;v_id bigint;begin
 perform private.chat_room_expire();
 insert into private.chat_room_cleanup_tokens default values returning token into v_token;
 select net.http_post(url:='https://ekbovsmxbiplhyrzxoyw.supabase.co/functions/v1/chat-room-maintenance',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('token',v_token),timeout_milliseconds:=10000) into v_id;
 return v_id;
end;$$;
revoke all on function private.chat_room_request_cleanup() from public,anon,authenticated,service_role;
select cron.schedule('fw-chat-room-expiry','* * * * *','select private.chat_room_expire();');
select cron.schedule('fw-chat-room-media-gc','*/5 * * * *','select private.chat_room_request_cleanup();');

alter publication supabase_realtime add table public.chat_rooms,public.chat_room_messages,public.chat_room_events;
notify pgrst,'reload schema';
