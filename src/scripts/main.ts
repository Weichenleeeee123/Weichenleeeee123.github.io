import { World } from './world';
import { Sound, type Clip } from './audio';
import { blank, target, approach, routeHeadings, type Flight, type Legs } from './flight';

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)];
const html = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lite = matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;

const data = JSON.parse($('#flight-data').textContent || '{}') as {
  radio: { freq: string; label: string; value: string; href?: string }[];
  codes: string[];
};
const N = data.codes.length;

history.scrollRestoration = 'manual';
scrollTo(0, 0);
html.classList.add('booting');

const sound = new Sound();
const cur: Flight = blank();
cur.n1 = 0;
let flying = false;
let bootN1 = 0;

/* ═════════ 世界 ═════════ */
let world: World | null = null;
try {
  world = new World($<HTMLCanvasElement>('[data-world]'), lite);
} catch {
  html.classList.add('nogl');
}
addEventListener('resize', () => world?.resize());

const legs: Legs = {
  takeoff: $('[data-leg="takeoff"]'),
  about: $('[data-leg="about"]'),
  cruise: $('[data-leg="cruise"]'),
  logbook: $('[data-leg="logbook"]'),
  landing: $('[data-leg="landing"]'),
};

/* ═════════ 呼叫 ═════════ */
const calloutEl = $('[data-callout]');
function callout(text: string, color: '' | 'green' | 'red' = '', clip?: Clip) {
  calloutEl.textContent = text;
  calloutEl.className = 'callout';
  void calloutEl.offsetWidth; // 重新触发动画
  calloutEl.classList.add('go');
  if (color) calloutEl.classList.add(color);
  if (clip) sound.voice(clip);
}

const up = (a: number, b: number, t: number) => a < t && b >= t;
const down = (a: number, b: number, t: number) => a > t && b <= t;

let prev = { ...cur };
let lastLanding = 0;
function triggers(tgt: Flight) {
  if (!flying) return;
  if (jumping || settling) {
    lastLanding = tgt.landing;
    // 跳转后等仪表追上目标再报到达，免得中途掠过的高度也喊出来
    if (settling && Math.abs(cur.alt - tgt.alt) < 150 && Math.abs(cur.speed - tgt.speed) < 8) {
      settling = false;
      prev = { ...cur };
      if (jumpMsg) callout(jumpMsg, 'green');
    }
    return;
  }
  const p = prev;
  if (cur.phase === 'takeoff' || cur.phase === 'climb' || cur.phase === 'ground') {
    if (up(p.n1, cur.n1, 85)) callout('THRUST SET', 'green', 'pm_thrust_set');
    if (up(p.speed, cur.speed, 80)) callout('80 KT', '', 'pm_80');
    if (up(p.speed, cur.speed, 138)) callout('V1', '', 'pm_v1');
    if (up(p.pitch, cur.pitch, 3) && cur.alt < 50) callout('ROTATE', 'green', 'pm_rotate');
    if (up(p.alt, cur.alt, 60)) callout('POSITIVE RATE', 'green', 'pm_positive');
    if (up(p.alt, cur.alt, 900)) {
      callout('GEAR UP', '', 'pm_gear_up');
      setTimeout(() => sound.gearClunk(), 900);
    }
  }
  // 过一万英尺时区调给高度
  if (up(p.alt, cur.alt, 10000)) {
    callout('FL350', 'green');
    sound.voice('atc_climb');
  }

  if (cur.phase === 'landing') {
    if (down(p.alt, cur.alt, 8000)) sound.voice('atc_land');
    if (down(p.alt, cur.alt, 2500)) callout('2500', 'green', 'gpws_2500');
    if (down(p.alt, cur.alt, 1000)) callout('1000', 'green', 'gpws_1000');
    if (down(p.alt, cur.alt, 500)) callout('500', 'green', 'gpws_500');
    if (down(p.alt, cur.alt, 220)) callout('MINIMUMS', '', 'gpws_minimums');
    if (down(p.alt, cur.alt, 100)) callout('100', 'green', 'gpws_100');
    // 737 只报到 10，没有空客那句 "retard"
    for (const n of [50, 40, 30, 20, 10] as const) if (down(p.alt, cur.alt, n)) callout(String(n), 'green', `gpws_${n}`);
  }
  if (up(lastLanding, tgt.landing, 0.86)) sound.voice('atc_welcome');
  // 接地：只在往前飞时发生
  if (up(lastLanding, tgt.landing, 0.8)) {
    cur.shake = 1;
    sound.thump();
    callout('TOUCHDOWN', 'red');
    const fl = $('[data-flash]');
    fl.classList.remove('go');
    void fl.offsetWidth;
    fl.classList.add('go');
    document.body.classList.remove('slam');
    void document.body.offsetWidth;
    document.body.classList.add('slam');
  }
  if (cur.phase === 'landing' && down(p.speed, cur.speed, 60) && cur.alt < 1) callout('60 KT', '', 'pm_60');
  lastLanding = tgt.landing;
}

