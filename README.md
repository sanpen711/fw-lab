# F.w 研究所｜可上线版本

这是一个纯静态网站，可直接部署到 GitHub Pages / Cloudflare Pages / Vercel。

## 本地预览

双击 `index.html` 即可打开。

## GitHub Pages 上线

1. 新建仓库：`fw-lab`
2. 上传本文件夹里的 `index.html`、`.nojekyll`、`README.md`
3. 打开 Settings → Pages
4. Source 选择 Deploy from a branch
5. Branch 选择 main，Folder 选择 / (root)
6. 网站地址通常是：`https://你的用户名.github.io/fw-lab/`

## 功能说明

- 注册 / 登录演示：使用浏览器 localStorage，本地保存
- 点赞 / 收藏 / 评论：本地保存
- 后台模式：前端演示，可新增文章
- 搜索 / 分类 / 分页：纯前端实现
- 主题切换：深色 / 浅色

正式上线后如果需要真实用户互通数据，可以再接 Supabase 或 Firebase。

## 部署触发

- 重新触发 GitHub Pages 构建。
