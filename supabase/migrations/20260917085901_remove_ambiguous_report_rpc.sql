-- PostgREST cannot resolve the four-argument admin call while this older
-- five-argument overload has defaults for the extra argument (PGRST203).
-- Keep the current four-argument function, which handles both positive chat
-- report IDs and negative site report IDs returned by admin_list_chat_reports.
drop function if exists public.admin_resolve_chat_report(bigint,text,text,boolean,text);

alter function public.admin_resolve_chat_report(bigint,text,text,boolean)
  set search_path = '';

revoke all on function public.admin_resolve_chat_report(bigint,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.admin_resolve_chat_report(bigint,text,text,boolean)
  to authenticated;

notify pgrst, 'reload schema';
