import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Room, type RoomData, type Spot, type Thing } from './room';
import { Sfx } from './sfx';

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const $$ = <T extends Element = HTMLElement>(s: string) => [...document.querySelectorAll<T>(s)];

const root = document.documentElement;
const data: RoomData = JSON.parse($('#room-data').textContent || '{}');
const SPOTS = data.spots.map((s) => s.id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const lite = coarse || innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4;

const TIPS: Record<Thing, string> = {
  ...(Object.fromEntries(data.spots.map((s) => [s.id, `${s.thing} · ${s.label}`])) as Record<Spot, string>),
  duck: '可达鸭 · 戳一下',
  lamp: '台灯 · 开 / 关',
  window: '窗外 · 白天 / 夜里',
  clock: '挂钟 · 你那边的时间',
  chair: '椅子 · 转一圈',
  plant: '绿植 · 摸一下',
  plane: '737 模型 · 起飞去驾驶舱',
  diary: '日记本 · 翻开看看',
  headset: '飞行耳机 · 碰一下',
  shoes: '跑鞋 · 踢一下',
  record: '唱机 · 放 / 停音乐',
};
const QUACKS = ['嘎？', '头好痛……', '嘎嘎！', '这是我的房间', '别光看我，去看看作品', '我是机长（不是）', '再戳要生气了'];

const sfx = new Sfx();
const soundBtn = $('[data-sound]');
const paintSound = () => {
  soundBtn.setAttribute('aria-pressed', String(sfx.on));
  soundBtn.textContent = sfx.on ? '声音 开' : '声音 关';
};
paintSound();
soundBtn.addEventListener('click', () => {
  sfx.toggle();
  paintSound();
});

/* ───────────── 没有 WebGL 就退成普通网页 ───────────── */

let onWork: (i: number) => void = () => {};
let workIndex = 0;

const canvas = $<HTMLCanvasElement>('[data-room]');
let renderer: THREE.WebGLRenderer | null = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: true, powerPreference: 'high-performance' });
} catch {
  renderer = null;
}

if (!renderer) {
  root.classList.add('no-gl', 'list');
  wireDoc();
} else {
  // 白板、软木板、海报的贴图要用到网页字体，等字体到了再画；最多等 1.5 秒
  const gl = renderer;
  const fonts = Promise.all([
    document.fonts.load('900 64px "WC Serif"', data.name + data.callsign),
    document.fonts.load('40px "WC Hand"', '出发前检查单'),
  ]).catch(() => null);
  Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).then(() => start(gl));
}

/* ───────────── 面板里的交互：不依赖 3D，列表模式也能用 ───────────── */


function wireDoc() {
  const tabs = $$<HTMLButtonElement>('[data-work-tab]');
  const works = $$('[data-work]');
  const count = $('[data-work-count]');
  const total = String(works.length).padStart(2, '0');
  const show = (i: number) => {
    workIndex = (i + works.length) % works.length;
    works.forEach((w, k) => w.classList.toggle('on', k === workIndex));
    tabs.forEach((t, k) => t.setAttribute('aria-selected', String(k === workIndex)));
    tabs[workIndex].scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
    count.textContent = `${String(workIndex + 1).padStart(2, '0')} / ${total}`;
    sfx.tick(1.5);
    onWork(workIndex);
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => show(i)));
  $$<HTMLButtonElement>('[data-work-step]').forEach((b) => b.addEventListener('click', () => show(workIndex + Number(b.dataset.workStep))));
  document.addEventListener('keydown', (e) => {
    if (!root.classList.contains('open-works') || root.classList.contains('list')) return;
    if (e.key === 'ArrowRight') show(workIndex + 1);
    if (e.key === 'ArrowLeft') show(workIndex - 1);
  });
  return show;
}

/* ───────────── 3D 房间 ───────────── */