/* ═════════ 仪表 ═════════ */
const ui = {
  att: $<SVGGElement>('[data-att]'),
  spdTape: $<SVGGElement>('[data-spd-tape]'),
  altTape: $<SVGGElement>('[data-alt-tape]'),
  spd: $<SVGTextElement>('[data-spd]'),
  alt: $<SVGTextElement>('[data-alt]'),
  hdg: $<SVGTextElement>('[data-hdg]'),
  mcp: Object.fromEntries($$('[data-mcp]').map((e) => [e.dataset.mcp!, e])),
  n1: $$('[data-n1]'),
  needles: $$<SVGLineElement>('[data-n1-needle]'),
  phase: $('[data-phase]'),
  ladder: $<SVGGElement>('[data-ladder]'),
  lever: $('[data-lever]'),
  bigSpd: $('[data-big-spd]'),
  ra: $('[data-ra]'),
  raNum: $('[data-ra-num]'),
  welcome: $('[data-welcome]'),
  radio: $('[data-radio]'),
  fma: Object.fromEntries($$('[data-fma]').map((e) => [e.dataset.fma!, e])),
};

const pad = (n: number, len: number) => String(Math.max(0, Math.round(n))).padStart(len, '0');

function fmaFor(f: Flight): [string, string, string] {
  switch (f.phase) {
    case 'ground':
      return ['ARM', 'HDG SEL', 'TO/GA'];
    case 'takeoff':
      return ['N1', 'HDG SEL', 'TO/GA'];
    case 'climb':
      return ['N1', 'LNAV', 'VNAV SPD'];
    case 'cruise':
      return ['FMC SPD', 'LNAV', 'VNAV PTH'];
    case 'landing':
      return f.alt > 50 ? ['MCP SPD', 'VOR/LOC', 'G/S'] : f.alt > 0.5 ? ['RETARD', 'ROLLOUT', 'FLARE'] : ['', 'ROLLOUT', ''];
    default:
      return ['', '', ''];
  }
}

