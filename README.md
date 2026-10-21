# weichenleeeee123.github.io

李伟宸（围城）的个人网站：一段可以「飞」的夜航。冷舱开机 → 滚动起飞 → 机长执照 → 巡航飞过 10 个作品 → 备降场 → 飞行日志 → 落地，在无线电上调频联系。

Astro 静态输出 + three.js，推到 `main` 由 GitHub Actions 部署到 GitHub Pages。

## 本地跑

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 输出到 dist/
```

## 改内容

所有文字都在 `src/data/site.ts`：

- `projects`：作品，顺序就是航路顺序。`code` 是五字母航路点代号，访客在 FMC 上敲它就能跳过去；`image` 可选，没有就显示代号大字
- `alternates`：备降场（小项目）
- `logbook`：飞行日志（经历），`stamp` 会盖一个红章
- `checklist`：起飞前检查单（技能）
- `radio`：无线电频率（联系方式），没有 `href` 的只显示不跳转
- `stats`：首屏数据带

截图放 `src/assets/covers/`，在 `site.ts` 顶部 import。

## 代码在哪

| 文件 | 管什么 |
| --- | --- |
| `src/scripts/flight.ts` | 滚动位置 → 速度/高度/姿态/航向。每段页面的进度怎么换算成飞行状态都在这 |
| `src/scripts/world.ts` | 挡风玻璃外的 3D 世界：天空、星星、月亮、城市灯、跑道灯、进近频闪、云层 |
| `src/scripts/audio.ts` | 发动机声、风噪、无线电沙沙声都是现场合成的；呼叫用浏览器语音合成 |
| `src/scripts/main.ts` | 主循环、仪表、HUD、呼叫、FMC、导航显示器、开机流程、无线电 |
| `src/styles/global.css` | 全部样式 |

调试：页面在后台时浏览器不跑动画帧，可以在控制台用 `__flight.step(100)` 手动推进 100 帧，`__flight.cur` 看当前飞行状态。

## 设计约定

夜航驾驶舱配色：洋红 = 航路/当前目标，青 = 数据，绿 = 状态正常，琥珀 = 读数和告警。字体 B612（空客为驾驶舱屏幕设计的开源字体），中文走系统黑体。正文卡片一律深底浅字，动效再夸张也不压字。系统开了「减少动态效果」时，所有动画和过渡会关掉。
