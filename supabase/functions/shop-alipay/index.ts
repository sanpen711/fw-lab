import { createClient } from "npm:@supabase/supabase-js@2.55.0";
import {
  alipayPaymentTime,
  checkoutUrl,
  makeAlipayClient,
  PaymentError,
  queryAlipay,
  readLimitedText,
  readPaymentSettings,
  validateTrade,
} from "../_shared/alipay.ts";

import {asCheckoutOrder,publicShopOrder,recipient,type ShopOrder} from "../_shared/shop.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function databaseError(message: string) {
  const codes: Record<string, number> = {
    ACCOUNT_UNAVAILABLE: 403,
    PRODUCT_UNAVAILABLE: 400,
    PRODUCT_OVER_PAYMENT_LIMIT: 400,
    PRODUCT_PRICE_CHANGED: 409,
    INVALID_RECIPIENT: 400,
    CHECKOUT_REQUEST_CONFLICT: 409,
    TOO_MANY_PENDING_ORDERS: 429,
  };
  for (const [code, status] of Object.entries(codes)) {
    if (message.includes(code)) throw new PaymentError(code, status);
  }
  throw new PaymentError("PAYMENT_DATABASE_ERROR", 503);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") {
    return reply(405, { error: "METHOD_NOT_ALLOWED" });
  }
  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return reply(401, { error: "LOGIN_REQUIRED" });
    }
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      throw new PaymentError("SERVICE_NOT_CONFIGURED", 503);
    }
    const auth = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return reply(401, { error: "LOGIN_REQUIRED" });
    const { data: profile, error: profileError } = await service.from(
      "profiles",
    ).select("id,is_banned").eq("id", user.id).maybeSingle();
    if (profileError) throw new PaymentError("SERVICE_UNAVAILABLE", 503);
    if (!profile || profile.is_banned) {
      return reply(403, { error: "ACCOUNT_UNAVAILABLE" });
    }
    let payload;
    try {
      payload = JSON.parse(await readLimitedText(request, 4096));
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw new PaymentError("INVALID_REQUEST");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new PaymentError("INVALID_REQUEST");
    }
    const settings = readPaymentSettings((name) => Deno.env.get(name));
    if (payload.action === "config") {
      return reply(200, {
        enabled: settings.enabled,
        configured: settings.missing.length === 0,
        max_amount_cents: Number.isSafeInteger(settings.maxAmountCents)
          ? settings.maxAmountCents
          : null,
        missing: settings.missing,
      });
    }
    if (payload.action === 'recover') {
      if (typeof payload.request_id !== 'string' || !uuidPattern.test(payload.request_id)) throw new PaymentError('INVALID_REQUEST');
      const {data,error} = await service.from('shop_orders').select('*').eq('user_id',user.id).eq('checkout_request_id',payload.request_id).maybeSingle();
      if (error) throw new PaymentError('PAYMENT_DATABASE_ERROR',503);
      return reply(200,{order:data?publicShopOrder(data as ShopOrder):null});
    }
    if (payload.action === "create") {
      if (!settings.enabled) throw new PaymentError("PAYMENT_NOT_OPEN", 503);
      if (
        typeof payload.product_id !== "string" ||
        !uuidPattern.test(payload.product_id) ||
        !Number.isSafeInteger(payload.expected_amount_cents) || payload.expected_amount_cents < 1 ||
        typeof payload.request_id !== "string" ||
        !uuidPattern.test(payload.request_id)
      ) throw new PaymentError("INVALID_REQUEST");
      const contact = recipient(payload);
      const client = makeAlipayClient(settings);
      const { data, error } = await service.rpc(
        "fw_create_shop_order",
        {
          p_user_id: user.id,
          p_product_id: payload.product_id,
          p_expected_amount_cents: payload.expected_amount_cents,
          p_recipient_name: contact.name,
          p_recipient_phone: contact.phone,
          p_recipient_address: contact.address,
          p_request_id: payload.request_id,
          p_max_amount_cents: settings.maxAmountCents,
          p_app_id: settings.appId,
          p_seller_id: settings.sellerId,
        },
      );
      if (error) databaseError(error.message);
      const order = asCheckoutOrder(data as ShopOrder);
      if (order.status !== "pending" || new Date(order.payment_expires_at).getTime() <= Date.now()) {
        return reply(200, { order: publicShopOrder(order) });
      }
      return reply(200, {
        order: publicShopOrder(order),
        payment_url: checkoutUrl(
          client,
          order,
          `${url}/functions/v1/shop-alipay-notify`,
        ),
      });
    }
    if (
      !["query", "resume"].includes(payload.action) || typeof payload.order_no !== "string" ||
      !/^FS[0-9a-f]{32}$/.test(payload.order_no)
    ) {
      throw new PaymentError("INVALID_REQUEST");
    }
    const { data, error } = await service.from("shop_orders").select("*")
      .eq("order_no", payload.order_no).eq("user_id", user.id).eq(
        "payment_method",
        "alipay",
      ).maybeSingle();
    if (error) throw new PaymentError("PAYMENT_DATABASE_ERROR", 503);
    if (!data) throw new PaymentError("ORDER_NOT_FOUND", 404);
    let order = asCheckoutOrder(data as ShopOrder);
    if (payload.action === "resume") {
      if (order.status === "paid") {
        return reply(200, { order: publicShopOrder(order) });
      }
      if (!settings.enabled) throw new PaymentError("PAYMENT_NOT_OPEN", 503);
      if (order.payment_app_id !== settings.appId || order.payment_seller_id !== settings.sellerId) {
        throw new PaymentError("PAYMENT_ACCOUNT_MISMATCH");
      }
      if (order.amount_cents > settings.maxAmountCents) throw new PaymentError("PRODUCT_OVER_PAYMENT_LIMIT");
      return reply(200, {
        order: publicShopOrder(order),
        payment_url: checkoutUrl(makeAlipayClient(settings), order, `${url}/functions/v1/shop-alipay-notify`),
      });
    }
    if (!["paid", "refunded"].includes(order.status)) {
      const client = makeAlipayClient(settings);
      if (
        order.payment_app_id !== settings.appId ||
        order.payment_seller_id !== settings.sellerId
      ) throw new PaymentError("PAYMENT_ACCOUNT_MISMATCH");
      // Atomic claim prevents simultaneous client polling from flooding Alipay.
      const checkedAt = new Date();
      const cutoff = new Date(checkedAt.getTime() - 5000).toISOString();
      const { data: claimed, error: claimError } = await service.from(
        "shop_orders",
      )
        .update({ provider_checked_at: checkedAt.toISOString() }).eq(
          "id",
          order.id,
        ).eq("user_id", user.id)
        .or(`provider_checked_at.is.null,provider_checked_at.lt.${cutoff}`)
        .select("id").maybeSingle();
      if (claimError) throw new PaymentError("PAYMENT_DATABASE_ERROR", 503);
      if (claimed) {
        const result = await queryAlipay(client, order.order_no);
        if (result.code !== "10000") {
          if (result.sub_code !== "ACQ.TRADE_NOT_EXIST") {
            throw new PaymentError("PAYMENT_QUERY_UNAVAILABLE", 503);
          }
          if (order.status === "pending" && new Date(order.payment_expires_at).getTime() <= Date.now()) {
            const { error: closeError } = await service.from("shop_orders")
              .update({ status: "closed" }).eq("id", order.id).eq("user_id", user.id).eq("status", "pending");
            if (closeError) throw new PaymentError("PAYMENT_DATABASE_ERROR", 503);
          }
        } else {
          const cents = validateTrade(result, order, settings, false);
          if (result.trade_status !== "WAIT_BUYER_PAY") {
            const paid = result.trade_status === "TRADE_SUCCESS" ||
              result.trade_status === "TRADE_FINISHED";
            const { error } = await service.rpc(
              "fw_apply_shop_payment",
              {
                p_order_no: order.order_no,
                p_trade_no: result.trade_no,
                p_amount_cents: cents,
                p_trade_status: result.trade_status,
                p_paid_at: paid
                  ? alipayPaymentTime(result.send_pay_date)
                  : null,
                p_event_id: `query:${result.trade_no}:${result.trade_status}`,
              },
            );
            if (error) throw new PaymentError("PAYMENT_DATABASE_ERROR", 503);
          }
        }
      }
      const { data: updated, error: readError } = await service.from(
        "shop_orders",
      ).select("*").eq("id", order.id).eq("user_id", user.id).single();
      if (readError) throw new PaymentError("PAYMENT_DATABASE_ERROR", 503);
      order = asCheckoutOrder(updated as ShopOrder);
    }
    return reply(200, {
      order: publicShopOrder(order),
    });
  } catch (error) {
    if (error instanceof PaymentError) {
      return reply(error.status, { error: error.code });
    }
    console.error("shop-alipay request failed");
    return reply(500, { error: "SERVICE_UNAVAILABLE" });
  }
});
