-- F.w 研究所数据库补丁 01：账号基础字段与搜索
-- 使用方法：Supabase Dashboard → SQL Editor → New query → 粘贴全文 → Run
-- 可重复运行。先运行本文件，再运行 social 和 rooms 补丁。

create extension if not exists "pgcrypto";

-- 1. profiles 补齐字段
alter table public.profiles add column if not exists lab_code text;
alter table public.profiles add column if not exists email_search text;
alter table public.profiles add column if not exists nickname_change_year int not null default extract(year from now())::int;
alter table public.profiles add column if not exists nickname_change_count int not null default 0;
alter table public.profiles add column if not exists muted_until timestamptz;

create unique index if not exists profiles_lab_code_unique_idx
  on public.profiles (upper(lab_code))
  where lab_code is not null and lab_code <> '';

create unique index if not exists profiles_nickname_unique_idx
  on public.profiles (lower(nickname))
  where nickname is not null and nickname <> '';

create index if not exists profiles_email_search_idx on public.profiles(email_search);
create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists reactions_type_idx on public.reactions(type);

-- 已有账号补邮箱搜索字段
update public.profiles p
set email_search = lower(u.email)
from auth.users u
where u.id = p.id
  and (p.email_search is null or p.email_search = '');

-- 2. 基础判断函数
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_banned = false
  );
$$;

create or replace function public.is_not_banned()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_banned = false
  );
$$;

create or replace function public.can_chat()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_banned = false
      and (muted_until is null or muted_until < now())
  );
$$;

-- 3. 资料规范化与限制
create or replace function public.normalize_and_guard_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from now())::int;
  old_year int;
  old_count int;
begin
  new.updated_at := now();
  new.nickname := trim(coalesce(new.nickname, ''));

  if char_length(new.nickname) < 2 or char_length(new.nickname) > 12 then
    raise exception '昵称需要 2-12 个字符。';
  end if;

  if exists (select 1 from public.profiles where lower(nickname) = lower(new.nickname) and id <> new.id) then
    raise exception '这个昵称已经被占用。';
  end if;

  if new.lab_code is not null then
    new.lab_code := upper(regexp_replace(trim(new.lab_code), '\s+', '', 'g'));
    if new.lab_code = '' then new.lab_code := null; end if;
  end if;

  if new.lab_code is not null and new.lab_code !~ '^[A-Z0-9]{7}$' then
    raise exception '实验品编号必须是 7 位字母或数字。';
  end if;

  if tg_op = 'UPDATE' then
    if old.lab_code is not null and new.lab_code is distinct from old.lab_code then
      raise exception '实验品编号注册后不能修改。';
    end if;

    if new.lab_code is not null and old.lab_code is null and exists (
      select 1 from public.profiles where upper(lab_code) = upper(new.lab_code) and id <> new.id
    ) then
      raise exception '该编号已被注册。';
    end if;

    if new.nickname is distinct from old.nickname then
      old_year := coalesce(old.nickname_change_year, current_year);
      old_count := coalesce(old.nickname_change_count, 0);
      if old_year = current_year then
        if old_count >= 5 then raise exception '昵称每年最多修改 5 次。'; end if;
        new.nickname_change_year := current_year;
        new.nickname_change_count := old_count + 1;
      else
        new.nickname_change_year := current_year;
        new.nickname_change_count := 1;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_normalize_guard on public.profiles;
create trigger profiles_normalize_guard
  before insert or update on public.profiles
  for each row execute function public.normalize_and_guard_profile();

-- 4. 新用户资料创建逻辑：加入 email_search
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, avatar_url, email_search)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nickname', ''), '临时研究员' || substring(new.id::text, 1, 4)),
    new.raw_user_meta_data ->> 'avatar_url',
    lower(new.email)
  )
  on conflict (id) do update set
    email_search = coalesce(public.profiles.email_search, lower(new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. 注册页查重
create or replace function public.fw_check_profile_identity(check_lab_code text default null, check_nickname text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  code text := nullif(upper(regexp_replace(trim(coalesce(check_lab_code,'')), '\s+', '', 'g')), '');
  nick text := nullif(trim(coalesce(check_nickname,'')), '');
  code_taken boolean := false;
  nick_taken boolean := false;
begin
  if code is not null then
    select exists(select 1 from public.profiles where upper(lab_code) = code and id <> coalesce(me, '00000000-0000-0000-0000-000000000000'::uuid)) into code_taken;
  end if;
  if nick is not null then
    select exists(select 1 from public.profiles where lower(nickname) = lower(nick) and id <> coalesce(me, '00000000-0000-0000-0000-000000000000'::uuid)) into nick_taken;
  end if;
  return jsonb_build_object('lab_code_taken', code_taken, 'nickname_taken', nick_taken);
end;
$$;

-- 6. 搭子搜索：编号 / 昵称 / 完整邮箱
create or replace function public.fw_search_profiles(search_text text)
returns table(id uuid, nickname text, avatar_url text, lab_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  q text := trim(coalesce(search_text,''));
  q_lower text := lower(trim(coalesce(search_text,'')));
begin
  if char_length(q) < 2 then return; end if;

  return query
  select p.id, p.nickname, p.avatar_url, p.lab_code
  from public.profiles p
  where p.id <> auth.uid()
    and p.is_banned = false
    and (
      p.lab_code ilike q || '%'
      or p.nickname ilike '%' || q || '%'
      or p.email_search = q_lower
    )
  order by case when p.lab_code ilike q || '%' then 0 else 1 end, p.created_at desc
  limit 20;
end;
$$;

-- 7. 权限：允许保存 lab_code 等字段
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update
using (auth.uid() = id and public.is_not_banned())
with check (auth.uid() = id and public.is_not_banned());

revoke update on public.profiles from authenticated;
grant select on public.profiles to anon, authenticated;
grant update (nickname, avatar_url, lab_code, email_search, nickname_change_year, nickname_change_count, updated_at) on public.profiles to authenticated;

grant execute on function public.fw_check_profile_identity(text, text) to anon, authenticated;
grant execute on function public.fw_search_profiles(text) to authenticated;

-- 8. 头像旧图删除权限
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars_user_delete" on storage.objects;
create policy "avatars_user_delete" on storage.objects for delete
using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