function instruments(f: Flight) {
  ui.att.setAttribute('transform', `rotate(${(-f.roll).toFixed(2)} 120 70) translate(0 ${(f.pitch * 2.2).toFixed(2)})`);
  ui.spdTape.setAttribute('transform', `translate(0 ${(f.speed * 2).toFixed(1)})`);
  ui.altTape.setAttribute('transform', `translate(0 ${(f.alt * 0.08).toFixed(1)})`);
  ui.spd.textContent = String(Math.round(f.speed));
  ui.alt.textContent = String(Math.round(f.alt / 10) * 10);
  const hdg = pad(f.heading, 3);
  ui.hdg.textContent = `HDG ${hdg}`;
  ui.mcp.spd.textContent = pad(f.speed, 3);
  ui.mcp.hdg.textContent = hdg;
  ui.mcp.alt.textContent = pad(Math.round(f.alt / 100) * 100, 5);
  const vs = Math.round(f.vs / 50) * 50;
  ui.mcp.vs.textContent = (vs >= 0 ? '+' : '−') + pad(Math.abs(vs), 4);
  for (const e of ui.n1) e.textContent = f.n1.toFixed(1);
  const ang = -120 + (f.n1 / 100) * 200;
  ui.needles.forEach((l, i) => l.setAttribute('transform', `rotate(${(ang + (i ? -0.6 : 0.4)).toFixed(1)})`));
  ui.phase.textContent = f.phase.toUpperCase();
  ui.ladder.setAttribute('transform', `rotate(${(-f.roll).toFixed(2)}) translate(0 ${(f.pitch * 14).toFixed(1)})`);
  ui.lever.style.setProperty('--thr', String(Math.min(1, Math.max(0, (f.n1 - 21) / 73))));
  ui.bigSpd.textContent = String(Math.round(f.speed));

  const [a, b, c] = fmaFor(f);
  for (const [k, v] of [['thr', a], ['roll', b], ['pitch', c]] as const) {
    const el = ui.fma[k];
    if (el.textContent !== v) {
      el.textContent = v;
      el.classList.remove('chg');
      void el.offsetWidth;
      if (v) el.classList.add('chg');
    }
  }

  // HUD 只在起飞、落地这种没什么字的段落里亮起来，其余时候退到背景
  html.classList.toggle('hud-on', (f.phase === 'takeoff' && f.takeoff > 0.02) || (f.phase === 'landing' && f.landing < 0.86));

  const landed = f.phase === 'landing' || f.phase === 'parked';
  ui.ra.classList.toggle('on', landed && f.alt < 2500 && f.landing < 0.8);
  ui.raNum.textContent = String(Math.round(f.alt));
  ui.welcome.classList.toggle('on', f.landing >= 0.86);
  ui.radio.classList.toggle('on', f.landing >= 0.9);
}

/* ═════════ 导航显示器 ═════════ */
const LEG = 150;
const wpts: [number, number][] = [[0, 0]];
for (let i = 1; i < N; i++) {
  const h = (routeHeadings[i % routeHeadings.length] * Math.PI) / 180;
  const [x, y] = wpts[i - 1];
  wpts.push([x + Math.sin(h) * LEG, y - Math.cos(h) * LEG]);
}
$('[data-nd-route]').setAttribute('points', wpts.map((p) => p.join(',')).join(' '));
const ndMap = $<SVGGElement>('[data-nd-map]');
const ndRose = $<SVGGElement>('[data-nd-rose]');
const ndWpts = $$<SVGGElement>('[data-nd-wpt]');
const ndHdg = $('[data-nd-hdg]');
const ndGs = $('[data-nd-gs]');
const ndNext = $('[data-nd-next]');
const ndDist = $('[data-nd-dist]');

function planeAt(u: number): [number, number] {
  if (u <= 0) {
    const h = (routeHeadings[0] * Math.PI) / 180;
    return [Math.sin(h) * LEG * u, -Math.cos(h) * LEG * u];
  }
  if (u >= N - 1) return wpts[N - 1];
  const i = Math.floor(u);
  const t = u - i;
  return [wpts[i][0] + (wpts[i + 1][0] - wpts[i][0]) * t, wpts[i][1] + (wpts[i + 1][1] - wpts[i][1]) * t];
}

let ndU = -0.5;
function nd(f: Flight, dt: number) {
  const target = Math.min(N - 0.5, Math.max(-0.5, f.cruise * N - 0.5));
  ndU += (target - ndU) * (1 - Math.exp(-dt * 3.2));
  const [px, py] = planeAt(ndU);
  const h = f.heading;
  ndMap.setAttribute('transform', `translate(200 330) rotate(${(-h).toFixed(2)}) translate(${(-px).toFixed(1)} ${(-py).toFixed(1)})`);
  ndRose.setAttribute('transform', `rotate(${(-h).toFixed(2)} 200 330)`);
  const active = Math.min(N - 1, Math.max(0, Math.round(ndU)));
  const next = Math.min(N - 1, Math.max(0, Math.ceil(ndU + 0.001)));
  ndWpts.forEach((g, i) => {
    g.setAttribute('transform', `translate(${wpts[i][0]} ${wpts[i][1]}) rotate(${h.toFixed(2)})`);
    g.classList.toggle('active', i === active);
  });
  ndHdg.textContent = pad(h, 3);
  ndGs.textContent = String(Math.round(f.speed));
  ndNext.textContent = data.codes[next];
  ndDist.textContent = `${Math.max(0, (next - ndU) * 30).toFixed(1)} NM`;
}

