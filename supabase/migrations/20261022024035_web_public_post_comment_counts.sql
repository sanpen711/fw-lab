-- Add the counts endpoint before deploying the browser that consumes it.
-- It runs as the caller: published-post and comment-review RLS still apply.
create or replace function public.fw_public_post_comment_counts(p_post_ids bigint[])
returns table(post_id bigint, comment_count bigint)
language sql stable security invoker
set search_path = ''
as $$
  select p.id, count(c.post_id)
  from public.posts p
  left join public.comments c on c.post_id = p.id
  where p.id = any(p_post_ids)
    and coalesce(cardinality(p_post_ids), 0) <= 100
    and not coalesce(p.is_deleted, false)
    and public.fw_content_visible('post', p.id::text)
  group by p.id;
$$;
revoke all on function public.fw_public_post_comment_counts(bigint[]) from public;
grant execute on function public.fw_public_post_comment_counts(bigint[]) to anon, authenticated, service_role;
comment on function public.fw_public_post_comment_counts(bigint[]) is
  'Public counts for up to 100 visible posts. No comment text, author, IDs, or timestamps are returned.';
