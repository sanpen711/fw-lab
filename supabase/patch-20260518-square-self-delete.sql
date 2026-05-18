-- F.w 研究所数据库补丁 05：精神广场本人软删除
-- 使用方法：Supabase SQL Editor 执行。可重复运行。

create or replace function public.fw_delete_own_post(p_post_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.posts
  set is_deleted = true
  where id = p_post_id
    and user_id = auth.uid();

  if not found then
    raise exception '只能删除自己的帖子';
  end if;
end;
$$;

create or replace function public.fw_delete_own_comment(p_comment_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.comments
  set is_deleted = true
  where id = p_comment_id
    and user_id = auth.uid();

  if not found then
    raise exception '只能删除自己的评论';
  end if;
end;
$$;

revoke all on function public.fw_delete_own_post(bigint) from public;
revoke all on function public.fw_delete_own_comment(bigint) from public;
grant execute on function public.fw_delete_own_post(bigint) to authenticated;
grant execute on function public.fw_delete_own_comment(bigint) to authenticated;
