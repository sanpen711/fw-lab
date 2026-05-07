# F.w 研究所 Supabase 接入说明

## 1. 创建 Supabase 项目

进入 Supabase，新建一个项目。项目创建完成后，打开：

- Project Settings → API
- 复制 `Project URL`
- 复制 `anon public` key

## 2. 初始化数据库

打开：

- SQL Editor → New query
- 粘贴 `schema.sql` 全部内容
- 点击 Run

这个脚本会创建：

- `profiles`：用户资料，昵称、头像、角色、封禁状态
- `posts`：帖子
- `comments`：评论
- `reactions`：点赞 / 俺也一样 / 递纸巾
- `avatars`：头像存储桶
- RLS 权限规则

## 3. 填写前端配置

打开仓库文件：

```js
assets/supabase-config.js
```

把内容改成：

```js
window.FW_SUPABASE = {
  url: "你的 Project URL",
  anonKey: "你的 anon public key"
};
```

提交后，网站会自动从本机演示版切换到真实数据库版。

## 4. 设置管理员账号

先在网站上用邮箱注册/登录一次，然后去 Supabase 的 `profiles` 表找到你的账号，把 `role` 改成：

```text
admin
```

也可以在 SQL Editor 运行：

```sql
update public.profiles
set role = 'admin'
where id = '你的用户 id';
```

之后这个账号登录 `admin.html`，就可以删帖、删评论、停用或恢复用户。

## 5. 当前登录方式

第一版使用：

- 邮箱 + 密码注册/登录
- 用户自己设置昵称
- 用户自己上传头像

手机号验证码和微信登录建议第二阶段再做，因为它们需要短信服务商、微信开放平台和额外审核配置。
