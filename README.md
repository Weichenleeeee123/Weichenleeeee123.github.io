# weichen.li

李伟宸（围城）的个人网站，有三种风格：

- **737 驾驶舱**（`/cockpit/`）：一段可以「飞」的夜航。冷舱开机 → 滚动起飞 → 机长执照 → 巡航飞过 10 个作品 → 备降场 → 飞行日志 → 落地，在无线电上调频联系。
- **围城的房间**（`/studio/`）：一间切开两面墙的 3D 小屋。显示器是作品、软木板是经历、书架是小项目、白板是技能、海报是关于我、手机是联系方式；台灯、窗户、可达鸭、椅子、书架顶上的 737 模型都能点。右上角「直接看」不转房间，直接把全部内容排成一页。
- **围城爬塔**（`/spire/`）：照《杀戮尖塔》的地图做的。打开先是角色档案（名字、介绍、学校一屏看完），「出发」后是一张从下往上爬的羊皮纸地图：问号是经历里的事件，敌人和精英是作品（拿奖的是精英），篝火是爱好，宝箱是小项目，商人是技能，顶上的 Boss 是联系方式。每个作品是一张卡牌，右上角「牌组」一页看完全部作品。顶栏的遗物是技能、药水是联系方式。没有 3D，也不用 three.js。

首页 `/` 第一次打开在三种里随机抽一种，记在 localStorage（`wc-style`）里，之后一直是这一种；每种风格的右上角都有「换个风格」菜单（`src/components/StyleMenu.astro`）。开了「减少动态效果」的访客固定进爬塔，搜索引擎留在驾驶舱。要指定给别人看哪种，就发 `/cockpit/`、`/studio/` 或 `/spire/`。

Astro 静态输出 + three.js，推到 `main` 由 GitHub Actions 部署到 GitHub Pages，自定义域名 weichen.li（Dynadot 注册，`public/CNAME`）。旧地址 weichenleeeee123.github.io 会自动跳到新域名。

