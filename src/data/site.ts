export const site = {
  handle: '围城',
  name: 'Weichen Li',
  age: 18,
  callsign: 'WCH2026',
  /** 人生这一段的实际航线：广州白云 → 南京禄口 */
  route: { from: 'ZGGG', to: 'ZSNJ' },
  title: '围城 Weichen Li — 能定义产品，也能自己把它写完',
  description:
    '18 岁，AI 产品人 / 独立开发者。AdventureX 2026 一等奖、豆包全国金奖，微软 Terminal 贡献者。这里是我做过的东西和还没做完的东西。',
  email: 'weichenleeeee@outlook.com',
  url: 'https://weichenleeeee123.github.io',
} as const;

export const links = [
  { label: 'EMAIL', value: 'weichenleeeee@outlook.com', href: 'mailto:weichenleeeee@outlook.com' },
  { label: 'GITHUB', value: '@Weichenleeeee123', href: 'https://github.com/Weichenleeeee123' },
  { label: 'X', value: '@weichenleeeee', href: 'https://x.com/weichenleeeee' },
  { label: '小红书', value: '@吴向西', href: 'https://www.xiaohongshu.com' },
] as const;

export const nav = [
  { label: 'WORK', href: '/#work' },
  { label: 'LOG', href: '/log' },
  { label: 'ABOUT', href: '/about' },
] as const;
