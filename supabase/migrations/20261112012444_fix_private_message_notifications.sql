-- A message creates its notification in one place, for either send RPC
-- and for messages inserted by the signup welcome flow.
create or replace function public.fw_notify_private_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare recipient uuid;
begin
  select case when c.user_one_id=new.sender_id then c.user_two_id
              when c.user_two_id=new.sender_id then c.user_one_id end
    into recipient from public.conversations c where c.id=new.conversation_id;
  if recipient is null then return new; end if;
  insert into public.notifications(user_id,actor_id,type,target_type,target_id,content,created_at)
    values(recipient,new.sender_id,'private_message','private_message',new.id::text,left(new.content,80),coalesce(new.created_at,transaction_timestamp()));
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.fw_send_private_message_to_user(target_user_id uuid, message_text text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  conv_id bigint;
  clean_text text := trim(coalesce(message_text, ''));
begin
  if me is null then
    raise exception '请先登录。';
  end if;

  if target_user_id is null or target_user_id = me then
    raise exception '无法发送私聊。';
  end if;

  if not public.can_chat() then
    raise exception '当前账号无法发送消息。';
  end if;

  if char_length(clean_text) < 1 or char_length(clean_text) > 300 then
    raise exception '私聊最多 300 字。';
  end if;

  conv_id := public.fw_get_or_create_conversation(target_user_id);

  insert into public.private_messages(conversation_id, sender_id, content)
  values(conv_id, me, clean_text);

  update public.conversations
  set updated_at = now()
  where id = conv_id;

  return conv_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fw_send_private_message(target_conversation_id bigint, message_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  c public.conversations;
  clean_text text := trim(coalesce(message_text, ''));
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION '请先登录。';
  END IF;

  IF NOT public.can_chat() THEN
    RAISE EXCEPTION '当前账号无法发送消息。';
  END IF;

  IF target_conversation_id IS NULL THEN
    RAISE EXCEPTION '私聊会话不存在，请关闭窗口重新打开私聊。';
  END IF;

  IF char_length(clean_text) < 1 OR char_length(clean_text) > 300 THEN
    RAISE EXCEPTION '私聊最多 300 字。';
  END IF;

  SELECT * INTO c
  FROM public.conversations
  WHERE id = target_conversation_id
    AND (
      user_one_id = me
      OR user_two_id = me
    )
  LIMIT 1;

  IF c.id IS NULL THEN
    RAISE EXCEPTION '私聊会话不存在或无权发送，请关闭窗口重新打开私聊。';
  END IF;

  INSERT INTO public.private_messages(conversation_id, sender_id, content)
  VALUES(c.id, me, clean_text);

  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = c.id;

END;
$function$;

-- Match the old two-notification writers by actual message, participants and
-- transaction time. Keep read state if either copy had already been read.
with duplicates as materialized (
  select canonical.id canonical_id, old.id duplicate_id, old.is_read
  from public.notifications canonical
  join public.private_messages m on canonical.target_id=m.id::text and canonical.actor_id=m.sender_id
  join public.notifications old on old.target_type='private_conversation'
    and old.target_id=m.conversation_id::text
    and old.user_id=canonical.user_id and old.actor_id=canonical.actor_id
    and old.created_at=canonical.created_at and old.type='private_message'
  where canonical.type='private_message' and canonical.target_type='private_message'
), read_ids as (
  select duplicate_id id from duplicates
  union
  select canonical_id id from duplicates where is_read
)
update public.notifications n set is_read=true
from read_ids where n.id=read_ids.id and not n.is_read;

-- Both desktop badges use this one server snapshot, including for long histories.
create function public.fw_private_unread_counts()
returns table(actor_id uuid, unread bigint)
language sql stable security invoker set search_path=''
as $$
  select n.actor_id, count(*)
  from public.notifications n
  where n.user_id=(select auth.uid()) and n.type='private_message'
    and not n.is_read and n.actor_id is not null
  group by n.actor_id
  order by n.actor_id;
$$;

revoke all on function public.fw_private_unread_counts() from public, anon;
grant execute on function public.fw_private_unread_counts() to authenticated;

-- Notification rows are only selectable by their recipient under the existing RLS.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
