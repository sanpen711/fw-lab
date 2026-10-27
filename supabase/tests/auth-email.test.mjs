import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { createHandler } from '../functions/fw-send-auth-email/handler.mjs';
import { signRequest } from '../functions/fw-send-auth-email/tencent.mjs';
import { verifyPayload } from '../functions/fw-send-auth-email/webhook.ts';

// Synthetic values only. No real credentials or outgoing mail in this suite.
const SECRET = 'v1,whsec_' + btoa('test-only-hook-secret-do-not-use');
const ENV = {TENCENTCLOUD_SECRET_ID: 'test-secret-id', TENCENTCLOUD_SECRET_KEY: 'test-secret-key', SEND_EMAIL_HOOK_SECRET: SECRET};
const PAYLOAD = {user: {email: 'test@example.com'}, email_data: {token: '012345', email_action_type: 'signup'}};
const url = 'https://example.com/functions/v1/fw-send-auth-email';
let serial = 0;

function request(payload = PAYLOAD, {id = `test-${++serial}`, time = new Date(), secret = SECRET, modify = body => body} = {}) {
  const body = JSON.stringify(payload);
  const signature = new Webhook(secret.replace(/^v1,/, '')).sign(id, time, body);
  return new Request(url, {method: 'POST', headers: {
    'content-type': 'application/json', 'webhook-id': id,
    'webhook-timestamp': String(Math.floor(time.getTime() / 1000)), 'webhook-signature': signature,
  }, body: modify(body)});
}
function setup({environment = ENV, provider} = {}) {
  const calls = [], logs = [];
  const handler = createHandler({
    env: key => environment[key], verify: verifyPayload,
    fetcher: async (endpoint, options) => {
      calls.push({endpoint, ...options});
      return provider ? provider(calls.length) : Response.json({Response: {MessageId: 'test-message-id', RequestId: 'test-request-id'}});
    },
    logger: {info: line => logs.push(line), error: line => logs.push(line)},
  });
  return {handler, calls, logs};
}

Deno.test('health reports presence only and accurately reports a missing hook secret', async () => {
  const {handler, calls} = setup({environment: {...ENV, SEND_EMAIL_HOOK_SECRET: ''}});
  const response = await handler(new Request(url + '/health'));
  const text = await response.text();
  const result = JSON.parse(text);
  assert.equal(result.ready, false);
  assert.deepEqual(result.configured, {tencent_secret_id: true, tencent_secret_key: true, hook_secret: false});
  for (const secret of Object.values(ENV)) assert.equal(text.includes(secret), false);
  assert.equal(calls.length, 0);
});

Deno.test('unsigned requests and unsupported methods never call Tencent', async () => {
  const {handler, calls} = setup();
  assert.equal((await handler(new Request(url, {method: 'POST', body: JSON.stringify(PAYLOAD)}))).status, 401);
  assert.equal((await handler(new Request(url))).status, 405);
  assert.equal(calls.length, 0);
});

for (const mode of ['tampered', 'wrong-key', 'expired', 'future']) {
  Deno.test(`signature rejects ${mode} requests before sending`, async () => {
    const {handler, calls} = setup();
    const options = mode === 'tampered' ? {modify: body => body.replace('012345', '999999')} :
      mode === 'wrong-key' ? {secret: 'whsec_' + btoa('wrong-test-key')} :
      {time: new Date(Date.now() + (mode === 'expired' ? -600000 : 600000))};
    assert.equal((await handler(request(PAYLOAD, options))).status, 401);
    assert.equal(calls.length, 0);
  });
}

for (const action of ['signup', 'recovery']) {
  Deno.test(`${action} sends the original OTP to one recipient using the correct template`, async () => {
    const {handler, calls, logs} = setup();
    const response = await handler(request({...PAYLOAD, email_data: {...PAYLOAD.email_data, email_action_type: action}}));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {});
    assert.equal(calls.length, 1);
    const call = calls[0], data = JSON.parse(call.body);
    assert.equal(call.endpoint, 'https://ses.tencentcloudapi.com/');
    assert.deepEqual(data.Destination, ['test@example.com']);
    assert.equal(data.FromEmailAddress, 'FW研究所 <fw@mail.fwyanjiusuo.com>');
    assert.equal(data.Template.TemplateID, action === 'signup' ? 227616 : 227617);
    assert.deepEqual(JSON.parse(data.Template.TemplateData), {code: '012345'});
    assert.equal(data.Subject, action === 'signup' ? 'FW研究所注册验证码' : 'FW研究所找回密码验证码');
    assert.equal(data.TriggerType, 1);
    assert.equal(call.headers['X-TC-Region'], 'ap-hongkong');
    assert.equal(call.headers['X-TC-Version'], '2020-10-02');
    assert.equal(call.redirect, 'error');
    for (const value of [...Object.values(ENV), '012345', 'test@example.com']) assert.equal(logs.join('').includes(value), false);
  });
}

