-- F.w 研究所：用户自助注销账号
-- 使用方法：Supabase Dashboard → SQL Editor → New query → 粘贴全文 → Run
-- 前端会先通过 Storage API 删除用户本人目录下的头像、表情和媒体文件，
-- 本函数再删除 Auth 用户；关联 profiles、帖子、评论、互动和社交数据按外键级联清理。

create or replace function public.fw_delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.role
  into current_role
  from public.profiles p
  where p.id = current_user_id;

  if current_role = 'admin' then
    raise exception 'Admin account cannot be self-deleted';
  end if;

  delete from auth.users
  where id = current_user_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

revoke all on function public.fw_delete_own_account() from public, anon;
grant execute on function public.fw_delete_own_account() to authenticated;
