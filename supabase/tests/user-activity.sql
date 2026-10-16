-- Transactional fixtures only. No production user's activity or login is changed.
begin;
select set_config('fw.activity.a',gen_random_uuid()::text,true),set_config('fw.activity.b',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,last_sign_in_at)
select id,'activity-check-'||id||'@example.invalid',jsonb_build_object('nickname','活跃验证'||left(id::text,8)),'2026-10-01T00:00:00Z'::timestamptz
from (values(current_setting('fw.activity.a')::uuid),(current_setting('fw.activity.b')::uuid)) fixtures(id);
update public.profiles set role='admin' where id=current_setting('fw.activity.b')::uuid;
select set_config('request.jwt.claim.sub',current_setting('fw.activity.a'),true);
set local role authenticated;
select public.fw_record_user_activity();
do $$ begin
  begin perform 1 from private.user_activity;raise exception 'Private activity table leaked';exception when insufficient_privilege then null;end;
  begin perform public.admin_list_profiles();raise exception 'Non-admin read the activity list';exception when raise_exception then if sqlerrm<>'Only admin can read profiles' then raise;end if;end;
end $$;
reset role;
select set_config('fw.activity.first',(select last_active_at::text from private.user_activity where user_id=current_setting('fw.activity.a')::uuid),true);
set local role authenticated;
select public.fw_record_user_activity();
reset role;
do $$ begin
  if (select last_active_at from private.user_activity where user_id=current_setting('fw.activity.a')::uuid)<>current_setting('fw.activity.first')::timestamptz then raise exception 'Server-side throttle failed';end if;
end $$;
update private.user_activity set last_active_at=clock_timestamp()-interval '2 minutes' where user_id=current_setting('fw.activity.a')::uuid;
set local role authenticated;
select public.fw_record_user_activity();
reset role;
do $$ begin
  if (select last_active_at from private.user_activity where user_id=current_setting('fw.activity.a')::uuid)<clock_timestamp()-interval '1 minute' then raise exception 'Activity did not advance';end if;
  if exists(select 1 from private.user_activity where user_id=current_setting('fw.activity.b')::uuid) then raise exception 'Activity was attributed to another account';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('fw.activity.b'),true);
set local role authenticated;
select public.fw_record_user_activity();
do $$ declare item record;begin
  select * into item from public.admin_list_profiles() where id=current_setting('fw.activity.a')::uuid;
  if item.last_active_at is null then raise exception 'Admin cannot read activity';end if;
  if item.last_sign_in_at<>'2026-10-01T00:00:00Z'::timestamptz then raise exception 'Authentication login history was changed';end if;
end $$;
reset role;
update public.profiles set is_banned=true where id=current_setting('fw.activity.a')::uuid;
select set_config('request.jwt.claim.sub',current_setting('fw.activity.a'),true);
set local role authenticated;
do $$ begin
  begin perform public.fw_record_user_activity();raise exception 'Banned account accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.fw_record_user_activity();raise exception 'Anonymous activity accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from public.profiles where id=current_setting('fw.activity.a')::uuid;
do $$ begin
  if exists(select 1 from private.user_activity where user_id=current_setting('fw.activity.a')::uuid) then raise exception 'Account activity was not removed by cascade';end if;
end $$;
rollback;
select 'PASS: own server time, throttling, admin-only read, unchanged login, banned/anonymous denial and cascade; fixtures rolled back' as result;
