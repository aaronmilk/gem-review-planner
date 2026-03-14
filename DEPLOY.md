# 部署与数据清理说明（gem-review-planner-site）

## 1. 这次改了什么
- **自动清理“每日记录”中 2026 年之外的数据**
  - 触发点：应用启动时读取本地缓存（`localStorage`）
  - 清理范围：`DailyRecord.date` 为字符串且 **不以 `2026-` 开头** 的记录会被移除
  - 清理效果：会**直接从浏览器本地 `localStorage` 删除**（不是仅隐藏）

- **远端 API 模式（如果你配置了 `VITE_API_BASE`）**
  - 仅做“展示过滤”：只展示 `2026-` 开头的记录
  - **不会自动删除后端数据**（避免误删服务器数据）

对应改动文件：
- `src/lib/storage.ts`
- `src/hooks/useRecords.ts`

## 2. 本地预览（开发模式）
```bash
npm install
npm run dev
```

## 3. 构建生产版本
```bash
npm install
npm run build
```
构建产物输出到：`dist/`

## 4. 部署（静态站点）

### 4.1 GitHub Pages（推荐：GitHub Actions 自动部署）
1. 把本项目推到 GitHub（默认分支：`main`）。
2. 仓库 Settings → Pages：
   - Build and deployment 选择 **GitHub Actions**。
3. 之后每次 push 到 `main` 会自动构建并发布到 Pages。

生成的工作流文件在：`.github/workflows/deploy-pages.yml`

> 注意：这是单页应用（SPA）。构建时会自动复制 `dist/index.html` → `dist/404.html`，用于 GitHub Pages 的路由回退。

这是一个 Vite 前端项目，**可作为纯静态站点部署**。

### 方案 A：Vercel
- New Project → Import 代码仓库
- Build Command：`npm run build`
- Output Directory：`dist`

### 方案 B：Netlify
- Build command：`npm run build`
- Publish directory：`dist`

### 方案 C：Nginx / 任意静态服务器
将 `dist/` 目录内容上传到服务器站点根目录。

Nginx 参考（单页应用路由回退）：
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## 5. 验证“只保留 2026”是否生效
1. 在浏览器打开站点
2. 打开开发者工具 → Application → Local Storage
3. 找到 key：`gem_review_records_v1`
4. 观察其中的记录：date 应仅出现 `2026-xx-xx`

> 说明：如果你之前缓存里有 2025/2024 等旧记录，首次打开新版页面就会被自动清理。
