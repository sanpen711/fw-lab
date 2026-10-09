import {
  deepStrictEqual,
  equal,
  ok,
  rejects,
  throws,
} from "node:assert/strict";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { Buffer } from "node:buffer";
import { AlipaySdk } from "npm:alipay-sdk@4.14.0";
import {
  alipayPaymentTime,
  alipayTimestamp,
  amountToCents,
  centsToAmount,
  type CheckoutOrder,
  checkoutUrl,
  makeAlipayClient,
  parseNotification,
  queryAlipay,
  readLimitedText,
  readPaymentSettings,
  signedJsonValue,
  validateTrade,
  verifyNotification,
} from "../functions/_shared/alipay.ts";

// Synthetic keys are generated in memory; these tests never contact Alipay.
const app = generateKeyPairSync("rsa", { modulusLength: 2048 });
const provider = generateKeyPairSync("rsa", { modulusLength: 2048 });
const sellerId = "2088000000000001";
const envValues: Record<string, string> = {
  ALIPAY_APP_PRIVATE_KEY: app.privateKey.export({
    format: "pem",
    type: "pkcs8",
  }).toString(),
  ALIPAY_PUBLIC_KEY: provider.publicKey.export({ format: "pem", type: "spki" })
    .toString(),
  ALIPAY_SELLER_ID: sellerId,
  FW_ALIPAY_ENABLED: "true",
};
const settings = readPaymentSettings((name) => envValues[name]);
const order: CheckoutOrder = {
  id: crypto.randomUUID(),
  user_id: crypto.randomUUID(),
  plan_id: "monthly",
  plan_name: "月度会员",
  duration_months: 1,
  order_no: "FW0123456789abcdef0123456789abcdef",
  amount_cents: 200,
  status: "pending",
  payment_method: "alipay",
  payment_app_id: settings.appId,
  payment_seller_id: sellerId,
  payment_expires_at: new Date(Date.now() + 600000).toISOString(),
  paid_at: null,
  provider_checked_at: null,
};
const fields = {
  app_id: settings.appId,
  seller_id: sellerId,
  out_trade_no: order.order_no,
  total_amount: "2.00",
  trade_no: "2026100922001400000000000001",
  trade_status: "TRADE_SUCCESS",
  gmt_payment: "2026-10-09 16:00:00",
  notify_id: "synthetic-notify",
  notify_type: "trade_status_sync",
  subject: "FW研究所 100% + 会员",
  future_field: "保留未知字段&=",
  empty_field: "",
};
function signedFields(values: Record<string, string>) {
  const raw = Object.keys(values).sort().map((key) => `${key}=${values[key]}`)
    .join("&");
  return {
    ...values,
    sign_type: "RSA2",
    sign: sign("RSA-SHA256", Buffer.from(raw), provider.privateKey).toString(
      "base64",
    ),
  };
}

Deno.test("configuration stays closed until valid seller and PKCS8 signing key exist", () => {
  const defaults = readPaymentSettings(() => undefined);
  equal(defaults.enabled, false);
  equal(defaults.maxAmountCents, 5000);
  deepStrictEqual(defaults.missing, [
    "ALIPAY_SELLER_ID",
    "ALIPAY_APP_PRIVATE_KEY",
  ]);
  equal(settings.enabled, true);
  const publicLines = settings.publicKey.trim().split("\n").slice(1, -1);
  ok(publicLines.every((line) => line.length <= 64));
  ok(publicLines.slice(0, -1).every((line) => line.length === 64));
  const invalid = readPaymentSettings((name) =>
    name === "ALIPAY_MAX_AMOUNT_CENTS" ? "5000.5" : envValues[name]
  );
  equal(invalid.enabled, false);
  ok(invalid.missing.includes("ALIPAY_MAX_AMOUNT_CENTS"));
  const pkcs1 = app.privateKey.export({ format: "pem", type: "pkcs1" })
    .toString();
  equal(
    readPaymentSettings((name) =>
      name === "ALIPAY_APP_PRIVATE_KEY" ? pkcs1 : envValues[name]
    ).enabled,
    false,
  );
  const raw = app.privateKey.export({ format: "der", type: "pkcs8" }).toString(
    "base64",
  );
  equal(
    readPaymentSettings((name) =>
      name === "ALIPAY_APP_PRIVATE_KEY" ? raw : envValues[name]
    ).enabled,
    true,
  );
});

