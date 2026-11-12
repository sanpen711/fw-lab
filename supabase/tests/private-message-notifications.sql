-- Execute as postgres. All test accounts, messages and notifications are rolled back.
begin;
do $$
declare
  sender uuid := gen_random_uuid();
  recipient uuid := gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
  select id,'authenticated','authenticated','private-notice-test-'||id||'@example.invalid',
    jsonb_build_object('nickname','提醒测试'||left(id::text,6)),'{}'::jsonb,now(),now()
  from unnest(array[sender,recipient]) id;
  insert into public.friendships(requester_id,receiver_id,status)
  values(sender,recipient,'accepted');
  perform set_config('fw.test.sender',sender::text,true);
  perform set_config('fw.test.recipient',recipient::text,true);
end;
$$;

set local role authenticated;
do $$
declare
  sender uuid := current_setting('fw.test.sender')::uuid;
  recipient uuid := current_setting('fw.test.recipient')::uuid;
  conversation bigint;
begin
  perform set_config('request.jwt.claim.sub',sender::text,true);
  conversation := public.fw_send_private_message_to_user(recipient,'发送入口测试 1');
  perform public.fw_send_private_message_to_user(recipient,'发送入口测试 2');
  perform public.fw_send_private_message_to_user(recipient,'发送入口测试 3');
  perform public.fw_send_private_message(conversation,'旧版发送测试 4');
  perform public.fw_send_private_message(conversation,'旧版发送测试 5');
  if exists(select 1 from public.fw_private_unread_counts() where actor_id=recipient) then
    raise exception 'Sender can see the recipient unread state';
  end if;
  perform set_config('fw.test.conversation',conversation::text,true);
end;
$$;

reset role;
insert into public.private_messages(conversation_id,sender_id,content,created_at)
values(current_setting('fw.test.conversation')::bigint,current_setting('fw.test.sender')::uuid,
  '直接写入测试',now()+interval '1 second');

set local role authenticated;
do $$
declare
  sender uuid := current_setting('fw.test.sender')::uuid;
  recipient uuid := current_setting('fw.test.recipient')::uuid;
  unread_count bigint;
begin
  perform set_config('request.jwt.claim.sub',recipient::text,true);
  select unread into unread_count from public.fw_private_unread_counts() where actor_id=sender;
  if unread_count is distinct from 6::bigint then
    raise exception 'Expected six notifications from six messages, got %',unread_count;
  end if;
  if (select count(distinct target_id) from public.notifications n
      where n.user_id=recipient and n.actor_id=sender and n.type='private_message'
      and n.target_type='private_message') <> 6 then
    raise exception 'Notifications must identify six distinct messages';
  end if;
  update public.notifications set is_read=true
  where user_id=recipient and actor_id=sender and type='private_message' and not is_read
    and created_at<=now();
  select unread into unread_count from public.fw_private_unread_counts() where actor_id=sender;
  if unread_count is distinct from 1::bigint then
    raise exception 'The newer unseen message must stay unread';
  end if;
  update public.notifications set is_read=true
  where user_id=recipient and actor_id=sender and type='private_message' and not is_read;
  if exists(select 1 from public.fw_private_unread_counts() where actor_id=sender) then
    raise exception 'The read conversation still has unread notifications';
  end if;
end;
$$;
reset role;
rollback;
select 'Five RPC messages, one direct message and the read watermark verified' as verified;
