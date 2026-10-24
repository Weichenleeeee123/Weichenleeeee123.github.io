/** 页面上的「换个风格」：记住选择，下次直接打开这一种 */
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-style-switch]');
  if (!a) return;
  try {
    localStorage.setItem('wc-style', a.dataset.styleSwitch!);
  } catch {
    /* 隐私模式下存不了，照样跳转 */
  }
});
