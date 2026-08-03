# weichenleeeee123.github.io

个人站。Astro + 静态输出，GitHub Actions 自动部署到 GitHub Pages。

## 本地跑

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 输出到 dist/
```

## 写一篇新文章

在 `src/content/posts/` 下新建一个 `.md` 文件，文件名就是 URL（`/log/<文件名>/`）：

```markdown
---
title: 标题
date: 2026-08-10
summary: 一句话摘要，会出现在首页列表和 RSS 里
tags: [KinoLens, 复盘]
draft: false
---

正文……
```

`draft: true` 的文章不会出现在首页、RSS 和构建产物里。

## 改作品列表

编辑 `src/data/projects.ts`。每个项目：

- `name` / `sub`：名字和一句话定位
- `desc`：两三句说清它是什么、现在什么状态
- `href` / `hrefText`：外链（没有就不写，标题自动变成纯文本）
- `tags`：`kind` 可选 `award`（琥珀）/ `wip`（洋红）/ `done`（绿）
- `active: true`：航路点变实心，表示正在做

顺序就是数组顺序，`WPT 01…` 编号自动生成。

## 改联系方式 / 状态

`src/data/site.ts` 管联系方式；首页 STATUS 面板的三行在 `src/pages/index.astro` 里。

## 部署

推到 `main` 自动构建部署。首次需要在仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。

## 设计约定

纸质航图：米白纸底 `#f5f2ea`、蓝灰细线、洋红航路 `#b8225e`。字体自托管在 `public/fonts/`（Barlow Condensed + JetBrains Mono，仅 latin 子集，共约 75 KB），中文走系统字体，不加载任何第三方资源。全站零 JavaScript。
