-- Redacted invalidation events: never contain content, author, reporter, or room membership.
create table public.content_review_events (
 id bigint generated always as identity primary key, kind text not null,target_id text not null,
 visible boolean not null,created_at timestamptz not null default now()
);
alter table public.content_review_events enable row level security;
revoke all on public.content_review_events from public,anon,authenticated;
grant select on public.content_review_events to anon,authenticated;
create policy content_review_events_read on public.content_review_events for select to anon,authenticated using(true);
create function private.content_review_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or old.status is distinct from new.status then
  insert into public.content_review_events(kind,target_id,visible) values(new.kind,new.target_id,new.status='approved');
 end if;
 return new;
end;$$;
revoke all on function private.content_review_invalidate() from public,anon,authenticated;
create trigger content_review_invalidate after insert or update on private.content_reviews for each row execute function private.content_review_invalidate();
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='content_review_events') then
  alter publication supabase_realtime add table public.content_review_events;
 end if;
end;$$;
create or replace function public.fw_content_visible(p_kind text,p_id text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare parent_id text; parent_kind text;
begin
 if exists(select 1 from private.content_reviews where kind=p_kind and target_id=p_id and status<>'approved') then return false; end if;
 if p_kind='comment' then select post_id::text,'post' into parent_id,parent_kind from public.comments where id::text=p_id;
 elsif p_kind='bird_comment' then select post_id::text,'bird_post' into parent_id,parent_kind from public.bird_comments where id::text=p_id;
 elsif p_kind='room_message' then select room_id::text,'room' into parent_id,parent_kind from public.chat_room_messages where id::text=p_id;
 elsif p_kind='poll_option' then select poll_id::text,'poll' into parent_id,parent_kind from public.poll_options where id::text=p_id;
 elsif p_kind='party_message' then select party_id::text,'game_party' into parent_id,parent_kind from public.game_party_messages where id::text=p_id;
 end if;
 return not exists(select 1 from private.content_reviews where kind=parent_kind and target_id=parent_id and status<>'approved');
end;$$;
create function public.fw_content_review_visibility(p_refs jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_refs)<>'array' or jsonb_array_length(p_refs)>300 then raise exception 'Too many content references'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('kind',r->>'kind','target_id',r->>'id','visible',public.fw_content_visible(r->>'kind',r->>'id'))) from jsonb_array_elements(p_refs)r),'[]'::jsonb);
end;$$;
revoke all on function public.fw_content_review_visibility(jsonb) from public;
grant execute on function public.fw_content_review_visibility(jsonb) to anon,authenticated;
notify pgrst,'reload schema';
