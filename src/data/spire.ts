/**
 * 第三种风格「围城爬塔」：经历画成一张往上爬的地图，作品是卡牌。
 * 内容本身仍然读 site.ts，这里只放爬塔特有的东西：每层是什么、卡牌长什么样、篝火上能做什么。
 * 改了 title / foe / label / text / date 这几种字段后，要重新跑 scripts/subset-fonts.py。
 */

export type Kind = 'event' | 'enemy' | 'elite' | 'rest' | 'treasure' | 'shop' | 'boss';

/** 地图图例 */
export const kinds: Record<Kind, { title: string; tip: string }> = {
  event: { title: '未知', tip: '一件发生过的事' },
  enemy: { title: '敌人', tip: '做过的一个作品' },
  elite: { title: '精英', tip: '拿了奖的硬仗' },
  rest: { title: '休息', tip: '篝火，喘口气' },
  treasure: { title: '宝箱', tip: '顺手做的小玩意' },
  shop: { title: '商人', tip: '手上的家伙' },
  boss: { title: 'Boss', tip: '还没出现' },
};

export type CardType = '攻击' | '技能' | '能力';
export type Rarity = 'common' | 'uncommon' | 'rare';

/**
 * 作品卡，按 site.ts 里的代号对应。
 * 攻击 = 比赛里打出来的，技能 = 拿来用的工具，能力 = 一直在跑的长期项目。
 * 费用凭投入大小给的，没有精确含义。text 里 **包起来** 的词会标成金色关键词。
 */
export const cards: Record<string, { type: CardType; rarity: Rarity; cost: number; foe: string; text: string }> = {
  TERMN: { type: '技能', rarity: 'uncommon', cost: 1, foe: '层层叠加的 WT_SESSION', text: '修掉 **WT_SESSION** 的重复累积。\n被微软 **合并**，进了 1.23。' },
  YJSHI: { type: '攻击', rarity: 'rare', cost: 2, foe: '豆包「应用生成」挑战赛', text: '把一个故事拆成 **剧本** 和 **分镜**。\n获得 **全国金奖**。' },
  KINOL: { type: '能力', rarity: 'rare', cost: 3, foe: '1TB 没剪过的素材', text: '每回合：把一堆素材剪成 **一条片子**。\n五个智能体轮流行动。' },
  VRATC: { type: '技能', rarity: 'uncommon', cost: 1, foe: '一直沉默的塔台', text: '戴上耳机，和 **AI 管制员** 通话。\n它知道你的高度和位置。' },
  YUWEN: { type: '技能', rarity: 'common', cost: 1, foe: '高考作文', text: '审题、立意、提纲、范文、批改。\n**开源**，有人在用。' },
  QMSHT: { type: '能力', rarity: 'uncommon', cost: 2, foe: '一整条不会说话的街', text: '你说的话会沿着关系\n**传遍整条街**。' },
  ALPHA: { type: '攻击', rarity: 'rare', cost: 2, foe: '四个人，四天', text: '召唤一支 **AI 投研团队**。\n每个结论都要有出处。\n获得 **一等奖**。' },
  XRAYS: { type: '攻击', rarity: 'uncommon', cost: 2, foe: '48 小时', text: '对照公司的说法和 **真实记录**。\n查不到的会写清楚。' },
  WCLAB: { type: '能力', rarity: 'uncommon', cost: 1, foe: '2 秒跳出率', text: '每期结束时：看 **完播率**，\n改下一期。' },
  COOPS: { type: '技能', rarity: 'common', cost: 0, foe: '各干各的 agent', text: '你和队友的 agent\n**共用一块任务板**。不用服务器。' },
};

export type Choice = { pick: string; text: string; result?: string; href?: string; style?: string };

export type Floor = {
  kind: Kind;
  /** 地图左边的时间 */
  date: string;
  /** 地图上节点下面的小字 */
  label: string;
  /** 作品代号（敌人、精英） */
  code?: string;
  /** 事件 */
  title?: string;
  body?: string[];
  choices?: Choice[];
  art?: 'plane' | 'grad' | 'wheat';
  /** 精英的额外奖励 */
  gold?: { amount: number; note: string };
};

