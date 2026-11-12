-- The desktop badge channel subscribes to both notifications and friendships.
-- Postgres Changes registers those bindings together. Friendships already has
-- participant-only SELECT policies.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end;
$$;
