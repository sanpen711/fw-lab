-- F.w 研究所数据库补丁：邮箱注册查重 RPC
-- 使用方法：Supabase Dashboard → SQL Editor → New query → 粘贴全文 → Run
-- 目的：手机端注册发送验证码前，先判断邮箱是否已经注册。

create or replace function public.fw_email_registered(check_email text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  q text := lower(trim(coalesce(check_email, '')));
  found boolean := false;
begin
  if q = '' then
    return false;
  end if;

  select exists (
    select 1
    from public.profiles p
    where lower(coalesce(p.email_search, '')) = q
  ) into found;

  if found then
    return true;
  end if;

  select exists (
    select 1
    from auth.users u
    where lower(coalesce(u.email, '')) = q
  ) into found;

  return found;
end;
$$;

grant execute on function public.fw_email_registered(text) to anon, authenticated;
