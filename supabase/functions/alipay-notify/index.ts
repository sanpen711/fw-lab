import { createClient } from "npm:@supabase/supabase-js@2.55.0";
import {
  alipayPaymentTime,
  type CheckoutOrder,
  parseNotification,
  PaymentError,
  readLimitedText,
  readPaymentSettings,
  validateTrade,
  verifyNotification,
} from "../_shared/alipay.ts";

const reply = (status: number, body = "failure") =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

// Alipay cannot send a Supabase user JWT. Authentication here is the RSA2
// signature plus app/seller/order/amount verification, before any database write.
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return reply(405);
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
      "application/x-www-form-urlencoded"
  ) return reply(415);
  try {
    const settings = readPaymentSettings((name) => Deno.env.get(name));
    if (!settings.verificationReady) return reply(503);
    const fields = parseNotification(await readLimitedText(request, 65536));
    if (!verifyNotification(fields, settings.publicKey)) return reply(400);
    if (
      fields.app_id !== settings.appId ||
      fields.seller_id !== settings.sellerId ||
      !/^FW[0-9a-f]{32}$/.test(fields.out_trade_no || "") ||
      !fields.notify_id || fields.notify_id.length > 150 ||
      fields.notify_type !== "trade_status_sync"
    ) return reply(400);
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return reply(503);
    const service = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await service.from("membership_orders").select("*")
      .eq("order_no", fields.out_trade_no).eq("payment_method", "alipay")
      .maybeSingle();
    if (error) return reply(503);
    if (!data) return reply(400);
    const cents = validateTrade(fields, data as CheckoutOrder, settings, true);
    if (fields.trade_status === "WAIT_BUYER_PAY") return reply(400);
    const paid = fields.trade_status === "TRADE_SUCCESS" ||
      fields.trade_status === "TRADE_FINISHED";
    const { error: applyError } = await service.rpc(
      "fw_apply_alipay_membership_result",
      {
        p_order_no: fields.out_trade_no,
        p_trade_no: fields.trade_no,
        p_amount_cents: cents,
        p_trade_status: fields.trade_status,
        p_paid_at: paid ? alipayPaymentTime(fields.gmt_payment) : null,
        p_event_id: `notify:${fields.notify_id}`,
      },
    );
    // Acknowledge only after order, membership and event have committed together.
    if (applyError) return reply(503);
    return reply(200, "success");
  } catch (error) {
    if (error instanceof PaymentError) return reply(error.status);
    console.error("alipay-notify request failed");
    return reply(503);
  }
});
