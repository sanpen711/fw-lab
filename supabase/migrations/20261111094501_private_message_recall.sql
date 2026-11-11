alter table public.private_messages add column recalled_at timestamptz;

CREATE OR REPLACE FUNCTION private.content_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cfg private.content_review_targets; payload jsonb:=to_jsonb(new); old_payload jsonb; owner_id uuid; col text; changed boolean:=tg_op='INSERT';
begin
 select * into strict cfg from private.content_review_targets where table_name=tg_table_name;
 if tg_op='UPDATE' then
  old_payload:=to_jsonb(old);
  -- A recall redacts the message without resubmitting it for content review.
  if tg_table_name='private_messages'
     and old_payload->>'recalled_at' is null and payload->>'recalled_at' is not null
     and payload->>'content'='已撤回一条消息'
     and payload - array['content','recalled_at'] = old_payload - array['content','recalled_at'] then
   return new;
  end if;
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
end;$function$;

-- Realtime must use the participant list of the table referenced by conversation_id.
create policy private_messages_canonical_participants on public.private_messages
  as restrictive for select to anon, authenticated
  using (conversation_id in (
    select c.id from public.conversations c
    where (select auth.uid()) in (c.user_one_id, c.user_two_id)
  ));

create function public.fw_recall_private_message(p_message_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  message public.private_messages%rowtype;
begin
  if caller is null then
    raise exception '请先登录。';
  end if;

  select m.* into message
  from public.private_messages m
  join public.conversations c on c.id=m.conversation_id
  where m.id=p_message_id and m.sender_id=caller and not m.is_deleted
    and caller in (c.user_one_id,c.user_two_id)
  for update of m;

  if not found then
    raise exception '只能撤回自己发送的消息。';
  end if;
  if message.recalled_at is not null then
    return to_jsonb(message);
  end if;
  if message.created_at is null or statement_timestamp() > message.created_at + interval '2 minutes' then
    raise exception '消息发送超过 2 分钟，无法撤回。';
  end if;

  update public.notifications
    set content='已撤回一条消息', is_read=true
    where type='private_message' and actor_id=caller
      and (
        (target_type='private_message' and target_id=message.id::text)
        or (target_type='private_conversation' and target_id=message.conversation_id::text
          and created_at=message.created_at and content=left(message.content,120))
      )
      and user_id in (
        select case when c.user_one_id=caller then c.user_two_id else c.user_one_id end
        from public.conversations c where c.id=message.conversation_id
      );

  update public.private_messages
    set content='已撤回一条消息', recalled_at=statement_timestamp()
    where id=message.id
    returning * into message;
  return to_jsonb(message);
end;
$$;

revoke all on function public.fw_recall_private_message(bigint) from public, anon;
grant execute on function public.fw_recall_private_message(bigint) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='private_messages'
  ) then
    alter publication supabase_realtime add table public.private_messages;
  end if;
end;
$$;