Deno.test("money uses exact integer cents and rejects ambiguous or zero amounts", () => {
  for (
    const [value, cents] of [["2", 200], ["2.0", 200], ["2.00", 200], [
      "0.01",
      1,
    ], ["25.99", 2599]] as const
  ) equal(amountToCents(value), cents);
  equal(centsToAmount(2599), "25.99");
  for (
    const value of ["0", "-2", "2.001", "2e0", "02.00", " 2.00", "2.", 2, NaN]
  ) throws(() => amountToCents(value));
  throws(() => centsToAmount(2.01));
});

Deno.test("signed cashier URL binds the stored price, seller, expiry and notify endpoint", () => {
  const url = new URL(
    checkoutUrl(
      makeAlipayClient(settings),
      order,
      "https://example.invalid/functions/v1/alipay-notify",
    ),
  );
  equal(url.origin, "https://openapi.alipay.com");
  equal(url.pathname, "/gateway.do");
  equal(url.searchParams.get("method"), "alipay.trade.page.pay");
  const biz = JSON.parse(url.searchParams.get("biz_content")!);
  equal(biz.total_amount, "2.00");
  equal(biz.seller_id, sellerId);
  equal(biz.out_trade_no, order.order_no);
  equal(biz.time_expire, alipayTimestamp(new Date(order.payment_expires_at)));
  equal(biz.product_code, "FAST_INSTANT_TRADE_PAY");
  equal(
    url.searchParams.get("notify_url"),
    "https://example.invalid/functions/v1/alipay-notify",
  );
  const canonical = [...url.searchParams].filter(([key]) => key !== "sign")
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([key, value]) => `${key}=${value}`).join("&");
  ok(
    verify(
      "RSA-SHA256",
      Buffer.from(canonical),
      app.publicKey,
      Buffer.from(url.searchParams.get("sign")!, "base64"),
    ),
  );
  throws(() =>
    checkoutUrl(
      makeAlipayClient(settings),
      { ...order, status: "paid" },
      "https://example.invalid",
    )
  );
  throws(() =>
    checkoutUrl(makeAlipayClient(settings), {
      ...order,
      payment_expires_at: "2020-01-01T00:00:00Z",
    }, "https://example.invalid")
  );
});

Deno.test("notification verifies decoded fields once and detects tampering", () => {
  const parsed = parseNotification(
    new URLSearchParams(signedFields(fields)).toString(),
  );
  equal(parsed.subject, fields.subject);
  ok(verifyNotification(parsed, settings.publicKey));
  equal(validateTrade(parsed, order, settings, true), 200);
  equal(
    verifyNotification({ ...parsed, subject: "被篡改" }, settings.publicKey),
    false,
  );
  equal(
    verifyNotification({ ...parsed, sign_type: "RSA" }, settings.publicKey),
    false,
  );
  equal(
    verifyNotification(
      { ...parsed, future_field: undefined } as unknown as Record<
        string,
        string
      >,
      settings.publicKey,
    ),
    false,
  );
  throws(() => parseNotification("total_amount=2.00&total_amount=0.01"));
  throws(() =>
    validateTrade(
      { ...fields, app_id: "2021000000000000" },
      order,
      settings,
      true,
    )
  );
  throws(() =>
    validateTrade(
      { ...fields, seller_id: "2088000000000002" },
      order,
      settings,
      true,
    )
  );
  throws(() =>
    validateTrade({ ...fields, total_amount: "0.01" }, order, settings, true)
  );
  throws(() =>
    validateTrade({ ...fields, out_trade_no: "other" }, order, settings, true)
  );
  throws(() =>
    validateTrade({ ...fields, trade_status: "UNKNOWN" }, order, settings, true)
  );
});