/* ═════════ 作品卡片 ═════════ */
const cards = $$('[data-card]');
const legBtns = $$('[data-goto]');
let activeCard = -1;
function showCard(i: number) {
  if (i === activeCard) return;
  cards.forEach((c, k) => {
    c.classList.toggle('on', k === i);
    c.classList.toggle('gone', k === activeCard);
  });
  legBtns.forEach((b, k) => b.classList.toggle('active', k === i));
  if (activeCard >= 0 && flying) sound.click(900);
  activeCard = i;
}

/* 程序跳转：滚动结束前不触发呼叫，结束后再报一句 */
let jumping = false;
let settling = false;
let jumpTimer = 0;
let jumpMsg = '';
function flyTo(top: number, msg: string) {
  jumping = true;
  jumpMsg = msg;
  const dist = Math.abs(top - scrollY);
  // 远距离直接切过去：平滑滚过十几屏太慢，飞行状态本身会平滑过渡
  scrollTo({ top, behavior: reduce || dist > innerHeight * 6 ? 'auto' : 'smooth' });
  clearTimeout(jumpTimer);
  jumpTimer = window.setTimeout(endJump, 1400);
}
function endJump() {
  if (!jumping) return;
  jumping = false;
  settling = true;
}
addEventListener('scrollend', () => {
  if (!jumping) return;
  clearTimeout(jumpTimer);
  jumpTimer = window.setTimeout(endJump, 150);
});

function goToWaypoint(i: number) {
  const el = legs.cruise;
  const top = el.offsetTop + ((i + 0.5) / N) * (el.offsetHeight - innerHeight);
  flyTo(top, `DIR TO ${data.codes[i]}`);
}

const sectionTop = (id: string) => {
  const el = document.getElementById(id)!;
  switch (id) {
    case 'hero':
      return 0;
    case 'works':
      return el.offsetTop + (0.5 / N) * (el.offsetHeight - innerHeight);
    case 'contact':
      return el.offsetTop + 0.94 * (el.offsetHeight - innerHeight);
    case 'captain':
      return ($('.about-grid').getBoundingClientRect().top + scrollY) - innerHeight * 0.12;
    default:
      return el.offsetTop + innerHeight * 0.05;
  }
};
const jumpNames: Record<string, string> = {
  hero: 'RWY 24',
  captain: 'CAPTAIN',
  works: 'DIR TO TERMN',
  alternates: 'ALTERNATES',
  logbook: 'LOGBOOK',
  contact: 'WELCOME',
};
function jumpTo(id: string) {
  if (!flying) return;
  flyTo(sectionTop(id), jumpNames[id] ?? '');
}
document.addEventListener('click', (e) => {
  const t = (e.target as Element).closest<HTMLElement>('[data-jump], [data-jump-to]');
  if (!t) return;
  e.preventDefault();
  sound.click(1100);
  if (t.dataset.jump !== undefined) goToWaypoint(Number(t.dataset.jump));
  else jumpTo(t.dataset.jumpTo!);
});

