# weichenleeeee123.github.io

围城 Weichen Li 的个人站。作品集 + 长文。

**线上**：https://weichenleeeee123.github.io

## 设计母题

夜航驾驶舱 / 航图（Navigation Display）。首页是一条航线，作品是航路点，滚动等于沿航线飞过去。
配色取自真实航电：**洋红 = 活动航路**、琥珀 = 注意、绿 = 正常。

长文页面切换到「纸质航图」模式（浅色）——深色读三千字是自残。

## 技术

- Astro 5，静态输出，**零运行时框架**
- 首页只有一段约 1KB 的内联 JS（滚动航线），其余页面零 JS
- 字体自托管、只带 latin 子集（53KB），中文走系统字体，**不请求任何第三方域名**
- 推 `main` 由 GitHub Actions 构建部署（`.github/workflows/deploy.yml`）

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 产物在 dist/
```

## 怎么加东西

### 加一篇长文

在 `src/content/posts/` 建一个 `.md`：

```markdown
---
title: 标题
date: 2026-08-10
summary: 一句话说清这篇讲什么，会显示在列表和 SEO 里。
tags: [KinoLens, 复盘]
draft: false        # true 则不会被构建
---

正文……
```

文件名就是 URL：`kinolens-verdict.md` → `/log/kinolens-verdict`。

**正文里用中文引号「」，不要用直的 `"`**，否则会被转成一对右引号。

### 加一个作品

在 `src/content/work/` 建一个 `.md`。字段说明：

| 字段 | 说明 |
|---|---|
| `wpt` | 航路点编号，决定在航线上的顺序 |
| `status` | `active` / `awarded` / `shipped` / `merged` / `archived`，决定徽标颜色 |
| `statusLabel` | 徽标上显示的中文，如「进行中」 |
| `metrics` | 数据条，`{ k: 名称, v: 值 }`，**值里有日期或纯数字要加引号** |
| `tier` | `primary` 出大卡，`secondary` 出紧凑行 |
| `detail` | `true` 才生成 `/work/<文件名>` 详情页，正文写在 markdown 正文里 |

### 改身份信息

`src/data/site.ts`——花名、实名、邮箱、社交链接、航班号、航线（`ZGGG→ZSNJ`）都在这。

## 一条自己定的规矩

首页 STATUS 面板写的是**当前真实状态**，不是装饰。它过期了就去改它。
一个写着三个月前状态的仪表盘，比没有仪表盘更糟。
