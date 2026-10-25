import type { ImageMetadata } from 'astro';
import alphabit from '../assets/covers/alphabit.png';
import yingjushi from '../assets/covers/yingjushi.png';
import kinolens from '../assets/covers/kinolens.png';
import qingming from '../assets/covers/qingming.jpg';

export const site = {
  name: '李伟宸',
  nameEn: 'WEICHEN LI',
  callsign: '围城',
  title: '李伟宸 · 围城',
  description: '李伟宸（围城）的个人网站。做 AI 产品，从想法到上线一个人把全程跑完。',
  url: 'https://weichen.li',
  /** 首页一句话，出自他自己的 Bonjour 主页 */
  motto: '从一个想法到真正上线，我喜欢一个人把全程跑完，但更想找到能一起跑的人。',
};

/** 个人资料：驾驶舱的执照、房间的海报都读这里 */
export const profile = {
  base: '南京',
  school: '南京农业大学 · 国际经济与贸易 · 2026 级',
  ratings: 'AI 产品 · 多智能体 · 全栈',
  home: '广东东莞 · 祖籍江西抚州',
  hobbies: ['模拟飞行 2020 起 · 最爱 737', '日记写了六年', '减压靠 5 公里', '杀戮尖塔'],
};

/** 首屏的数据带 */
export const stats = [
  { value: 10, suffix: '', label: '个作品' },
  { value: 3, suffix: '', label: '个比赛奖项' },
  { value: 1, suffix: '', label: '个微软合并的 PR' },
  { value: 6, suffix: ' 年', label: '模拟飞行' },
];

export type Project = {
  /** 五字母航路点代号，FMC 里敲它就能跳过去 */
  code: string;
  name: string;
  sub: string;
  when: string;
  desc: string;
  role?: string;
  award?: string;
  stack: string;
  links: { text: string; href: string }[];
  image?: ImageMetadata;
};

