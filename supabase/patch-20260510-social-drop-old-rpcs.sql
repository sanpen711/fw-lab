-- F.w 研究所临时修复：删除旧版搭子 / 私聊 RPC
-- 使用方法：如果运行 patch-20260510-social.sql 时出现 42P13 cannot change return type，先运行本文件，再重新运行 patch-20260510-social.sql。
-- 可重复运行。

DROP FUNCTION IF EXISTS public.fw_send_friend_request(uuid);
DROP FUNCTION IF EXISTS public.fw_respond_friendship(bigint, boolean);
DROP FUNCTION IF EXISTS public.fw_remove_friendship(bigint);
DROP FUNCTION IF EXISTS public.fw_block_user(uuid);
DROP FUNCTION IF EXISTS public.fw_get_or_create_conversation(uuid);
DROP FUNCTION IF EXISTS public.fw_send_private_message(bigint, text);
