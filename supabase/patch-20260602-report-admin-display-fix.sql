-- F.w 研究所数据库补丁 05B：举报后台展示与处理补丁
-- 使用方法：先执行 patch-20260602-report-closure.sql 成功后，再执行本文件。
-- 作用：让后台举报中心能区分 post/comment/user/chat_message，并把帖子/评论 ID 传给前端用于直接处理。

DROP FUNCTION IF EXISTS public.admin_list_chat_reports();

CREATE FUNCTION public.admin_list_chat_reports()
RETURNS TABLE(
  id bigint,
  message_id bigint,
  reporter_id uuid,
  reporter_name text,
  target_user_id uuid,
  target_name text,
  room_key text,
  message_content text,
  report_reason text,
  status text,
  created_at timestamptz,
  handled_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id,
         r.message_id,
         r.reporter_id,
         rp.nickname AS reporter_name,
         m.user_id AS target_user_id,
         tp.nickname AS target_name,
         'chat_message'::text AS room_key,
         m.content AS message_content,
         COALESCE(r.report_reason, '用户举报') AS report_reason,
         COALESCE(r.status, 'pending') AS status,
         r.created_at,
         r.handled_at
  FROM public.chat_message_reports r
  LEFT JOIN public.chat_messages m ON m.id = r.message_id
  LEFT JOIN public.profiles rp ON rp.id = r.reporter_id
  LEFT JOIN public.profiles tp ON tp.id = m.user_id
  WHERE public.is_admin()

  UNION ALL

  SELECT -sr.id AS id,
         CASE
           WHEN sr.target_type IN ('post','comment') AND sr.target_id ~ '^[0-9]+$' THEN sr.target_id::bigint
           ELSE NULL::bigint
         END AS message_id,
         sr.reporter_id,
         rp.nickname AS reporter_name,
         sr.target_user_id,
         sr.target_display_name AS target_name,
         sr.target_type AS room_key,
         sr.target_preview AS message_content,
         sr.report_reason,
         sr.status,
         sr.created_at,
         sr.handled_at
  FROM public.site_reports sr
  LEFT JOIN public.profiles rp ON rp.id = sr.reporter_id
  WHERE public.is_admin()

  ORDER BY created_at DESC
  LIMIT 240;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_chat_reports() TO authenticated;
