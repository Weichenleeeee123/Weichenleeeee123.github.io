/* 页面交互。全部在 prefers-reduced-motion 下降级为静态。 */

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 日/夜航图切换 ---------- */
function initTheme() {
  const KEY = 'chart-mode';
  const root = document.documentElement;
  const btns = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')];

  const apply = (mode: 'day' | 'night') => {
    root.dataset.mode = mode;
    for (const btn of btns) {
      btn.textContent = mode === 'day' ? 'DAY' : 'NIGHT';
      btn.setAttribute('aria-label', mode === 'day' ? '切换到夜间航图' : '切换到日间航图');
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', mode === 'day' ? '#d9d3c1' : '#0d1218');
  };

  const saved = localStorage.getItem(KEY) as 'day' | 'night' | null;
  apply(saved ?? 'day');

  for (const btn of btns) {
    btn.addEventListener('click', () => {
      const next = root.dataset.mode === 'night' ? 'day' : 'night';
      localStorage.setItem(KEY, next);
      apply(next);
    });
  }
}

/* ---------- 顶栏：滚过首屏才出现，显示当前区块 ---------- */
function initTopbar() {
  const bar = document.querySelector<HTMLElement>('[data-topbar]');
  const head = document.querySelector<HTMLElement>('.titleblock');
  if (!bar || !head) return;

  const io = new IntersectionObserver(
    ([e]) => bar.classList.toggle('show', !e.isIntersecting),
    { threshold: 0, rootMargin: '-72px 0px 0px 0px' }
  );
  io.observe(head);
}

/* ---------- Zulu 时钟：航图报文用的世界时 ---------- */
function initClock() {
  const p2 = (n: number) => String(n).padStart(2, '0');
  /* 每次都重新查元素：翻页后旧节点已经不在文档里了 */
  const tick = () => {
    const el = document.querySelector<HTMLElement>('[data-zulu]');
    if (!el) return;
    const d = new Date();
    el.textContent = `${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(
      d.getUTCSeconds()
    )}Z`;
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- 航路：随滚动描线 + 航路点依次点亮 ---------- */
function initRoute() {
  const route = document.querySelector<HTMLElement>('.route');
  const progress = document.querySelector<HTMLElement>('.route-progress');
  if (!route || !progress) return;

  const points = [...route.querySelectorAll<HTMLElement>('.wpt')];
  let ticking = false;

  const update = () => {
    ticking = false;
    const box = route.getBoundingClientRect();
    const mark = innerHeight * 0.62;
    const ratio = Math.min(1, Math.max(0, (mark - box.top) / box.height));
    progress.style.transform = `scaleY(${ratio})`;

    for (const p of points) {
      const b = p.getBoundingClientRect();
      p.classList.toggle('passed', b.top < mark);
    }
  };

  addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );
  addEventListener('resize', update, { passive: true });
  update();
}

/* ---------- 罗盘指针：转向当前所在区块 ---------- */
function initNeedle() {
  const needle = document.querySelector<SVGGElement>('.needle');
  const blocks = [...document.querySelectorAll<HTMLElement>('.block[data-bearing]')];
  if (!needle || !blocks.length) return;

  let current = -1;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const bearing = Number((e.target as HTMLElement).dataset.bearing);
        if (bearing === current) continue;
        current = bearing;
        needle.style.transform = `rotate(${bearing}deg)`;
        const readout = document.querySelector<HTMLElement>('[data-bearing-readout]');
        if (readout) readout.textContent = `HDG ${String(bearing).padStart(3, '0')}°`;

        const label = (e.target as HTMLElement).querySelector('h2')?.lastChild?.textContent?.trim();
        const where = document.querySelector<HTMLElement>('[data-topbar-where]');
        if (where && label) where.textContent = label;
      }
    },
    { rootMargin: '-45% 0px -45% 0px' }
  );
  blocks.forEach((b) => io.observe(b));
}

/* ---------- 内容分层进场 ---------- */
/* ---------- 滚动显现 ----------
   自己算进度写进 --p，不用 animation-timeline: view()：那个东西一旦有任何
   祖先 overflow 非 visible 就整条静默失效，且无法在不渲染的环境里验证。 */
function initReveal() {
  const items = [
    ...document.querySelectorAll<HTMLElement>('[data-reveal], .block > h2, .block .num'),
  ];
  const pans = [...document.querySelectorAll<HTMLElement>('.shot-img')];
  if (!items.length && !pans.length) return;

  /* reduced-motion 时什么都不做：CSS 默认 --p:1，本来就是完整显示 */
  if (reduced) return;

  const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

  const update = () => {
    const vh = innerHeight;
    /* 元素顶边从视口 90% 处开始显现，到 58% 处完全显现 */
    const from = vh * 0.9;
    const to = vh * 0.58;

    for (const el of items) {
      const r = el.getBoundingClientRect();
      const p = clamp01((from - r.top) / (from - to));
      el.style.setProperty('--p', p.toFixed(3));
    }

    /* 视差：元素中心相对视口中心，映射到 -1 ~ 1 */
    for (const el of pans) {
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const v = (center - vh / 2) / (vh / 2 + r.height / 2);
      el.style.setProperty('--pan', Math.max(-1, Math.min(1, v)).toFixed(3));
    }
  };

  /* 不走 rAF：rAF 在不渲染的标签页里根本不触发，直接算反而更可靠也够快 */
  let pending = false;
  const onScroll = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      update();
    }, 16);
  };

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', update, { passive: true });
  update();

  /* 图片加载完尺寸会变，重算一次视差基准 */
  for (const img of pans) {
    if (!(img as HTMLImageElement).complete) img.addEventListener('load', update, { once: true });
  }
}

