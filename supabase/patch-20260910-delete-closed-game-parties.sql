-- F.w 研究所：结束组队时直接删除房间和关联记录。

create or replace function public.fw_close_game_party(p_party_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_not_banned() then raise exception '请先登录。'; end if;

  perform 1
  from public.game_parties
  where id=p_party_id and captain_id=me and status in ('open','full')
  for update;
  if not found then raise exception '房间不存在或无权结束。'; end if;

  delete from public.notifications
  where target_type='game_party' and target_id=p_party_id::text;
  delete from public.game_parties
  where id=p_party_id and captain_id=me;
end;
$$;

delete from public.notifications n
using public.game_parties p
where n.target_type='game_party'
  and n.target_id=p.id::text
  and p.status in ('closed','cancelled');

delete from public.game_parties
where status in ('closed','cancelled');

revoke all on function public.fw_close_game_party(bigint) from public,anon,authenticated;
grant execute on function public.fw_close_game_party(bigint) to authenticated;

notify pgrst,'reload schema';
