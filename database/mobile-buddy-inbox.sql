-- One latest message per accepted buddy, and unread state shared across devices.
create or replace function public.fw_mobile_buddy_inbox()
returns table(user_id uuid, conversation_id bigint, message jsonb, unread boolean)
language sql stable security invoker set search_path = ''
as $$
  with buddies as (
    select distinct case when f.requester_id=(select auth.uid()) then f.receiver_id else f.requester_id end as buddy_id
    from public.friendships f where (select auth.uid()) is not null and f.status='accepted'
      and (f.requester_id=(select auth.uid()) or f.receiver_id=(select auth.uid()))
  )
  select b.buddy_id,c.id,coalesce(case when m.id is not null then to_jsonb(m) end,case when info.id is not null then jsonb_build_object('id','notice:'||info.id::text,'sender_id',info.actor_id,'content',info.content,'created_at',info.created_at) end),exists(
    select 1 from public.notifications n
    where n.user_id=(select auth.uid()) and n.actor_id=b.buddy_id
      and n.type='private_message' and not n.is_read
  )
  from buddies b
  left join public.conversations c on
    least(c.user_one_id,c.user_two_id)=least((select auth.uid()),b.buddy_id)
    and greatest(c.user_one_id,c.user_two_id)=greatest((select auth.uid()),b.buddy_id)
  left join lateral (
    select pm.* from public.private_messages pm
    where pm.conversation_id=c.id and not pm.is_deleted
    order by pm.created_at desc,pm.id desc limit 1
  ) m on true
  left join lateral (
    select n.id,n.actor_id,n.content,n.created_at from public.notifications n
    where n.user_id=(select auth.uid()) and n.actor_id=b.buddy_id and n.type='private_message'
      and n.target_type='system' order by n.created_at desc,n.id desc limit 1
  ) info on true;
$$;
revoke all on function public.fw_mobile_buddy_inbox() from public,anon;
grant execute on function public.fw_mobile_buddy_inbox() to authenticated;

-- Only the existing friendship trigger emits the acceptance notification.
create or replace function public.fw_respond_friendship(target_friendship_id bigint,accept_request boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid:=auth.uid(); f public.friendships;
begin
  if me is null then raise exception '请先登录。'; end if;
  select * into f from public.friendships
  where id=target_friendship_id and receiver_id=me and status='pending' for update;
  if f.id is null then raise exception '申请不存在或无权处理。'; end if;
  update public.friendships set status=case when accept_request then 'accepted' else 'rejected' end,
    updated_at=now() where id=f.id;
end;
$$;
revoke all on function public.fw_respond_friendship(bigint,boolean) from public,anon;
grant execute on function public.fw_respond_friendship(bigint,boolean) to authenticated;

-- Request and acceptance notifications have one writer: the trigger.
create or replace function public.fw_send_friend_request(target_user_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare me uuid:=auth.uid(); admin_id uuid:=public.fw_admin_user_id(); f public.friendships;
begin
  if me is null or not public.is_not_banned() then raise exception '请先登录。'; end if;
  if target_user_id=me then return 'self'; end if;
  if admin_id is not null and target_user_id=admin_id then
    perform public.fw_ensure_admin_friendship(me); return 'admin_auto_accepted';
  end if;
  select * into f from public.friendships where
    (requester_id=me and receiver_id=target_user_id) or (requester_id=target_user_id and receiver_id=me)
    limit 1 for update;
  if f.id is not null then
    if f.status='accepted' then return 'already_accepted'; end if;
    if f.status='pending' then return 'already_pending'; end if;
    if f.status='blocked' then return 'blocked'; end if;
    update public.friendships set requester_id=me,receiver_id=target_user_id,status='pending',updated_at=now()
      where id=f.id;
  else
    insert into public.friendships(requester_id,receiver_id,status) values(me,target_user_id,'pending');
  end if;
  return 'sent';
end;
$$;
revoke all on function public.fw_send_friend_request(uuid) from public,anon;
grant execute on function public.fw_send_friend_request(uuid) to authenticated;

create or replace function public.fw_notify_friendship()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op='DELETE' then
    update public.notifications set is_read=true where type in ('friend_request','friend_accept')
      and target_type='friendship' and target_id=old.id::text
      and user_id in (old.requester_id,old.receiver_id);
    update public.notifications set is_read=true where type='private_message'
      and ((user_id=old.requester_id and actor_id=old.receiver_id)
        or (user_id=old.receiver_id and actor_id=old.requester_id));
    return old;
  end if;
  if tg_op='INSERT' and new.status='pending' then
    perform public.fw_insert_notification(new.receiver_id,new.requester_id,'friend_request','friendship',new.id::text,'想加你为搭子');
  end if;
  if tg_op='UPDATE' and old.status is distinct from new.status then
    update public.notifications set is_read=true where user_id=new.receiver_id
      and type='friend_request' and target_type='friendship' and target_id=new.id::text;
    if new.status='pending' then
      perform public.fw_insert_notification(new.receiver_id,new.requester_id,'friend_request','friendship',new.id::text,'想加你为搭子');
    end if;
    if new.status='accepted' then
      perform public.fw_insert_notification(new.requester_id,new.receiver_id,'friend_accept','friendship',new.id::text,'通过了你的搭子申请');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.fw_notify_friendship() from public,anon,authenticated;
drop trigger fw_friendships_notify_after_change on public.friendships;
create trigger fw_friendships_notify_after_change after insert or update or delete on public.friendships
for each row execute function public.fw_notify_friendship();

-- Resolved or withdrawn requests must not leave stale red dots.
update public.notifications n set is_read=true
where n.type='friend_request' and n.target_type='friendship' and not n.is_read
  and not exists(select 1 from public.friendships f where f.id::text=n.target_id
    and f.receiver_id=n.user_id and f.status='pending');
update public.notifications n set is_read=true
where n.type='friend_accept' and n.target_type='friendship' and not n.is_read
  and not exists(select 1 from public.friendships f where f.id::text=n.target_id
    and f.status='accepted' and f.requester_id=n.user_id);