function start(renderer: THREE.WebGLRenderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, lite ? 1.5 : 2));
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const room = new Room(data, lite);
  const pmrem = new THREE.PMREMGenerator(renderer);
  room.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const hour = new Date().getHours();
  let night = hour < 6 || hour >= 18;
  const applySky = (instant = false) => {
    room.setTime(night, room.lampOn, instant);
    root.dataset.sky = night ? 'night' : 'day';
    $('[data-sky-label]').textContent = night ? '夜里' : '白天';
    $('[data-light]').setAttribute('aria-pressed', String(room.lampOn));
  };
  applySky(true);
  // 开场先黑着，房间落定以后台灯「咔哒」一声亮起来（加载提示写的就是「正在开灯」）
  if (!reduce) room.setTime(night, false, true);
  room.loadImages();
  if (coarse) $('[data-hint]').textContent = '滑动转一转 · 点房间里的东西';

  sfx.onMusic = (playing, at) => room.setRecord(playing, at);
  const showWork = wireDoc();
  onWork = (i) => room.drawScreen(i);

  /* 镜头：围着一个目标点转的球坐标，当前值一直追目标值 */
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  type Rig = { target: THREE.Vector3; theta: number; phi: number; r: number };
  const HOME: Rig = { target: new THREE.Vector3(0.1, 1.75, -0.8), theta: Math.PI / 4, phi: 1.13, r: 15 };
  const goal: Rig = { ...HOME, target: HOME.target.clone() };
  const cur: Rig = { target: HOME.target.clone(), theta: HOME.theta + 0.9, phi: 0.85, r: 30 };
  let homeZoom = 1;
  let aspect = 1;
  let fitScale = 1;
  let offX = 0;
  let offY = 0;
  let offXGoal = 0;
  let offYGoal = 0;

  const resize = () => {
    const w = innerWidth;
    const h = innerHeight;
    aspect = w / h;
    renderer.setSize(w, h, false);
    cam.aspect = aspect;
    cam.fov = aspect < 1 ? 42 : 30;
    fitScale = aspect < 1 ? THREE.MathUtils.clamp(1 / aspect, 1, 1.7) * 0.82 : 1;
    cam.updateProjectionMatrix();
    if (mode !== 'focus') setHome();
    else measureDrawer();
  };

  const setHome = () => {
    const r = 17 * THREE.MathUtils.clamp(1.75 / aspect, 1, 1.75) * homeZoom;
    goal.target.copy(HOME.target);
    goal.r = r;
    // 给左上角的标题让位：宽屏把房间往右推，竖屏往下推
    offXGoal = innerWidth >= 760 ? -innerWidth * 0.15 : 0;
    offYGoal = innerWidth >= 760 ? 0 : -innerHeight * 0.1;
  };

  let mode: 'intro' | 'home' | 'focus' = 'intro';
  let focused: Thing | null = null;

  const measureDrawer = () => {
    const d = $('[data-drawer]');
    if (innerWidth < 760) {
      offXGoal = 0;
      offYGoal = d.offsetHeight * 0.4;
    } else {
      offXGoal = d.offsetWidth / 2;
      offYGoal = 0;
    }
  };

  const flyTo = (t: Thing) => {
    const v = room.views[t];
    if (!v) return;
    goal.target.copy(v.target);
    goal.theta = v.theta;
    goal.phi = v.phi;
    goal.r = v.r * fitScale;
  };

  /* ───── 打开 / 关上面板 ───── */

  const hero = $('[data-hero]');
  const dockBtns = $$<HTMLButtonElement>('.st-dock [data-open]');

  const open = (spot: Spot) => {
    if (root.classList.contains('list')) {
      document.getElementById(spot)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      return;
    }
    mode = 'focus';
    focused = spot;
    for (const s of SPOTS) root.classList.toggle(`open-${s}`, s === spot);
    root.classList.add('drawer-open');
    dockBtns.forEach((b) => b.setAttribute('aria-current', String(b.dataset.open === spot)));
    flyTo(spot);
    requestAnimationFrame(measureDrawer);
    history.replaceState(null, '', `#${spot}`);
    if (spot === 'works') room.drawScreen(workIndex);
    if (spot === 'contact') room.drawPhone(true);
    sfx.swish(true);
    sfx.duck(true);
    $('[data-drawer]').scrollTop = 0;
    hero.setAttribute('aria-hidden', 'true');
  };

  const close = () => {
    if (root.classList.contains('list')) {
      setList(false);
      return;
    }
    if (mode !== 'focus') return;
    mode = 'home';
    focused = null;
    for (const s of SPOTS) root.classList.remove(`open-${s}`);
    root.classList.remove('drawer-open');
    dockBtns.forEach((b) => b.removeAttribute('aria-current'));
    goal.theta = HOME.theta;
    goal.phi = HOME.phi;
    setHome();
    room.drawPhone(false);
    sfx.swish(false);
    sfx.duck(false);
    history.replaceState(null, '', location.pathname);
    hero.removeAttribute('aria-hidden');
  };

  /* 起飞时镜头只是「看一眼」，点空白处或按 Esc 回来 */
  const unpeek = () => {
    root.classList.remove('peeking');
    mode = 'home';
    focused = null;
    goal.theta = HOME.theta;
    goal.phi = HOME.phi;
    setHome();
    hero.removeAttribute('aria-hidden');
  };

  /* ───── 列表模式：不转房间，直接看全部 ───── */

  const listBtn = $('[data-list]');
  const setList = (on: boolean) => {
    if (on && mode === 'focus' && !root.classList.contains('peeking')) close();
    root.classList.toggle('list', on);
    listBtn.setAttribute('aria-pressed', String(on));
    listBtn.textContent = on ? '回到房间' : '直接看';
    if (on) $('[data-drawer]').scrollTop = 0;
  };
  listBtn.addEventListener('click', () => setList(!root.classList.contains('list')));

  /* ───── 气泡、提示、吐司 ───── */

  const bubble = $('[data-bubble]');
  let bubbleFor: Thing | null = null;
  let bubbleTimer = 0;
  const say = (t: Thing, text: string, ms = 2200) => {
    bubbleFor = t;
    bubble.textContent = text;
    bubble.classList.add('on');
    clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => {
      bubble.classList.remove('on');
      bubbleFor = null;
    }, ms);
  };

  const tip = $('[data-tip]');

  /* ───── 点到东西 ───── */

  let quack = 0;
  let planeArmed = 0;
  let leaving = false;
  const now = () => performance.now();

  /** 镜头转到书架顶和窗户，模型飞机从窗户飞出去，然后去驾驶舱 */
  const fly = () => {
    if (leaving) return;
    leaving = true;
    try {
      localStorage.setItem('wc-style', 'cockpit');
    } catch {
      /* 存不了也照样飞 */
    }
    if (reduce) {
      location.href = '/cockpit/';
      return;
    }
    if (root.classList.contains('list')) setList(false);
    if (mode === 'focus' && !root.classList.contains('peeking')) close();
    mode = 'focus';
    focused = 'plane';
    root.classList.add('peeking');
    hero.setAttribute('aria-hidden', 'true');
    const v = room.takeoffView;
    goal.target.copy(v.target);
    goal.theta = v.theta;
    goal.phi = v.phi;
    goal.r = v.r * fitScale;
    offXGoal = 0;
    offYGoal = 0;
    say('plane', '起飞！', 1500);
    sfx.fadeOutMusic();
    setTimeout(() => {
      sfx.takeoff();
      room.takeoff(now(), () => {
        root.classList.add('leaving');
        setTimeout(() => (location.href = '/cockpit/'), 450);
      });
    }, 650);
  };

  /** 点到书架上某本书、软木板上某张票根：打开面板后高亮那一条 */
  const flash = (sel: string, i: number) => {
    const el = $$(sel)[i];
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }, 480);
  };

  const activate = (t: Thing, hit?: THREE.Intersection) => {
    if ((SPOTS as string[]).includes(t)) {
      if (!(focused === t && mode === 'focus' && !root.classList.contains('peeking'))) {
        root.classList.remove('peeking');
        open(t as Spot);
      }
      const ud = hit?.object.userData;
      if (t === 'shelf' && ud?.book !== undefined) flash('.books li', ud.book as number);
      if (t === 'journey' && ud?.pins && hit?.uv) {
        const uv = hit.uv;
        let best = -1;
        let bestD = 0.12;
        (ud.pins as [number, number][]).forEach(([u, v], i) => {
          const d = Math.hypot((u - uv.x) * 1.4, v - uv.y);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        if (best >= 0) flash('.pins li', best);
      }
      return;
    }
    switch (t) {
      case 'duck':
        room.hopDuck(now());
        sfx.quack();
        say('duck', QUACKS[quack++ % QUACKS.length]);
        break;
      case 'lamp':
        room.setTime(night, !room.lampOn);
        sfx.lamp();
        $('[data-light]').setAttribute('aria-pressed', String(room.lampOn));
        say('lamp', room.lampOn ? '咔哒 · 开灯' : '咔哒 · 关灯', 1400);
        break;
      case 'window':
        night = !night;
        applySky();
        sfx.chime(night);
        say('window', night ? '天黑了' : '天亮了', 1400);
        break;
      case 'clock': {
        const d = new Date();
        say('clock', `你那边现在 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
        break;
      }
      case 'chair':
        room.spinChair(now());
        sfx.spin();
        break;
      case 'plant':
        room.shakePlant(now());
        sfx.rustle();
        break;
      case 'diary':
        room.openDiary(now());
        sfx.swish(true);
        say('diary', data.hobbies[1] ?? '日记', 2400);
        break;
      case 'headset':
        room.swingHeadset(now());
        sfx.tick(0.7);
        say('headset', data.hobbies[0] ?? '模拟飞行', 2600);
        break;
      case 'shoes':
        room.jogShoes(now());
        sfx.tick(0.5);
        say('shoes', data.hobbies[2] ?? '跑步', 2200);
        break;
      case 'record': {
        // 第一次点页面时音乐已经自动放起来了；如果这一下正好点在唱机上，别马上又关掉
        if (sfx.playing && performance.now() - sfx.musicStartedAt < 800) break;
        const on = sfx.toggleMusic();
        paintSound();
        say('record', on ? '♪ 放一张唱片' : '唱片停了', 1800);
        break;
      }
      case 'plane':
        if (now() - planeArmed < 3500) fly();
        else {
          planeArmed = now();
          say('plane', '再点一下就起飞，去 737 驾驶舱 ✈', 3500);
        }
        break;
    }
  };

  $$('[data-open]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      if (root.classList.contains('peeking')) root.classList.remove('peeking');
      open(b.dataset.open as Spot);
    }),
  );
  $('[data-close]').addEventListener('click', close);
  $('[data-light]').addEventListener('click', () => activate('lamp'));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (root.classList.contains('peeking')) unpeek();
    else close();
  });
  // 换去驾驶舱：先让模型飞机起飞
  $$<HTMLAnchorElement>('a[data-style-switch="cockpit"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      if (reduce || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      fly();
    }),
  );

  // 手机上的底部卡片：按住顶上的把手往下拖就关上
  const drawer = $('[data-drawer]');
  const grab = $('[data-grab]');
  let grabY: number | null = null;
  let grabDy = 0;
  grab.addEventListener('pointerdown', (e) => {
    grabY = e.clientY;
    grabDy = 0;
    grab.setPointerCapture(e.pointerId);
    drawer.style.transition = 'none';
  });
  grab.addEventListener('pointermove', (e) => {
    if (grabY === null) return;
    grabDy = Math.max(0, e.clientY - grabY);
    drawer.style.transform = `translateY(${grabDy}px)`;
  });
  const release = () => {
    if (grabY === null) return;
    grabY = null;
    drawer.style.transition = '';
    drawer.style.transform = '';
    if (grabDy > 80) close();
  };
  grab.addEventListener('pointerup', release);
  grab.addEventListener('pointercancel', release);

  /* ───── 指针：拖动转镜头、悬停高亮、轻点 ───── */

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered: THREE.Group | null = null;
  let down: { x: number; y: number; t: number; id: number } | null = null;
  let vel = { t: 0, p: 0 };
  let pointer = { x: 0, y: 0 };

  const pick = (x: number, y: number): { g: THREE.Group; hit: THREE.Intersection } | null => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObjects(room.things, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.thing === undefined) o = o.parent;
    return o ? { g: o as THREE.Group, hit } : null;
  };

  const setHover = (g: THREE.Group | null, x: number, y: number) => {
    if (g !== hovered) {
      room.highlight(hovered, false);
      room.highlight(g, true);
      hovered = g;
      if (g) sfx.tick();
      canvas.style.cursor = g ? 'pointer' : '';
      tip.textContent = g ? TIPS[g.userData.thing as Thing] : '';
      tip.classList.toggle('on', !!g);
    }
    if (g) tip.style.transform = `translate(${x + 16}px, ${y + 18}px)`;
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (mode === 'intro') return;
    down = { x: e.clientX, y: e.clientY, t: now(), id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    vel = { t: 0, p: 0 };
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer = { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 };
    if (down && down.id === e.pointerId) {
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
        canvas.classList.add('dragging');
        setHover(null, 0, 0);
        if (mode === 'home') {
          vel = { t: -dx * 0.005, p: -dy * 0.004 };
          goal.theta = THREE.MathUtils.clamp(goal.theta + vel.t, HOME.theta - 0.62, HOME.theta + 0.62);
          goal.phi = THREE.MathUtils.clamp(goal.phi + vel.p, 0.78, 1.4);
        }
      }
      return;
    }
    if (e.pointerType === 'mouse' && mode !== 'intro') setHover(pick(e.clientX, e.clientY)?.g ?? null, e.clientX, e.clientY);
  });
  const up = (e: PointerEvent) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = now() - down.t < 600;
    down = null;
    canvas.classList.remove('dragging');
    if (moved > 6 || !quick) return;
    const p = pick(e.clientX, e.clientY);
    if (p) activate(p.g.userData.thing as Thing, p.hit);
    else if (root.classList.contains('peeking')) unpeek();
    else if (mode === 'focus') close();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => {
    down = null;
    canvas.classList.remove('dragging');
  });
  canvas.addEventListener('pointerleave', () => setHover(null, 0, 0));
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (mode !== 'home') return;
      e.preventDefault();
      homeZoom = THREE.MathUtils.clamp(homeZoom * (1 + Math.sign(e.deltaY) * 0.08), 0.62, 1.25);
      setHome();
    },
    { passive: false },
  );

  addEventListener('resize', resize);
  // 显卡上下文丢了（比如手机切后台太久），就退成列表页
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    root.classList.add('no-gl');
    setList(true);
  });
  addEventListener('hashchange', () => {
    const h = location.hash.slice(1) as Spot;
    if (SPOTS.includes(h) && mode !== 'intro') open(h);
  });
  resize();

  /* ───── 时钟文字 ───── */

  const clockEl = $('[data-clock]');
  const tickClock = () => {
    const d = new Date();
    clockEl.innerHTML = `${String(d.getHours()).padStart(2, '0')}<i class="colon">:</i>${String(d.getMinutes()).padStart(2, '0')}`;
  };
  tickClock();
  setInterval(tickClock, 10_000);
  setInterval(() => {
    if (!root.classList.contains('drawer-open') && !document.hidden) room.drawPhone(false);
  }, 60_000);

  /* 显示器：光标闪烁；没在看作品的时候自己轮播 */
  setInterval(() => !document.hidden && room.blinkCursor(), 560);
  setInterval(() => {
    if (document.hidden || root.classList.contains('open-works')) return;
    room.drawScreen((room.currentScreen + 1) % data.projects.length);
  }, 4200);

  /* ───── 渲染循环 ───── */

  const anchor = new THREE.Vector3();
  const t0 = now();
  const INTRO = reduce ? 1 : 2600;
  let last = t0;
  let opened = false;
  let painted = false;
  let ratio = renderer.getPixelRatio();
  let slowSum = 0;
  let slowN = 0;
  const wantSpot = location.hash.slice(1) as Spot;

  const frame = (time: number) => {
    requestAnimationFrame(frame);
    if (document.hidden || root.classList.contains('list')) {
      last = time;
      return;
    }
    const dt = Math.min(Math.max((time - last) / 1000, 0), 0.1);
    last = time;

    const ik = Math.min((time - t0) / INTRO, 1);
    room.intro(ik);
    if (mode === 'intro') {
      if (ik >= 0.35) {
        goal.theta = HOME.theta;
        goal.phi = HOME.phi;
      }
      if (ik >= 1) {
        mode = 'home';
        root.classList.add('ready');
        if (!room.lampOn) {
          room.setTime(night, true);
          sfx.lamp();
          $('[data-light]').setAttribute('aria-pressed', 'true');
        }
        if (!opened && SPOTS.includes(wantSpot)) {
          opened = true;
          open(wantSpot);
        }
      }
    }

    // 拖完松手还会滑一点
    if (!down && mode === 'home' && (Math.abs(vel.t) > 1e-4 || Math.abs(vel.p) > 1e-4)) {
      goal.theta = THREE.MathUtils.clamp(goal.theta + vel.t, HOME.theta - 0.62, HOME.theta + 0.62);
      goal.phi = THREE.MathUtils.clamp(goal.phi + vel.p, 0.78, 1.4);
      vel.t *= 0.9;
      vel.p *= 0.9;
    }

    const k = 1 - Math.exp(-dt * (mode === 'intro' ? 1.6 : reduce ? 30 : 3.2));
    cur.target.lerp(goal.target, k);
    cur.theta += (goal.theta - cur.theta) * k;
    cur.phi += (goal.phi - cur.phi) * k;
    cur.r += (goal.r - cur.r) * k;
    offX += (offXGoal - offX) * k;
    offY += (offYGoal - offY) * k;

    // 鼠标位置带来的一点视差
    const par = coarse || reduce ? 0 : mode === 'home' ? 0.06 : 0.025;
    const th = cur.theta + pointer.x * par;
    const ph = cur.phi + pointer.y * par * 0.6;
    cam.position.set(
      cur.target.x + cur.r * Math.sin(ph) * Math.sin(th),
      cur.target.y + cur.r * Math.cos(ph),
      cur.target.z + cur.r * Math.sin(ph) * Math.cos(th),
    );
    cam.lookAt(cur.target);
    const w = innerWidth;
    const h = innerHeight;
    if (Math.abs(offX) > 0.5 || Math.abs(offY) > 0.5) cam.setViewOffset(w, h, offX, offY, w, h);
    else cam.clearViewOffset();

    room.update(time, dt);
    renderer.render(room.scene, cam);
    if (!painted) {
      painted = true;
      $('[data-load-bar]').style.transform = 'scaleX(1)';
      setTimeout(() => root.classList.add('loaded'), reduce ? 0 : 250);
    }

    // 掉帧就降低清晰度：每 90 帧看一次平均帧时
    if (mode !== 'intro' && dt < 0.1) {
      slowSum += dt;
      if (++slowN >= 90) {
        if (slowSum / slowN > 0.034 && ratio > 1) {
          ratio = Math.max(1, ratio - 0.5);
          renderer.setPixelRatio(ratio);
          resize();
        }
        slowSum = 0;
        slowN = 0;
      }
    }

    // 气泡跟着说话的东西走
    if (bubbleFor) {
      const a = room.anchors[bubbleFor];
      if (a) {
        anchor.copy(a).project(cam);
        bubble.style.transform = `translate(${((anchor.x + 1) / 2) * w}px, ${((1 - anchor.y) / 2) * h}px) translate(-50%, -100%)`;
      }
    }
  };
  requestAnimationFrame(frame);


  // 在别的标签页回来时不要一下子补很多帧
  document.addEventListener('visibilitychange', () => (last = performance.now()));

  void showWork;
  // 调试用
  (window as unknown as { __room: unknown }).__room = {
    room,
    activate,
    open,
    close,
    cam,
    settle: () => {
      cur.target.copy(goal.target);
      Object.assign(cur, { theta: goal.theta, phi: goal.phi, r: goal.r });
      offX = offXGoal;
      offY = offYGoal;
    },
  };
}
