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
