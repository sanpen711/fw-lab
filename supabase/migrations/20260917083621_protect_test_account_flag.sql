-- 普通用户不能把自己标记为测试账号来绕过后台列表。
create or replace function private.protect_profile_test_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_test_account is distinct from old.is_test_account
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only admin can change test account status';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_profile_test_flag() from public, anon, authenticated;

drop trigger if exists fw_protect_profile_test_flag on public.profiles;
create trigger fw_protect_profile_test_flag
  before update of is_test_account on public.profiles
  for each row execute function private.protect_profile_test_flag();
