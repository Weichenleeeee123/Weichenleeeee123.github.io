/**
 * 围城爬塔：地图、每一层的画面、牌组、提示框、火星。
 * 内容全在 HTML 里（没有 JS 也能从上往下读完），这里只负责「玩」的部分：
 *   #hero 角色档案 → #map 地图 → #f-N 第 N 层 / #deck 牌组，前进后退都走浏览器历史。
 * 看过的层记在 localStorage（wc-spire-seen），地图上会被圈起来；开场的墨线动画每次打开只放一遍。
 */
import { Sfx } from './sfx';

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

const root = $('[data-spire]')!;
const html = document.documentElement;
const map = $<SVGSVGElement>('[data-map]')!;
const token = $<SVGGElement>('[data-token]')!;
const reveal = $<SVGRectElement>('[data-reveal]')!;
const tipBox = $('[data-tip-box]')!;
const toastBox = $('[data-toast]')!;
const fade = $('.sp-fade')!;
const hint = $('[data-map-hint]');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const sfx = new Sfx();

history.scrollRestoration = 'manual';

/* ───── 地图上的节点 ───── */

const VIEW_H = map.viewBox.baseVal.height;
const nodes = new Map<number, { el: SVGAElement; x: number; y: number; kind: string }>();
for (const el of $$<SVGAElement>('[data-node]')) {
  const n = Number(el.dataset.node);
  const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(el.getAttribute('transform') ?? '');
  const kind = [...el.classList].find((c) => c.startsWith('k-'))?.slice(2) ?? '';
  nodes.set(n, { el, x: Number(m?.[1] ?? 0), y: Number(m?.[2] ?? 0), kind });
  el.style.setProperty('--d', String(n));
}
const lastFloor = Math.max(...nodes.keys());

/* 看过的层 */
const seen = new Set<number>();
try {
  for (const n of JSON.parse(localStorage.getItem('wc-spire-seen') ?? '[]')) if (nodes.has(n)) seen.add(n);
} catch {
  /* 隐私模式或者坏数据 */
}
const seenCount = $('[data-seen]')!;
const floorStat = $('.sp-floor');
const paintSeen = () => {
  for (const [n, { el }] of nodes) el.classList.toggle('seen', seen.has(n));
  seenCount.textContent = String(seen.size);
};
paintSeen();
const markSeen = (n: number) => {
  if (seen.has(n)) return;
  seen.add(n);
  try {
    localStorage.setItem('wc-spire-seen', JSON.stringify([...seen]));
  } catch {
    /* 隐私模式 */
  }
  // 地图在后面，等回到地图时圈才画上
  setTimeout(paintSeen, 400);
  floorStat?.classList.remove('bump');
  void floorStat?.offsetWidth;
  floorStat?.classList.add('bump');
  seenCount.textContent = String(seen.size);
};

/* ───── 小鸭子（当前位置） ───── */

let tokFloor = lastFloor - 1;
const placeToken = (x: number, y: number) => token.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
const walkTo = (n: number) =>
  new Promise<void>((done) => {
    const to = nodes.get(n);
    const from = nodes.get(tokFloor);
    if (!to || !from || n === tokFloor || calm) {
      if (to) placeToken(to.x, to.y);
      tokFloor = n;
      return done();
    }
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const dur = Math.min(620, 260 + dist * 0.35);
    const t0 = performance.now();
    token.classList.add('walking');
    sfx.ink();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const hop = Math.sin(Math.PI * k) * Math.min(46, 14 + dist * 0.08);
      placeToken(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e - hop);
      if (k < 1) requestAnimationFrame(step);
      else {
        token.classList.remove('walking');
        tokFloor = n;
        done();
      }
    };
    requestAnimationFrame(step);
  });

/* 地图坐标 → 页面滚动位置 */
const mapToPage = (y: number) => {
  const r = map.getBoundingClientRect();
  return r.top + scrollY + (y / VIEW_H) * r.height;
};
const scrollToMapY = (y: number, at = 0.5, smooth = false) => {
  window.scrollTo({ top: Math.max(0, mapToPage(y) - innerHeight * at), behavior: smooth ? 'smooth' : 'auto' });
};

/* ───── 开场：墨线从下往上画出来 ───── */

let toured = false;
try {
  toured = sessionStorage.getItem('wc-spire-toured') === '1';
} catch {
  /* 隐私模式 */
}
let touring = 0;

const revealAll = () => {
  reveal.setAttribute('y', '0');
  reveal.setAttribute('height', String(VIEW_H));
  root.classList.remove('touring');
  for (const { el } of nodes.values()) el.classList.add('lit');
};

