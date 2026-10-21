// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://weichen.li',
  integrations: [sitemap()],
  // 旧站的文章已下线，老链接统一落回首页
  redirects: {
    '/log/adventurex-2026': '/',
    '/log/kinolens-200-lines': '/',
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
