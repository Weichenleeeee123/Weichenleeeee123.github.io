/*
 * 滚动位置 → 飞行状态。
 * 每一段页面（data-leg）对应航程的一段，进度 0–1 由它在视口里的位置算出。
 * 这里只算「目标值」；main 里再按时间平滑，画面才不会跟着滚轮一顿一顿。
 */

export type Phase = 'ground' | 'takeoff' | 'climb' | 'cruise' | 'landing' | 'parked';

export type Flight = {
  phase: Phase;
  speed: number; // 节
  alt: number; // 英尺
  pitch: number; // 度，抬头为正
  roll: number; // 度，右压坡度为正
  heading: number; // 度
  n1: number; // %
  vs: number; // 英尺/分
  shake: number; // 0–1，接地冲击，自己衰减
  toThreshold: number; // 落地时离跑道头的世界距离
  /** 巡航段进度和当前航路点 */
  cruise: number;
  wpt: number;
  /** 起飞段、落地段进度，给呼叫和界面用 */
  takeoff: number;
  landing: number;
};

export const blank = (): Flight => ({
  phase: 'ground',
  speed: 0,
  alt: 0,
  pitch: 0,
  roll: 0,
  heading: 240,
  n1: 21,
  vs: 0,
  shake: 0,
  toThreshold: 0,
  cruise: 0,
  wpt: 0,
  takeoff: 0,
  landing: 0,
});

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, t: number) => {
  const x = clamp((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 吸顶段：从段顶碰到视口顶，到段底碰到视口底 */
function stickyProgress(el: HTMLElement) {
  const span = el.offsetHeight - innerHeight;
  return span > 0 ? clamp((scrollY - el.offsetTop) / span) : scrollY >= el.offsetTop ? 1 : 0;
}

/** 普通段：段顶进入视口底部为 0，段底离开视口顶部为 1 */
function passProgress(el: HTMLElement) {
  return clamp((scrollY + innerHeight - el.offsetTop) / (el.offsetHeight + innerHeight));
}

export type Legs = Record<'takeoff' | 'about' | 'cruise' | 'logbook' | 'landing', HTMLElement>;

/** 航路点航向：作品之间左右转，转弯时压坡度 */
export const routeHeadings = [240, 262, 228, 251, 275, 243, 219, 247, 270, 236];

export function target(legs: Legs, waypoints: number): Flight {
  const f = blank();
  const to = stickyProgress(legs.takeoff);
  const about = passProgress(legs.about);
  const cr = stickyProgress(legs.cruise);
  const log = passProgress(legs.logbook);
  const ld = stickyProgress(legs.landing);
  f.takeoff = to;
  f.landing = ld;
  f.cruise = cr;

  if (ld > 0) {
    // ───── 下降、进近、接地、滑跑 ─────
    f.phase = ld > 0.97 ? 'parked' : 'landing';
    const td = 0.8; // 接地点
    const k = clamp(ld / td);
    f.alt = ld < td ? 35000 * Math.pow(1 - k, 2.3) : 0;
    f.pitch = ld < 0.72 ? lerp(-1.5, -3, smooth(0, 0.4, ld)) : lerp(-3, 4, smooth(0.72, td, ld)) * (1 - smooth(td, 0.86, ld));
    f.speed = ld < td ? lerp(460, 145, smooth(0, 0.6, ld)) : lerp(140, 0, smooth(td, 0.97, ld));
    f.n1 = ld < td ? lerp(45, 38, k) : lerp(84, 22, smooth(0.86, 0.95, ld)) * (ld < 0.83 ? 0.45 : 1);
    f.toThreshold = (td - ld) * 2600;
    f.heading = 61;
    f.roll = Math.sin(ld * 18) * 4 * (1 - smooth(0.5, 0.7, ld));
    return f;
  }

  if (cr > 0 || log > 0.02) {
    // ───── 巡航：一个航路点一个作品 ─────
    f.phase = 'cruise';
    const climb = smooth(0, 0.1, cr);
    f.alt = lerp(11000, 35000, climb);
    f.pitch = lerp(6, 1.8, climb);
    f.speed = lerp(290, 460, climb);
    f.n1 = lerp(90, 84, climb);
    const pos = clamp(cr) * waypoints;
    const i = Math.min(waypoints - 1, Math.floor(pos));
    const s = pos - i;
    f.wpt = i;
    // 每张卡片的中点正好飞过航路点 i，在那里从上一段航向转到下一段
    const h0 = routeHeadings[i % routeHeadings.length];
    const h1 = routeHeadings[(i + 1) % routeHeadings.length];
    f.heading = lerp(h0, h1, smooth(0.38, 0.62, s));
    // 转弯时最多压 28° 坡度，夸张一点
    f.roll = Math.sin(Math.PI * clamp((s - 0.3) / 0.4)) * 28 * Math.sign(h1 - h0);
    if (cr >= 1) {
      f.roll = Math.sin(log * 9) * 6;
      f.heading = lerp(236, 61, smooth(0.2, 0.9, log));
    }
    return f;
  }

  if (about > 0.05 && to >= 1) {
    // ───── 爬升穿云 ─────
    f.phase = 'climb';
    f.alt = lerp(3500, 11000, smooth(0, 1, about));
    f.pitch = lerp(13, 6, about);
    f.speed = lerp(200, 290, about);
    f.n1 = 92;
    f.heading = 240;
    return f;
  }

  // ───── 地面：滑跑、抬轮、离地 ─────
  f.phase = to > 0 ? 'takeoff' : 'ground';
  f.n1 = lerp(21, 94, smooth(0, 0.12, to));
  f.speed = to < 0.68 ? 165 * Math.pow(smooth(0.06, 0.62, to), 1.4) : lerp(165, 200, smooth(0.68, 1, to));
  f.pitch = lerp(0, 15, smooth(0.6, 0.72, to)) - lerp(0, 2, smooth(0.9, 1, to));
  f.alt = to < 0.68 ? 0 : 3500 * Math.pow(smooth(0.68, 1, to), 1.4);
  f.heading = 240;
  return f;
}

/** 按时间逼近目标；离散量直接跳 */
export function approach(cur: Flight, tgt: Flight, dt: number) {
  const k = 1 - Math.exp(-dt * 3.2);
  const fast = 1 - Math.exp(-dt * 6);
  const prevAlt = cur.alt;
  cur.speed += (tgt.speed - cur.speed) * k;
  cur.alt += (tgt.alt - cur.alt) * (tgt.alt < 60 ? fast : k);
  cur.pitch += (tgt.pitch - cur.pitch) * k;
  cur.roll += (tgt.roll - cur.roll) * k;
  let dh = tgt.heading - cur.heading;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  cur.heading = (cur.heading + dh * k + 360) % 360;
  cur.n1 += (tgt.n1 - cur.n1) * (1 - Math.exp(-dt * 1.6)); // 发动机响应慢一拍，像真的
  cur.toThreshold += (tgt.toThreshold - cur.toThreshold) * fast;
  cur.vs = cur.vs * 0.9 + ((cur.alt - prevAlt) / Math.max(dt, 1e-3)) * 60 * 0.1;
  cur.shake *= Math.exp(-dt * 3.5);
  cur.phase = tgt.phase;
  cur.cruise = tgt.cruise;
  cur.wpt = tgt.wpt;
  cur.takeoff = tgt.takeoff;
  cur.landing = tgt.landing;
}
