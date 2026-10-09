import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { Buffer } from "node:buffer";

// These are public identifiers supplied by the application owner. Signing keys
// must only be set through Supabase Edge Function Secrets.
export const DEFAULT_APP_ID = "2021007104686921";
export const DEFAULT_ALIPAY_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzGle+VBR7Giuho6qv3oZ2ZYymOdGdKS36YdSJvZik+oznHNdAIoshVGWABdXT4Z6jC6slLZTomTHHypAEC9XTkkR9WSgCv1y0LoFCbD0k+1MvBgM9cUMJc0/HdtnZ1qT1JhU+/6tAlcObj5INY7Me5D88s5Cj3+ofyryDXUQyOa9TVY/8+m611IwSrz+x+B9s7N082KMfn+RdNbSF6Pq6iLDSEbPIGTHtcJumlMNGJ7gwTPDVR1jmx9N16ZpYaEXfeCk0rvYVqcjgyq9C2Y3Niy8Nk5T673xetvuL6ZnaSoQTLgzMnT/CqWmYHA9BhrsJtGMk/1F6njvAPf/qs9R6QIDAQAB";

export class PaymentError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

export type PaymentSettings = {
  appId: string;
  sellerId: string;
  publicKey: string;
  privateKey: string;
  maxAmountCents: number;
  enabled: boolean;
  missing: string[];
  verificationReady: boolean;
};

