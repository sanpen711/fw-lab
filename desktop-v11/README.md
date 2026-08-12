# Windows 1.1 本地前端

这是 F.w 研究所 Windows 客户端的渐进迁移入口。它只共用 Supabase 账号和数据，不加载 `fwyanjiusuo.com` 整页，也不运行网页版历史补丁。

当前第一阶段包含本地首页、桌面导航框架、登录、注册、邮箱验证、找回密码、资料编辑、头像上传和退出登录。精神广场、回声、搭子等栏目先保留迁移占位，不会随这一阶段替换现有 1.0.5。

开发预览：

```bash
npm --prefix desktop-v11 install
npx tauri dev --config src-tauri/tauri.v11.conf.json
```

验证：

```bash
npm --prefix desktop-v11 test
```
