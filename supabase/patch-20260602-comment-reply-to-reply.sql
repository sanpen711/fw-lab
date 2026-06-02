-- F.w 研究所数据库补丁 06B：支持“回复回复”
-- 使用方法：先执行 patch-20260602-comment-parent-reply.sql，再执行本文件。
-- 设计：parent_comment_id 保持为楼层根评论；reply_to_comment_id 记录实际回复的是哪条评论/回复。
-- 可重复运行。

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS reply_to_comment_id bigint NULL REFERENCES public.comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS comments_reply_to_comment_id_idx ON public.comments(reply_to_comment_id);

-- 历史兼容：以前只有 parent_comment_id 的回复，默认实际回复对象就是 parent_comment_id。
UPDATE public.comments
SET reply_to_comment_id = parent_comment_id
WHERE parent_comment_id IS NOT NULL
  AND reply_to_comment_id IS NULL;
