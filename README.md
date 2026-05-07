# F.w 研究所｜可上线静态网站

## 页面
- `index.html`：首页，先发一句牢骚 + 实时牢骚流
- `square.html`：精神广场
- `rooms.html`：摸鱼房间
- `archive.html`：废话档案
- `rules.html`：入馆须知
- `404.html`：错误页面

## 上线方式
直接把本文件夹上传到 GitHub Pages、Cloudflare Pages、Netlify 或 Vercel 的静态站点托管即可。

## 说明
当前是纯静态前端版本：
- 发牢骚、点赞、评论会保存在当前浏览器 localStorage 中；
- 这不是多人共享数据库；
- 后续如果要所有用户实时互通，需要接入 Supabase / Firebase / 自建后端。
