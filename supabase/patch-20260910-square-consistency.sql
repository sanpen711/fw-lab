-- F.w 研究所：精神广场状态、媒体容量与回复通知规则收口。
-- 可重复执行；保留 status_tag 列只为兼容旧客户端，所有值统一为“精神广场”。

begin;

alter table public.posts
  alter column status_tag set default '精神广场';

update public.posts
set status_tag = '精神广场'
where status_tag is distinct from '精神广场';

create or replace function public.fw_normalize_post_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.status_tag := '精神广场';
  return new;
end;
$$;

drop trigger if exists fw_posts_normalize_status_before_write on public.posts;
create trigger fw_posts_normalize_status_before_write
  before insert or update of status_tag on public.posts
  for each row execute function public.fw_normalize_post_status();

alter table public.posts drop constraint if exists posts_content_check;
alter table public.posts
  add constraint posts_content_check check (char_length(content) between 1 and 4000);

alter table public.comments drop constraint if exists comments_content_check;
alter table public.comments
  add constraint comments_content_check check (char_length(content) between 1 and 4000);

create or replace function public.fw_notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  reply_user uuid;
begin
  select id, user_id, content, is_deleted
  into p
  from public.posts
  where id = new.post_id
  limit 1;

  if p.id is null or coalesce(p.is_deleted, false) then
    return new;
  end if;

  if coalesce(new.reply_to_comment_id, new.parent_comment_id) is not null then
    select c.user_id
    into reply_user
    from public.comments c
    where c.id = coalesce(new.reply_to_comment_id, new.parent_comment_id)
      and c.post_id = new.post_id
      and not coalesce(c.is_deleted, false)
    limit 1;
  end if;

  if reply_user is not null then
    perform public.fw_insert_notification(
      reply_user,
      new.user_id,
      'comment_reply',
      'comment',
      new.id::text,
      new.content
    );
  end if;

  if reply_user is null or p.user_id is distinct from reply_user then
    perform public.fw_insert_notification(
      p.user_id,
      new.user_id,
      'comment',
      'post',
      new.post_id::text,
      new.content
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.fw_insert_notification(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.fw_notify_post_comment() from public, anon, authenticated;
revoke execute on function public.fw_normalize_post_status() from public, anon, authenticated;

commit;