const tour = () => {
  toured = true;
  try {
    sessionStorage.setItem('wc-spire-toured', '1');
  } catch {
    /* 隐私模式 */
  }
  if (calm) {
    revealAll();
    scrollToMapY(nodes.get(tokFloor)!.y, 0.55);
    return;
  }
  root.classList.add('touring');
  for (const { el } of nodes.values()) el.classList.remove('lit');
  window.scrollTo(0, document.documentElement.scrollHeight);
  const endScroll = Math.max(0, mapToPage(nodes.get(tokFloor)!.y) - innerHeight * 0.5);
  const dur = 3600;
  const t0 = performance.now();
  const id = ++touring;
  const stop = () => {
    if (touring !== id) return;
    touring = 0;
    revealAll();
    off();
  };
  const off = () => {
    for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) removeEventListener(ev, stop, true);
  };
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) addEventListener(ev, stop, { capture: true, passive: true });
  let lastLit = Infinity;
  const frame = (now: number) => {
    if (touring !== id) return;
    const k = Math.min(1, (now - t0) / dur);
    const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
    const edge = VIEW_H * (1 - e);
    reveal.setAttribute('y', edge.toFixed(1));
    reveal.setAttribute('height', (VIEW_H - edge).toFixed(1));
    for (const [n, { el, y }] of nodes) {
      if (y > edge - 20 && !el.classList.contains('lit')) {
        el.classList.add('lit');
        if (n < lastLit) {
          lastLit = n;
          sfx.hover();
        }
      }
    }
    const want = mapToPage(edge) - innerHeight * 0.62;
    window.scrollTo(0, Math.max(endScroll, want));
    if (k < 1) requestAnimationFrame(frame);
    else stop();
  };
  requestAnimationFrame(frame);
};

/* ───── 画面切换 ───── */

type View = 'hero' | 'map' | 'screen';
let current: HTMLElement | null = null;
let currentFloor = -1;
let mapScroll = 0;

const setView = (v: View) => {
  if (root.dataset.view === 'map' && v !== 'map') mapScroll = scrollY;
  root.dataset.view = v;
  html.classList.toggle('locked', v !== 'map');
};

const closeScreen = () => {
  if (!current) return;
  const el = current;
  el.classList.remove('on');
  el.classList.add('leaving');
  setTimeout(() => el.classList.remove('leaving'), 320);
  if (el.classList.contains('scr-rest')) sfx.fire(false);
  current = null;
};

const openScreen = (el: HTMLElement, floor = -1) => {
  if (current === el) return;
  closeScreen();
  setView('screen');
  current = el;
  currentFloor = floor;
  el.classList.add('on');
  el.scrollTop = 0;
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  hideTip();
  if (el.classList.contains('scr-fight')) {
    sfx.enter(el.classList.contains('k-elite'));
    setTimeout(() => sfx.card(), 260);
    if (el.querySelector('.rw-gold')) setTimeout(() => sfx.coin(), 560);
  } else if (el.classList.contains('scr-rest')) {
    sfx.enter();
    sfx.fire(true);
  } else if (el.classList.contains('scr-deck')) {
    sfx.card();
    setTimeout(() => sfx.card(), 140);
  } else sfx.enter(el.classList.contains('scr-boss'));
  if (floor >= 0) {
    markSeen(floor);
    if (tokFloor !== floor) {
      const n = nodes.get(floor);
      if (n) placeToken(n.x, n.y);
      tokFloor = floor;
    }
  }
};

const showMap = () => {
  const from = currentFloor;
  closeScreen();
  currentFloor = -1;
  const wasMap = root.dataset.view === 'map';
  setView('map');
  if (!toured) {
    // 等角色档案淡出再开始
    setTimeout(tour, wasMap ? 0 : 380);
    return;
  }
  revealAll();
  const target = from >= 0 ? nodes.get(from) : null;
  if (target) {
    window.scrollTo(0, mapScroll);
    const r = target.el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > innerHeight - 60) scrollToMapY(target.y, 0.5, true);
  } else if (!wasMap) {
    if (mapScroll) window.scrollTo(0, mapScroll);
    else scrollToMapY(nodes.get(tokFloor)!.y, 0.5);
  }
};

const showHero = () => {
  closeScreen();
  currentFloor = -1;
  setView('hero');
};

const route = async () => {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h || h === 'hero') return showHero();
  if (h === 'map') return showMap();
  if (h === 'deck') return openScreen($('#deck')!);
  const m = /^f-(\d+)$/.exec(h);
  const el = m ? $<HTMLElement>(`#${h}`) : null;
  if (m && el) {
    const n = Number(m[1]);
    // 在地图上点的：先让小鸭子走过去
    if (root.dataset.view === 'map' && toured && !touring) await walkTo(n);
    return openScreen(el, n);
  }
  showMap();
};

