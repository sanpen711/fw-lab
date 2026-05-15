-- F.w 研究所：评论回复 / 回声通知增强 SQL
-- 用途：支持评论回复、回复回声提醒、评论精确时间。
-- 运行位置：Supabase SQL Editor。

-- 1. 评论表增加“一层回复”字段。
alter table public.comments
  add column if not exists parent_comment_id bigint null references public.comments(id) on delete set null,
  add column if not exists reply_to_user_id uuid null references public.profiles(id) on delete set null;

create index if not exists comments_parent_comment_id_idx on public.comments(parent_comment_id);
create index if not exists comments_reply_to_user_id_idx on public.comments(reply_to_user_id);
create index if not exists comments_post_created_idx on public.comments(post_id, created_at);

-- 2. 允许已有通知系统记录评论回复类型。
-- 如果你的 notifications.type 没有 check 约束，这段不会产生额外影响。
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table public.notifications drop constraint if exists %I', con.conname);
  end loop;
exception when undefined_table then
  null;
end $$;

-- 3. 补一个更宽松的通知类型约束，避免旧约束不认识 comment_reply。
do $$
begin
  if to_regclass('public.notifications') is not null then
    alter table public.notifications
      add constraint notifications_type_check
      check (type in (
        'like',
        'same',
        'tissue',
        'comment',
        'comment_reply',
        'private_message',
        'friend_request',
        'friend_accept',
        'chat_agree',
        'report',
        'system'
      ))
      not valid;
  end if;
exception when duplicate_object then
  null;
end $$;
