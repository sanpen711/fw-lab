-- Restore missing reply notifications and keep future replies in the shared inbox.
-- Historical fallback replies already appeared read after 3 days; preserve that
-- initial state during this one-time repair. New notifications never age to read.
create or replace function public.fw_notify_post_comment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  p record;
  reply_user uuid;
begin
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    raise exception 'Comment author does not match authenticated user';
  end if;
  if coalesce(new.is_deleted, false) then return new; end if;
  select id, user_id, content, is_deleted into p from public.posts where id = new.post_id;
  if p.id is null or coalesce(p.is_deleted, false) then return new; end if;

  select c.user_id into reply_user from public.comments c
  where c.id = coalesce(new.reply_to_comment_id, new.parent_comment_id)
    and c.post_id = new.post_id and not coalesce(c.is_deleted, false);

  -- Legacy clients may identify the recipient without reply_to_comment_id.
  -- Accept that recipient only when they actually authored a comment in this thread.
  if new.reply_to_comment_id is null and new.reply_to_user_id is not null then
    select c.user_id into reply_user from public.comments c
    where c.post_id = new.post_id and c.id <> new.id
      and c.user_id = new.reply_to_user_id and not coalesce(c.is_deleted, false)
      and (c.id = new.parent_comment_id or c.parent_comment_id = new.parent_comment_id)
    order by c.id desc limit 1;
    if reply_user is null then
      select c.user_id into reply_user from public.comments c
      where c.id = new.parent_comment_id and c.post_id = new.post_id
        and not coalesce(c.is_deleted, false);
    end if;
  end if;

  if reply_user is not null then
    perform public.fw_insert_notification(reply_user, new.user_id, 'comment_reply', 'comment', new.id::text, new.content);
  end if;
  if reply_user is null or p.user_id is distinct from reply_user then
    perform public.fw_insert_notification(p.user_id, new.user_id, 'comment', 'post', new.post_id::text, new.content);
  end if;
  return new;
end;
$$;
-- This privileged trigger function is invoked by the existing INSERT trigger,
-- never as a client RPC. No client needs EXECUTE permission.
revoke execute on function public.fw_notify_post_comment() from public, anon, authenticated;

with replies as (
  select c.*, coalesce(
    case when c.reply_to_comment_id is null then (
      select t.user_id from public.comments t
      where t.post_id=c.post_id and t.id<>c.id and t.user_id=c.reply_to_user_id
        and not coalesce(t.is_deleted,false)
        and (t.id=c.parent_comment_id or t.parent_comment_id=c.parent_comment_id)
      order by t.id desc limit 1
    ) end, parent.user_id
  ) as recipient
  from public.comments c
  join public.posts p on p.id=c.post_id and not coalesce(p.is_deleted,false)
  left join public.comments parent on parent.id=coalesce(c.reply_to_comment_id,c.parent_comment_id)
    and parent.post_id=c.post_id and not coalesce(parent.is_deleted,false)
  where not coalesce(c.is_deleted,false)
)
insert into public.notifications(user_id,actor_id,type,target_type,target_id,content,is_read,created_at)
select recipient,user_id,'comment_reply','comment',id::text,left(coalesce(content,''),120),
  created_at < now()-interval '3 days',created_at
from replies r
where recipient is not null and recipient<>user_id
  and not exists(select 1 from public.notifications n
    where n.user_id=r.recipient and n.type='comment_reply' and n.target_id=r.id::text);
