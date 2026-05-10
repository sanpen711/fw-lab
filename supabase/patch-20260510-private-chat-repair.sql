-- F.w 研究所数据库补丁 04：私聊会话 RPC 修复
-- 适用问题：发送私聊时报错 private_messages_conversation_id_fkey
-- 原因：旧版/混合版 RPC 可能把不存在的 conversation_id 写入 private_messages。
-- 使用方法：在 Supabase SQL Editor 运行本文件；运行后刷新网站再测试私聊。
-- 可重复运行。

-- 1. 先删除旧版私聊 RPC，避免旧函数返回值/逻辑残留
DROP FUNCTION IF EXISTS public.fw_get_or_create_conversation(uuid);
DROP FUNCTION IF EXISTS public.fw_send_private_message(bigint, text);

-- 2. 获取或创建私聊会话：只返回 public.conversations.id
CREATE FUNCTION public.fw_get_or_create_conversation(target_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  conv_id bigint;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION '请先登录。';
  END IF;

  IF target_user_id IS NULL OR target_user_id = me THEN
    RAISE EXCEPTION '无法创建私聊。';
  END IF;

  IF NOT public.is_not_banned() THEN
    RAISE EXCEPTION '当前账号无法使用私聊。';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships
    WHERE status = 'accepted'
      AND (
        (requester_id = me AND receiver_id = target_user_id)
        OR
        (requester_id = target_user_id AND receiver_id = me)
      )
  ) THEN
    RAISE EXCEPTION '只有成为搭子后才能私聊。';
  END IF;

  SELECT id INTO conv_id
  FROM public.conversations
  WHERE (user_one_id = me AND user_two_id = target_user_id)
     OR (user_one_id = target_user_id AND user_two_id = me)
  LIMIT 1;

  IF conv_id IS NULL THEN
    BEGIN
      INSERT INTO public.conversations(user_one_id, user_two_id)
      VALUES(me, target_user_id)
      RETURNING id INTO conv_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO conv_id
      FROM public.conversations
      WHERE (user_one_id = me AND user_two_id = target_user_id)
         OR (user_one_id = target_user_id AND user_two_id = me)
      LIMIT 1;
    END;
  END IF;

  IF conv_id IS NULL THEN
    RAISE EXCEPTION '私聊会话创建失败，请刷新后重试。';
  END IF;

  RETURN conv_id;
END;
$$;

-- 3. 发送私聊：必须先确认会话真实存在，并且当前用户是会话成员
CREATE FUNCTION public.fw_send_private_message(target_conversation_id bigint, message_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  c public.conversations;
  receiver uuid;
  msg_id bigint;
  clean_text text := trim(coalesce(message_text, ''));
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION '请先登录。';
  END IF;

  IF NOT public.can_chat() THEN
    RAISE EXCEPTION '当前账号无法发送消息。';
  END IF;

  IF target_conversation_id IS NULL THEN
    RAISE EXCEPTION '私聊会话不存在，请关闭窗口重新打开私聊。';
  END IF;

  IF char_length(clean_text) < 1 OR char_length(clean_text) > 300 THEN
    RAISE EXCEPTION '私聊最多 300 字。';
  END IF;

  SELECT * INTO c
  FROM public.conversations
  WHERE id = target_conversation_id
    AND (user_one_id = me OR user_two_id = me)
  LIMIT 1;

  IF c.id IS NULL THEN
    RAISE EXCEPTION '私聊会话不存在或无权发送，请关闭窗口重新打开私聊。';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships
    WHERE status = 'accepted'
      AND (
        (requester_id = c.user_one_id AND receiver_id = c.user_two_id)
        OR
        (requester_id = c.user_two_id AND receiver_id = c.user_one_id)
      )
  ) THEN
    RAISE EXCEPTION '只有成为搭子后才能私聊。';
  END IF;

  receiver := CASE WHEN c.user_one_id = me THEN c.user_two_id ELSE c.user_one_id END;

  INSERT INTO public.private_messages(conversation_id, sender_id, content)
  VALUES(c.id, me, clean_text)
  RETURNING id INTO msg_id;

  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = c.id;

  INSERT INTO public.notifications(user_id, actor_id, type, target_type, target_id, content)
  VALUES(receiver, me, 'private_message', 'private_message', msg_id, left(clean_text, 80));
END;
$$;

-- 4. 授权
GRANT EXECUTE ON FUNCTION public.fw_get_or_create_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fw_send_private_message(bigint, text) TO authenticated;
