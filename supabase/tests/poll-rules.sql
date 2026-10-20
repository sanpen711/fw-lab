-- Isolated fixtures only. Every user, poll, option and vote is rolled back.
begin;
select set_config('fw.poll.owner',gen_random_uuid()::text,true),
       set_config('fw.poll.voter',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select id,'poll-check-'||id||'@example.invalid',jsonb_build_object('nickname','投票验证'||left(id::text,8))
from (values(current_setting('fw.poll.owner')::uuid),(current_setting('fw.poll.voter')::uuid)) f(id);
select set_config('request.jwt.claim.sub',current_setting('fw.poll.owner'),true);
set local role authenticated;
do $$
declare
  days integer;
  n integer;
  v_id bigint;
  row public.polls%rowtype;
  options text[];
begin
  foreach days in array array[1,3,7,15,30] loop
    for n in 2..4 loop
      begin
        select array_agg('选项'||i) into options from generate_series(1,n) as i;
        v_id:=public.fw_create_poll_v2('规则验证',options,false,days,true);
        select * into row from public.polls where polls.id=v_id;
        if row.ends_at-row.created_at<>make_interval(days=>days) or not row.allow_user_options then raise exception 'Duration/open setting mismatch';end if;
        if (select count(*) from public.poll_options where poll_id=v_id)<>n then raise exception 'Initial option count mismatch';end if;
        raise exception using errcode='P9999',message='rollback valid case';
      exception when sqlstate 'P9999' then null;end;
    end loop;
  end loop;
  foreach n in array array[0,1,5] loop
    select coalesce(array_agg('选项'||i),array[]::text[]) into options from generate_series(1,n) as i;
    begin perform public.fw_create_poll_v2('无效选项',options);raise exception 'Invalid count accepted';
    exception when raise_exception then if sqlerrm<>'创建投票需要填写 2～4 个初始选项。' then raise;end if;end;
  end loop;
  foreach days in array array[0,2,14,31] loop
    begin perform public.fw_create_poll_v2('无效天数',array['A','B'],false,days);raise exception 'Invalid duration accepted';
    exception when raise_exception then if sqlerrm<>'投票时长请选择 1、3、7、15 或 30 天。' then raise;end if;end;
  end loop;
  begin perform public.fw_create_poll_v2('重复',array['A',' a ']);raise exception 'Duplicate accepted';
  exception when raise_exception then if sqlerrm<>'初始选项不能重复。' then raise;end if;end;
  begin perform public.fw_create_poll_v2('超长',array['A',repeat('字',81)]);raise exception 'Long option accepted';
  exception when raise_exception then if sqlerrm<>'每个选项最多 80 个字。' then raise;end if;end;
  begin perform public.fw_create_poll_v2('冒充官方',array['A','B'],true);raise exception 'Official escalation accepted';
  exception when raise_exception then if sqlerrm<>'只有管理员可以发布官方课题。' then raise;end if;end;
  v_id:=public.fw_create_poll_v2('默认设置',array['A','B']);
  select * into row from public.polls where polls.id=v_id;
  if row.allow_user_options or row.ends_at-row.created_at<>interval '7 days' then raise exception 'Incorrect new defaults';end if;
  perform set_config('fw.poll.closed',v_id::text,true);
  v_id:=public.fw_create_poll_v2('允许补充',array['A','B'],false,30,true);
  perform set_config('fw.poll.open',v_id::text,true);
  v_id:=public.fw_create_poll('旧客户端',array['A','B','C','D'],false);
  select * into row from public.polls where polls.id=v_id;
  if not row.allow_user_options or row.ends_at-row.created_at<>interval '7 days' then raise exception 'Legacy behaviour changed';end if;
  begin perform public.fw_create_poll_v2('第四次',array['A','B']);raise exception 'Daily limit bypassed';
  exception when raise_exception then if sqlerrm<>'每个用户每天最多发起 3 次投票。' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('fw.poll.voter'),true);
do $$ declare option_id bigint;begin
  begin perform public.fw_add_poll_option(current_setting('fw.poll.closed')::bigint,'不可添加');raise exception 'Closed additions bypassed';
  exception when raise_exception then if sqlerrm<>'发起人未开放补充选项。' then raise;end if;end;
  option_id:=public.fw_add_poll_option(current_setting('fw.poll.open')::bigint,'补充项');
  perform public.fw_vote_poll(current_setting('fw.poll.open')::bigint,option_id);
  begin perform public.fw_add_poll_option(current_setting('fw.poll.open')::bigint,'第二个');raise exception 'Second addition accepted';
  exception when raise_exception then if sqlerrm<>'你已经为这个投票新增过 1 个选项。' then raise;end if;end;
  begin perform public.fw_delete_my_poll_option(option_id);raise exception 'Voted option removed';
  exception when raise_exception then if sqlerrm<>'该选项已有投票，不能删除' then raise;end if;end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.poll_votes where user_id=current_setting('fw.poll.voter')::uuid and poll_id=current_setting('fw.poll.open')::bigint) then raise exception 'Add-and-vote regression';end if;
end $$;
-- Fill the poll to the existing 20-option ceiling without modifying real data.
insert into public.poll_options(poll_id,label,source)
select current_setting('fw.poll.open')::bigint,'填充'||i,'initial' from generate_series(1,17) i;
set local role authenticated;
do $$ begin
  begin perform public.fw_add_poll_option(current_setting('fw.poll.open')::bigint,'超过20');raise exception 'Option ceiling bypassed';
  exception when raise_exception then if sqlerrm<>'每个投票最多 20 个选项。' then raise;end if;end;
end $$;
reset role;
update public.polls set ends_at=now()-interval '1 second' where id=current_setting('fw.poll.open')::bigint;
set local role authenticated;
do $$ begin
  begin perform public.fw_add_poll_option(current_setting('fw.poll.open')::bigint,'过期补充');raise exception 'Expired addition accepted';
  exception when raise_exception then if sqlerrm<>'这个课题已经截止，不能新增选项。' then raise;end if;end;
end $$;
reset role;
update public.profiles set is_banned=true where id=current_setting('fw.poll.voter')::uuid;
set local role authenticated;
do $$ begin
  begin perform public.fw_create_poll_v2('封禁',array['A','B']);raise exception 'Banned account accepted';
  exception when raise_exception then if sqlerrm<>'这个账号当前不能参与投票研究。' then raise;end if;end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.fw_create_poll_v2('匿名',array['A','B']);raise exception 'Anonymous creation accepted';exception when insufficient_privilege then null;end;
  begin perform public.fw_add_poll_option(current_setting('fw.poll.closed')::bigint,'匿名添加');raise exception 'Anonymous addition accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: 2/3/4 options, five durations, defaults, permissions, legacy compatibility, daily/option limits, expiry and add-and-vote; fixtures rolled back' as result;