/** 从下往上一层一层，最后一层是 Boss */
export const floors: Floor[] = [
  {
    kind: 'event',
    date: '2020',
    label: '第一次推油门',
    title: '驾驶舱里的夜',
    art: 'plane',
    body: ['2020 年，你第一次在模拟器里推起油门。', '从 X-Plane 换到 MSFS，最爱 737。连飞的时候，耳机里是中文管制。'],
    choices: [{ pick: '[飞一班]', text: '换成 737 驾驶舱风格。', href: '/cockpit/', style: 'cockpit' }],
  },
  { kind: 'elite', date: '2025.07', label: 'Microsoft Terminal', code: 'TERMN' },
  { kind: 'elite', date: '2025.12', label: '影剧师', code: 'YJSHI', gold: { amount: 10000, note: '全部成了 KinoLens 的启动资金' } },
  { kind: 'enemy', date: '2026.01', label: 'KinoLens', code: 'KINOL' },
  { kind: 'enemy', date: '2026.02', label: 'Virtual ATC', code: 'VRATC' },
  { kind: 'rest', date: '喘口气', label: '篝火' },
  { kind: 'enemy', date: '2026.04', label: '语文老师', code: 'YUWEN' },
  {
    kind: 'event',
    date: '2026.06',
    label: '毕业',
    title: '最后一个夏天',
    art: 'grad',
    body: ['东莞中学，毕业。', '高三那年你拿着大疆拍了将近 1TB 的日常，为的是喂给后来的 KinoLens。'],
    choices: [{ pick: '[拍毕业照]', text: '再多拍一段。', result: '咔嚓。素材库又多了一点。' }],
  },
  { kind: 'enemy', date: '2026.07', label: '清明上河图', code: 'QMSHT' },
  { kind: 'elite', date: '2026.07', label: 'AlphaBit Coach', code: 'ALPHA' },
  { kind: 'treasure', date: '一路上', label: '小玩意' },
  {
    kind: 'event',
    date: '2026.09',
    label: '到南京',
    title: '新的一层',
    art: 'wheat',
    body: ['进入南京农业大学，国际经济与贸易。', '专业课和写代码没什么关系。代码都在课外。'],
    choices: [
      { pick: '[去上课]', text: '国贸，2026 级。', result: '你在教室后排坐下，打开了课本，也打开了终端。' },
      { pick: '[去写代码]', text: '课外的事。', result: '一个月后是回响48H 黑客松，接着是围城Lab 和 Coopagents。' },
    ],
  },
  { kind: 'enemy', date: '2026.10', label: 'X-Ray', code: 'XRAYS' },
  { kind: 'enemy', date: '2026.10', label: '围城Lab', code: 'WCLAB' },
  { kind: 'enemy', date: '2026.10', label: 'Coopagents', code: 'COOPS' },
  { kind: 'shop', date: '现在', label: '商人' },
  { kind: 'boss', date: '下一站', label: '下一位 Boss' },
];

/** 篝火上的选项 */
export const campfire = [
  { id: 'run', title: '休息', hint: '跑一圈', text: '跑了 5 公里。减压就靠这个。', icon: 'shoe' },
  { id: 'diary', title: '回忆', hint: '翻翻日记', text: '翻开日记本。已经写了六年。', icon: 'book' },
  { id: 'spire', title: '打一局', hint: '杀戮尖塔', text: '这一页就是照着它的地图做的。', icon: 'card' },
  { id: 'studio', title: '回房间', hint: '3D 小屋', text: '去「围城的房间」。', icon: 'house', href: '/studio/', style: 'studio' },
  { id: 'cockpit', title: '去机场', hint: '737 驾驶舱', text: '去 737 驾驶舱。', icon: 'plane', href: '/cockpit/', style: 'cockpit' },
];

/** 遗物 = 技能，和 site.ts 的 checklist 一一对应；24×24 线条图标 */
export const relicIcons = [
  // 产品定义 · PRD：卷轴
  '<path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M6 4a2 2 0 0 0-2 2v2h2M9.5 9h6M9.5 12.5h6M9.5 16h4"/>',
  // 多智能体编排：三个连起来的点
  '<circle cx="12" cy="5" r="2.6"/><circle cx="5" cy="18" r="2.6"/><circle cx="19" cy="18" r="2.6"/><path d="M10.7 7.3 6.3 15.7M13.3 7.3l4.4 8.4M7.6 18h8.8"/>',
  // Prompt 工程：对话气泡
  '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 4v-4H6a2 2 0 0 1-2-2z"/><path d="M8.5 9.5l2 1.5-2 1.5M12.5 12.5h3"/>',
  // Python：两条蛇
  '<path d="M12 3.5c-3.5 0-4 1.5-4 3v2h4.5M12 20.5c3.5 0 4-1.5 4-3v-2h-4.5"/><path d="M8 8.5H6c-1.5 0-2.5 1.2-2.5 3.5S4.5 15.5 6 15.5h2v-2.5c0-1.5 1-2.5 2.5-2.5H14c1.5 0 2-1 2-2V6.5c0-1.6-.9-3-4-3M16 15.5h2c1.5 0 2.5-1.2 2.5-3.5S19.5 8.5 18 8.5h-2"/><circle cx="10.2" cy="5.9" r=".6"/><circle cx="13.8" cy="18.1" r=".6"/>',
  // TypeScript：方块
  '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M7 11h6M10 11v7M18 11.6c-.5-.6-1.2-.9-2-.9-1.1 0-1.9.6-1.9 1.5 0 2 4 1.2 4 3.4 0 1-.9 1.7-2.1 1.7-.9 0-1.7-.4-2.2-1"/>',
  // Rust · Tauri：齿轮
  '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M5.6 18.4l1.9-1.9M16.5 7.5l1.9-1.9"/><circle cx="12" cy="12" r="6.6"/>',
  // FFmpeg · 视频管线：胶片
  '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M7 5v14M17 5v14M3.5 9H7M3.5 15H7M17 9h3.5M17 15h3.5M10.5 9.5l3.5 2.5-3.5 2.5z"/>',
  // 部署上线：火箭
  '<path d="M12 3c3 2.2 4.5 5.5 4.5 9.5l-2 3.5h-5l-2-3.5C7.5 8.5 9 5.2 12 3z"/><circle cx="12" cy="10" r="1.7"/><path d="M7.6 13 5 16.5l3.4.8M16.4 13l2.6 3.5-3.4.8M10.5 18.5 12 21l1.5-2.5"/>',
  // 上台 Pitch：麦克风
  '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7"/>',
];

/** 药水 = 联系方式，和 radio 一一对应：瓶子里的颜色 */
export const potionColors = ['#e2574c', '#9aa7b8', '#4fb4e8', '#e6e6e6', '#ff4f6d'];
