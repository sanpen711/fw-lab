# 支付宝电脑网站支付

APPID：`2021007104686921`。支付宝公钥已作为服务端默认公钥配置；两者是公开信息。应用私钥只保存到 Supabase Edge Function Secrets，不进入 Git、客户端或聊天。

本阶段已接通电脑端套餐、下单、继续付款、查单和成功页面。`FW_ALIPAY_ENABLED` 继续保持 `false`，不会创建真实付款订单；应用上线和真实小额支付验收后再开放收款。

## 后台配置

打开 [Edge Function Secrets](https://supabase.com/dashboard/project/ekbovsmxbiplhyrzxoyw/functions/secrets)，添加：

| 名称 | 内容 |
| --- | --- |
| `ALIPAY_APP_PRIVATE_KEY` | 密钥工具生成、与上传的应用公钥配对的 **PKCS8 应用私钥**。支持完整 PEM 或原始 Base64。 |
| `ALIPAY_SELLER_ID` | 应用绑定的收款支付宝账号 PID，16 位，以 `2088` 开头。不是 APPID 或手机号。 |
| `FW_ALIPAY_ENABLED` | 先保持 `false`；准备上线收款时才设为 `true`。关闭后仍处理已签发订单的通知和查询。 |

可选覆盖项：`ALIPAY_APP_ID`、`ALIPAY_PUBLIC_KEY`、`ALIPAY_MAX_AMOUNT_CENTS`。默认单笔上限为 **5000 分（50 元）**，只有支付宝确认给予更高限额后才提高。月度 2 元、季度 25 元可在当前单笔限制内创建订单；年度 88 元会被服务端拒绝，不改价、不拆单。每日额度由支付宝执行。

支付宝开放平台需要确认：电脑网站支付产品已生效；此 APPID 绑定正确的收款账号；应用公钥与上述私钥匹配；应用已上线。应用网关、AES 和 OAuth 授权回调不是支付通知地址。

每次支付请求由后台自动带上：

```text
notify_url=https://ekbovsmxbiplhyrzxoyw.supabase.co/functions/v1/alipay-notify
```

不要将这个地址填到 OAuth 授权回调。`return_url` 暂不设置，会员到账以验签后的通知或查单结果为准。

## 接口

`membership-alipay` 启用网关 JWT 校验，函数内再验证 Supabase 登录账号和封禁状态。请求头为 `Authorization: Bearer <用户 access_token>`，`Content-Type: application/json`。不接收用户指定金额、时长、收款账号或通知地址。

| action | 请求字段 | 返回 |
| --- | --- | --- |
| `config` | 无其他字段 | `enabled`、`configured`、`max_amount_cents`、缺失配置名称；不返回密钥 |
| `create` | `plan_id`、`request_id`（每次点击产生 UUID，网络重试使用同一个） | 自己的订单与签名后的 `payment_url` |
| `query` | `order_no` | 自己的订单与会员状态；支付宝查询最多每个订单 5 秒一次 |
| `resume` | `order_no` | 自己的未到期订单与原金额、原时长签名的 `payment_url`；已付款订单只返回结果 |

电脑端通过 `desktop_open_alipay` 打开浏览器，只允许此应用的支付宝官方电脑网站支付 URL。付款页面可见且订单未过期时每 5 秒查单；离开会员付款页、隐藏窗口或退出登录后停止。到期仍可手动查单补到账。客户端只保存当前账号的订单号或幂等请求 UUID，不保存付款 URL、JWT 或私钥到订单缓存；退出登录时清除付款缓存。微信入口已移除。

`alipay-notify` 仅接收支付宝的表单 POST，用 RSA2 公钥验签代替用户 JWT，验证应用、PID、订单号、交易号和订单金额。订单、会员时长及精简支付事件在一个数据库事务内提交后才返回纯文本 `success`。重复通知与查单补到账不会重复续期。

订单保存套餐名、价格、时长、APPID、PID 和固定 10 分钟到期时间。生效会员从原到期时间续期，过期或取消的会员从当前时间开始。失败或延迟通知允许随后真实到账恢复订单。付款后 `TRADE_CLOSED` 可能表示退款；本次只实现开通/续期，退款及退款后会员权益调整另行实现，事件会留档。

两个数据库 RPC 是 `SECURITY INVOKER`，仅 `service_role` 可调用。用户仅能读取自己的订单和会员；私钥及 `service_role` 密钥不能进入客户端。

服务端按支付宝 OpenAPI 2.0 规范使用 RSA2 加签和验签，通过运行环境原生 HTTP 请求查单，保留响应中业务 JSON 的原始字节验签。官方支付宝 SDK 仅用于本地测试交叉校验，避免其 Node HTTP 依赖在 Edge 环境加载失败。

## 验证与部署

```bash
npx deno test --allow-env --config supabase/functions/membership-alipay/deno.json supabase/tests/alipay.test.ts
npx deno check --config supabase/functions/membership-alipay/deno.json supabase/functions/membership-alipay/index.ts supabase/functions/alipay-notify/index.ts
```

应用迁移 `migrations/20261009073113_alipay_membership_checkout.sql` 后运行 `tests/alipay-membership.sql`。时间戳与 Supabase 已应用的迁移记录一致。该 SQL 在事务内创建合成账号和订单，所有测试数据回滚，不产生真实支付。部署时包含入口、所在函数的 `deno.json` 和共享文件 `_shared/alipay.ts`；`membership-alipay` 的 `verify_jwt=true`，`alipay-notify` 的 `verify_jwt=false`（函数内验证提供方签名）。

上线验收必须使用支付宝允许的实际买家账号完成一笔小额真实订单，确认应用签名可用、正确商家收款、会员只开通一次、重发通知和查单不会重复续期，并检查取消支付后没有开通。合成签名和数据库测试不能证明支付宝签约、应用上线或真实到账已经完成。

官方参考：[电脑网站支付](https://ideservice.alipay.com/cms/site/0izblh)、[查单](https://ideservice.alipay.com/cms/site/0izam7)、[支付宝官方 SDK](https://github.com/alipay/alipay-sdk-nodejs-all)、[Supabase Secrets](https://supabase.com/docs/guides/functions/secrets)。
