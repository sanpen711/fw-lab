-- Deliver the approved welcome once, after a non-anonymous account is verified.
-- No backfill: existing accounts receive no message when this migration runs.
create or replace function public.fw_ensure_admin_welcome_message(target_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  admin_id uuid := public.fw_admin_user_id();
  conv_id bigint;
  welcome_text text := $welcome$欢迎来到 F.w 研究所！发发牢骚、聊聊日常，找点共鸣，也找个同频的搭子。

这里允许你偶尔的负能量，但交流也要有边界：情绪可以表达，请勿攻击或骚扰他人；匿名让表达更自在，也请为自己的发言负责。$welcome$;
begin
  if target_user_id is null or admin_id is null or target_user_id = admin_id then return; end if;
  if not exists(select 1 from auth.users u where u.id=target_user_id
    and u.email_confirmed_at is not null and not u.is_anonymous) then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fw:signup-welcome:'||target_user_id::text,0));
  select c.id into conv_id from public.conversations c
    where (c.user_one_id=admin_id and c.user_two_id=target_user_id)
       or (c.user_one_id=target_user_id and c.user_two_id=admin_id) limit 1;
  -- Include deleted welcome messages, and recognise the previous wording too.
  if conv_id is not null and exists(
    select 1 from public.private_messages m where m.conversation_id=conv_id and m.sender_id=admin_id
      and (m.content like '欢迎进入 F.w 研究所。%' or m.content like '欢迎来到 F.w 研究所！%')
  ) then return; end if;
  perform public.fw_ensure_admin_friendship(target_user_id);
  if conv_id is null then
    begin
      insert into public.conversations(user_one_id,user_two_id)
        values(admin_id,target_user_id) returning id into conv_id;
    exception when unique_violation then
      select c.id into conv_id from public.conversations c
        where (c.user_one_id=admin_id and c.user_two_id=target_user_id)
           or (c.user_one_id=target_user_id and c.user_two_id=admin_id) limit 1;
    end;
  end if;
  if conv_id is null then raise exception 'Unable to create signup welcome conversation'; end if;
  -- The private-message insert trigger emits exactly one recipient notification.
  insert into public.private_messages(conversation_id,sender_id,content) values(conv_id,admin_id,welcome_text);
  update public.conversations set updated_at=now() where id=conv_id;
end;
$function$;
revoke execute on function public.fw_ensure_admin_welcome_message(uuid) from public,anon,authenticated;
grant execute on function public.fw_ensure_admin_welcome_message(uuid) to service_role;

-- private_messages references conversations, not the retired private_conversations table.
create or replace function public.fw_notify_private_message()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare target uuid;
begin
  select case when c.user_one_id=new.sender_id then c.user_two_id
              when c.user_two_id=new.sender_id then c.user_one_id end
    into target from public.conversations c where c.id=new.conversation_id;
  if target is null then return new; end if;
  perform public.fw_insert_notification(target,new.sender_id,'private_message',
    'private_conversation',new.conversation_id::text,new.content);
  return new;
end;
$function$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = 'public' as $function$
begin
  insert into public.profiles(id,nickname,avatar_url,email_search)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'nickname',''),'临时研究员'||substring(new.id::text,1,4)),
    new.raw_user_meta_data->>'avatar_url',lower(new.email))
  on conflict(id) do update set email_search=coalesce(public.profiles.email_search,lower(new.email));
  perform public.fw_ensure_admin_friendship(new.id);
  -- Covers trusted account creation with verification already completed.
  if new.email_confirmed_at is not null and not new.is_anonymous then
    perform public.fw_ensure_admin_welcome_message(new.id);
  end if;
  return new;
end;
$function$;

create or replace function private.fw_welcome_after_signup_confirmation()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  perform public.fw_ensure_admin_welcome_message(new.id);
  return new;
end;
$function$;
revoke execute on function private.fw_welcome_after_signup_confirmation() from public,anon,authenticated;
create trigger fw_welcome_after_signup_confirmation
after update of email_confirmed_at on auth.users for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null and not new.is_anonymous)
execute function private.fw_welcome_after_signup_confirmation();

-- Fixtures and their messages/notifications roll back before this DO block ends.
do $test$
declare
  pending_id uuid := gen_random_uuid();
  confirmed_id uuid := gen_random_uuid();
  anonymous_id uuid := gen_random_uuid();
  admin_id uuid := public.fw_admin_user_id();
  conv_id bigint;
  lab_code text := upper(substr(replace(gen_random_uuid()::text,'-',''),1,7));
  expected_text text := $welcome$欢迎来到 F.w 研究所！发发牢骚、聊聊日常，找点共鸣，也找个同频的搭子。