## 本地跑

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 输出到 dist/
```

## 改内容

三种风格共用 `src/data/site.ts` 里的文字，改一处都变：

- `projects`：作品，顺序就是航路顺序。`code` 是五字母航路点代号，访客在 FMC 上敲它就能跳过去；`image` 可选，没有就显示代号大字
- `alternates`：备降场（小项目）
- `logbook`：飞行日志（经历），`stamp` 会盖一个红章
- `checklist`：起飞前检查单（技能）
- `radio`：无线电频率（联系方式），没有 `href` 的只显示不跳转
- `stats`：首屏数据带
- `profile`：学校、老家、爱好（驾驶舱的执照和房间的海报）

截图放 `src/assets/covers/`，在 `site.ts` 顶部 import。

爬塔特有的东西在 `src/data/spire.ts`：地图每一层是什么（`floors`，从下往上，最后一层是 Boss）、每个作品的卡牌（`cards`：类型、稀有度、费用、对手、卡面文字，`**包起来**` 的词标金色）、篝火上的选项、遗物图标。新加一个作品要在 `cards` 里补一张卡，再在 `floors` 里放到对应的位置。地图上没走的岔路是编译时用固定种子随机生成的，每次构建都一样。

## 字体

房间页和爬塔页的标题和手写字用两款开源字体，只截了页面上用到的字。房间用 `public/fonts/wc-serif.woff2`、`wc-hand.woff2`（各几十 KB），爬塔单独一套 `wc-serif-spire.woff2`、`wc-hand-spire.woff2`（约 145 KB + 71 KB）：

- WC Serif：思源宋体 Noto Serif SC Black（SIL OFL 1.1）
- WC Hand：霞鹜文楷 LXGW WenKai（SIL OFL 1.1）

截子集算修改，按协议改了字体名。改了 `site.ts`、`spire.ts` 里的名字、标题、卡面文字这些字段后，重新跑一次：

```bash
python scripts/subset-fonts.py --serif <NotoSerifSC-Black.otf> --hand <LXGWWenKai-Regular.ttf>
```

不跑也不会坏，新出现的字会退回系统字体。

## 代码在哪

| 文件 | 管什么 |
| --- | --- |
| `src/pages/index.astro` | 首页：挑风格的那段小脚本，挑中驾驶舱就地渲染 |
| `src/components/Cockpit.astro` | 驾驶舱页面本体，`/` 和 `/cockpit/` 共用 |
| `src/pages/studio.astro` | 房间页面：底部导航和六块内容（不支持 WebGL 时就是一张普通网页） |
| `src/scripts/studio/room.ts` | 房间里的每样东西，全部是基本几何体 + 画布贴图，没有外部模型 |
| `src/scripts/studio/main.ts` | 房间的镜头、拖动、点选、抽屉、白天黑夜、起飞去驾驶舱 |
| `src/scripts/studio/sfx.ts` | 房间的音效（现场合成）和唱机的背景音乐；`wc-sound`、`wc-music` 记开关 |
| `scripts/gen-lofi.py` | 房间背景音乐 `public/audio/room-lofi.mp3`：原创 lo-fi 循环，全部代码合成，首尾无缝 |
| `src/styles/studio.css` | 房间的样式 |
| `src/pages/spire.astro` | 爬塔页面：角色档案、地图（编译时排好的 SVG）、每一层的画面、牌组。没有 JS 时从上往下就是一张普通网页 |
| `src/components/SpireCard.astro` | 一张作品卡：卡面颜色看类型，边框看稀有度，没截图的作品画一个线条小图 |
| `src/scripts/spire/main.ts` | 爬塔的路由（`#hero` / `#map` / `#f-N` / `#deck`）、开场墨线动画、小鸭子走格子、提示框、卡牌倾斜、火星 |
| `src/scripts/spire/sfx.ts` | 爬塔的音效（翻牌、墨水、金币、宝箱、篝火），现场合成，没有背景音乐 |
| `src/styles/spire.css` | 爬塔的样式 |
| `src/scripts/flight.ts` | 滚动位置 → 速度/高度/姿态/航向。每段页面的进度怎么换算成飞行状态都在这 |
| `src/scripts/world.ts` | 挡风玻璃外的 3D 世界：天空、星星、月亮、城市灯、跑道灯、进近频闪、云层 |
| `src/scripts/audio.ts` | 发动机声、风噪、音效现场合成；呼叫和塔台语音是 `scripts/gen-voices.py` 预先生成的 mp3，巡航音乐是 `scripts/gen-music.py` 编的《茉莉花》 |
| `src/scripts/main.ts` | 主循环、仪表、HUD、呼叫、FMC、导航显示器、开机流程、无线电 |
| `src/styles/global.css` | 驾驶舱的样式 |

调试：页面在后台时浏览器不跑动画帧，可以在控制台用 `__flight.step(100)` 手动推进 100 帧，`__flight.cur` 看当前飞行状态。房间那边是 `__room`：`__room.open('works')` 打开一块，`__room.settle()` 让镜头立刻到位。爬塔是 `__spire`：`__spire.go('#f-3')` 打开第 4 层，`__spire.tour()` 重放开场；清掉 localStorage 的 `wc-spire-seen` 能把看过的圈去掉。

## 设计约定

夜航驾驶舱配色：洋红 = 航路/当前目标，青 = 数据，绿 = 状态正常，琥珀 = 读数和告警。字体 B612（空客为驾驶舱屏幕设计的开源字体），中文走系统黑体。正文卡片一律深底浅字，动效再夸张也不压字。系统开了「减少动态效果」时，所有动画和过渡会关掉。

房间：暖色纸张 + 赤陶红、墨绿、芥末黄。白天黑夜按访客本地时间切换（点窗户也能切），挂钟和手机上显示的是访客自己的时间。每块内容的抽屉用那样东西的材质：显示器深色、软木板、白板、海报。

爬塔：深蓝灰的界面 + 金色描边 + 红色横幅，地图是羊皮纸加墨线。墨线实的是真走过的路，淡的是没走的岔路；访客点开过的层会被手画的圈圈起来，记在 `wc-spire-seen`。另外两种风格的「换个风格」按钮上有个小红点、菜单里标「新」，提醒没来过爬塔的人；来过一次（`wc-spire-visited`）就不再标。玩法和版式致敬《杀戮尖塔》，但图标、卡框、插画全是自己用代码画的，没有用原作的美术素材。
