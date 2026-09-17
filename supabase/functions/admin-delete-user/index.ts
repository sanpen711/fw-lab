import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.55.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function listUserFiles(
  service: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await service.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data?.length) break;

    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      if (item.id) files.push(path);
      else files.push(...await listUserFiles(service, bucket, path));
    }

    if (data.length < 100) break;
    offset += data.length;
  }

  return files;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "仅支持 POST 请求" });

  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return reply(401, { error: "登录状态无效" });

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return reply(500, { error: "服务配置不完整" });

    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    const caller = userData.user;
    if (userError || !caller) return reply(401, { error: "登录状态已失效" });

    const { data: callerProfile, error: callerError } = await service
      .from("profiles")
      .select("id,role,is_banned")
      .eq("id", caller.id)
      .maybeSingle();
    if (callerError || !callerProfile || callerProfile.role !== "admin" || callerProfile.is_banned) {
      return reply(403, { error: "只有正常状态的管理员可以删除账号" });
    }

    const payload = await request.json().catch(() => ({}));
    const targetUserId = String(payload?.targetUserId || "").trim();
    const confirmCode = String(payload?.confirmCode || "").trim();
    const confirmText = String(payload?.confirmText || "").trim();
    const reason = String(payload?.reason || "").trim().slice(0, 240);

    if (!targetUserId || !confirmCode || confirmText !== "永久删除" || reason.length < 2) {
      return reply(400, { error: "请填写删除原因、账号编号，并输入“永久删除”" });
    }
    if (targetUserId === caller.id) return reply(400, { error: "不能删除当前登录的管理员账号" });

    const { data: target, error: targetError } = await service
      .from("profiles")
      .select("id,nickname,lab_code,role,is_banned")
      .eq("id", targetUserId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return reply(404, { error: "目标账号不存在或已删除" });
    if (target.role === "admin") return reply(400, { error: "管理员账号禁止在管理台删除" });

    const expectedCode = target.lab_code || target.id;
    if (confirmCode !== expectedCode) return reply(400, { error: "账号编号不匹配，请重新确认" });

    const wasBanned = Boolean(target.is_banned);
    const { error: banError } = await service.from("profiles").update({ is_banned: true }).eq("id", target.id);
    if (banError) throw banError;

    let removedFiles = 0;
    const { data: buckets, error: bucketsError } = await service.storage.listBuckets();
    if (bucketsError) throw bucketsError;

    for (const bucket of buckets || []) {
      const files = await listUserFiles(service, bucket.id, target.id);
      for (let index = 0; index < files.length; index += 100) {
        const batch = files.slice(index, index + 100);
        const { error: removeError } = await service.storage.from(bucket.id).remove(batch);
        if (removeError) throw removeError;
        removedFiles += batch.length;
      }
    }

    const { error: logError } = await service.from("moderation_logs").insert({
      target_type: "user",
      target_id: target.id,
      target_user_id: target.id,
      target_display_name: target.nickname || "某位研究员",
      action: "delete_account",
      reason,
      public_visible: false,
      created_by: caller.id,
    });
    if (logError) throw logError;

    const { error: deleteError } = await service.auth.admin.deleteUser(target.id, false);
    if (deleteError) {
      if (!wasBanned) await service.from("profiles").update({ is_banned: false }).eq("id", target.id);
      throw deleteError;
    }

    return reply(200, {
      ok: true,
      deletedUserId: target.id,
      deletedNickname: target.nickname || "用户",
      removedFiles,
    });
  } catch (error) {
    console.error("admin-delete-user failed", error);
    return reply(500, { error: error instanceof Error ? error.message : "删除账号失败" });
  }
});
