-- Synthetic users and clock fixtures; every change is rolled back.
begin;
select set_config('fw.growth_test_user',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('fw.growth_test_user')::uuid,'growth-'||current_setting('fw.growth_test_user')||'@example.invalid',jsonb_build_object('nickname','等级测试'||left(current_setting('fw.growth_test_user'),8));
do $$
declare me uuid:=current_setting('fw.growth_test_user')::uuid; thresholds integer[]:=array[0,30,90,180,365,540,730,1095,1460]; i integer; got jsonb;
begin
  got:=private.membership_growth_snapshot(me);
  if got->>'level'<>'0' then raise exception 'Never-member received V1'; end if;
  insert into public.memberships(user_id,plan_id,status,starts_at,expires_at,source)
    values(me,'monthly','active',now(),now()+interval '4 years','manual');
  got:=private.membership_growth_snapshot(me);
  if got->>'level'<>'1' or got->>'active_days'<>'0' then raise exception 'Future prepaid time awarded levels'; end if;
  for i in 1..9 loop
    update private.membership_growth set elapsed_seconds=thresholds[i]*86400::numeric,interval_start=now(),interval_end=now()+interval '1 year' where user_id=me;
    got:=private.membership_growth_snapshot(me);
    if (got->>'level')::integer<>i then raise exception 'Threshold % failed: %',i,got; end if;
    if i>1 then
      update private.membership_growth set elapsed_seconds=thresholds[i]*86400::numeric-1 where user_id=me;
      if (private.membership_growth_snapshot(me)->>'level')::integer<>i-1 then raise exception 'Premature threshold %',i; end if;
    end if;
  end loop;
  -- Expired interval counts only to its end, not the inactive gap.
  update private.membership_growth set elapsed_seconds=10*86400,interval_start=now()-interval '25 days',interval_end=now()-interval '5 days' where user_id=me;
  if private.membership_growth_snapshot(me)->>'active_days'<>'30' then raise exception 'Expired gap counted'; end if;
  update public.memberships set starts_at=now(),expires_at=now()+interval '1 month' where user_id=me;
  if private.membership_growth_snapshot(me)->>'active_days'<>'30' then raise exception 'Renewal dropped elapsed history'; end if;
  update public.memberships set expires_at=expires_at+interval '1 month' where user_id=me;
  if private.membership_growth_snapshot(me)->>'active_days'<>'30' then raise exception 'Repeated renewal awarded future days'; end if;
  update private.membership_growth set interval_start=now()-interval '1 day',interval_end=now()+interval '1 month' where user_id=me;
  update public.memberships set status='cancelled' where user_id=me;
  got:=private.membership_growth_snapshot(me);
  if got->>'active_days'<>'31' or got->>'level'<>'2' or (got->>'active')::boolean then raise exception 'Cancellation lost/fabricated days or badge remains active'; end if;
  update public.memberships set status='active',starts_at=now(),expires_at=now()+interval '1 month' where user_id=me;
  if private.membership_growth_snapshot(me)->>'active_days'<>'31' then raise exception 'Restart counted inactive time'; end if;
  if has_table_privilege('authenticated','private.membership_growth','UPDATE') or has_table_privilege('anon','private.membership_growth','SELECT')
    or has_function_privilege('authenticated','private.membership_growth_snapshot(uuid)','EXECUTE')
    or has_function_privilege('anon','public.fw_get_own_membership_growth()','EXECUTE') then raise exception 'Growth privileges leaked'; end if;
end; $$;
select set_config('request.jwt.claim.sub',current_setting('fw.growth_test_user'),true);
set local role authenticated;
do $$
declare me uuid:=current_setting('fw.growth_test_user')::uuid; got jsonb;
begin
  got:=public.fw_get_own_membership_growth();
  if got->>'level'<>'2' or got->>'active_days'<>'31' then raise exception 'Own wrapper returned wrong account'; end if;
  if (select count(*) from public.fw_get_membership_levels(array[me,gen_random_uuid()]))<>1 then raise exception 'Levels reveal inactive/nonmember users'; end if;
  begin
    update private.membership_growth set elapsed_seconds=999999999 where user_id=me;
    raise exception 'Client forged growth';
  exception when insufficient_privilege then null; end;
  begin
    perform public.fw_set_membership_appearance('black_gold','crown','default','','classic','',null);
    raise exception 'Locked frame accepted';
  exception when raise_exception then if sqlerrm<>'达到 V9 后可使用这个装扮。' then raise; end if; end;
  begin
    perform public.fw_set_membership_appearance('black_gold','double','default','','honor','',null);
    raise exception 'Locked layout accepted';
  exception when raise_exception then if sqlerrm<>'达到 V8 后可使用这个装扮。' then raise; end if; end;
  perform public.fw_set_membership_appearance('black_gold','double','default','准点下班','pass','原有选择保留',null);
end; $$;
reset role;
update private.membership_growth set elapsed_seconds=1460*86400::numeric where user_id=current_setting('fw.growth_test_user')::uuid;
set local role authenticated;
select public.fw_set_membership_appearance('black_gold','crown','default','','honor','',null);
reset role;
update public.memberships set status='expired' where user_id=current_setting('fw.growth_test_user')::uuid;
set local role authenticated;
do $$ begin
  if (public.fw_get_own_membership_growth()->>'level')::integer<>9 then raise exception 'Expiration removed attained level'; end if;
  if exists(select 1 from public.fw_get_membership_levels(array[current_setting('fw.growth_test_user')::uuid])) then raise exception 'Expired badge leaked'; end if;
  begin
    perform public.fw_set_membership_appearance('black_gold','double','default','','classic','',null);
    raise exception 'Expired member saved decoration';
  exception when raise_exception then if sqlerrm<>'会员有效期内才能保存身份设置。' then raise; end if; end;
end; $$;
reset role;
update public.profiles set is_banned=true where id=current_setting('fw.growth_test_user')::uuid;
set local role authenticated;
do $$ begin
  begin perform public.fw_get_own_membership_growth(); raise exception 'Banned account read growth';
  exception when raise_exception then if sqlerrm<>'请先登录。' then raise; end if; end;
end; $$;
reset role;
rollback;