Deno.test('missing server configuration fails closed', async () => {
  for (const missing of Object.keys(ENV)) {
    const {handler, calls} = setup({environment: {...ENV, [missing]: ''}});
    assert.equal((await handler(request())).status, 503);
    assert.equal(calls.length, 0);
  }
});

Deno.test('unsupported email actions are rejected instead of silently dropped', async () => {
  const {handler, calls} = setup();
  for (const action of ['magiclink', 'email_change', 'invite', 'password_changed_notification']) {
    const payload = {...PAYLOAD, email_data: {...PAYLOAD.email_data, email_action_type: action}};
    assert.equal((await handler(request(payload))).status, 422);
  }
  assert.equal(calls.length, 0);
});

Deno.test('invalid OTPs and multi-recipient injection never call the provider', async () => {
  const {handler, calls} = setup();
  for (const token of ['', '12345', 123456, '<script>', '12345678901']) {
    assert.equal((await handler(request({...PAYLOAD, email_data: {...PAYLOAD.email_data, token}}))).status, 400);
  }
  for (const email of ['test@example.com,other@example.com', 'Name <test@example.com>', 'test@example.com\r\nBcc:other@example.com']) {
    assert.equal((await handler(request({...PAYLOAD, user: {email}}))).status, 400);
  }
  assert.equal(calls.length, 0);
});

Deno.test('oversized request bodies are rejected', async () => {
  const {handler, calls} = setup();
  assert.equal((await handler(request({...PAYLOAD, padding: 'x'.repeat(65536)}))).status, 413);
  assert.equal(calls.length, 0);
});

Deno.test('HTTP 200 provider error is not reported as sent, is redacted and can be retried', async () => {
  const {handler, calls, logs} = setup({provider: count => count === 1 ?
    Response.json({Response: {Error: {Code: 'FailedOperation.InvalidTemplateID', Message: 'secret details 012345 test@example.com'}, RequestId: 'req-1'}}) :
    Response.json({Response: {MessageId: 'ok', RequestId: 'req-2'}})});
  const first = await handler(request(PAYLOAD, {id: 'retry'}));
  assert.equal(first.status, 502);
  const result = await first.text();
  assert.equal(result.includes('012345'), false);
  assert.equal(logs.join('').includes('test@example.com'), false);
  assert.equal(logs.join('').includes('secret details'), false);
  assert.match(logs.join(''), /FailedOperation.InvalidTemplateID/);
  assert.equal((await handler(request(PAYLOAD, {id: 'retry'}))).status, 200);
  assert.equal(calls.length, 2);
});

Deno.test('network timeouts, non-JSON replies and missing MessageId fail closed', async () => {
  for (const provider of [() => {throw new Error('network secret details');},
    () => new Response('not json', {status: 503}),
    () => Response.json({Response: {RequestId: 'req'}})]) {
    const {handler, logs} = setup({provider});
    assert.equal((await handler(request())).status, 502);
    assert.equal(logs.join('').includes('secret details'), false);
  }
});

Deno.test('successful duplicate callbacks send only once', async () => {
  const {handler, calls} = setup();
  assert.equal((await handler(request(PAYLOAD, {id: 'duplicate'}))).status, 200);
  assert.equal((await handler(request(PAYLOAD, {id: 'duplicate'}))).status, 200);
  assert.equal(calls.length, 1);
});

Deno.test('concurrent duplicate callbacks share the in-flight send', async () => {
  const {handler, calls} = setup({provider: async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return Response.json({Response: {MessageId: 'ok', RequestId: 'req'}});
  }});
  const responses = await Promise.all([handler(request(PAYLOAD, {id: 'concurrent'})), handler(request(PAYLOAD, {id: 'concurrent'}))]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.deepEqual(await Promise.all(responses.map(r => r.json())), [{}, {}]);
  assert.equal(calls.length, 1);
});

Deno.test('TC3 uses the published canonical-request digest and UTC signing date', async () => {
  // Tencent's published canonical hash for its DescribeInstances example:
  // https://cloud.tencent.com/document/api/213/30654
  const body = '{"Limit": 1, "Filters": [{"Values": ["\\u672a\\u547d\\u540d"], "Name": "instance-name"}]}';
  const timestamp = 1551113065;
  const headers = await signRequest({secretId: 'test-id', secretKey: 'test-key', service: 'cvm', host: 'cvm.tencentcloudapi.com', action: 'DescribeInstances', body, timestamp});
  // Independent Node crypto HMAC derivation over the documented fixed digest.
  const mac = (key, data) => createHmac('sha256', key).update(data).digest();
  const key = mac(mac(mac('TC3test-key', '2019-02-25'), 'cvm'), 'tc3_request');
  const expected = createHmac('sha256', key).update('TC3-HMAC-SHA256\n1551113065\n2019-02-25/cvm/tc3_request\n7019a55be8395899b900fb5564e4200d984910f34794a27cb3fb7d10ff6a1e84').digest('hex');
  assert.equal(headers.Authorization, `TC3-HMAC-SHA256 Credential=test-id/2019-02-25/cvm/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=${expected}`);
});