/* ---------- 纸面上的一点光，跟着光标走 ---------- */
function initSheen() {
  if (reduced || !matchMedia('(pointer: fine)').matches) return;
  const sheet = document.querySelector<HTMLElement>('.sheet');
  if (!sheet) return;
  let raf = 0;
  sheet.addEventListener('pointermove', (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const b = sheet.getBoundingClientRect();
      sheet.style.setProperty('--mx', `${e.clientX - b.left}px`);
      sheet.style.setProperty('--my', `${e.clientY - b.top}px`);
    });
  });
  sheet.addEventListener('pointerenter', () => sheet.classList.add('lit'));
  sheet.addEventListener('pointerleave', () => sheet.classList.remove('lit'));
}

/* ---------- 导航图 ↔ 作品列表 双向联动 ---------- */
function initChartMap() {
  const nd = document.querySelector<HTMLElement>('[data-nd]');
  if (!nd) return;

  const readout = nd.querySelector<HTMLElement>('[data-nd-readout]');
  const needle = document.querySelector<SVGGElement>('.needle');
  const marks = [...nd.querySelectorAll<SVGGElement>('[data-nd-pt]')];
  const rows = [...document.querySelectorAll<HTMLElement>('[data-wpt]')];
  const meta = rows.map((r) => ({
    name: r.querySelector('h3')?.firstElementChild?.textContent?.trim() ?? '',
    brg: 0,
  }));

  /* 方位从图上的位置反算，省得再传一份数据下来 */
  marks.forEach((m, i) => {
    const c = m.querySelector('circle')!;
    const x = Number(c.getAttribute('cx')) - 200;
    const y = Number(c.getAttribute('cy')) - 200;
    meta[i].brg = Math.round((((Math.atan2(y, x) * 180) / Math.PI + 90) + 360) % 360);
  });

  let locked = false;

  const focus = (i: number | null) => {
    marks.forEach((m, k) => m.classList.toggle('hot', k === i));
    rows.forEach((r, k) => r.classList.toggle('hot', k === i));

    if (i === null) {
      if (readout) readout.innerHTML = '<span class="ph">悬停任一航路点</span>';
      return;
    }
    const { name, brg } = meta[i];
    if (readout) {
      readout.innerHTML = `<span>WPT ${String(i + 1).padStart(2, '0')} <b>${name}</b></span><span>BRG ${String(
        brg
      ).padStart(3, '0')}°</span>`;
    }
    if (needle && !locked) needle.style.transform = `rotate(${brg}deg)`;
  };

  marks.forEach((m, i) => {
    m.addEventListener('pointerenter', () => focus(i));
    m.addEventListener('focus', () => focus(i));
    m.addEventListener('pointerleave', () => focus(null));
    m.addEventListener('blur', () => focus(null));
    const go = () => {
      locked = true;
      rows[i].scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      setTimeout(() => (locked = false), 900);
    };
    m.addEventListener('click', go);
    m.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        go();
      }
    });
  });

  rows.forEach((r, i) => {
    r.addEventListener('pointerenter', () => focus(i));
    r.addEventListener('pointerleave', () => focus(null));
  });
}

/* ---------- 数据带：数字滚上去 ---------- */
function initCounters() {
  const nums = [...document.querySelectorAll<HTMLElement>('[data-count]')];
  if (!nums.length) return;
  if (reduced || !('IntersectionObserver' in window)) return;

  const run = (el: HTMLElement) => {
    const target = Number(el.dataset.count);
    const dur = 900;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      /* easeOutExpo，末尾几乎停住，像仪表定位 */
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = String(Math.round(target * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(
    (entries, obs) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        run(e.target as HTMLElement);
        obs.unobserve(e.target);
      }
    },
    { threshold: 0.6 }
  );
  nums.forEach((n) => {
    n.textContent = '0';
    io.observe(n);
  });

  /* 兜底：2.5 秒后仍停在 0 的直接补上真值，绝不让数字永远是 0 */
  setTimeout(() => {
    for (const n of nums) {
      if (n.textContent === '0' && n.dataset.count !== '0') n.textContent = n.dataset.count!;
    }
  }, 2500);
}

/* 开了视图过渡后脚本不会随导航重新执行，所以每次 page-load 都重新接一遍。
   定时器只起一次，避免翻页翻几次就有几个时钟在跑。 */
let clockStarted = false;

function boot() {
  initTheme();
  initTopbar();
  initCounters();
  if (!clockStarted) {
    initClock();
    clockStarted = true;
  }
  initRoute();
  initNeedle();
  initReveal();
  initSheen();
  initChartMap();
}

boot();
document.addEventListener('astro:page-load', boot);
