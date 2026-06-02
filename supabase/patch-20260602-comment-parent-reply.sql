-- F.w 研究所数据库补丁 06：评论父级回复
-- 使用方法：在 Supabase SQL Editor 执行。
-- 作用：让评论回复真正写入 parent_comment_id，不再只靠“回复某某：”文本。
-- 可重复运行。

-- 1. 评论表增加父评论字段与被回复用户字段。
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_comment_id bigint NULL REFERENCES public.comments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS comments_parent_comment_id_idx ON public.comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS comments_reply_to_user_id_idx ON public.comments(reply_to_user_id);
CREATE INDEX IF NOT EXISTS comments_post_parent_created_idx ON public.comments(post_id, parent_comment_id, created_at);

-- 2. 补充通知类型 comment_reply，兼容旧 notifications.type 约束。
DO $$
DECLARE
  con record;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RETURN;
  END IF;

  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS %I', con.conname);
  END LOOP;

  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
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
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