const go = (hash: string, replace = false) => {
  if (hash === location.hash || (hash === '#hero' && !location.hash)) return route();
  history[replace ? 'replaceState' : 'pushState'](null, '', hash || location.pathname);
  route();
};

/* 站内的 # 链接都走这里，免得浏览器跳着滚动 */
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  const href = a.getAttribute('href')!;
  if (a.hasAttribute('data-embark')) sfx.embark();
  if (a.classList.contains('sc-next') || a.classList.contains('choice-go')) sfx.ink();
  if (href.startsWith('#f-') || href === '#deck') hint?.classList.add('gone');
  go(href);
});
addEventListener('popstate', route);

/* 换风格：黑一下再走，记选择的事交给 style-pref */
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-style-switch]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  sfx.embark();
  fade.classList.add('on');
  setTimeout(() => (location.href = a.href), calm ? 0 : 420);
});
addEventListener('pageshow', () => fade.classList.remove('on'));

/* 键盘：Esc 回地图，左右键在层之间走 */
addEventListener('keydown', (e) => {
  if (e.defaultPrevented || $('[data-style-menu][open]')) return;
  const view = root.dataset.view;
  if (e.key === 'Escape') {
    if (view === 'screen') go('#map');
    else if (view === 'hero') go('#map');
  } else if (view === 'screen' && currentFloor >= 0 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const n = currentFloor + (e.key === 'ArrowRight' ? 1 : -1);
    if (nodes.has(n)) {
      sfx.ink();
      go(`#f-${n}`);
    }
  }
});

/* ───── 地图上的小互动 ───── */

for (const [, { el }] of nodes) {
  el.addEventListener('pointerenter', () => sfx.hover());
  el.addEventListener('focus', () => sfx.hover());
}

for (const g of $$<SVGGElement>('[data-ghost]')) {
  g.addEventListener('click', () => {
    g.classList.remove('poke');
    void g.getBoundingClientRect();
    g.classList.add('poke');
    sfx.hover();
    toast('这条路没走过。');
  });
}

for (const b of $$<HTMLButtonElement>('[data-legend]')) {
  const k = b.dataset.legend!;
  const on = () => (map.dataset.hl = k);
  const off = () => {
    const pinned = $<HTMLButtonElement>('[data-legend][aria-pressed="true"]');
    if (pinned) map.dataset.hl = pinned.dataset.legend!;
    else delete map.dataset.hl;
  };
  b.addEventListener('pointerenter', on);
  b.addEventListener('focus', on);
  b.addEventListener('pointerleave', off);
  b.addEventListener('blur', off);
  b.addEventListener('click', () => {
    const pressed = b.getAttribute('aria-pressed') === 'true';
    for (const o of $$('[data-legend]')) o.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-pressed', pressed ? 'false' : 'true');
    sfx.pick();
    off();
  });
}

/* ───── 每层里的互动 ───── */

for (const btn of $$<HTMLButtonElement>('[data-pick]')) {
  btn.addEventListener('click', () => {
    const scr = btn.closest('.scr')!;
    const out = $<HTMLElement>('[data-result]', scr)!;
    out.textContent = btn.dataset.pick!;
    out.hidden = false;
    btn.classList.add('picked');
    sfx.pick();
  });
}

for (const btn of $$<HTMLButtonElement>('[data-rest]')) {
  btn.addEventListener('click', () => {
    const line = $('[data-rest-line]', btn.closest('.scr')!)!;
    line.textContent = btn.dataset.rest!;
    line.classList.remove('say');
    void line.offsetWidth;
    line.classList.add('say');
    sfx.pick();
  });
}

for (const btn of $$<HTMLButtonElement>('[data-chest]')) {
  btn.addEventListener('click', () => {
    btn.closest('.chest')!.classList.add('open');
    sfx.chest();
  });
}

for (const btn of $$<HTMLButtonElement>('[data-copy]')) {
  btn.addEventListener('click', async () => {
    const v = btn.dataset.copy!;
    try {
      await navigator.clipboard.writeText(v);
      toast(`已复制：${v}`);
    } catch {
      toast(v);
    }
    sfx.coin();
  });
}

/* 牌组按类型筛 */
for (const b of $$<HTMLButtonElement>('[data-filter]')) {
  b.addEventListener('click', () => {
    for (const o of $$('[data-filter]')) o.setAttribute('aria-pressed', String(o === b));
    const t = b.dataset.filter;
    for (const s of $$<HTMLElement>('.deck-slot')) s.classList.toggle('dim', !!t && s.dataset.type !== t);
    sfx.card();
  });
}