/* ═════════ FMC ═════════ */
const fmc = $('[data-fmc]');
const scratch = $('[data-scratch]');
let buf = '';
function fmcKey(k: string) {
  sound.click(1400);
  scratch.classList.remove('err');
  if (k === 'CLR') buf = '';
  else if (k === 'BACK') buf = buf.slice(0, -1);
  else if (k === 'EXEC') {
    const hit = data.codes.findIndex((c) => c === buf) >= 0 ? data.codes.indexOf(buf) : data.codes.findIndex((c) => buf.length >= 2 && c.startsWith(buf));
    if (hit >= 0) {
      goToWaypoint(hit);
      buf = '';
    } else {
      scratch.textContent = 'NOT IN DATA BASE';
      scratch.classList.add('err');
      buf = '';
      fmc.classList.remove('armed');
      return;
    }
  } else if (buf.length < 5) buf += k;
  scratch.textContent = buf || '直接敲代号，比如 ALPHA，回车';
  fmc.classList.toggle('armed', buf.length > 0);
  const btn = $(`[data-key="${k}"]`, fmc);
  btn?.classList.add('press');
  setTimeout(() => btn?.classList.remove('press'), 120);
}
$$('[data-key]').forEach((b) => b.addEventListener('click', () => fmcKey(b.dataset.key!)));
legBtns.forEach((b) => b.addEventListener('click', () => goToWaypoint(Number(b.dataset.goto))));
// 导航显示器上的航路点也能点
$$<SVGGElement>('[data-nd-wpt]').forEach((g) => g.addEventListener('click', () => goToWaypoint(Number(g.dataset.ndWpt))));
addEventListener('keydown', (e) => {
  if (!flying || e.metaKey || e.ctrlKey || e.altKey) return;
  const r = legs.cruise.getBoundingClientRect();
  const inCruise = r.top <= 1 && r.bottom >= innerHeight - 1;
  if (!inCruise) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') {
    e.preventDefault();
    if (activeCard < N - 1) goToWaypoint(activeCard + 1);
    else jumpTo('alternates');
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    if (activeCard > 0) goToWaypoint(activeCard - 1);
  } else if (/^[a-z]$/i.test(e.key)) fmcKey(e.key.toUpperCase());
  else if (e.key === 'Enter') fmcKey('EXEC');
  else if (e.key === 'Backspace') fmcKey('BACK');
  else if (e.key === 'Escape') fmcKey('CLR');
});

/* ═════════ 光标、视角 ═════════ */
const fpv = $('[data-fpv]');
// 鼠标真动过之前不算位置，否则屏幕中央的字母会被「推开」
let pointerSeen = false;
const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
const fp = { x: mouse.x, y: mouse.y };
const look = { x: 0, y: 0 };
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') pointerSeen = true;
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  const t = e.target as Element;
  fpv.classList.toggle('hot', !!t.closest?.('a, button'));
});

/* 名字：鼠标靠近，字母被推开 */
const letters = $$('.hero-name .ch');
letters.forEach((l, i) => {
  l.style.setProperty('--i', String(i));
  l.addEventListener('animationend', () => l.classList.add('landed'), { once: true });
});
const landedStyle = document.createElement('style');
landedStyle.textContent = '.hero-name .ch.landed{animation:none!important;opacity:1!important}';
document.head.append(landedStyle);
function repel() {
  if (!pointerSeen || scrollY > innerHeight) return;
  for (const l of letters) {
    const r = l.getBoundingClientRect();
    const dx = r.left + r.width / 2 - mouse.x;
    const dy = r.top + r.height / 2 - mouse.y;
    const d = Math.hypot(dx, dy);
    const R = 240;
    if (d < R) {
      const f = Math.pow(1 - d / R, 2) * 90;
      l.style.setProperty('--tx', `${((dx / (d || 1)) * f).toFixed(1)}px`);
      l.style.setProperty('--ty', `${((dy / (d || 1)) * f).toFixed(1)}px`);
      l.style.setProperty('--tr', `${((dx / R) * 25).toFixed(1)}deg`);
    } else if (l.style.getPropertyValue('--tx')) {
      l.style.removeProperty('--tx');
      l.style.removeProperty('--ty');
      l.style.removeProperty('--tr');
    }
  }
}

