-- Execute as postgres. The temporary accounts and messages are rolled back.
begin;
do $$
declare
  sender uuid := gen_random_uuid();
  recipient uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  conversation bigint;
  recent bigint;
  old bigint;
begin
  insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
  select id,'authenticated','authenticated','recall-test-'||id||'@example.invalid',
    jsonb_build_object('nickname','撤回测试'||left(id::text,6)),'{}'::jsonb,now(),now()
  from unnest(array[sender,recipient,outsider]) id;
  insert into public.conversations(user_one_id,user_two_id)
    values(sender,recipient) returning id into conversation;
  insert into public.private_messages(conversation_id,sender_id,content,created_at)
    values(conversation,sender,'过期测试消息',now()-interval '3 minutes') returning id into old;
  insert into public.private_messages(conversation_id,sender_id,content)
    values(conversation,sender,'待撤回测试消息') returning id into recent;
  perform set_config('fw.test.sender',sender::text,true);
  perform set_config('fw.test.recipient',recipient::text,true);
  perform set_config('fw.test.outsider',outsider::text,true);
  perform set_config('fw.test.recent',recent::text,true);
  perform set_config('fw.test.old',old::text,true);
end;
$$;

set local role authenticated;
do $$
declare
  recent bigint := current_setting('fw.test.recent')::bigint;
  expired bigint := current_setting('fw.test.old')::bigint;
  recalled jsonb;
begin
  perform set_config('request.jwt.claim.sub',current_setting('fw.test.recipient'),true);
  begin
    perform public.fw_recall_private_message(recent);
    raise exception 'Recipient recalled a message they did not send';
  exception when raise_exception then
    if sqlerrm <> '只能撤回自己发送的消息。' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub',current_setting('fw.test.sender'),true);
  begin
    perform public.fw_recall_private_message(expired);
    raise exception 'Expired recall was allowed';
  exception when raise_exception then
    if sqlerrm <> '消息发送超过 2 分钟，无法撤回。' then raise; end if;
  end;
  recalled := public.fw_recall_private_message(recent);
  if recalled->>'recalled_at' is null or recalled->>'content' <> '已撤回一条消息' then
    raise exception 'Recall did not redact the message';
  end if;
  if public.fw_recall_private_message(recent) <> recalled then
    raise exception 'Recall retry changed the result';
  end if;

  perform set_config('request.jwt.claim.sub',current_setting('fw.test.recipient'),true);
  if not exists (select 1 from public.private_messages where id=recent and recalled_at is not null and content='已撤回一条消息') then
    raise exception 'Recipient cannot see the recalled message state';
  end if;
  if exists (select 1 from public.notifications where type='private_message' and content='待撤回测试消息') then
    raise exception 'The original message remains in a notification';
  end if;

  perform set_config('request.jwt.claim.sub',current_setting('fw.test.outsider'),true);
  if exists (select 1 from public.private_messages where id=recent) then
    raise exception 'Outsider can read the message';
  end if;
end;
$$;
reset role;
rollback;
select 'Private message recall, time limit, participant RLS and notification redaction verified' as verified;
