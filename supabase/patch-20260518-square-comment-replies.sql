-- F.w 研究所数据库补丁 06：精神广场一级回复
-- 使用方法：Supabase SQL Editor 执行。可重复运行。

alter table public.comments
  add column if not exists parent_comment_id bigint references public.comments(id) on delete cascade;

create index if not exists comments_parent_comment_id_idx
  on public.comments(parent_comment_id);
