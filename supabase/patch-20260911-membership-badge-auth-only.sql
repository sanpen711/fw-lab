-- 会员标识只需要向已登录用户展示，匿名访问不开放 SECURITY DEFINER 函数。

begin;

revoke all on function public.fw_has_active_membership(uuid) from public,anon,authenticated;
grant execute on function public.fw_has_active_membership(uuid) to authenticated;

commit;

notify pgrst,'reload schema';
