# FW研究所验证码邮件（腾讯云 SES）

项目：`ekbovsmxbiplhyrzxoyw`。函数：`fw-send-auth-email`。

该函数通过 Supabase Send Email Hook 接收认证邮件请求，校验 Standard
Webhooks 原始请求签名和时间戳后调用腾讯云 SES `SendEmail`。不改变现有
账号、密码、验证码生成与验证逻辑，不把腾讯云密钥交给网页或客户端。

## 已配置的发信参数

| 参数 | 值 |
| --- | --- |
| 区域 | `ap-hongkong`（中国香港） |
| 发件人 | `FW研究所 <fw@mail.fwyanjiusuo.com>` |
| 注册及重新发送注册验证码 | 模板 `227616`，变量 `code` |
| 找回密码验证码 | 模板 `227617`，变量 `code` |

仅支持 `signup`、`recovery`。邀请、免密登录、更换邮箱和安全通知等其他
Auth 邮件类型会明确失败，不会悄悄跳过。启用相应功能前必须增加匹配且审核通过的模板与处理逻辑。

## 服务器密钥

在 Supabase 项目的 Edge Functions → Secrets 保存：

- `TENCENTCLOUD_SECRET_ID`：发信专用子用户的 SecretId。
- `TENCENTCLOUD_SECRET_KEY`：同一子用户的 SecretKey。
- `SEND_EMAIL_HOOK_SECRET`：Auth Hooks 页面生成的完整 `v1,whsec_...` 值。

子用户策略只需 `ses:SendEmail`，资源 `*`（该接口只支持操作级授权）。
不得将密钥提交到 Git，也不要在日志中打印原始请求、收件地址或验证码。

## 部署与启用

1. 部署函数时 `verify_jwt=false`。本函数自行校验 Auth Webhook 签名；不能删除此校验。
2. 访问函数 URL 加 `/health`，确认三项 configured 都为 true。
   此接口只报告是否存在密钥，不能证明腾讯云权限、模板审核或实际投递成功。
3. 确认腾讯云两个模板均审核通过。保留现有 QQ SMTP 配置用于回退。
4. Supabase Authentication → Auth Hooks → Send Email：选择 HTTPS，填入
   `https://ekbovsmxbiplhyrzxoyw.supabase.co/functions/v1/fw-send-auth-email`。
   生成签名密钥，先存入 `SEND_EMAIL_HOOK_SECRET`，再保存/启用钩子。
   如果界面允许，准备期间保持钩子关闭。启用 Email Provider。
5. 用户在网站用自己控制的测试邮箱完成注册、重发验证码、找回密码，检查腾讯云投递记录。
   不要给真实用户无故触发验证码或重置密码。确认成功后再考虑撤销网站专用 QQ 授权码。

启用 Send Email Hook 后 Supabase 不再调用 SMTP；没有自动 QQ 回退。
若需要回滚，在 Auth Hooks 禁用 Send Email Hook，原 QQ SMTP 恢复接管。

## 校验

```sh
npm ci --ignore-scripts --prefix supabase/functions/fw-send-auth-email
deno check --node-modules-dir=manual --config supabase/functions/fw-send-auth-email/deno.json supabase/functions/fw-send-auth-email/index.ts
deno test --no-check --allow-env --node-modules-dir=manual --config supabase/functions/fw-send-auth-email/deno.json supabase/tests/auth-email.test.mjs
```

测试使用模拟提供商和虚拟密钥，不发送真实邮件。覆盖签名验证、过期/篡改请求、
模板和原始 OTP 映射、提供商拒绝/超时、敏感信息不外泄、重复回调与错误后重试。
去重仅在同一个函数实例中生效；网络响应不明或跨实例重试时仍可能收到重复验证码邮件。
函数不执行数据库迁移，也不写入账号资料。
