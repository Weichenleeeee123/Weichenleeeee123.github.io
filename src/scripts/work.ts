/** 普通版的一点点交互：滚到才出现、目录跟着高亮、复制邮箱、存成 PDF */

const $$ = <T extends Element = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 滚到了再淡进来；不支持或者减少动态就直接全显示 */
const items = $$('[data-reveal]');
if (!calm && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const el of items) {
    // 一开始就在屏幕里的不用等
    if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in');
    else {
      el.classList.add('wait');
      io.observe(el);
    }
  }
}

/* 顶栏目录：看到哪一块就亮哪一个 */
const links = new Map($$<HTMLAnchorElement>('.wk-nav a').map((a) => [a.hash.slice(1), a]));
const secs = [...links.keys()].map((id) => document.getElementById(id)).filter((s): s is HTMLElement => !!s);
const bar = document.querySelector<HTMLElement>('.wk-bar');
const spy = () => {
  const line = innerHeight * 0.35;
  let on = '';
  for (const s of secs) if (s.getBoundingClientRect().top < line) on = s.id;
  // 滚到底了，最后一块一定亮
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) on = secs.at(-1)?.id ?? on;
  for (const [id, a] of links) a.classList.toggle('on', id === on);
  bar?.classList.toggle('scrolled', scrollY > 8);
};
addEventListener('scroll', spy, { passive: true });
addEventListener('resize', spy);
spy();

/* 小提示 */
const toastEl = document.querySelector<HTMLElement>('.wk-toast');
let toastTimer = 0;
const toast = (text: string) => {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => (toastEl.hidden = true), 300);
  }, 2000);
};

/* 复制邮箱：有的浏览器（微信里）不给剪贴板权限，那就把字选中让人自己复制 */
for (const btn of $$<HTMLButtonElement>('[data-copy]')) {
  btn.addEventListener('click', async () => {
    const text = btn.dataset.copy!;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = '已复制';
      toast(`已复制 ${text}`);
      setTimeout(() => (btn.textContent = '复制'), 1600);
    } catch {
      const a = btn.previousElementSibling;
      if (a) getSelection()?.selectAllChildren(a);
      toast('复制不了，已经帮你选中了');
    }
  });
}

/* 存成 PDF：打印样式在 work.css 的 @media print 里 */
for (const btn of $$('[data-print]')) btn.addEventListener('click', () => print());
