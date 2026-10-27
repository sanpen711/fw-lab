// TC3-HMAC-SHA256 using Web Crypto (no Node SDK or browser-side credentials).
const encoder = new TextEncoder();
const hex = (buffer) => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (value) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
async function hmac(key, value) {
  const bytes = typeof key === 'string' ? encoder.encode(key) : key;
  const imported = await crypto.subtle.importKey('raw', bytes, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return crypto.subtle.sign('HMAC', imported, encoder.encode(value));
}

// Exported for verification against Tencent's published signing example.
export async function signRequest({secretId, secretKey, service, host, action, body, timestamp}) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const contentType = 'application/json; charset=utf-8';
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const canonical = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${await sha256(body)}`;
  const scope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${await sha256(canonical)}`;
  const dateKey = await hmac(`TC3${secretKey}`, date);
  const serviceKey = await hmac(dateKey, service);
  const signingKey = await hmac(serviceKey, 'tc3_request');
  const signature = hex(await hmac(signingKey, stringToSign));
  return {
    'Content-Type': contentType,
    'Authorization': `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
  };
}

export class ProviderError extends Error {
  constructor(code, requestId = '') {
    super('Email provider rejected the request');
    this.code = code;
    this.requestId = requestId;
  }
}

export async function sendTencentEmail({config, email, token, templateId, subject, fetcher = fetch, now = Date.now}) {
  const body = JSON.stringify({
    FromEmailAddress: config.from,
    Destination: [email],
    Subject: subject,
    Template: {TemplateID: templateId, TemplateData: JSON.stringify({code: token})},
    TriggerType: 1,
  });
  const headers = await signRequest({
    secretId: config.secretId, secretKey: config.secretKey,
    service: 'ses', host: 'ses.tencentcloudapi.com', action: 'SendEmail', body,
    timestamp: Math.floor(now() / 1000),
  });
  headers['X-TC-Version'] = '2020-10-02';
  headers['X-TC-Region'] = config.region;
  let response;
  try {
    response = await fetcher('https://ses.tencentcloudapi.com/', {
      method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(4000),
    });
  } catch {
    throw new ProviderError('ProviderNetworkError');
  }
  let result;
  try { result = (await response.json()).Response; }
  catch { throw new ProviderError('InvalidProviderResponse'); }
  if (!response.ok || result?.Error || !result?.MessageId) {
    throw new ProviderError(result?.Error?.Code || 'ProviderSendFailed', result?.RequestId);
  }
  return {messageId: result.MessageId, requestId: result.RequestId};
}
