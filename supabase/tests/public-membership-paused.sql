-- Run after the pause migration. Test accounts, rooms and stickers are rolled back.
begin;
select set_config('fw.test_admin',gen_random_uuid()::text,true),
       set_config('fw.test_regular',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select id::uuid, id||'@example.invalid',jsonb_build_object('nickname','测试'||left(id,8))
from unnest(array[current_setting('fw.test_admin'),current_setting('fw.test_regular')]) as ids(id);
update public.profiles set role='admin' where id=current_setting('fw.test_admin')::uuid;
insert into public.memberships(user_id,status,starts_at,expires_at,source)
values (current_setting('fw.test_regular')::uuid,'active',now()-interval '1 day',now()+interval '1 day','manual');

select set_config('request.jwt.claim.sub',current_setting('fw.test_admin'),true);
set local role authenticated;
select public.admin_save_appearance_test(true,9,'black_gold','crown','pink_starlight','测试称号','honor','测试介绍',null);
do $$
begin
  if public.admin_get_appearance_test()->>'frame' is distinct from 'crown' then
    raise exception 'Admin settings did not round-trip';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('fw.test_regular'),true);
set local role authenticated;
do $$
declare
  admin_id uuid := current_setting('fw.test_admin')::uuid;
  regular_id uuid := auth.uid();
  room bigint;
begin
  if not exists(select 1 from public.fw_get_membership_appearances(array[admin_id]) a
    where a.frame='crown' and a.nickname_color='pink_starlight' and a.title='测试称号')
    or not exists(select 1 from public.fw_get_membership_levels(array[admin_id]) a where a.level=9) then
    raise exception 'Signed-in viewers must see the admin appearance';
  end if;
  if exists(select 1 from public.fw_get_membership_appearances(array[regular_id])) or public.fw_has_active_membership(regular_id) then
    raise exception 'A regular user still has a membership benefit';
  end if;
  begin
    perform public.admin_get_appearance_test();
    raise exception 'Regular user can read admin settings';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_save_appearance_test(true,9,'black_gold','crown','default','','classic','',null);
    raise exception 'Regular user can set admin appearance';
  exception when insufficient_privilege then null;
  end;

  for i in 1..5 loop
    room := public.fw_create_game_party('限额验证 '||i,'','','',null,5,'','',false,'');
  end loop;
  begin
    perform public.fw_create_game_party('第六个房间','','','',null,5,'','');
    raise exception 'Sixth room accepted';
  exception when raise_exception then
    if sqlerrm not like '%5 个组队房间%' then raise; end if;
  end;
  perform public.fw_close_game_party(room);
  perform public.fw_create_game_party('释放名额后创建','','','',null,5,'','',false);

  insert into public.user_stickers(user_id,image_url,storage_path,file_name,file_size,mime_type)
  select regular_id,'https://example.invalid/'||i,regular_id||'/'||i,'test.png',1,'image/png' from generate_series(1,80) i;
  begin
    insert into public.user_stickers(user_id,image_url,storage_path,file_name,file_size,mime_type)
    values (regular_id,'https://example.invalid/81',regular_id||'/81','test.png',1,'image/png');
    raise exception 'Eighty-first sticker accepted';
  exception when check_violation then null;
  end;
  update public.user_stickers set is_deleted=true where user_id=regular_id and storage_path=regular_id||'/1';
  insert into public.user_stickers(user_id,image_url,storage_path,file_name,file_size,mime_type)
  values (regular_id,'https://example.invalid/81',regular_id||'/81','test.png',1,'image/png');
end $$;
reset role;

do $$
begin
  begin
    insert into public.membership_orders default values;
    raise exception 'Paused membership order accepted';
  exception when raise_exception then
    if sqlerrm <> 'PAYMENT_NOT_OPEN' then raise; end if;
  end;
  begin
    insert into public.shop_orders default values;
    raise exception 'Paused shop order accepted';
  exception when raise_exception then
    if sqlerrm <> 'PAYMENT_NOT_OPEN' then raise; end if;
  end;
end $$;
rollback;