/* ═════════ 航程进度条 ═════════ */
const routeIds = ['hero', 'captain', 'works', 'alternates', 'logbook', 'contact'];
const routePts = $$('.route-pt');
const routePlane = $('[data-route-plane]');
const routeFill = $('[data-route-fill]');
let routeTops: number[] = [];
const measureRoute = () => {
  routeTops = routeIds.map((id) => Math.max(0, sectionTop(id) - innerHeight * 0.3));
  routeTops[0] = 0;
};
addEventListener('resize', measureRoute);
addEventListener('load', measureRoute);
measureRoute();
let routeX = 0;
function route() {
  const y = scrollY;
  let i = 0;
  while (i < routeTops.length - 1 && y >= routeTops[i + 1]) i++;
  const next = routeTops[i + 1] ?? routeTops[i] + 1;
  const local = i < routeTops.length - 1 ? Math.min(1, Math.max(0, (y - routeTops[i]) / (next - routeTops[i]))) : 0;
  const x = (i + local) / (routeIds.length - 1);
  routeX += (x - routeX) * 0.2;
  routePlane.style.setProperty('--x', routeX.toFixed(4));
  routeFill.style.transform = `scaleX(${routeX.toFixed(4)})`;
  routePts.forEach((b, k) => {
    b.classList.toggle('passed', k < i || (k === i && local > 0));
    b.classList.toggle('current', k === i);
  });
}

/* ═════════ 主循环 ═════════ */
let last = performance.now();
function tick(now: number) {
  // 时间只许往前走：切后台回来或调试步进时，dt 不能是负的
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = Math.max(last, now);
  const tgt = target(legs, N);
  approach(cur, tgt, dt);
  if (!flying) {
    cur.n1 = bootN1;
    cur.speed = 0;
  }
  triggers(tgt);
  prev = { ...cur };

  fp.x += (mouse.x - fp.x) * 0.25;
  fp.y += (mouse.y - fp.y) * 0.25;
  fpv.style.transform = `translate(${fp.x.toFixed(1)}px, ${fp.y.toFixed(1)}px)`;
  look.x += ((mouse.x / innerWidth - 0.5) * 2 - look.x) * 0.05;
  look.y += ((0.5 - mouse.y / innerHeight) * 2 - look.y) * 0.05;

  world?.update(cur, dt, now / 1000, reduce ? { x: 0, y: 0 } : look);
  instruments(cur);
  nd(cur, dt);
  showCard(cur.phase === 'cruise' && cur.cruise < 1 ? tgt.wpt : cur.cruise >= 1 ? N - 1 : 0);
  sound.update(cur.n1, cur.speed, cur.alt);
  repel();
  route();
}
function frame(now: number) {
  tick(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// 调试用：页面在后台时 rAF 不跑，可以手动推进 n 帧
(window as unknown as { __flight: unknown }).__flight = {
  cur,
  step: (n = 1) => {
    for (let i = 0; i < n; i++) tick(last + 33);
    last = performance.now();
  },
};

/* ═════════ 开机 ═════════ */
const boot = $('[data-boot]');
const guard = $<HTMLButtonElement>('[data-guard]');
const battery = $<HTMLButtonElement>('[data-battery]');
const start = $<HTMLButtonElement>('[data-start]');
const eicas = $('[data-eicas]');
const bootN1El = $('[data-boot-n1] b');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));

async function type(line: string, cls = '') {
  const row = document.createElement('div');
  if (cls) row.className = cls;
  eicas.append(row);
  for (let i = 0; i <= line.length; i += 2) {
    row.textContent = line.slice(0, i);
    await sleep(12);
  }
  row.textContent = line;
}

let step = 0;
guard.addEventListener('click', () => {
  if (step !== 0) return;
  step = 1;
  sound.start();
  sound.click(700);
  guard.classList.add('open');
  battery.disabled = false;
  $('[data-battery-hint]').textContent = '② 拨上开关';
  battery.focus();
});