function pem(value: string, label: string) {
  const normalized = value.replaceAll("\\n", "\n").trim();
  const body = normalized.replace(/-----[^\n]+-----/g, "").replace(/\s/g, "");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

export function readPaymentSettings(
  env: (name: string) => string | undefined,
): PaymentSettings {
  const appId = (env("ALIPAY_APP_ID") || DEFAULT_APP_ID).trim();
  const sellerId = (env("ALIPAY_SELLER_ID") || "").trim();
  const publicKey = pem(
    env("ALIPAY_PUBLIC_KEY") || DEFAULT_ALIPAY_PUBLIC_KEY,
    "PUBLIC KEY",
  );
  const privateInput = env("ALIPAY_APP_PRIVATE_KEY") || "";
  const privateKey = privateInput ? pem(privateInput, "PRIVATE KEY") : "";
  const maxInput = env("ALIPAY_MAX_AMOUNT_CENTS") || "5000";
  const maxAmountCents = /^\d+$/.test(maxInput) ? Number(maxInput) : NaN;
  const missing: string[] = [];
  if (!/^\d{16}$/.test(appId)) missing.push("ALIPAY_APP_ID");
  if (!/^2088\d{12}$/.test(sellerId)) missing.push("ALIPAY_SELLER_ID");
  try {
    const key = createPublicKey(publicKey);
    if (
      key.asymmetricKeyType !== "rsa" ||
      (key.asymmetricKeyDetails?.modulusLength || 0) < 2048
    ) throw new Error();
  } catch {
    missing.push("ALIPAY_PUBLIC_KEY");
  }
  const verificationReady = missing.length === 0;
  try {
    // Require the PKCS8 format selected in Alipay's key-generation tool.
    const body = privateInput.replaceAll("\\n", "\n").replace(
      /-----[^\n]+-----/g,
      "",
    ).replace(/\s/g, "");
    const key = createPrivateKey({
      key: Buffer.from(body, "base64"),
      format: "der",
      type: "pkcs8",
    });
    if (
      key.asymmetricKeyType !== "rsa" ||
      (key.asymmetricKeyDetails?.modulusLength || 0) < 2048
    ) throw new Error();
  } catch {
    missing.push("ALIPAY_APP_PRIVATE_KEY");
  }
  if (
    !Number.isSafeInteger(maxAmountCents) || maxAmountCents < 1 ||
    maxAmountCents > 100000000
  ) {
    missing.push("ALIPAY_MAX_AMOUNT_CENTS");
  }
  return {
    appId,
    sellerId,
    publicKey,
    privateKey,
    maxAmountCents,
    missing,
    verificationReady,
    enabled: env("FW_ALIPAY_ENABLED") === "true" && missing.length === 0,
  };
}

export type AlipayClient = { settings: PaymentSettings };

export function makeAlipayClient(settings: PaymentSettings): AlipayClient {
  if (settings.missing.length) {
    throw new PaymentError("PAYMENT_NOT_CONFIGURED", 503);
  }
  return { settings };
}

function signedParameters(
  client: AlipayClient,
  method: string,
  bizContent: Record<string, unknown>,
  extra: Record<string, string> = {},
) {
  const parameters: Record<string, string> = {
    app_id: client.settings.appId,
    method,
    charset: "utf-8",
    version: "1.0",
    sign_type: "RSA2",
    timestamp: alipayTimestamp(),
    biz_content: JSON.stringify(bizContent),
    ...extra,
  };
  const canonical = Object.keys(parameters).sort().map((key) =>
    `${key}=${parameters[key]}`
  ).join("&");
  parameters.sign = sign(
    "RSA-SHA256",
    Buffer.from(canonical, "utf8"),
    client.settings.privateKey,
  ).toString("base64");
  return new URLSearchParams(parameters);
}

// Extract a top-level JSON value without changing any signed bytes. A scanner
// handles nested objects and quoted braces; JSON.parse separately validates the
// whole document. Duplicate top-level keys, including escaped aliases, fail.
export function signedJsonValue(raw: string, targetKey: string) {
  JSON.parse(raw);
  let cursor = 0;
  const skipWhitespace = () => {
    while (/\s/.test(raw[cursor] || "") && cursor < raw.length) cursor++;
  };
  const quotedEnd = (start: number) => {
    let escaped = false;
    for (let i = start + 1; i < raw.length; i++) {
      if (escaped) escaped = false;
      else if (raw[i] === "\\") escaped = true;
      else if (raw[i] === '"') return i + 1;
    }
    throw new PaymentError("INVALID_PAYMENT_RESPONSE", 503);
  };
  skipWhitespace();
  if (raw[cursor++] !== "{") {
    throw new PaymentError("INVALID_PAYMENT_RESPONSE", 503);
  }
  const seen = new Set<string>();
  let result: string | undefined;
  while (cursor < raw.length) {
    skipWhitespace();
    if (raw[cursor] === "}") break;
    const keyEnd = quotedEnd(cursor);
    const key = JSON.parse(raw.slice(cursor, keyEnd));
    if (seen.has(key)) throw new PaymentError("INVALID_PAYMENT_RESPONSE", 503);
    seen.add(key);
    cursor = keyEnd;
    skipWhitespace();
    if (raw[cursor++] !== ":") {
      throw new PaymentError("INVALID_PAYMENT_RESPONSE", 503);
    }
    skipWhitespace();
    const start = cursor;
    if (raw[cursor] === "{" || raw[cursor] === "[") {
      let depth = 0;
      do {
        const char = raw[cursor];
        if (char === '"') {
          cursor = quotedEnd(cursor);
          continue;
        }
        if (char === "{" || char === "[") depth++;
        else if (char === "}" || char === "]") depth--;
        cursor++;
      } while (depth > 0 && cursor < raw.length);
    } else if (raw[cursor] === '"') cursor = quotedEnd(cursor);
    else {while (
        cursor < raw.length && raw[cursor] !== "," && raw[cursor] !== "}"
      ) cursor++;}
    if (key === targetKey) result = raw.slice(start, cursor).trimEnd();
    skipWhitespace();
    if (raw[cursor] === "}") break;
    if (raw[cursor++] !== ",") {
      throw new PaymentError("INVALID_PAYMENT_RESPONSE", 503);
    }
  }
  if (!result) throw new PaymentError("INVALID_PAYMENT_RESPONSE", 503);
  return result;
}

export function amountToCents(value: unknown) {
  if (
    typeof value !== "string" || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(value)
  ) {
    throw new PaymentError("INVALID_PAYMENT_AMOUNT");
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 1) {
    throw new PaymentError("INVALID_PAYMENT_AMOUNT");
  }
  return cents;
}

export function centsToAmount(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 1) {
    throw new PaymentError("INVALID_PAYMENT_AMOUNT");
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function alipayTimestamp(date = new Date()) {
  if (!Number.isFinite(date.getTime())) {
    throw new PaymentError("INVALID_PAYMENT_TIME");
  }
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 19)
    .replace("T", " ");
}

export function alipayPaymentTime(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
  ) {
    throw new PaymentError("INVALID_PAYMENT_TIME");
  }
  const date = new Date(value.replace(" ", "T") + "+08:00");
  if (!Number.isFinite(date.getTime()) || alipayTimestamp(date) !== value) {
    throw new PaymentError("INVALID_PAYMENT_TIME");
  }
  return date.toISOString();
}

