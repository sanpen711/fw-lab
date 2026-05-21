# F.w 研究所

## 页面
- `index.html`：首页
- `square.html`：精神广场
- `rooms.html`：学术研讨 / 投票研究区
- `bird.html`：观鸟台
- `archive.html`：废话档案
- `rules.html`：入馆须知
- `admin.html`：后台 / 公告 / 处理入口
- `404.html`：错误页面

## 当前状态
项目已接入 Supabase，登录、发帖、评论、互动、投票等功能依赖 Supabase。

Supabase SQL 补丁放在 `supabase/` 目录。前端只能放可公开使用的 publishable / anon key，不要放 `service_role` key、secret key 或其他私密凭据。

静态文件可部署到 GitHub Pages 等静态托管服务。