battery.addEventListener('click', async () => {
  if (step !== 1) return;
  step = 2;
  sound.click(500);
  battery.classList.add('on');
  boot.classList.add('powered', 'lamptest');
  $('[data-boot-title]').textContent = 'POWER ON';
  $('[data-boot-sub]').textContent = '灯光测试，系统自检中……';
  $('[data-battery-hint]').textContent = 'ON';
  await sleep(1100);
  boot.classList.remove('lamptest');
  await type('IRS ALIGN ............ OK');
  await type('PILOT ................ 李伟宸 / WEICHEN LI', 'cy');
  await type('CALLSIGN ............. 围城', 'cy');
  await type('BASE ................. ZSNJ 南京');
  await type(`FMC ROUTE ............ ${N} WAYPOINTS LOADED`);
  await type('WX ZSNJ .............. CAVOK 能见度极好', 'warn');
  $('[data-boot-sub]').textContent = '一切正常。启动发动机。';
  start.disabled = false;
  $('[data-start-hint]').textContent = '③ 转到 GRD';
  start.focus();
});

async function finish() {
  if (flying) return;
  step = 9;
  flying = true;
  localStorage.setItem('booted', '1');
  boot.classList.add('gone');
  html.classList.remove('booting');
  html.classList.add('flying');
  setTimeout(() => boot.classList.add('done'), 1300);
  await sleep(900);
  callout('READY FOR TAKEOFF', 'green');
  sound.voice('atc_takeoff');
}

start.addEventListener('click', async () => {
  if (step !== 2) return;
  step = 3;
  sound.click(400);
  start.classList.add('on');
  boot.classList.add('starting');
  $('[data-start-hint]').textContent = 'GRD';
  $('[data-boot-sub]').textContent = '发动机加速中……';
  type('ENG 1 START VALVE ..... OPEN', 'warn');
  const t0 = performance.now();
  const dur = reduce ? 1 : 2600;
  await new Promise<void>((res) => {
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      bootN1 = 21 * (1 - Math.pow(1 - k, 2));
      bootN1El.textContent = bootN1.toFixed(1);
      if (k < 1) setTimeout(tick, 30);
      else res();
    };
    tick();
  });
  await type('ENG 1 / ENG 2 ......... STABLE 21% N1');
  await sleep(400);
  finish();
});

$('[data-skip]').addEventListener('click', () => {
  sound.start();
  bootN1 = 21;
  finish();
});
if (localStorage.getItem('booted')) $('[data-skip]').textContent = '快速开机 →';

/* ═════════ 头像 ═════════ */
const lock = $('[data-lock]');
const bubbles = ['嘎？', '头好痛……', '嘎嘎！', '起飞了吗？', '我是机长'];
let bubbleN = 0;
lock.addEventListener('click', () => {
  lock.classList.remove('shake');
  void lock.offsetWidth;
  lock.classList.add('shake');
  $('[data-bubble]').textContent = bubbles[bubbleN++ % bubbles.length];
  sound.click(600);
});

/* ═════════ 声音开关、重新开机 ═════════ */
const soundBtn = $('[data-sound]');
const syncSound = () => {
  soundBtn.textContent = sound.muted ? 'SOUND OFF' : 'SOUND ON';
  soundBtn.setAttribute('aria-pressed', String(!sound.muted));
};
syncSound();
soundBtn.addEventListener('click', () => {
  sound.start();
  sound.toggle();
  syncSound();
});
$('[data-reboot]').addEventListener('click', () => {
  scrollTo(0, 0);
  location.reload();
});

/* ═════════ 出现、计数、检查单、执照 ═════════ */
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  },
  { threshold: 0.15 },
);
$$('[data-reveal]').forEach((el) => io.observe(el));

const counted = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting || !flying) continue;
    counted.unobserve(e.target);
    const el = e.target as HTMLElement;
    const to = Number(el.dataset.count);
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 1400);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(tick);
    };
    setTimeout(tick, 900);
  }
});
const startCounters = () => $$('[data-count]').forEach((el) => counted.observe(el));
new MutationObserver(() => html.classList.contains('flying') && startCounters()).observe(html, { attributes: true, attributeFilter: ['class'] });