export async function readLimitedText(
  request: Pick<Request, "body" | "headers">,
  maxBytes: number,
) {
  if (!request.body) return "";
  if (Number(request.headers.get("content-length") || 0) > maxBytes) {
    throw new PaymentError("BODY_TOO_LARGE", 413);
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let result = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new PaymentError("BODY_TOO_LARGE", 413);
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function queryAlipay(
  client: AlipayClient,
  orderNo: string,
  transport: typeof fetch = fetch,
) {
  try {
    // Alipay OpenAPI 2.0 RSA2 with native Edge transport and Node crypto.
    const response = await transport("https://openapi.alipay.com/gateway.do", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        "Accept": "application/json",
      },
      body: signedParameters(client, "alipay.trade.query", {
        out_trade_no: orderNo,
      }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error();
    const raw = await readLimitedText(response, 65536);
    const envelope = JSON.parse(raw);
    if (envelope.alipay_trade_query_response && envelope.error_response) {
      throw new Error();
    }
    const responseKey = envelope.alipay_trade_query_response
      ? "alipay_trade_query_response"
      : "error_response";
    const data = envelope[responseKey];
    if (
      !data || typeof data !== "object" || Array.isArray(data) ||
      typeof envelope.sign !== "string"
    ) throw new Error();
    const signedBytes = signedJsonValue(raw, responseKey);
    if (
      !verify(
        "RSA-SHA256",
        Buffer.from(signedBytes, "utf8"),
        client.settings.publicKey,
        Buffer.from(envelope.sign, "base64"),
      )
    ) throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new PaymentError("PAYMENT_QUERY_UNAVAILABLE", 503);
  }
}

export function parseNotification(body: string) {
  const fields: Record<string, string> = Object.create(null);
  let count = 0;
  for (const [key, value] of new URLSearchParams(body)) {
    if (
      ++count > 100 || !/^[a-zA-Z0-9_]{1,64}$/.test(key) || key in fields ||
      value.length > 16384
    ) {
      throw new PaymentError("INVALID_NOTIFICATION");
    }
    fields[key] = value;
  }
  return fields;
}

export function verifyNotification(
  fields: Record<string, string>,
  publicKey: string,
) {
  if (
    fields.sign_type !== "RSA2" || !fields.sign ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(fields.sign)
  ) return false;
  // URLSearchParams has already decoded the form once. All fields, including
  // future provider fields, participate, except sign and sign_type.
  const canonical = Object.keys(fields).filter((key) =>
    key !== "sign" && key !== "sign_type"
  )
    .sort().map((key) => `${key}=${fields[key]}`).join("&");
  try {
    return verify(
      "RSA-SHA256",
      Buffer.from(canonical, "utf8"),
      publicKey,
      Buffer.from(fields.sign, "base64"),
    );
  } catch {
    return false;
  }
}

export type CheckoutOrder = {
  id: string;
  order_no: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  amount_cents: number;
  status: string;
  payment_method: string;
  payment_expires_at: string;
  paid_at: string | null;
  payment_app_id: string;
  payment_seller_id: string;
  provider_checked_at: string | null;
};

export function validateTrade(
  fields: Record<string, unknown>,
  order: CheckoutOrder,
  settings: PaymentSettings,
  notification: boolean,
) {
  if (
    order.payment_method !== "alipay" ||
    order.payment_app_id !== settings.appId ||
    order.payment_seller_id !== settings.sellerId
  ) {
    throw new PaymentError("PAYMENT_ACCOUNT_MISMATCH");
  }
  if (
    notification &&
    (fields.app_id !== order.payment_app_id ||
      fields.seller_id !== order.payment_seller_id)
  ) {
    throw new PaymentError("PAYMENT_ACCOUNT_MISMATCH");
  }
  // Query replies are signed and scoped to this application's credentials;
  // Alipay's query API does not normally include app_id or seller_id.
  if (
    (fields.app_id !== undefined && fields.app_id !== order.payment_app_id) ||
    (fields.seller_id !== undefined &&
      fields.seller_id !== order.payment_seller_id)
  ) {
    throw new PaymentError("PAYMENT_ACCOUNT_MISMATCH");
  }
  if (fields.out_trade_no !== order.order_no) {
    throw new PaymentError("PAYMENT_ORDER_MISMATCH");
  }
  const cents = amountToCents(fields.total_amount);
  if (cents !== order.amount_cents) {
    throw new PaymentError("PAYMENT_AMOUNT_MISMATCH");
  }
  if (
    typeof fields.trade_no !== "string" || !/^\d{10,64}$/.test(fields.trade_no)
  ) throw new PaymentError("INVALID_PAYMENT_TRANSACTION");
  if (
    !["WAIT_BUYER_PAY", "TRADE_SUCCESS", "TRADE_FINISHED", "TRADE_CLOSED"]
      .includes(String(fields.trade_status))
  ) {
    throw new PaymentError("INVALID_PAYMENT_STATUS");
  }
  return cents;
}

export function publicOrder(order: CheckoutOrder) {
  return {
    id: order.id,
    order_no: order.order_no,
    plan_id: order.plan_id,
    amount_cents: order.amount_cents,
    status: order.status,
    payment_expires_at: order.payment_expires_at,
    paid_at: order.paid_at,
  };
}

export function checkoutUrl(
  client: AlipayClient,
  order: CheckoutOrder,
  notifyUrl: string,
) {
  if (
    order.status !== "pending" ||
    new Date(order.payment_expires_at).getTime() <= Date.now()
  ) {
    throw new PaymentError("ORDER_NOT_PAYABLE", 409);
  }
  const parameters = signedParameters(client, "alipay.trade.page.pay", {
    out_trade_no: order.order_no,
    total_amount: centsToAmount(order.amount_cents),
    subject: `FW研究所-${order.plan_name}`,
    product_code: "FAST_INSTANT_TRADE_PAY",
    seller_id: order.payment_seller_id,
    qr_pay_mode: 2,
    time_expire: alipayTimestamp(new Date(order.payment_expires_at)),
  }, { notify_url: notifyUrl });
  return `https://openapi.alipay.com/gateway.do?${parameters}`;
}
