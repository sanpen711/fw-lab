-- Run through the SQL connector. All fixtures and existing-row edits roll back.
begin;
do $$
declare ids uuid[]; a uuid; b uuid; c uuid; f bigint; ca bigint; cb bigint; count_notices integer;
begin
  select array_agg(id) into ids from (select id from public.profiles
    where id<>public.fw_admin_user_id() and not coalesce(is_banned,false)
    order by created_at limit 3) p;
  if cardinality(ids)<3 then raise exception 'Need three test participants'; end if;
  a:=ids[1];b:=ids[2];c:=ids[3];
  perform set_config('fw.test_a',a::text,true);perform set_config('fw.test_b',b::text,true);perform set_config('fw.test_c',c::text,true);
  delete from public.friendships where least(requester_id,receiver_id)=least(a,b) and greatest(requester_id,receiver_id)=greatest(a,b);
  perform set_config('request.jwt.claim.sub',a::text,true);
  if public.fw_send_friend_request(b)<>'sent' then raise exception 'Initial request failed'; end if;
  select id into f from public.friendships where requester_id=a and receiver_id=b;
  select count(*) into count_notices from public.notifications where user_id=b and type='friend_request' and target_id=f::text and not is_read;
  if count_notices<>1 then raise exception 'Duplicate request: %',count_notices; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.fw_respond_friendship(f,false);
  if exists(select 1 from public.notifications where user_id=b and type='friend_request' and target_id=f::text and not is_read) then raise exception 'Rejected request stays unread'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.fw_send_friend_request(b);
  if (select count(*) from public.notifications where user_id=b and type='friend_request' and target_id=f::text and not is_read)<>1 then raise exception 'Retry request notice wrong'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.fw_respond_friendship(f,true);
  if (select count(*) from public.notifications where user_id=a and type='friend_accept' and target_id=f::text)<>1 then raise exception 'Duplicate acceptance'; end if;
  if exists(select 1 from public.notifications where user_id=b and type='friend_request' and target_id=f::text and not is_read) then raise exception 'Accepted request stays unread'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  ca:=public.fw_get_or_create_conversation(b);
  delete from public.friendships where least(requester_id,receiver_id)=least(a,c) and greatest(requester_id,receiver_id)=greatest(a,c);
  insert into public.friendships(requester_id,receiver_id,status) values(a,c,'accepted');
  cb:=public.fw_get_or_create_conversation(c);
  insert into public.private_messages(conversation_id,sender_id,content,created_at)
    select ca,b,'buddy fixture '||i,now()+interval '1 day'+i*interval '1 second' from generate_series(1,400) i;
  insert into public.private_messages(conversation_id,sender_id,content,created_at) values(ca,a,'latest outgoing fixture',now()+interval '2 days');
  insert into public.private_messages(conversation_id,sender_id,content,created_at) values(cb,c,'quiet buddy fixture',now()+interval '1 day');
  perform public.fw_insert_notification(a,b,'private_message','private_message',
    (select id::text from public.private_messages where conversation_id=ca and content='buddy fixture 400'),'fixture unread');
  perform set_config('fw.test_ca',ca::text,true);perform set_config('fw.test_cb',cb::text,true);
end;
$$;
set local role authenticated;
do $$
declare a uuid:=current_setting('fw.test_a')::uuid; b uuid:=current_setting('fw.test_b')::uuid;
  c uuid:=current_setting('fw.test_c')::uuid; ca bigint:=current_setting('fw.test_ca')::bigint; f bigint;
begin
  perform set_config('request.jwt.claim.sub',a::text,true);
  if not exists(select 1 from public.fw_mobile_buddy_inbox() where user_id=b and message->>'content'='latest outgoing fixture' and unread) then raise exception 'Outgoing latest hides incoming unread'; end if;
  if not exists(select 1 from public.fw_mobile_buddy_inbox() where user_id=c and message->>'content'='quiet buddy fixture') then raise exception 'Busy conversation suppressed quiet peer'; end if;
  if exists(select 1 from public.fw_mobile_buddy_inbox() where user_id=a) then raise exception 'Inbox scope leaked'; end if;
  update public.notifications set is_read=true where user_id=a and actor_id=b and type='private_message';
  if exists(select 1 from public.fw_mobile_buddy_inbox() where user_id=b and unread) then raise exception 'Cross-device read not reflected'; end if;
  perform set_config('request.jwt.claim.sub',c::text,true);
  if exists(select 1 from public.private_messages where conversation_id=ca) then raise exception 'RLS leaked private conversation'; end if;
  if exists(select 1 from public.notifications where user_id=a) then raise exception 'RLS leaked another inbox'; end if;
  if exists(select 1 from public.fw_mobile_buddy_inbox() where conversation_id=ca) then raise exception 'RPC leaked another conversation'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  select id into f from public.friendships where requester_id=a and receiver_id=b and status='accepted';
  perform public.fw_remove_friendship(f);
  if exists(select 1 from public.notifications where target_id=f::text and target_type='friendship' and user_id=a and not is_read) then raise exception 'Removed friendship leaves badge'; end if;
  perform public.fw_send_friend_request(b);
  select id into f from public.friendships where requester_id=a and receiver_id=b and status='pending';
  perform public.fw_remove_friendship(f);
  perform set_config('request.jwt.claim.sub',b::text,true);
  if exists(select 1 from public.notifications where target_id=f::text and target_type='friendship' and not is_read) then raise exception 'Withdrawn request leaves badge'; end if;
end;
$$;
rollback;
select 'passed: one request/accept notice, rejection/retry/withdrawal, busy/quiet inbox, cross-device read, authenticated RLS' as checks;