/* 声音开关 */
const soundBtn = $<HTMLButtonElement>('[data-sound]')!;
const paintSound = () => {
  soundBtn.setAttribute('aria-pressed', String(sfx.on));
  soundBtn.dataset.tip = sfx.on ? '声音：开' : '声音：关';
};
paintSound();
soundBtn.addEventListener('click', () => {
  sfx.toggle();
  paintSound();
  showTip(soundBtn);
});

/* ───── 卡牌：跟着鼠标微微倾斜，一道光扫过 ───── */

if (finePointer && !calm) {
  for (const card of $$<HTMLElement>('[data-card]')) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.classList.add('tilting');
      card.style.setProperty('--ry', `${((px - 0.5) * 16).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${((0.5 - py) * 14).toFixed(2)}deg`);
      card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.classList.remove('tilting');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
    card.addEventListener('pointerenter', () => sfx.hover());
  }
}

/* ───── 提示框 ───── */

let tipFor: Element | null = null;
function showTip(el: Element) {
  const text = (el as HTMLElement).dataset.tip ?? el.getAttribute('data-tip');
  if (!text) return;
  tipFor = el;
  const i = text.indexOf('|') >= 0 ? text.indexOf('|') : text.indexOf('：');
  tipBox.replaceChildren();
  if (i > 0) {
    const b = document.createElement('b');
    b.textContent = text.slice(0, i);
    tipBox.append(b, text.slice(i + 1));
  } else tipBox.textContent = text;
  const r = el.getBoundingClientRect();
  const w = tipBox.offsetWidth;
  const h = tipBox.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  let y = r.bottom + 10;
  if (y + h > innerHeight - 8) y = r.top - h - 10;
  x = Math.max(8, Math.min(innerWidth - w - 8, x));
  tipBox.style.left = `${x}px`;
  tipBox.style.top = `${y}px`;
  tipBox.classList.add('on');
}
function hideTip() {
  tipFor = null;
  tipBox.classList.remove('on');
}
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const el = (e.target as Element).closest('[data-tip]');
  if (el && el !== tipFor) showTip(el);
  else if (!el && tipFor) hideTip();
});
document.addEventListener('focusin', (e) => {
  const el = (e.target as Element).closest('[data-tip]');
  if (el) showTip(el);
  else hideTip();
});
addEventListener('scroll', hideTip, { passive: true });

let toastTimer = 0;
function toast(text: string) {
  toastBox.textContent = text;
  toastBox.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastBox.classList.remove('on'), 1800);
}

/* ───── 火星 ───── */

function embers() {
  const canvas = $<HTMLCanvasElement>('[data-embers]');
  if (!canvas || calm) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(1.5, devicePixelRatio || 1);
  let w = 0;
  let h = 0;
  const resize = () => {
    w = innerWidth;
    h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);
  type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; seed: number };
  const count = innerWidth < 700 ? 18 : 42;
  const spawn = (p?: P): P => {
    const q = p ?? ({} as P);
    q.x = Math.random() * w;
    q.y = h + 10 + Math.random() * h * 0.3;
    q.vx = (Math.random() - 0.5) * 0.25;
    q.vy = -(0.25 + Math.random() * 0.7);
    q.r = 0.6 + Math.random() * 1.8;
    q.max = 300 + Math.random() * 500;
    q.life = 0;
    q.seed = Math.random() * 100;
    return q;
  };
  const ps = Array.from({ length: count }, () => {
    const p = spawn();
    p.y = Math.random() * h;
    p.life = Math.random() * p.max;
    return p;
  });
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(3, (now - last) / 16.7);
    last = now;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    // 打开一层的时候火星淡一点，别抢内容
    const dim = root.dataset.view === 'screen' && !current?.classList.contains('scr-rest') ? 0.45 : 1;
    for (const p of ps) {
      p.life += dt;
      p.x += (p.vx + Math.sin((p.life + p.seed * 50) * 0.02) * 0.25) * dt;
      p.y += p.vy * dt;
      if (p.life > p.max || p.y < -10) spawn(p);
      const k = p.life / p.max;
      const a = Math.sin(Math.PI * k) * (0.55 + 0.45 * Math.sin(p.life * 0.2 + p.seed)) * dim;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      g.addColorStop(0, `rgba(255, 210, 120, ${(a * 0.9).toFixed(3)})`);
      g.addColorStop(0.35, `rgba(255, 120, 40, ${(a * 0.45).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 80, 20, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ───── 开始 ───── */

if (location.hash && location.hash !== '#hero') {
  // 直接打开某一层或地图：不放开场
  toured = true;
}
route();
embers();

// 调试入口
(window as unknown as { __spire: unknown }).__spire = { go, nodes, seen, walkTo, sfx, tour };