/* 航路顺序 = 时间顺序 */
export const projects: Project[] = [
  {
    code: 'TERMN',
    name: 'Microsoft Terminal',
    sub: 'PR #19167 · 已合并',
    when: '2025.07',
    desc: 'WSLENV 里的 WT_SESSION 每开一层就重复累积一次。我把它修了，跟微软工程师来回改了几轮，合进主线，又 cherry-pick 到了 1.23。',
    stack: 'C++ · Windows',
    links: [{ text: 'PR #19167', href: 'https://github.com/microsoft/terminal/pull/19167' }],
  },
  {
    code: 'YJSHI',
    name: '影剧师',
    sub: '把故事拆成剧本和分镜',
    when: '2025.12',
    award: '豆包「应用生成」挑战赛 · 全国金奖',
    desc: '给它一个故事想法，它拆出剧本、分镜和能照着拍的计划。我第一个真正有人用的产品，去上海收官活动讲了一次；一万块奖金全部成了 KinoLens 的启动资金。',
    stack: 'LLM · 分镜规划',
    links: [],
    image: yingjushi,
  },
  {
    code: 'KINOL',
    name: 'KinoLens',
    sub: '丢进素材，剪出片子',
    when: '2026',
    role: '个人独立开发',
    desc: '一堆没整理过的素材丢进去，出来一条能看的片子。五个智能体分工：理解意图、选段、定切点、排节奏。约 9 万行代码，一个人写的。高三那年我拿大疆拍了将近 1TB 的日常，就是为了喂它。',
    stack: 'Python · FFmpeg · 多智能体',
    links: [{ text: 'kinolens.ai', href: 'https://kinolens.ai' }],
    image: kinolens,
  },
  {
    code: 'VRATC',
    name: 'Virtual ATC',
    sub: '模拟飞行里的 AI 管制员',
    when: '2026.02',
    desc: '戴上耳机用语音跟 AI 管制员通话，它读得到飞机的状态，按位置和高度给指令。X-Plane 和 MSFS 都支持。给自己做的，核心功能一天写完。',
    stack: 'Tauri · Rust · Whisper.cpp · TTS',
    links: [{ text: 'GitHub', href: 'https://github.com/Weichenleeeee123/virtual-atc' }],
  },
  {
    code: 'YUWEN',
    name: '语文老师.skill',
    sub: 'AI 高考作文教练',
    when: '2026.04',
    desc: '审题、立意、列提纲、写范文、批改打分，一条龙。高三时语文是我最大的短板，这个 skill 是从那时候的笔记里长出来的。开源，有人在用。',
    stack: 'Claude Skill',
    links: [{ text: 'GitHub', href: 'https://github.com/Weichenleeeee123/oh-my-chinese-teacher' }],
  },
  {
    code: 'QMSHT',
    name: '清明上河图',
    sub: '会说话的古画',
    when: '2026.07',
    desc: '画里的人各有身份和关系。你跟一个人说的话，会沿着关系图一跳一跳传出去，整条街慢慢都知道了。虹桥上有一场定时开演的事件；你盯着某个人看久了，他会发现你在看他。',
    stack: '多智能体 · 状态机',
    links: [],
    image: qingming,
  },
  {
    code: 'ALPHA',
    name: 'AlphaBit Coach',
    sub: '看得见的 AI 投研团队',
    when: '2026.07',
    role: '产品设计 · 核心架构 · 部署 · Pitch',
    award: 'AdventureX 2026 · PandaAI 赛道一等奖',
    desc: '问一个投资问题，系统当场决定请哪几位专家，排成任务图跑完，过程在一间像素办公室里实时演出来。规矩只有一条：每个结论都必须追回到专家真实返回的数据，缺了就写缺了。四个人，四天，第一次线下黑客松。',
    stack: 'LangGraph · A2A',
    links: [{ text: 'GitHub', href: 'https://github.com/Alia0415/AlphaBit-Coach' }],
    image: alphabit,
  },
  {
    code: 'XRAYS',
    name: 'X-Ray 透视·真相',
    sub: '对照公司说的和真实记录',
    when: '2026.10',
    award: '回响48H 黑客松 · 赛道二等奖',
    desc: '回响48H 黑客松，杭州银行赛题。输入企业名和你要干什么，它去监管、法院、登记和新闻里找真实记录，跟公司的说法对照，生成一份普通人看得懂的报告。查不到的地方会说清楚是没查成、查不到还是不适用。',
    stack: 'Python · 大模型 · 公开数据',
    links: [
      { text: 'GitHub', href: 'https://github.com/Weichenleeeee123/qier' },
    ],
  },
  {
    code: 'WCLAB',
    name: '围城Lab',
    sub: '每一帧都是代码画的知识视频',
    when: '2026.10 起',
    desc: '「Vibe知识大赏」系列：一期讲一个心理学或学习方法里的概念，画面一帧一帧用代码渲染。每个数字都回到原始论文核对过。每期发完看 2 秒跳出率和完播率，再改下一期。',
    stack: 'HTML 渲染 · FFmpeg',
    links: [{ text: 'B站 · 围城Lab', href: 'https://space.bilibili.com/38183634' }],
  },
  {
    code: 'COOPS',
    name: 'Coopagents',
    sub: 'Claude Code 和 Codex 的多人模式',
    when: '2026.10',
    desc: '你的 agent 和队友的 agent 共用一块任务板，能互相提问、交接、把对方叫醒。点对点连接，不需要服务器，也不用注册账号。',
    stack: 'Python · P2P',
    links: [{ text: 'GitHub', href: 'https://github.com/Weichenleeeee123/coopagents' }],
  },
];