Deno.test("query signature validates raw provider JSON, with optional identity fields checked", async () => {
  const client = makeAlipayClient(settings);
  // SDK is a cross-check in tests; production has no Node HTTP dependency.
  const sdk = new AlipaySdk({
    appId: settings.appId,
    // The SDK formatter expects the footer to be the final split line.
    privateKey: settings.privateKey.trim(),
    alipayPublicKey: settings.publicKey.trim(),
    keyType: "PKCS8",
  });
  const rawPayload =
    '{"code":"10000","msg":"Success","subject":"FW研究所","total_amount":"2.00"}';
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(rawPayload),
    provider.privateKey,
  ).toString("base64");
  const raw =
    `{"alipay_trade_query_response":${rawPayload},"sign":"${signature}"}`;
  sdk.checkResponseSign(
    raw,
    "alipay_trade_query_response",
    signature,
    "synthetic",
  );
  let responseBody = raw;
  const mockFetch: typeof fetch = (url, options) => {
    equal(url, "https://openapi.alipay.com/gateway.do");
    equal(options?.method, "POST");
    const parameters = new URLSearchParams(String(options?.body));
    equal(parameters.get("method"), "alipay.trade.query");
    equal(
      JSON.parse(parameters.get("biz_content")!).out_trade_no,
      order.order_no,
    );
    return Promise.resolve(new Response(responseBody));
  };
  const result = await queryAlipay(client, order.order_no, mockFetch);
  equal(result.code, "10000");
  equal(result.total_amount, "2.00");
  responseBody = raw.replace('"2.00"', '"0.01"');
  await rejects(() => queryAlipay(client, order.order_no, mockFetch));
  responseBody = JSON.stringify({
    alipay_trade_query_response: { code: "10000", total_amount: "2.00" },
  });
  await rejects(() => queryAlipay(client, order.order_no, mockFetch));
  throws(() =>
    sdk.checkResponseSign(
      raw.replace('"2.00"', '"0.01"'),
      "alipay_trade_query_response",
      signature,
      "synthetic",
    )
  );
  const query = {
    out_trade_no: order.order_no,
    trade_no: fields.trade_no,
    total_amount: "2.00",
    trade_status: "TRADE_SUCCESS",
  };
  equal(validateTrade(query, order, settings, false), 200);
  throws(() => validateTrade(query, order, settings, true));
  throws(() =>
    validateTrade(
      { ...query, seller_id: "2088000000000002" },
      order,
      settings,
      false,
    )
  );
});

Deno.test("raw signed JSON extraction preserves nesting, escapes, whitespace and rejects duplicate keys", () => {
  const payload =
    '{ "code": "10000", "text": "引号\\"和括号}{", "items":[{"value":"a\\\\b"}], "total_amount":"2.00" }';
  const key = "alipay_trade_query_response";
  equal(
    signedJsonValue(
      `{ "sign": "abc", "${key}" : ${payload}, "extra":[1,2] }`,
      key,
    ),
    payload,
  );
  equal(
    signedJsonValue(`{"extra":"${key}","${key}":${payload},"sign":"abc"}`, key),
    payload,
  );
  throws(() => signedJsonValue(`{"${key}":{},"${key}":{},"sign":"abc"}`, key));
  throws(() => signedJsonValue('{"a":1,"\\u0061":2,"target":{}}', "target"));
  throws(() => signedJsonValue('{"sign":"abc"}', key));
  throws(() => signedJsonValue("not JSON", key));
});

Deno.test("Alipay timestamps are Shanghai time and invalid dates are rejected", () => {
  equal(
    alipayTimestamp(new Date("2026-10-09T07:00:00Z")),
    "2026-10-09 15:00:00",
  );
  equal(alipayPaymentTime("2026-10-09 15:00:00"), "2026-10-09T07:00:00.000Z");
  throws(() => alipayPaymentTime("2026-02-30 00:00:00"));
  throws(() => alipayPaymentTime("2026-10-09T15:00:00"));
});

Deno.test("request body limits apply even without content-length", async () => {
  equal(
    await readLimitedText(
      new Request("https://example.invalid", { method: "POST", body: "会员" }),
      6,
    ),
    "会员",
  );
  await rejects(() =>
    readLimitedText(
      new Request("https://example.invalid", { method: "POST", body: "会员" }),
      5,
    )
  );
});
