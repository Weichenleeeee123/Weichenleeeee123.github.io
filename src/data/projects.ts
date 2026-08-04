import type { ImageMetadata } from 'astro';
import alphabit from '../assets/covers/alphabit.png';
import yingjushi from '../assets/covers/yingjushi.png';
import kinolens from '../assets/covers/kinolens.png';
import qingming from '../assets/covers/qingming.jpg';

export type Tag = { text: string; kind?: 'award' | 'wip' | 'done' };

export type Project = {
  name: string;
  /** 副标题，一句话说清它是什么 */
  sub: string;
  desc: string;
  href?: string;
  hrefText?: string;
  tags: Tag[];
  /** 正在进行中的项目，航路点实心 */
  active?: boolean;
  /** 导航图上的方位（度）与距离（0–1），决定它画在哪 */
  brg: number;
  dist: number;
  /** bento 网格里占几列（共 6 列） */
  span: number;
  /** 图上的短标识 */
  code: string;
  /** 真实截图。没有的话回退到生成封面 */
  cover?: ImageMetadata;
  /** 截图偏暗，覆盖层要反过来 */
  coverDark?: boolean;
};

/* 顺序 = bento 排布顺序：有真实截图的排前两行占大格，
   生成封面的收在第三行占小格，避免两种封面混在同一行 */
export const projects: Project[] = [
  {
    name: 'AlphaBit Coach',
    span: 4,
    brg: 25,
    dist: 0.74,
    code: 'ABC',
    cover: alphabit,
    coverDark: true,
    sub: '看得见的 AI 投研团队',
    desc: '问一个投资问题，系统当场决定请哪几个专家（研究、量化、宏观、风控、报告），排成任务 DAG 跑完，过程在一间像素风办公室里实时演出来。报告里每个结论都必须追回到某个专家真实返回的数据，缺了就写缺了，不让模型自己补圆。',
    href: 'https://github.com/Alia0415/AlphaBit-Coach',
    hrefText: 'github.com/Alia0415/AlphaBit-Coach',
    tags: [
      { text: 'AdventureX 2026 赛道一等奖', kind: 'award' },
      { text: 'LangGraph · A2A' },
      { text: '4 天' },
    ],
  },
  {
    name: '影剧师',
    span: 2,
    brg: 68,
    dist: 0.46,
    code: 'YJS',
    cover: yingjushi,
    sub: '剧本创作与分镜规划',
    desc: '把一个故事想法拆成剧本、分镜和可执行的拍摄计划。这是我第一个真正有人用的产品，奖金后来成了 KinoLens 的启动资金。',
    tags: [{ text: '豆包应用生成挑战赛 全国金奖', kind: 'award' }],
  },
  {
    name: 'KinoLens',
    span: 3,
    brg: 118,
    dist: 0.82,
    code: 'KNL',
    cover: kinolens,
    active: true,
    sub: 'AI 视频剪辑',
    desc: '丢一堆没整理过的素材进去，出来一条能看的片子。做了半年，成片效果还不行——话会被切断、节奏是散的。原因我审出来了：9 万行代码里真正在做剪辑决策的只有 200 行。现在在重写这 200 行。',
    href: 'https://kinolens.ai',
    hrefText: 'kinolens.ai',
    tags: [
      { text: '进行中', kind: 'wip' },
      { text: 'Python · FFmpeg · LLM' },
    ],
  },
  {
    name: '清明上河图',
    span: 3,
    brg: 313,
    dist: 0.71,
    code: 'QMSHT',
    cover: qingming,
    coverDark: true,
    sub: '会说话的古画',
    desc: '画里的人各有身份和社会关系，你跟其中一个说的话，会沿着关系图一跳一跳传出去，整条街慢慢都知道了。虹桥上还有个定时开演的事件。',
    tags: [{ text: '多智能体 · 状态机' }],
  },
  {
    name: 'Virtual ATC',
    span: 2,
    brg: 170,
    dist: 0.56,
    code: 'VATC',
    sub: '模拟飞行里的 AI 管制员',
    desc: '戴上耳机用语音跟 AI 管制员通话，它会看你的飞机状态给指令。支持 X-Plane 和 MSFS 两个模拟器。我玩了六年模拟飞行，这个是给自己做的。',
    href: 'https://github.com/Weichenleeeee123/virtual-atc',
    hrefText: 'github.com/Weichenleeeee123/virtual-atc',
    tags: [{ text: 'Tauri · Rust · Whisper.cpp' }],
  },
  {
    name: '语文老师.skill',
    span: 2,
    brg: 216,
    dist: 0.79,
    code: 'YWLS',
    sub: 'AI 高考作文教练',
    desc: '审题、立意、列提纲、写范文、批改打分，一条龙。我自己高三时语文是最大的短板，这个是从那时候的笔记长出来的。开源，有真实用户在用。',
    href: 'https://github.com/Weichenleeeee123/oh-my-chinese-teacher',
    hrefText: 'github.com/Weichenleeeee123/oh-my-chinese-teacher',
    tags: [{ text: '开源' }],
  },
  {
    name: 'Microsoft Terminal',
    span: 2,
    brg: 268,
    dist: 0.43,
    code: 'MSFT',
    sub: 'PR #19167',
    desc: '修了 WSLENV 里 WT_SESSION 会重复累积的问题。跟微软工程师来回改了几轮，合并进主线并 cherry-pick 到 1.23。',
    href: 'https://github.com/microsoft/terminal/pull/19167',
    hrefText: 'github.com/microsoft/terminal/pull/19167',
    tags: [{ text: '已合并', kind: 'done' }],
  },
];