/** 备降场：没单独展开的小项目 */
export const alternates = [
  { icao: 'FLMH', name: 'filmhive', note: '一个视频模型接力 100 段一秒钟，拼成一部连续的片子', href: 'https://github.com/Weichenleeeee123/filmhive' },
  { icao: 'CDHV', name: 'codehive', note: '100 个 agent 共用一个代码库，现场写出一个游戏', href: 'https://github.com/Weichenleeeee123/codehive' },
  { icao: 'WNHU', name: '玩乎', note: '把知乎文章变成能上手玩的知识实验', href: 'https://github.com/Weichenleeeee123/wanhu-interactive-knowledge' },
  { icao: 'BILI', name: 'B站成分诊所', note: '输入 UID，生成一份成分鉴定报告', href: 'https://github.com/Weichenleeeee123/bilibili-cyber-clinic' },
  { icao: 'TLDY', name: 'Three-Line-Diary', note: '一天三句话的日记本', href: 'https://github.com/Weichenleeeee123/Three-Line-Diary' },
  { icao: 'MSFS', name: 'BetterMouseYoke', note: '在 MSFS 里把鼠标当摇杆用', href: 'https://github.com/Weichenleeeee123/BetterMouseYoke-for-MSFS' },
  { icao: 'PPTX', name: 'ppt-mcp-server', note: '让 AI 直接编辑 PowerPoint 的 MCP 服务', href: 'https://github.com/Weichenleeeee123/ppt-mcp-server' },
  { icao: 'IZYZ', name: 'Izyz-Helper', note: '广东志愿者平台批量录入的油猴脚本', href: 'https://github.com/Weichenleeeee123/Izyz-Helper' },
];

/** 飞行日志 = 经历 */
export const logbook = [
  { date: '2020', from: 'ZGSZ', to: 'VATSIM', remark: '开始玩模拟飞行，X-Plane 到 MSFS，最爱 737，连飞靠中文管制' },
  { date: '2025.07', from: 'GITHUB', to: 'MSFT', remark: 'Microsoft Terminal PR #19167 合并，cherry-pick 到 1.23' },
  { date: '2025.12', from: 'ZGSZ', to: 'ZSSS', remark: '影剧师拿下豆包「应用生成」挑战赛全国金奖，上海收官活动演讲', stamp: '金奖' },
  { date: '2026.01', from: 'ZGSZ', to: 'KINOL', remark: '开始做 KinoLens，奖金当启动资金' },
  { date: '2026.04', from: 'ZGSZ', to: 'GITHUB', remark: '开源「语文老师.skill」' },
  { date: '2026.06', from: 'ZGSZ', to: '—', remark: '东莞中学毕业' },
  { date: '2026.07', from: 'ZGSZ', to: 'ZSHC', remark: 'AdventureX 2026，人生第一次线下黑客松，PandaAI 赛道一等奖', stamp: '冠军' },
  { date: '2026.09', from: 'ZGSZ', to: 'ZSNJ', remark: '进入南京农业大学，国际经济与贸易' },
  { date: '2026.10', from: 'ZSNJ', to: 'HACK', remark: '回响48H 黑客松，X-Ray 拿下赛道二等奖；同月「围城Lab」开始连更' },
];

/** 起飞前检查单 = 技能 */
export const checklist = [
  { item: '产品定义 · PRD', state: 'CHECKED' },
  { item: '多智能体编排', state: 'LangGraph · A2A' },
  { item: 'Prompt 工程', state: 'CHECKED' },
  { item: 'Python', state: 'CHECKED' },
  { item: 'TypeScript', state: 'CHECKED' },
  { item: 'Rust · Tauri', state: 'CHECKED' },
  { item: 'FFmpeg · 视频管线', state: 'CHECKED' },
  { item: '部署上线', state: 'CHECKED' },
  { item: '上台 Pitch', state: 'CHECKED' },
];

/** 无线电面板：一个频率一个联系方式 */
export const radio = [
  { freq: '118.100', label: '邮件', value: 'weichenleeeee@outlook.com', href: 'mailto:weichenleeeee@outlook.com' },
  { freq: '121.300', label: 'GitHub', value: 'Weichenleeeee123', href: 'https://github.com/Weichenleeeee123' },
  { freq: '124.500', label: 'B站', value: '围城Lab', href: 'https://space.bilibili.com/38183634' },
  { freq: '127.800', label: 'X', value: '@weichenleeeee', href: 'https://x.com/weichenleeeee' },
  { freq: '131.200', label: '小红书', value: '@吴向西' },
];
