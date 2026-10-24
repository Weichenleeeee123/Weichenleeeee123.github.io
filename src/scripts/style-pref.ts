/** 页面上的「换个风格」：记住选择，下次直接打开这一种 */
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const a = target.closest<HTMLAnchorElement>('[data-style-switch]');
  if (a) {
    try {
      localStorage.setItem('wc-style', a.dataset.styleSwitch!);
    } catch {
      /* 隐私模式下存不了，照样跳转 */
    }
  }
  // 点菜单外面就收起来
  document.querySelectorAll<HTMLDetailsElement>('[data-style-menu][open]').forEach((d) => {
    if (!d.contains(target)) d.open = false;
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll<HTMLDetailsElement>('[data-style-menu][open]').forEach((d) => {
    d.open = false;
    d.querySelector('summary')?.focus();
  });
});

/* 爬塔是后来加的：以前抽到别的风格的人没见过它，菜单上标个「新」，去过一次就不再标 */
let visited = true;
try {
  visited = localStorage.getItem('wc-spire-visited') === '1';
} catch {
  /* 隐私模式就不标了 */
}
if (!visited) {
  document.querySelectorAll<HTMLDetailsElement>('[data-style-menu]').forEach((d) => {
    const a = d.querySelector('a[data-style-switch="spire"]:not([aria-current])');
    if (!a) return;
    d.classList.add('has-new');
    a.classList.add('is-new');
  });
}