这里允许你偶尔的负能量，但交流也要有边界：情绪可以表达，请勿攻击或骚扰他人；匿名让表达更自在，也请为自己的发言负责。$welcome$;
begin
  if admin_id is null then raise exception 'No active station owner configured'; end if;
  if has_function_privilege('anon','public.fw_ensure_admin_welcome_message(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.fw_ensure_admin_welcome_message(uuid)','EXECUTE')
  then raise exception 'Welcome helper must not be a public sending endpoint'; end if;
  begin
    insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
    values(pending_id,'authenticated','authenticated',pending_id::text||'@welcome-test.invalid',
      jsonb_build_object('nickname','欢迎验证'||left(pending_id::text,8)),'{}',now(),now());
    perform public.fw_ensure_admin_welcome_message(pending_id);
    if exists(select 1 from public.conversations c join public.private_messages m on m.conversation_id=c.id
      where c.user_one_id=pending_id or c.user_two_id=pending_id)
    then raise exception 'Unverified signup received a welcome'; end if;
    update auth.users set email_confirmed_at=now() where id=pending_id;
    select c.id into strict conv_id from public.conversations c
      where (c.user_one_id=admin_id and c.user_two_id=pending_id)
         or (c.user_two_id=admin_id and c.user_one_id=pending_id);
    if (select count(*) from public.friendships f where f.status='accepted'
      and ((f.requester_id=admin_id and f.receiver_id=pending_id) or
           (f.receiver_id=admin_id and f.requester_id=pending_id)))<>1
    then raise exception 'Confirmed signup must have exactly one accepted station-owner friendship'; end if;
    if (select count(*) from public.private_messages where conversation_id=conv_id
      and sender_id=admin_id and content=expected_text)<>1
    then raise exception 'Confirmed signup did not receive the exact approved welcome once'; end if;
    if (select count(*) from public.notifications where user_id=pending_id and actor_id=admin_id and type='private_message')<>1
    then raise exception 'Welcome must generate exactly one notification for its recipient'; end if;
    perform set_config('request.jwt.claim.sub',pending_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',pending_id,'role','authenticated')::text,true);
    perform public.fw_complete_signup_profile(lab_code,pending_id::text||'@welcome-test.invalid');
    perform public.fw_ensure_admin_welcome_message(pending_id);
    update auth.users set email_confirmed_at=now(),last_sign_in_at=now() where id=pending_id;
    if (select count(*) from public.private_messages where conversation_id=conv_id)<>1
       or (select count(*) from public.notifications where user_id=pending_id and type='private_message')<>1
    then raise exception 'Repeated signup completion or login duplicated the welcome'; end if;
    update public.private_messages set is_deleted=true where conversation_id=conv_id;
    perform public.fw_ensure_admin_welcome_message(pending_id);
    if (select count(*) from public.private_messages where conversation_id=conv_id)<>1
    then raise exception 'Deleting a welcome must not make it resend'; end if;
    update public.private_messages set content=$legacy$欢迎进入 F.w 研究所。这里可以发废话、找共鸣、找搭子、私聊放松，但请注意边界：可以表达情绪，不要攻击他人；可以匿名发言，不代表可以不负责。$legacy$ where conversation_id=conv_id;
    perform public.fw_ensure_admin_welcome_message(pending_id);
    if (select count(*) from public.private_messages where conversation_id=conv_id)<>1
    then raise exception 'Previous welcome wording was not recognised'; end if;
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
    values(confirmed_id,'authenticated','authenticated',confirmed_id::text||'@welcome-test.invalid',now(),
      jsonb_build_object('nickname','欢迎验证'||left(confirmed_id::text,8)),'{}',now(),now());
    if (select count(*) from public.conversations c join public.private_messages m on m.conversation_id=c.id
      where (c.user_one_id=confirmed_id or c.user_two_id=confirmed_id) and m.content=expected_text)<>1
    then raise exception 'Already-verified signup did not receive its welcome'; end if;
    insert into auth.users(id,aud,role,email_confirmed_at,is_anonymous,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
    values(anonymous_id,'authenticated','authenticated',now(),true,
      jsonb_build_object('nickname','欢迎验证'||left(anonymous_id::text,8)),'{}',now(),now());
    if exists(select 1 from public.conversations c join public.private_messages m on m.conversation_id=c.id
      where c.user_one_id=anonymous_id or c.user_two_id=anonymous_id)
    then raise exception 'Anonymous account received a signup welcome'; end if;
    raise exception using errcode='ZX001',message='signup welcome fixtures passed; roll back fixtures';
  exception when sqlstate 'ZX001' then
    if sqlerrm<>'signup welcome fixtures passed; roll back fixtures' then raise; end if;
  end;
  if exists(select 1 from auth.users where id in (pending_id,confirmed_id,anonymous_id))
  then raise exception 'Welcome test fixtures were not rolled back'; end if;
end;
$test$;
