-- The callable API keeps the existing name while the privileged function lives
-- outside the schemas exposed by PostgREST.
alter function public.fw_recall_private_message(bigint) set schema private;

create function public.fw_recall_private_message(p_message_id bigint)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.fw_recall_private_message(p_message_id);
$$;

revoke all on function public.fw_recall_private_message(bigint) from public, anon;
grant execute on function public.fw_recall_private_message(bigint) to authenticated;
