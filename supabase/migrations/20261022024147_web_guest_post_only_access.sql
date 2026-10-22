-- Apply after the counts-only browser frontend has been deployed.
-- Keep signed-in users' existing table/RLS permissions unchanged.
revoke all on public.comments from anon;
grant select(post_id) on public.comments to anon;

revoke select on public.polls, public.poll_options, public.game_parties,
  public.membership_plans, public.shop_products from anon;
revoke execute on function public.fw_poll_vote_stats() from anon, public;
grant execute on function public.fw_poll_vote_stats() to authenticated, service_role;
