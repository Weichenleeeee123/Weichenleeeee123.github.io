export const site = {
  title: '围城 Weichen Li',
  description: '18 岁，做 AI 产品。从想法到上线自己跑完整个流程。',
  url: 'https://weichenleeeee123.github.io',
  /** 用于 STATUS 面板的呼号 */
  callsign: 'WCH',
};

export type Link = { label: string; text: string; href?: string };

export const links: Link[] = [
  { label: 'Email', text: 'weichenleeeee@outlook.com', href: 'mailto:weichenleeeee@outlook.com' },
  { label: 'GitHub', text: 'github.com/Weichenleeeee123', href: 'https://github.com/Weichenleeeee123' },
  { label: 'X', text: '@weichenleeeee', href: 'https://x.com/weichenleeeee' },
  // 小红书暂无主页直链，先只放 handle（换成真实主页地址即可变成链接）
  { label: '小红书', text: '小红书 @吴向西' },
];