const checks = $$('[data-check]');
const ckDone = $('[data-ck-done]');
const syncDone = () => ckDone.classList.toggle('on', checks.every((c) => c.classList.contains('checked')));
checks.forEach((c) =>
  c.addEventListener('click', () => {
    c.classList.toggle('checked');
    sound.click(1200);
    syncDone();
  }),
);
new IntersectionObserver(
  (entries, obs) => {
    if (!entries[0].isIntersecting) return;
    obs.disconnect();
    checks.forEach((c, i) =>
      setTimeout(() => {
        c.classList.add('checked');
        sound.click(1500);
        syncDone();
      }, 400 + i * 220),
    );
  },
  { threshold: 0.4 },
).observe($('.checklist'));

const lic = $('[data-tilt]');
lic.addEventListener('pointermove', (e) => {
  const r = lic.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  lic.style.setProperty('--rx', `${((0.5 - y) * 16).toFixed(2)}deg`);
  lic.style.setProperty('--ry', `${((x - 0.5) * 22).toFixed(2)}deg`);
  lic.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  lic.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
});
lic.addEventListener('pointerleave', () => {
  lic.style.setProperty('--rx', '0deg');
  lic.style.setProperty('--ry', '0deg');
});

/* ═════════ 无线电 ═════════ */
const R = data.radio;
let activeF = 0;
let stbyF = 1;
let knobRot = 0;
const activeEl = $('[data-active]');
const stbyEl = $('[data-stby]');
const roLabel = $('[data-ro-label]');
const roValue = $<HTMLAnchorElement>('[data-ro-value]');
const roBox = $('[data-radio-out]');
const knob = $('[data-knob]');
const tuneBtns = $$('[data-tune]');

function renderRadio() {
  activeEl.textContent = R[activeF].freq;
  stbyEl.textContent = R[stbyF].freq;
  roLabel.textContent = R[activeF].label;
  roValue.textContent = R[activeF].value;
  if (R[activeF].href) {
    roValue.setAttribute('href', R[activeF].href!);
    if (R[activeF].href!.startsWith('http')) {
      roValue.target = '_blank';
      roValue.rel = 'noopener';
    } else roValue.removeAttribute('target');
  } else roValue.removeAttribute('href');
  tuneBtns.forEach((b, i) => b.classList.toggle('active', i === activeF));
}

function spin(dir: number) {
  stbyF = (stbyF + dir + R.length) % R.length;
  knobRot += dir * 30;
  knob.style.setProperty('--rot', `${knobRot}deg`);
  sound.click(2200);
  stbyEl.classList.remove('blink');
  void stbyEl.offsetWidth;
  stbyEl.classList.add('blink');
  renderRadio();
}

function transfer() {
  [activeF, stbyF] = [stbyF, activeF];
  sound.static();
  roBox.classList.remove('tuning');
  void roBox.offsetWidth;
  roBox.classList.add('tuning');
  activeEl.classList.remove('blink');
  void activeEl.offsetWidth;
  activeEl.classList.add('blink');
  renderRadio();
}

$('[data-xfer]').addEventListener('click', transfer);
let dragged = false;
knob.addEventListener('click', () => {
  if (!dragged) spin(1);
  dragged = false;
});
knob.addEventListener('wheel', (e) => {
  e.preventDefault();
  spin(e.deltaY > 0 ? 1 : -1);
}, { passive: false });
knob.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (spin(1), e.preventDefault());
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (spin(-1), e.preventDefault());
});
let dragX: number | null = null;
knob.addEventListener('pointerdown', (e) => {
  dragX = e.clientX;
  knob.setPointerCapture(e.pointerId);
});
knob.addEventListener('pointermove', (e) => {
  if (dragX === null) return;
  const d = e.clientX - dragX;
  if (Math.abs(d) > 28) {
    dragged = true;
    spin(d > 0 ? 1 : -1);
    dragX = e.clientX;
  }
});
knob.addEventListener('pointerup', () => (dragX = null));
tuneBtns.forEach((b, i) =>
  b.addEventListener('click', () => {
    if (i === activeF) return;
    stbyF = i;
    transfer();
  }),
);
renderRadio();

const lt = $('[data-localtime]');
const clock = () => (lt.textContent = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(new Date()));
clock();
setInterval(clock, 30000);
