import { sendTencentEmail } from './tencent.mjs';

export const DEFAULTS = Object.freeze({
  region: 'ap-hongkong',
  from: 'FW研究所 <fw@mail.fwyanjiusuo.com>',
  signupTemplate: 227616,
  recoveryTemplate: 227617,
});
const MAX_BODY_BYTES = 64 * 1024;
const json = (status, body) => Response.json(body, {
  status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
});
const failure = (status, message) => json(status, {error: {http_code: status, message}});
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value) ? value : 'unknown';
const value = (env, key) => String(env(key) || '').trim();

async function readBody(req) {
  if (Number(req.headers.get('content-length')) > MAX_BODY_BYTES) throw new Error('too_large');
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('too_large'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}

// Only signup/resend and recovery are enabled for the two approved-use templates.
// Reject other actions explicitly instead of sending misleading registration text.
export function createHandler({env, verify, fetcher = fetch, now = Date.now, logger = console}) {
  // Best effort retry deduplication within an isolate; not a durable outbox.
  const delivered = new Map();
  const inFlight = new Map();
  return async function handle(req) {
    const secretId = value(env, 'TENCENTCLOUD_SECRET_ID');
    const secretKey = value(env, 'TENCENTCLOUD_SECRET_KEY');
    const hookSecret = value(env, 'SEND_EMAIL_HOOK_SECRET');
    if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
      return json(200, {
        service: 'fw-send-auth-email',
        ready: Boolean(secretId && secretKey && hookSecret),
        configured: {tencent_secret_id: Boolean(secretId), tencent_secret_key: Boolean(secretKey), hook_secret: Boolean(hookSecret)},
        region: DEFAULTS.region,
        templates: {signup: DEFAULTS.signupTemplate, recovery: DEFAULTS.recoveryTemplate},
        supported_actions: ['signup', 'recovery'],
      });
    }
    if (req.method !== 'POST') return failure(405, '仅支持 POST。');
    const id = req.headers.get('webhook-id');
    const timestamp = req.headers.get('webhook-timestamp');
    const signature = req.headers.get('webhook-signature');
    if (!id || id.length > 128 || !timestamp || !signature || signature.length > 2048) {
      return failure(401, '邮件请求签名无效。');
    }
    if (!hookSecret || !secretId || !secretKey) return failure(503, '邮件服务尚未完成配置。');
    let body;
    try { body = await readBody(req); }
    catch (error) { return failure(error.message === 'too_large' ? 413 : 400, '邮件请求格式无效。'); }
    let payload;
    try { payload = await verify(body, Object.fromEntries(req.headers), hookSecret); }
    catch { return failure(401, '邮件请求签名无效。'); }
    const action = payload?.email_data?.email_action_type;
    if (action !== 'signup' && action !== 'recovery') {
      logger.error(JSON.stringify({event: 'auth_email_unsupported_action', action: safeId(action)}));
      return failure(422, '该邮件操作尚未配置对应模板。');
    }
    const email = payload?.user?.email;
    const token = payload?.email_data?.token;
    // The OTP comes from signed Supabase Auth data and is never generated here.
    if (typeof email !== 'string' || email.length > 320 || !/^[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+$/.test(email) ||
        typeof token !== 'string' || !/^\d{6,10}$/.test(token)) {
      return failure(400, '邮件请求缺少有效邮箱或验证码。');
    }
    const key = id;
    for (const [oldId, expiry] of delivered) if (expiry < now()) delivered.delete(oldId);
    if (delivered.has(key)) return json(200, {});
    if (inFlight.has(key)) return inFlight.get(key).then(response => response.clone());
    const work = (async () => {
      try {
        const result = await sendTencentEmail({
          config: {secretId, secretKey, from: DEFAULTS.from, region: DEFAULTS.region},
          email, token,
          templateId: action === 'signup' ? DEFAULTS.signupTemplate : DEFAULTS.recoveryTemplate,
          subject: action === 'signup' ? 'FW研究所注册验证码' : 'FW研究所找回密码验证码',
          fetcher, now,
        });
        if (delivered.size >= 1000) delivered.delete(delivered.keys().next().value);
        delivered.set(key, now() + 5 * 60 * 1000);
        logger.info(JSON.stringify({event: 'auth_email_accepted', action, request_id: safeId(result.requestId)}));
        return json(200, {});
      } catch (error) {
        // Never log payloads, addresses, codes, credentials, or provider error messages.
        logger.error(JSON.stringify({event: 'auth_email_failed', action, provider_code: safeId(error.code), request_id: safeId(error.requestId)}));
        return failure(502, '验证码邮件发送失败，请稍后重试。');
      }
    })();
    inFlight.set(key, work);
    try { return (await work).clone(); }
    finally { inFlight.delete(key); }
  };
}
