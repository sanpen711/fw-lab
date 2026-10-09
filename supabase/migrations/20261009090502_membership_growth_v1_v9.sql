-- Accrue elapsed membership time, never purchased future time. The private
-- accumulator is updated inside the same transaction as grants/renewals.
create table private.membership_growth (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  elapsed_seconds numeric not null default 0 check (elapsed_seconds >= 0),
  has_membership boolean not null default false,
  interval_start timestamptz,
  interval_end timestamptz,
  check ((interval_start is null) = (interval_end is null))
);
alter table private.membership_growth enable row level security;
revoke all on private.membership_growth from public, anon, authenticated;

-- Existing rows describe the last continuous membership period. Do not invent
-- older periods that are absent from historical data.
insert into private.membership_growth(user_id,has_membership,elapsed_seconds,interval_start,interval_end)
select user_id,true,
  case when status='active' then 0 else greatest(0,extract(epoch from (least(expires_at,updated_at,now())-starts_at))) end,
  case when status='active' then starts_at end,
  case when status='active' then expires_at end
from public.memberships;

create function private.track_membership_growth()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_now timestamptz := now();
begin
  v_user := case when tg_op='DELETE' then old.user_id else new.user_id end;
  if tg_op <> 'DELETE' then
    insert into private.membership_growth(user_id) values(v_user) on conflict do nothing;
  end if;
  update private.membership_growth g set
    elapsed_seconds=g.elapsed_seconds+case when g.interval_start is null then 0
      else greatest(0,extract(epoch from (least(v_now,g.interval_end)-g.interval_start))) end,
    interval_start=null,interval_end=null
    where g.user_id=v_user;
  if tg_op <> 'DELETE' then
    update private.membership_growth set has_membership=true,
      interval_start=case when new.status='active' then greatest(v_now,new.starts_at) end,
      interval_end=case when new.status='active' then new.expires_at end
      where user_id=v_user;
    return new;
  end if;
  return old;
end; $$;
revoke all on function private.track_membership_growth() from public,anon,authenticated;
create trigger membership_growth_track after insert or update or delete on public.memberships
for each row execute function private.track_membership_growth();

create function private.membership_growth_snapshot(p_user uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with elapsed as (
    select g.has_membership,
      floor((g.elapsed_seconds+case when g.interval_start is null then 0
        else greatest(0,extract(epoch from (least(now(),g.interval_end)-g.interval_start))) end)/86400)::integer as days
    from private.membership_growth g where g.user_id=p_user
  ), thresholds as (
    select * from (values(1,0),(2,30),(3,90),(4,180),(5,365),(6,540),(7,730),(8,1095),(9,1460)) t(level,days)
  ), current as (
    select coalesce((select days from elapsed),0) days,
      coalesce((select max(t.level) from thresholds t,elapsed e where e.has_membership and t.days<=e.days),0) level
  ) select jsonb_build_object('level',c.level,'active_days',c.days,
    'next_level',case when c.level=9 then null else c.level+1 end,
    'next_threshold',(select t.days from thresholds t where t.level=c.level+1),
    'active',public.fw_has_active_membership(p_user)) from current c;
$$;
revoke all on function private.membership_growth_snapshot(uuid) from public,anon,authenticated;

create function private.get_own_membership_growth()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_not_banned() then raise exception '请先登录。'; end if;
  return private.membership_growth_snapshot(auth.uid());
end; $$;
create function private.get_membership_levels(p_user_ids uuid[])
returns table(user_id uuid,level integer) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_not_banned() then raise exception '请先登录。'; end if;
  if coalesce(cardinality(p_user_ids),0)>200 then raise exception '一次最多读取 200 个等级。'; end if;
  return query select m.user_id,(private.membership_growth_snapshot(m.user_id)->>'level')::integer
    from public.memberships m join public.profiles p on p.id=m.user_id
    where m.user_id=any(p_user_ids) and not p.is_banned and public.fw_has_active_membership(m.user_id);
end; $$;
create function public.fw_get_own_membership_growth()
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_own_membership_growth();
$$;
create function public.fw_get_membership_levels(p_user_ids uuid[])
returns table(user_id uuid,level integer) language sql stable security invoker set search_path='' as $$
  select * from private.get_membership_levels(p_user_ids);
$$;
revoke all on function private.get_own_membership_growth(),private.get_membership_levels(uuid[]),
  public.fw_get_own_membership_growth(),public.fw_get_membership_levels(uuid[]) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.get_own_membership_growth(),private.get_membership_levels(uuid[]),
  public.fw_get_own_membership_growth(),public.fw_get_membership_levels(uuid[]) to authenticated;

alter table public.membership_appearances drop constraint membership_frame_check;
alter table public.membership_appearances add constraint membership_frame_check
  check(frame in ('double','corners','ticket','laurel','fufu','orbit','ribbon','crown'));
alter table public.membership_appearances drop constraint membership_card_layout_check;
alter table public.membership_appearances add constraint membership_card_layout_check
  check(card_layout in ('classic','pass','folio','honor'));

create function private.set_membership_appearance(p_theme text,p_frame text,p_nickname_color text,p_title text,p_card_layout text,p_intro text,p_featured_post_id bigint default null)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_level integer; v_required integer;
begin
  if me is null or not public.is_not_banned() then raise exception '请先登录。'; end if;
  if not public.fw_has_active_membership(me) then raise exception '会员有效期内才能保存身份设置。'; end if;
  v_level:=(private.membership_growth_snapshot(me)->>'level')::integer;
  v_required:=greatest(case p_frame when 'laurel' then 3 when 'fufu' then 5 when 'orbit' then 6 when 'ribbon' then 7 when 'crown' then 9 else 1 end,
    case p_card_layout when 'folio' then 4 when 'honor' then 8 else 1 end);
  if v_level<v_required then raise exception '达到 V% 后可使用这个装扮。',v_required; end if;
  if p_featured_post_id is not null and not exists(select 1 from public.posts where id=p_featured_post_id and user_id=me and not is_deleted) then raise exception '代表作只能选择自己的广场帖子。'; end if;
  insert into public.membership_appearances(user_id,theme,frame,nickname_color,title,card_layout,intro,featured_post_id)
  values(me,p_theme,p_frame,p_nickname_color,btrim(coalesce(p_title,'')),p_card_layout,btrim(coalesce(p_intro,'')),p_featured_post_id)
  on conflict(user_id) do update set theme=excluded.theme,frame=excluded.frame,nickname_color=excluded.nickname_color,
    title=excluded.title,card_layout=excluded.card_layout,intro=excluded.intro,featured_post_id=excluded.featured_post_id,updated_at=now();
end; $$;
revoke all on function private.set_membership_appearance(text,text,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function private.set_membership_appearance(text,text,text,text,text,text,bigint) to authenticated;
create or replace function public.fw_set_membership_appearance(p_theme text,p_frame text,p_nickname_color text,p_title text,p_card_layout text,p_intro text,p_featured_post_id bigint default null)
returns void language sql security invoker set search_path='' as $$
  select private.set_membership_appearance(p_theme,p_frame,p_nickname_color,p_title,p_card_layout,p_intro,p_featured_post_id);
$$;
revoke all on function public.fw_set_membership_appearance(text,text,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.fw_set_membership_appearance(text,text,text,text,text,text,bigint) to authenticated;
