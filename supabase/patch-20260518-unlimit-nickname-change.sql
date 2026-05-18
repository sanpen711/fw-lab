-- F.w 研究所数据库补丁：解除昵称修改次数限制
-- 可重复执行。保留原有资料规范化与实验品编号约束，只移除昵称年度次数限制。

create or replace function public.normalize_and_guard_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.nickname := trim(coalesce(new.nickname, ''));

  if char_length(new.nickname) < 2 or char_length(new.nickname) > 12 then
    raise exception '昵称需要 2-12 个字符。';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(nickname) = lower(new.nickname)
      and id <> new.id
  ) then
    raise exception '这个昵称已经被占用。';
  end if;

  if new.lab_code is not null then
    new.lab_code := upper(regexp_replace(trim(new.lab_code), '\s+', '', 'g'));
    if new.lab_code = '' then
      new.lab_code := null;
    end if;
  end if;

  if new.lab_code is not null and new.lab_code !~ '^[A-Z0-9]{7}$' then
    raise exception '实验品编号必须是 7 位字母或数字。';
  end if;

  if tg_op = 'UPDATE' then
    if old.lab_code is not null and new.lab_code is distinct from old.lab_code then
      raise exception '实验品编号注册后不能修改。';
    end if;

    if new.lab_code is not null and old.lab_code is null and exists (
      select 1
      from public.profiles
      where upper(lab_code) = upper(new.lab_code)
        and id <> new.id
    ) then
      raise exception '该编号已被注册。';
    end if;
  end if;

  return new;
end;
$$;
