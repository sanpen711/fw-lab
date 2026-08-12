# Windows 1.1 本地前端

这是 F.w 研究所 Windows 客户端的渐进迁移入口。它只共用 Supabase 账号和数据，不加载 `fwyanjiusuo.com` 整页，也不运行网页版历史补丁。

已完成的迁移包含：

- 本地首页、桌面导航框架和完整账号流程
- 回声通知、回复兜底、打开即已读和原帖入口
- 搭子消息、全部搭子、申请搜索与处理
- 私聊历史、发送、表情和单会话实时消息
- 唯一未读控制器，不使用定时轮询或全局 DOM 监听器

精神广场、学术研讨、观鸟台和废话档案仍保留迁移占位。开发入口不会直接替换现有 Windows 1.0.5。

开发预览：

```bash
npm --prefix desktop-v11 install
npx tauri dev --config src-tauri/tauri.v11.conf.json
```

验证：

```bash
npm --prefix desktop-v11 test
```
