/**
 * 围城的房间：一间切开两面墙的小屋，全部用基本几何体和画布贴图搭出来。
 *
 * 坐标：地板顶面 y = 0，房间占 x、z ∈ [-4, 4]。后墙在 z = -4，左墙在 x = -4，
 * 镜头从 +x +z 方向斜着看进去。
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Spot = 'works' | 'journey' | 'shelf' | 'skills' | 'about' | 'contact';
export type Thing = Spot | 'duck' | 'lamp' | 'plane' | 'window' | 'clock' | 'chair' | 'plant';

export type RoomData = {
  projects: { code: string; name: string; sub: string; when: string; award: string; image: string }[];
  books: string[];
  pins: { date: string; stamp: string }[];
  skills: string[];
  name: string;
  callsign: string;
  nameEn: string;
  avatar: string;
  motto: string;
  spots: { id: Spot; thing: string; label: string }[];
};

const HAND = '"KaiTi", "STKaiti", "Kaiti SC", "AR PL UKai CN", serif';
const SERIF = '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", "SimSun", serif';
const SANS = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';
const MONO = 'ui-monospace, "JetBrains Mono", Consolas, monospace';

type V3 = [number, number, number];

const std = (color: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...o });

const rbox = (w: number, h: number, d: number, r = 0.04) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.98);

function put<T extends THREE.Object3D>(o: T, parent: THREE.Object3D, p: V3, shadow = true): T {
  o.position.set(...p);
  if (o instanceof THREE.Mesh) {
    o.castShadow = shadow;
    o.receiveShadow = true;
  }
  parent.add(o);
  return o;
}

function m(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, p: V3, shadow = true) {
  return put(new THREE.Mesh(geo, mat), parent, p, shadow);
}

/** 在两点之间放一根圆杆 */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, parent: THREE.Object3D) {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { c, ctx, tex };
}

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 9) {
  let line = '';
  let n = 0;
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      ctx.fillText(line, x, y + n * lh);
      line = ch;
      if (++n >= maxLines) return n;
    } else line += ch;
  }
  if (line) ctx.fillText(line, x, y + n * lh);
  return n + 1;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((res) => {
    if (!src) return res(null);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

/** 按比例铺满（object-fit: cover） */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

type Drop = { obj: THREE.Object3D; y: number; delay: number };

export class Room {
  scene = new THREE.Scene();
  /** 能点的东西：射线只打这些 */
  things: THREE.Group[] = [];
  drops: Drop[] = [];
  /** 每样东西的「镜头站位」：看向哪里、从哪个角度、离多远 */
  views: Partial<Record<Thing, { target: THREE.Vector3; theta: number; phi: number; r: number }>> = {};
  anchors: Partial<Record<Thing, THREE.Vector3>> = {};

  private data: RoomData;
  private lite: boolean;
  private hemi!: THREE.HemisphereLight;
  private key!: THREE.DirectionalLight;
  private lampSpot!: THREE.SpotLight;
  private lampFill!: THREE.PointLight;
  private bulb!: THREE.MeshStandardMaterial;
  private screenGlow!: THREE.PointLight;
  private screen!: ReturnType<typeof canvas>;
  private phone!: ReturnType<typeof canvas>;
  private sky!: ReturnType<typeof canvas>;
  private flyer!: THREE.Mesh;
  private covers: (HTMLImageElement | null)[] = [];
  private avatarImg: HTMLImageElement | null = null;
  private poster!: ReturnType<typeof canvas>;
  private hands!: { h: THREE.Object3D; m: THREE.Object3D; s: THREE.Object3D };
  private duck!: THREE.Group;
  private plane!: THREE.Group;
  private chair!: THREE.Group;
  private leaves: THREE.Group[] = [];
  private steam: THREE.Sprite[] = [];
  private dust!: THREE.Points;
  private dustSeed: Float32Array = new Float32Array();
  private anims: { t0: number; dur: number; fn: (k: number) => void; done?: () => void }[] = [];
  private screenIndex = 0;
  private screenCursor = true;

  lampOn = true;
  night = true;

  constructor(data: RoomData, lite: boolean) {
    this.data = data;
    this.lite = lite;
    this.buildLights();
    this.buildShell();
    this.buildWindow();
    this.buildClock();
    this.buildDesk();
    this.buildMonitor();
    this.buildLamp();
    this.buildDuck();
    this.buildPhone();
    this.buildMug();
    this.buildChair();
    this.buildShelf();
    this.buildPlane();
    this.buildCorkboard();
    this.buildWhiteboard();
    this.buildPoster();
    this.buildPlant();
    this.buildRug();
    this.buildDust();
  }

  /** 图片异步加载完以后重画显示器和海报 */
  async loadImages() {
    const [avatar, ...covers] = await Promise.all([loadImage(this.data.avatar), ...this.data.projects.map((p) => loadImage(p.image))]);
    this.avatarImg = avatar;
    this.covers = covers;
    this.drawPoster();
    this.drawScreen(this.screenIndex);
  }

  /* ───────────── 灯 ───────────── */

  private buildLights() {
    this.hemi = new THREE.HemisphereLight(0x6070a8, 0x2a1e18, 0.7);
    this.scene.add(this.hemi);

    this.key = new THREE.DirectionalLight(0xa9bcff, 0.7);
    this.key.position.set(6, 10, 7);
    this.key.target.position.set(-0.5, 0.5, -1);
    this.key.castShadow = !this.lite;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -7;
    sc.right = 7;
    sc.top = 7;
    sc.bottom = -7;
    sc.near = 1;
    sc.far = 30;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.scene.add(this.key, this.key.target);
  }

  setTime(night: boolean, lampOn = this.lampOn) {
    this.night = night;
    this.lampOn = lampOn;
    this.hemi.color.set(night ? 0x5a6aa8 : 0xfff2dc);
    this.hemi.groundColor.set(night ? 0x2a1e18 : 0x8a6a50);
    this.hemi.intensity = night ? 0.28 : 1.5;
    this.key.color.set(night ? 0x9fb4ff : 0xfff0d2);
    this.key.intensity = night ? 0.32 : 2.6;
    this.scene.environmentIntensity = night ? 0.08 : 0.5;
    this.lampSpot.intensity = lampOn ? (night ? 16 : 5) : 0;
    this.lampFill.intensity = lampOn ? (night ? 7 : 1.5) : 0;
    this.bulb.emissiveIntensity = lampOn ? 2.4 : 0;
    this.screenGlow.intensity = night ? 1.6 : 0.4;
    this.drawSky();
  }

  /* ───────────── 地板、墙 ───────────── */

  private buildShell() {
    const floor = canvas(1024, 1024);
    {
      const { ctx } = floor;
      const r = rand(7);
      const rows = 9;
      const h = 1024 / rows;
      for (let i = 0; i < rows; i++) {
        let x = -r() * 300;
        while (x < 1024) {
          const w = 260 + r() * 300;
          const l = 46 + r() * 10;
          ctx.fillStyle = `hsl(${26 + r() * 6}, ${42 + r() * 10}%, ${l}%)`;
          ctx.fillRect(x, i * h, w, h);
          ctx.globalAlpha = 0.12;
          for (let g = 0; g < 6; g++) {
            ctx.fillStyle = r() > 0.5 ? '#000' : '#fff';
            ctx.fillRect(x, i * h + r() * h, w, 1 + r() * 2);
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(40,20,10,0.55)';
          ctx.fillRect(x, i * h, 3, h);
          x += w;
        }
        ctx.fillStyle = 'rgba(40,20,10,0.6)';
        ctx.fillRect(0, i * h, 1024, 3);
      }
    }
    const cut = std(0x4b3a2e);
    const floorTop = std(0xffffff, { map: floor.tex, roughness: 0.7 });
    const floorSide = std(0x6b4a33);
    const slab = m(new THREE.BoxGeometry(8.3, 0.36, 8.3), [floorSide, floorSide, floorTop, floorSide, floorSide, floorSide], this.scene, [-0.15, -0.18, -0.15], false);
    this.drop(slab, 0);

    const wallBack = std(0xe9dac2);
    const wallLeft = std(0xdcc7a8);
    const back = m(new THREE.BoxGeometry(8.0, 5.2, 0.3), [wallBack, wallBack, cut, wallBack, wallBack, wallBack], this.scene, [0, 2.6, -4.15], false);
    back.receiveShadow = true;
    const left = m(new THREE.BoxGeometry(0.3, 5.2, 8.3), [wallLeft, wallLeft, cut, wallLeft, wallLeft, wallLeft], this.scene, [-4.15, 2.6, -0.15], false);
    left.receiveShadow = true;
    this.drop(back, 1, 0.08);
    this.drop(left, 1, 0.12);

    // 踢脚线
    const skirt = std(0xb89a7a);
    this.drop(m(new THREE.BoxGeometry(8.0, 0.16, 0.05), skirt, this.scene, [0, 0.08, -3.98]), 1, 0.2);
    this.drop(m(new THREE.BoxGeometry(0.05, 0.16, 8.0), skirt, this.scene, [-3.98, 0.08, 0]), 1, 0.2);
  }

  /** 从上面掉进房间的入场动画 */
  private drop(obj: THREE.Object3D, kind: 0 | 1, delay = 0) {
    this.drops.push({ obj, y: obj.position.y, delay: kind === 0 ? 0 : delay });
  }

  private thing(name: Thing, delay: number) {
    const g = new THREE.Group();
    g.userData.thing = name;
    this.scene.add(g);
    this.things.push(g);
    this.drops.push({ obj: g, y: 0, delay });
    return g;
  }

  /* ───────────── 窗户：南京的夜 ───────────── */

  private buildWindow() {
    const g = this.thing('window', 0.3);
    const W = 1.7;
    const H = 1.9;
    const cx = -2.25;
    const cy = 3.0;
    const z = -3.99;
    this.sky = canvas(512, 572);
    m(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.sky.tex, toneMapped: false }), g, [cx, cy, z], false);

    const frame = std(0xf6f1e8, { roughness: 0.6 });
    const t = 0.09;
    m(rbox(W + t * 2, t, 0.14, 0.02), frame, g, [cx, cy + H / 2 + t / 2, z + 0.05]);
    m(rbox(W + t * 2, t, 0.14, 0.02), frame, g, [cx, cy - H / 2 - t / 2, z + 0.05]);
    m(rbox(t, H, 0.14, 0.02), frame, g, [cx - W / 2 - t / 2, cy, z + 0.05]);
    m(rbox(t, H, 0.14, 0.02), frame, g, [cx + W / 2 + t / 2, cy, z + 0.05]);
    m(new THREE.BoxGeometry(0.04, H, 0.05), frame, g, [cx, cy, z + 0.03]);
    m(new THREE.BoxGeometry(W, 0.04, 0.05), frame, g, [cx, cy + 0.25, z + 0.03]);
    m(rbox(W + 0.4, 0.07, 0.32, 0.02), frame, g, [cx, cy - H / 2 - 0.11, z + 0.15]);

    // 窗台上的小仙人掌
    const pot = std(0xc9563c);
    m(new THREE.CylinderGeometry(0.08, 0.065, 0.12, 16), pot, g, [cx + 0.55, cy - H / 2 - 0.02, z + 0.16]);
    const cactus = std(0x5f8f4e);
    const c1 = m(new THREE.CapsuleGeometry(0.045, 0.12, 4, 10), cactus, g, [cx + 0.55, cy - H / 2 + 0.1, z + 0.16]);
    c1.scale.set(1, 1, 1);
    const c2 = m(new THREE.CapsuleGeometry(0.025, 0.05, 4, 8), cactus, g, [cx + 0.6, cy - H / 2 + 0.12, z + 0.16]);
    c2.rotation.z = -0.6;

    // 窗帘
    const cloth = std(0xd9a441, { roughness: 0.95 });
    for (const s of [-1, 1]) {
      const curtain = m(rbox(0.32, H + 0.5, 0.06, 0.03), cloth, g, [cx + s * (W / 2 + 0.28), cy - 0.05, z + 0.2]);
      curtain.scale.z = 1.6;
    }
    rod(new THREE.Vector3(cx - W / 2 - 0.55, cy + H / 2 + 0.2, z + 0.2), new THREE.Vector3(cx + W / 2 + 0.55, cy + H / 2 + 0.2, z + 0.2), 0.02, std(0x3a3330, { metalness: 0.6, roughness: 0.4 }), g);

    // 窗外偶尔飞过的一架飞机（闪烁的航行灯）
    this.flyer = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), new THREE.MeshBasicMaterial({ color: 0xff5040, toneMapped: false, transparent: true }));
    this.flyer.position.set(cx, cy, z + 0.004);
    g.add(this.flyer);
    this.flyer.userData = { cx, cy, W, H };

    this.views.window = { target: new THREE.Vector3(cx, cy, z), theta: 0.18, phi: 1.5, r: 4.4 };
    this.anchors.window = new THREE.Vector3(cx, cy + 0.6, z + 0.2);
  }

  private drawSky() {
    const { ctx, c, tex } = this.sky;
    const w = c.width;
    const h = c.height;
    const night = this.night;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (night) {
      grad.addColorStop(0, '#070b22');
      grad.addColorStop(0.55, '#1c2552');
      grad.addColorStop(0.85, '#5b3f6b');
      grad.addColorStop(1, '#a3615d');
    } else {
      grad.addColorStop(0, '#5aa7e6');
      grad.addColorStop(0.7, '#bfe0f4');
      grad.addColorStop(1, '#f4e6cf');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const r = rand(42);
    if (night) {
      for (let i = 0; i < 90; i++) {
        ctx.globalAlpha = 0.3 + r() * 0.7;
        ctx.fillStyle = '#fff';
        const s = r() * 1.8 + 0.6;
        ctx.fillRect(r() * w, r() * h * 0.6, s, s);
      }
      ctx.globalAlpha = 1;
      // 月亮
      const mg = ctx.createRadialGradient(380, 110, 10, 380, 110, 120);
      mg.addColorStop(0, 'rgba(255,240,200,0.55)');
      mg.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(220, 0, 300, 260);
      ctx.fillStyle = '#fff5d8';
      ctx.beginPath();
      ctx.arc(380, 110, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a2350';
      ctx.beginPath();
      ctx.arc(396, 100, 30, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 4; i++) {
        const x = r() * w;
        const y = 60 + r() * 180;
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.ellipse(x + k * 22 - 40, y + Math.sin(k) * 8, 34, 18, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // 城市剪影：一排楼加紫峰大厦
    const base = h * 0.72;
    const far = night ? '#2b2546' : '#9fb3c4';
    const near = night ? '#15122a' : '#7a8da0';
    for (const [col, y0, hMax] of [
      [far, base, 70],
      [near, base + 40, 110],
    ] as const) {
      ctx.fillStyle = col;
      let x = -10;
      while (x < w) {
        const bw = 26 + r() * 46;
        const bh = 30 + r() * hMax;
        ctx.fillRect(x, y0 - bh, bw, h);
        if (night && col === near) {
          for (let wy = y0 - bh + 8; wy < h - 6; wy += 13) {
            for (let wx = x + 5; wx < x + bw - 6; wx += 10) {
              if (r() > 0.62) {
                ctx.fillStyle = r() > 0.3 ? '#ffd27a' : '#9fd8ff';
                ctx.fillRect(wx, wy, 4, 6);
              }
            }
          }
          ctx.fillStyle = col;
        }
        x += bw + 2;
      }
    }
    // 紫峰大厦：细长的塔，顶上有红色航空障碍灯
    ctx.fillStyle = night ? '#1d1838' : '#6f8296';
    ctx.beginPath();
    ctx.moveTo(150, base + 40);
    ctx.lineTo(160, 120);
    ctx.lineTo(178, 70);
    ctx.lineTo(186, 70);
    ctx.lineTo(196, 140);
    ctx.lineTo(206, base + 40);
    ctx.fill();
    ctx.fillStyle = '#ff4030';
    ctx.beginPath();
    ctx.arc(182, 66, 3, 0, Math.PI * 2);
    ctx.fill();
    tex.needsUpdate = true;
  }

  /* ───────────── 挂钟：走的是访客自己的时间 ───────────── */

  private buildClock() {
    const g = this.thing('clock', 0.35);
    const p = new THREE.Vector3(0.55, 4.28, -3.97);
    const face = canvas(256, 256);
    {
      const { ctx } = face;
      ctx.fillStyle = '#fbf7ef';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#2b2622';
      for (let i = 0; i < 60; i++) {
        ctx.save();
        ctx.translate(128, 128);
        ctx.rotate((i / 60) * Math.PI * 2);
        if (i % 5) ctx.fillRect(-1, -118, 2, 8);
        else ctx.fillRect(-3, -120, 6, 20);
        ctx.restore();
      }
      ctx.font = `600 22px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText('WCL', 128, 92);
    }
    const ring = std(0x2b2622, { roughness: 0.4, metalness: 0.3 });
    const body = m(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 40), ring, g, [p.x, p.y, p.z + 0.035]);
    body.rotation.x = Math.PI / 2;
    const disc = m(new THREE.CircleGeometry(0.32, 40), std(0xffffff, { map: face.tex, roughness: 0.5 }), g, [p.x, p.y, p.z + 0.072], false);
    disc.receiveShadow = false;
    const hand = (len: number, w: number, color: number, z: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(p.x, p.y, p.z + z);
      const h = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.008), new THREE.MeshStandardMaterial({ color }));
      h.position.y = len / 2 - 0.03;
      pivot.add(h);
      g.add(pivot);
      return pivot;
    };
    this.hands = { h: hand(0.18, 0.026, 0x2b2622, 0.08), m: hand(0.26, 0.018, 0x2b2622, 0.085), s: hand(0.28, 0.006, 0xc9563c, 0.09) };
    this.views.clock = { target: p.clone(), theta: 0.1, phi: 1.55, r: 3.2 };
    this.anchors.clock = p.clone().add(new THREE.Vector3(0, 0.45, 0.1));
  }

  /* ───────────── 书桌 ───────────── */

  private buildDesk() {
    const g = new THREE.Group();
    this.scene.add(g);
    this.drop(g, 1, 0.4);
    const top = std(0xd8b083, { roughness: 0.6 });
    m(rbox(3.7, 0.1, 1.45, 0.03), top, g, [0.55, 1.42, -3.22]);
    const metal = std(0x2b2b2e, { metalness: 0.5, roughness: 0.45 });
    for (const [x, z] of [
      [-1.2, -3.85],
      [-1.2, -2.6],
    ]) {
      m(new THREE.BoxGeometry(0.07, 1.37, 0.07), metal, g, [x, 0.685, z]);
    }
    m(new THREE.BoxGeometry(0.07, 0.07, 1.25), metal, g, [-1.2, 0.2, -3.22]);
    // 右边一组抽屉柜
    const cab = std(0xefe6d8, { roughness: 0.7 });
    m(rbox(0.95, 1.36, 1.3, 0.03), cab, g, [1.9, 0.68, -3.25]);
    const knob = std(0x3a3330, { metalness: 0.6, roughness: 0.3 });
    for (let i = 0; i < 3; i++) {
      const y = 0.25 + i * 0.42;
      m(new THREE.BoxGeometry(0.88, 0.012, 0.01), std(0xc9bba5), g, [1.9, y + 0.2, -2.595], false);
      m(rbox(0.22, 0.04, 0.04, 0.015), knob, g, [1.9, y, -2.58]);
    }
  }

  /* ───────────── 显示器：作品 ───────────── */

  private buildMonitor() {
    const g = this.thing('works', 0.55);
    const dark = std(0x1f2226, { roughness: 0.45, metalness: 0.2 });
    m(rbox(0.55, 0.035, 0.34, 0.015), dark, g, [0.55, 1.49, -3.55]);
    m(rbox(0.08, 0.55, 0.05, 0.02), dark, g, [0.55, 1.75, -3.62]);
    m(rbox(1.84, 1.08, 0.07, 0.03), dark, g, [0.55, 2.38, -3.57]);
    this.screen = canvas(1024, 576);
    m(new THREE.PlaneGeometry(1.72, 0.968), new THREE.MeshBasicMaterial({ map: this.screen.tex, toneMapped: false }), g, [0.55, 2.38, -3.533], false);
    this.drawScreen(0);

    // 键盘和鼠标
    const keys = canvas(512, 160);
    {
      const { ctx } = keys;
      ctx.fillStyle = '#e9e5de';
      ctx.fillRect(0, 0, 512, 160);
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 15; col++) {
          ctx.fillStyle = row === 4 && col > 3 && col < 11 ? '#fff' : col === 14 && row === 1 ? '#c9563c' : '#fbfaf7';
          if (row === 4 && col > 4 && col < 11) continue;
          ctx.fillRect(8 + col * 33.2, 8 + row * 29.6, 29, 25);
        }
      }
      ctx.fillStyle = '#fbfaf7';
      ctx.fillRect(8 + 4 * 33.2, 8 + 4 * 29.6, 33.2 * 7 - 4, 25);
    }
    const kbSide = std(0xd9d4cc);
    const kbTop = std(0xffffff, { map: keys.tex });
    m(new RoundedBoxGeometry(1.15, 0.045, 0.36, 2, 0.015), [kbSide, kbSide, kbTop, kbSide, kbSide, kbSide], g, [0.45, 1.495, -2.88]);
    const mouse = m(new THREE.CapsuleGeometry(0.05, 0.07, 4, 12), std(0xf2efe9, { roughness: 0.4 }), g, [1.3, 1.49, -2.86]);
    mouse.rotation.x = Math.PI / 2;
    mouse.scale.set(1.2, 1, 0.45);

    this.screenGlow = new THREE.PointLight(0x8fd0ff, 1.6, 4, 2);
    this.screenGlow.position.set(0.55, 2.3, -3.0);
    g.add(this.screenGlow);

    this.views.works = { target: new THREE.Vector3(0.55, 2.2, -3.4), theta: 0.16, phi: 1.42, r: 4.8 };
    this.anchors.works = new THREE.Vector3(0.55, 3.05, -3.5);
  }

  /** 显示器上显示第 i 个作品；没打开面板时自己轮播 */
  drawScreen(i: number) {
    this.screenIndex = i;
    const { ctx, tex } = this.screen;
    const p = this.data.projects[i];
    const W = 1024;
    const H = 576;
    ctx.fillStyle = '#0f1216';
    ctx.fillRect(0, 0, W, H);
    // 窗口标题栏
    ctx.fillStyle = '#1a1e24';
    ctx.fillRect(0, 0, W, 44);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, k) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(28 + k * 26, 22, 8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#7d8794';
    ctx.font = `20px ${MONO}`;
    ctx.fillText(`~/works/${p.code.toLowerCase()}  —  ${String(i + 1).padStart(2, '0')}/${this.data.projects.length}`, 120, 29);

    const img = this.covers[i];
    const textW = img ? 470 : 900;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(520, 76, 470, 440, 14);
      ctx.clip();
      drawCover(ctx, img, 520, 76, 470, 440);
      ctx.restore();
    }
    ctx.fillStyle = '#ffb35c';
    ctx.font = `22px ${MONO}`;
    ctx.fillText(`${p.code} · ${p.when}`, 48, 110);
    ctx.fillStyle = '#f5f1ea';
    ctx.font = `700 ${p.name.length > 12 ? 50 : 64}px ${SANS}`;
    wrapText(ctx, p.name, 48, 190, textW - 20, 70, 2);
    ctx.fillStyle = '#a9b3bf';
    ctx.font = `28px ${SANS}`;
    wrapText(ctx, p.sub, 48, p.name.length > 12 ? 330 : 270, textW - 30, 40, 2);
    if (p.award) {
      ctx.font = `600 22px ${SANS}`;
      const w = Math.min(ctx.measureText(p.award).width + 36, textW - 10);
      ctx.fillStyle = '#c9563c';
      ctx.beginPath();
      ctx.roundRect(48, 400, w, 44, 22);
      ctx.fill();
      ctx.fillStyle = '#fff';
      wrapText(ctx, p.award, 66, 430, w - 30, 30, 1);
    }
    ctx.fillStyle = '#58d68d';
    ctx.font = `24px ${MONO}`;
    ctx.fillText(`$ open ${p.code.toLowerCase()}${this.screenCursor ? ' ▌' : ''}`, 48, 510);
    tex.needsUpdate = true;
  }

  blinkCursor() {
    this.screenCursor = !this.screenCursor;
    this.drawScreen(this.screenIndex);
  }

  get currentScreen() {
    return this.screenIndex;
  }

  /* ───────────── 台灯 ───────────── */

  private buildLamp() {
    const g = this.thing('lamp', 0.65);
    const body = std(0x2f6f6a, { roughness: 0.5, metalness: 0.2 });
    const base = new THREE.Vector3(-0.8, 1.47, -3.4);
    m(new THREE.CylinderGeometry(0.17, 0.19, 0.05, 28), body, g, [base.x, base.y + 0.025, base.z]);
    const j1 = new THREE.Vector3(-0.9, 2.25, -3.52);
    const head = new THREE.Vector3(-0.4, 2.42, -3.15);
    rod(base.clone().setY(base.y + 0.05), j1, 0.022, body, g);
    rod(j1, head, 0.022, body, g);
    m(new THREE.SphereGeometry(0.04, 12, 12), body, g, [j1.x, j1.y, j1.z]);

    const aim = new THREE.Vector3(-0.15, 1.47, -2.85);
    const shadeG = new THREE.Group();
    shadeG.position.copy(head);
    shadeG.lookAt(aim);
    g.add(shadeG);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 28, 1, true), std(0x2f6f6a, { side: THREE.DoubleSide, roughness: 0.5 }));
    shade.rotation.x = -Math.PI / 2;
    shade.position.z = 0.06;
    shade.castShadow = true;
    shadeG.add(shade);
    this.bulb = std(0xfff1d0, { emissive: 0xffc078, emissiveIntensity: 2.4 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), this.bulb);
    bulb.position.z = 0.12;
    shadeG.add(bulb);

    this.lampSpot = new THREE.SpotLight(0xffb36b, 9, 0, 0.85, 0.6, 2);
    this.lampSpot.position.copy(head).add(aim.clone().sub(head).normalize().multiplyScalar(0.15));
    this.lampSpot.target.position.copy(aim);
    this.lampSpot.castShadow = !this.lite;
    this.lampSpot.shadow.mapSize.set(1024, 1024);
    this.lampSpot.shadow.bias = -0.0008;
    this.lampSpot.shadow.camera.near = 0.1;
    this.scene.add(this.lampSpot, this.lampSpot.target);
    this.lampFill = new THREE.PointLight(0xffa860, 4.5, 0, 1.4);
    this.lampFill.position.copy(head).add(new THREE.Vector3(0.25, -0.2, 0.3));
    this.scene.add(this.lampFill);

    this.views.lamp = { target: new THREE.Vector3(-0.6, 2.0, -3.2), theta: 0.6, phi: 1.35, r: 3.6 };
    this.anchors.lamp = head.clone().add(new THREE.Vector3(0, 0.35, 0));
  }

  /* ───────────── 可达鸭：就是头像那只 ───────────── */

  private buildDuck() {
    const outer = this.thing('duck', 0.8);
    const g = new THREE.Group();
    g.position.set(1.85, 1.47, -2.85);
    g.rotation.y = -0.5;
    outer.add(g);
    this.duck = g;
    const yellow = std(0xf6c945, { roughness: 0.55 });
    const cream = std(0xf4e4b4, { roughness: 0.6 });
    const white = std(0xffffff, { roughness: 0.3 });
    const black = std(0x111111, { roughness: 0.3 });
    const body = m(new THREE.SphereGeometry(0.16, 28, 20), yellow, g, [0, 0.16, 0]);
    body.scale.set(1, 0.92, 0.9);
    m(new THREE.SphereGeometry(0.155, 28, 20), yellow, g, [0, 0.39, 0.01]);
    const beak = m(new THREE.SphereGeometry(0.085, 20, 14), cream, g, [0, 0.35, 0.14]);
    beak.scale.set(1.25, 0.45, 1);
    for (const s of [-1, 1]) {
      m(new THREE.SphereGeometry(0.038, 14, 10), white, g, [s * 0.062, 0.435, 0.125]);
      m(new THREE.SphereGeometry(0.011, 8, 6), black, g, [s * 0.062, 0.435, 0.162]);
      // 双手抱头
      const arm = m(new THREE.SphereGeometry(0.05, 14, 10), yellow, g, [s * 0.15, 0.43, 0.04]);
      arm.scale.set(0.7, 1.4, 0.8);
      arm.rotation.z = s * 0.5;
      const foot = m(new THREE.SphereGeometry(0.05, 12, 8), cream, g, [s * 0.07, 0.015, 0.07]);
      foot.scale.set(1, 0.35, 1.4);
    }
    for (const a of [-0.35, 0, 0.35]) {
      const hair = m(new THREE.CylinderGeometry(0.005, 0.008, 0.11, 6), black, g, [Math.sin(a) * 0.04, 0.58, 0]);
      hair.rotation.z = -a;
    }
    this.views.duck = { target: new THREE.Vector3(1.85, 1.75, -2.85), theta: 0.55, phi: 1.3, r: 2.4 };
    this.anchors.duck = new THREE.Vector3(1.85, 2.15, -2.85);
  }

  /** 点一下可达鸭：蹦一下 */
  hopDuck(now: number) {
    const g = this.duck;
    this.animate(now, 700, (k) => {
      const jump = Math.sin(Math.min(k / 0.7, 1) * Math.PI) * 0.22;
      const squash = k > 0.7 ? 1 - Math.sin(((k - 0.7) / 0.3) * Math.PI) * 0.18 : 1 + Math.sin((k / 0.7) * Math.PI) * 0.06;
      g.position.y = 1.47 + jump;
      g.scale.set(2 - squash, squash, 2 - squash);
      g.rotation.y = -0.5 + Math.sin(k * Math.PI * 2) * 0.35;
    });
  }

  /* ───────────── 手机：联系 ───────────── */

  private buildPhone() {
    const g = this.thing('contact', 0.9);
    const holder = new THREE.Group();
    holder.position.set(-0.3, 1.47, -2.8);
    holder.rotation.y = 0.55;
    g.add(holder);
    const stand = std(0x8a6a50, { roughness: 0.6 });
    m(rbox(0.26, 0.04, 0.16, 0.015), stand, holder, [0, 0.02, 0]);
    m(rbox(0.26, 0.12, 0.03, 0.01), stand, holder, [0, 0.07, -0.06]);
    const tilt = new THREE.Group();
    tilt.position.set(0, 0.05, -0.02);
    tilt.rotation.x = -0.32;
    holder.add(tilt);
    m(rbox(0.24, 0.48, 0.026, 0.03), std(0x1c1c1e, { roughness: 0.3, metalness: 0.4 }), tilt, [0, 0.24, 0]);
    this.phone = canvas(256, 512);
    m(new THREE.PlaneGeometry(0.215, 0.445), new THREE.MeshBasicMaterial({ map: this.phone.tex, toneMapped: false }), tilt, [0, 0.24, 0.0135], false);
    this.drawPhone(false);
    this.views.contact = { target: new THREE.Vector3(-0.3, 1.7, -2.8), theta: 0.55, phi: 1.25, r: 2.3 };
    this.anchors.contact = new THREE.Vector3(-0.3, 2.1, -2.8);
  }

  drawPhone(lit: boolean) {
    const { ctx, tex } = this.phone;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, lit ? '#3b4b7a' : '#151a2b');
    g.addColorStop(1, lit ? '#c9563c' : '#2b1a1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 512);
    const d = new Date();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `200 72px ${SANS}`;
    ctx.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, 128, 130);
    ctx.font = `20px ${SANS}`;
    ctx.globalAlpha = 0.8;
    ctx.fillText(`${d.getMonth() + 1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}`, 128, 166);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(18, 250, 220, 96, 18);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c9563c';
    ctx.font = `600 18px ${SANS}`;
    ctx.fillText('新消息', 36, 282);
    ctx.fillStyle = '#222';
    ctx.font = `22px ${SANS}`;
    ctx.fillText('想一起做点东西？', 36, 316);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `18px ${SANS}`;
    ctx.fillText('点我联系 ↑', 128, 470);
    tex.needsUpdate = true;
  }

  /* ───────────── 杯子和热气 ───────────── */

  private buildMug() {
    const g = new THREE.Group();
    this.scene.add(g);
    this.drop(g, 1, 0.95);
    const mug = std(0xf3efe8, { roughness: 0.35 });
    const p: V3 = [-1.0, 1.47, -2.85];
    const cup = m(new THREE.CylinderGeometry(0.09, 0.08, 0.2, 24, 1, true), std(0xf3efe8, { roughness: 0.35, side: THREE.DoubleSide }), g, [p[0], p[1] + 0.1, p[2]]);
    cup.castShadow = true;
    m(new THREE.CircleGeometry(0.08, 24), mug, g, [p[0], p[1] + 0.005, p[2]]).rotation.x = -Math.PI / 2;
    const tea = m(new THREE.CircleGeometry(0.085, 24), std(0x9a6b2f, { roughness: 0.2 }), g, [p[0], p[1] + 0.16, p[2]], false);
    tea.rotation.x = -Math.PI / 2;
    const handle = m(new THREE.TorusGeometry(0.05, 0.014, 8, 16, Math.PI), mug, g, [p[0] + 0.09, p[1] + 0.1, p[2]]);
    handle.rotation.z = -Math.PI / 2;
    const puff = canvas(64, 64);
    const rg = puff.ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,0.7)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    puff.ctx.fillStyle = rg;
    puff.ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff.tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.position.set(p[0], p[1] + 0.2, p[2]);
      s.userData.phase = i / 4;
      s.userData.base = new THREE.Vector3(p[0], p[1] + 0.2, p[2]);
      g.add(s);
      this.steam.push(s);
    }
  }

  /* ───────────── 椅子 ───────────── */

  private buildChair() {
    const outer = this.thing('chair', 1.0);
    const g = new THREE.Group();
    g.position.set(0.7, 0, -1.85);
    g.rotation.y = 0.35;
    outer.add(g);
    this.chair = g;
    const dark = std(0x26262a, { metalness: 0.4, roughness: 0.4 });
    const seat = std(0x34506e, { roughness: 0.85 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = m(new THREE.BoxGeometry(0.05, 0.05, 0.4), dark, g, [Math.sin(a) * 0.2, 0.1, Math.cos(a) * 0.2]);
      leg.rotation.y = a;
      m(new THREE.SphereGeometry(0.045, 10, 8), dark, g, [Math.sin(a) * 0.38, 0.045, Math.cos(a) * 0.38]);
    }
    m(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 12), dark, g, [0, 0.47, 0]);
    m(rbox(0.85, 0.14, 0.8, 0.06), seat, g, [0, 0.86, 0]);
    const back = m(rbox(0.8, 0.9, 0.12, 0.06), seat, g, [0, 1.42, 0.4]);
    back.rotation.x = -0.12;
    m(new THREE.BoxGeometry(0.06, 0.5, 0.05), dark, g, [0, 1.05, 0.36]);
  }

  spinChair(now: number) {
    const g = this.chair;
    const from = g.rotation.y;
    this.animate(now, 1400, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      g.rotation.y = from + e * Math.PI * 2;
    });
  }

  /* ───────────── 书架：小玩意 ───────────── */

  private buildShelf() {
    const g = this.thing('shelf', 0.5);
    const wood = std(0x7a5136, { roughness: 0.7 });
    const x0 = -3.98;
    const depth = 0.58;
    const xc = x0 + depth / 2;
    const z1 = -3.15;
    const z2 = -0.95;
    const H = 3.2;
    m(new THREE.BoxGeometry(depth, H, 0.06), wood, g, [xc, H / 2, z1]);
    m(new THREE.BoxGeometry(depth, H, 0.06), wood, g, [xc, H / 2, z2]);
    m(new THREE.BoxGeometry(0.03, H, z2 - z1), std(0x5e3d28), g, [x0 + 0.015, H / 2, (z1 + z2) / 2]);
    const levels = [0.06, 0.85, 1.65, 2.45, 3.2];
    for (const y of levels) m(new THREE.BoxGeometry(depth, 0.05, z2 - z1), wood, g, [xc, y, (z1 + z2) / 2]);

    const r = rand(11);
    const palette = [0xc9563c, 0x2f6f6a, 0xd9a441, 0x34506e, 0xe8dcc6, 0x6b4a7a, 0x8a9a5b, 0x2b2622];
    const names = [...this.data.books];
    for (let li = 0; li < 4; li++) {
      let z = z1 + 0.06;
      const yBase = levels[li] + 0.025;
      const maxH = levels[li + 1] - levels[li] - 0.1;
      // 每层留一点空：有一层放个小摆件
      const stopAt = li === 1 ? z2 - 0.55 : z2 - 0.05;
      let named = 0;
      let count = 0;
      while (z < stopAt) {
        // 每层挑两本写上小项目的名字，写字的书厚一点
        const naming = names.length > 0 && named < 2 && count++ % 3 === 1;
        const t = naming ? 0.12 + r() * 0.02 : 0.07 + r() * 0.07;
        if (z + t > stopAt) break;
        const h = maxH * (0.68 + r() * 0.3);
        const d = 0.38 + r() * 0.12;
        const color = palette[Math.floor(r() * palette.length)];
        const side = std(color, { roughness: 0.75 });
        let spine: THREE.Material = side;
        if (naming) {
          spine = std(0xffffff, { map: this.spineTexture(names.shift()!, color), roughness: 0.7 });
          named++;
        }
        const book = m(new THREE.BoxGeometry(d, h, t), [spine, side, side, side, side, side], g, [x0 + 0.04 + d / 2, yBase + h / 2, z + t / 2]);
        if (r() > 0.88) {
          book.rotation.x = 0.12;
          book.position.y -= 0.01;
        }
        z += t + 0.005;
      }
      if (li === 1) {
        // 小地球仪
        const globe = m(new THREE.SphereGeometry(0.16, 24, 16), std(0x3f7fb0, { roughness: 0.4 }), g, [xc, yBase + 0.32, z2 - 0.28]);
        globe.rotation.z = 0.4;
        m(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 16), wood, g, [xc, yBase + 0.04, z2 - 0.28]);
      }
    }
    this.views.shelf = { target: new THREE.Vector3(-3.7, 2.0, -2.05), theta: 1.3, phi: 1.38, r: 6.0 };
    this.anchors.shelf = new THREE.Vector3(-3.6, 3.0, -1.2);
  }

  private spineTexture(text: string, color: number) {
    const { ctx, tex } = canvas(64, 512);
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 64, 512);
    const light = [0xe8dcc6, 0xd9a441].includes(color);
    ctx.fillStyle = light ? '#2b2622' : '#f6efe2';
    ctx.fillRect(0, 40, 64, 3);
    ctx.fillRect(0, 470, 64, 3);
    ctx.save();
    ctx.translate(32, 256);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 34;
    ctx.font = `600 ${size}px ${SANS}`;
    while (ctx.measureText(text).width > 380 && size > 16) {
      size -= 2;
      ctx.font = `600 ${size}px ${SANS}`;
    }
    ctx.fillText(text, 0, 2);
    ctx.restore();
    return tex;
  }

  /* ───────────── 书架顶上的 737 模型 ───────────── */

  private buildPlane() {
    const outer = this.thing('plane', 1.1);
    const standMat = std(0x2b2622, { metalness: 0.4, roughness: 0.35 });
    const sx = -3.66;
    const sz = -2.05;
    m(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 24), standMat, outer, [sx, 3.245, sz]);
    m(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), standMat, outer, [sx, 3.47, sz]);
    const g = new THREE.Group();
    g.position.set(sx, 3.72, sz);
    g.rotation.y = 0.9;
    outer.add(g);
    this.plane = g;
    const white = std(0xf7f7f4, { roughness: 0.35, metalness: 0.1 });
    const navy = std(0x1d3d8f, { roughness: 0.4 });
    const red = std(0xc9563c, { roughness: 0.4 });
    const grey = std(0x9aa3ad, { roughness: 0.4, metalness: 0.4 });
    const fus = m(new THREE.CapsuleGeometry(0.065, 0.8, 6, 16), white, g, [0, 0, 0]);
    fus.rotation.x = Math.PI / 2;
    const stripe = m(new THREE.CylinderGeometry(0.0665, 0.0665, 0.62, 16, 1, true), navy, g, [0, -0.012, 0.02]);
    stripe.rotation.x = Math.PI / 2;
    stripe.scale.set(1, 1, 0.35);
    for (const s of [-1, 1]) {
      const wing = m(new THREE.BoxGeometry(0.5, 0.012, 0.16), white, g, [s * 0.26, -0.03, 0.02]);
      wing.rotation.y = s * 0.42;
      const tip = m(new THREE.BoxGeometry(0.01, 0.06, 0.05), red, g, [s * 0.5, 0.0, -0.08]);
      tip.rotation.y = s * 0.42;
      const eng = m(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 14), grey, g, [s * 0.2, -0.07, 0.11]);
      eng.rotation.x = Math.PI / 2;
      const stab = m(new THREE.BoxGeometry(0.18, 0.008, 0.07), white, g, [s * 0.1, 0.01, -0.42]);
      stab.rotation.y = s * 0.45;
    }
    const fin = m(new THREE.BoxGeometry(0.01, 0.17, 0.13), navy, g, [0, 0.11, -0.43]);
    fin.rotation.x = -0.45;
    this.views.plane = { target: new THREE.Vector3(sx, 3.6, sz), theta: 1.1, phi: 1.35, r: 3.0 };
    this.anchors.plane = new THREE.Vector3(sx, 4.1, sz);
  }

  /** 起飞：从书架上飞出窗外 */
  takeoff(now: number, done: () => void) {
    const g = this.plane;
    const start = g.position.clone();
    const rot = g.rotation.y;
    this.animate(
      now,
      1500,
      (k) => {
        const e = k * k;
        g.position.set(start.x + e * 1.6, start.y + e * 0.9 + Math.sin(k * Math.PI) * 0.3, start.z + e * 0.6);
        g.rotation.set(-0.3 * k, rot + k * 0.6, -0.4 * Math.sin(k * Math.PI));
        g.scale.setScalar(1 + e * 1.5);
      },
      done,
    );
  }

  /* ───────────── 软木板：经历 ───────────── */

  private buildCorkboard() {
    const g = this.thing('journey', 0.45);
    const W = 1.8;
    const H = 1.28;
    const p = new THREE.Vector3(2.95, 3.0, -3.98);
    m(rbox(W + 0.1, H + 0.1, 0.05, 0.02), std(0x8a5a3a), g, [p.x, p.y, p.z + 0.025]);
    const cork = canvas(1024, 728);
    const { ctx } = cork;
    const r = rand(5);
    ctx.fillStyle = '#c69a6a';
    ctx.fillRect(0, 0, 1024, 728);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(90,55,25,0.25)' : 'rgba(255,230,190,0.18)';
      ctx.fillRect(r() * 1024, r() * 728, 2 + r() * 3, 2 + r() * 3);
    }
    const pins = this.data.pins;
    const pts: [number, number][] = [];
    const cols = 5;
    pins.forEach((_, i) => {
      const row = Math.floor(i / cols);
      const col = row % 2 ? cols - 1 - (i % cols) : i % cols;
      const x = 110 + col * 200 + (r() - 0.5) * 30;
      const y = 170 + row * 340 + (r() - 0.5) * 50;
      pts.push([x, y]);
    });
    // 红线把票根按时间串起来
    ctx.strokeStyle = '#b3261e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y - 60) : ctx.moveTo(x, y - 60)));
    ctx.stroke();
    pins.forEach((pin, i) => {
      const [x, y] = pts[i];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((r() - 0.5) * 0.18);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-72, -62, 150, 130);
      ctx.fillStyle = ['#fbf6ea', '#fff4b8', '#e7f0f7', '#fbe1d8'][i % 4];
      ctx.fillRect(-76, -68, 150, 130);
      ctx.fillStyle = '#2b2622';
      ctx.textAlign = 'center';
      ctx.font = `600 34px ${HAND}`;
      ctx.fillText(pin.date, 0, -6);
      ctx.font = `22px ${HAND}`;
      ctx.fillStyle = '#6b5f55';
      ctx.fillText(`第 ${i + 1} 站`, 0, 34);
      if (pin.stamp) {
        ctx.strokeStyle = 'rgba(190,30,30,0.85)';
        ctx.fillStyle = 'rgba(190,30,30,0.85)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(40, 24, 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `700 26px ${SERIF}`;
        ctx.fillText(pin.stamp, 40, 33);
      }
      ctx.restore();
    });
    ctx.fillStyle = '#2b2622';
    ctx.font = `600 40px ${HAND}`;
    ctx.textAlign = 'left';
    ctx.fillText('一路走过来的', 36, 60);
    cork.tex.needsUpdate = true;
    m(new THREE.PlaneGeometry(W, H), std(0xffffff, { map: cork.tex, roughness: 0.95 }), g, [p.x, p.y, p.z + 0.052], false);
    // 3D 图钉
    const pinMat = std(0xd23b2a, { roughness: 0.3 });
    pts.forEach(([x, y]) => {
      const px = p.x - W / 2 + (x / 1024) * W;
      const py = p.y + H / 2 - ((y - 60) / 728) * H;
      m(new THREE.SphereGeometry(0.022, 12, 8), pinMat, g, [px, py, p.z + 0.07]);
    });
    this.views.journey = { target: p.clone(), theta: 0.05, phi: 1.52, r: 3.6 };
    this.anchors.journey = p.clone().add(new THREE.Vector3(0, H / 2 + 0.2, 0.1));
  }

  /* ───────────── 白板：技能 ───────────── */

  private buildWhiteboard() {
    const g = this.thing('skills', 0.6);
    const p = new THREE.Vector3(-3.98, 2.65, 0.95);
    const W = 2.0;
    const H = 1.3;
    const frame = std(0xb9bec4, { metalness: 0.6, roughness: 0.35 });
    m(rbox(0.05, H + 0.08, W + 0.08, 0.02), frame, g, [p.x + 0.025, p.y, p.z]);
    const board = canvas(1024, 666);
    const { ctx } = board;
    ctx.fillStyle = '#fbfcfd';
    ctx.fillRect(0, 0, 1024, 666);
    ctx.fillStyle = 'rgba(160,170,190,0.12)';
    ctx.fillRect(560, 30, 400, 120);
    ctx.font = `600 52px ${HAND}`;
    ctx.fillStyle = '#1f4fa8';
    ctx.fillText('出发前检查单', 50, 86);
    ctx.font = `36px ${HAND}`;
    const items = this.data.skills;
    items.forEach((s, i) => {
      const col = i < 5 ? 0 : 1;
      const row = i < 5 ? i : i - 5;
      const x = 60 + col * 480;
      const y = 180 + row * 92;
      ctx.strokeStyle = '#2b2622';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y - 30, 32, 32);
      ctx.strokeStyle = i % 3 === 1 ? '#c42b2b' : '#1f8a4c';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 14);
      ctx.lineTo(x + 14, y - 2);
      ctx.lineTo(x + 40, y - 40);
      ctx.stroke();
      ctx.fillStyle = '#2b2622';
      ctx.fillText(s, x + 56, y);
    });
    ctx.save();
    ctx.translate(820, 610);
    ctx.rotate(-0.06);
    ctx.fillStyle = '#c42b2b';
    ctx.font = `600 38px ${HAND}`;
    ctx.fillText('全部 ✓', -60, 0);
    ctx.restore();
    board.tex.needsUpdate = true;
    const surf = m(new THREE.PlaneGeometry(W, H), std(0xffffff, { map: board.tex, roughness: 0.3 }), g, [p.x + 0.052, p.y, p.z], false);
    surf.rotation.y = Math.PI / 2;
    // 笔槽和白板笔
    m(new THREE.BoxGeometry(0.1, 0.03, W * 0.6), frame, g, [p.x + 0.08, p.y - H / 2 - 0.05, p.z]);
    [0xc42b2b, 0x1f4fa8, 0x1f8a4c].forEach((c, i) => {
      const pen = m(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 10), std(c, { roughness: 0.4 }), g, [p.x + 0.09, p.y - H / 2 - 0.02, p.z - 0.2 + i * 0.12]);
      pen.rotation.x = Math.PI / 2;
    });
    this.views.skills = { target: p.clone(), theta: 1.42, phi: 1.48, r: 4.5 };
    this.anchors.skills = p.clone().add(new THREE.Vector3(0.1, H / 2 + 0.22, 0));
  }

  /* ───────────── 海报：关于我 ───────────── */

  private buildPoster() {
    const g = this.thing('about', 0.7);
    const p = new THREE.Vector3(-3.98, 2.75, 2.75);
    const W = 1.1;
    const H = 1.55;
    m(new THREE.BoxGeometry(0.03, H + 0.06, W + 0.06), std(0x1e1b18, { roughness: 0.5 }), g, [p.x + 0.015, p.y, p.z]);
    this.poster = canvas(660, 930);
    this.drawPoster();
    const surf = m(new THREE.PlaneGeometry(W, H), std(0xffffff, { map: this.poster.tex, roughness: 0.6 }), g, [p.x + 0.032, p.y, p.z], false);
    surf.rotation.y = Math.PI / 2;
    this.views.about = { target: p.clone(), theta: 1.55, phi: 1.5, r: 3.4 };
    this.anchors.about = p.clone().add(new THREE.Vector3(0.1, H / 2 + 0.2, 0));
  }

  private drawPoster() {
    const { ctx, tex } = this.poster;
    const W = 660;
    const H = 930;
    ctx.fillStyle = '#c9563c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f3e7d3';
    ctx.fillRect(28, 28, W - 56, H - 56);
    ctx.fillStyle = '#c9563c';
    ctx.font = `900 250px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.fillText('围', 50, 300);
    ctx.fillText('城', 50, 560);
    if (this.avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(470, 220, 130, 0, Math.PI * 2);
      ctx.clip();
      drawCover(ctx, this.avatarImg, 340, 90, 260, 260);
      ctx.restore();
      ctx.strokeStyle = '#2b2622';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(470, 220, 130, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#2b2622';
    ctx.font = `700 64px ${SERIF}`;
    ctx.fillText(this.data.name, 330, 450);
    ctx.font = `22px ${MONO}`;
    ctx.fillText(this.data.nameEn, 334, 494);
    ctx.fillRect(50, 610, W - 100, 4);
    ctx.font = `30px ${SERIF}`;
    wrapText(ctx, this.data.motto, 50, 670, W - 100, 46, 4);
    ctx.font = `20px ${MONO}`;
    ctx.fillStyle = '#7a6a5c';
    ctx.fillText('WEICHEN.LI · 2026', 50, H - 60);
    tex.needsUpdate = true;
  }

  /* ───────────── 植物和地毯 ───────────── */

  private buildPlant() {
    const outer = this.thing('plant', 0.75);
    const p: V3 = [3.3, 0, -3.3];
    m(new THREE.CylinderGeometry(0.32, 0.24, 0.6, 24), std(0xe8dcc6, { roughness: 0.6 }), outer, [p[0], 0.3, p[2]]);
    m(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 24), std(0x3b2a1e), outer, [p[0], 0.59, p[2]], false);
    const r = rand(3);
    const greens = [0x4f8a4a, 0x5f9e55, 0x3f7a40];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + r() * 0.4;
      const pivot = new THREE.Group();
      pivot.position.set(p[0], 0.58, p[2]);
      pivot.rotation.set(Math.cos(a) * (0.35 + r() * 0.35), 0, Math.sin(a) * (0.35 + r() * 0.35), 'XZY');
      outer.add(pivot);
      const len = 0.7 + r() * 0.6;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), std(greens[i % 3], { roughness: 0.6 }));
      leaf.scale.set(0.11, len / 2, 0.035);
      leaf.position.y = len / 2;
      leaf.castShadow = true;
      pivot.add(leaf);
      pivot.userData.base = pivot.rotation.clone();
      pivot.userData.phase = r() * Math.PI * 2;
      this.leaves.push(pivot);
    }
    this.views.plant = { target: new THREE.Vector3(3.3, 0.9, -3.3), theta: 0.6, phi: 1.3, r: 3.5 };
    this.anchors.plant = new THREE.Vector3(3.3, 1.9, -3.3);
  }

  shakePlant(now: number) {
    this.animate(now, 900, (k) => {
      const amp = Math.sin(k * Math.PI * 6) * (1 - k) * 0.25;
      for (const l of this.leaves) {
        const b = l.userData.base as THREE.Euler;
        l.rotation.x = b.x + amp;
      }
    });
  }

  private buildRug() {
    const g = new THREE.Group();
    this.scene.add(g);
    this.drop(g, 1, 0.3);
    const t = canvas(512, 512);
    const { ctx } = t;
    const rings = ['#c9563c', '#e8dcc6', '#d9a441', '#c9563c', '#2f6f6a', '#e8dcc6', '#c9563c'];
    rings.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(256, 256, 256 - i * 34, 0, Math.PI * 2);
      ctx.fill();
    });
    t.tex.needsUpdate = true;
    const rug = m(new THREE.CylinderGeometry(2, 2, 0.025, 64), [std(0xb44a33), std(0xffffff, { map: t.tex, roughness: 1 }), std(0xb44a33)], g, [0.7, 0.013, -1.5], false);
    rug.scale.z = 0.72;
    rug.receiveShadow = true;
  }

  /* ───────────── 灯光里的浮尘 ───────────── */

  private buildDust() {
    const n = this.lite ? 120 : 260;
    const pos = new Float32Array(n * 3);
    this.dustSeed = new Float32Array(n * 3);
    const r = rand(9);
    for (let i = 0; i < n; i++) {
      this.dustSeed[i * 3] = -3.5 + r() * 6.5;
      this.dustSeed[i * 3 + 1] = 0.3 + r() * 4.2;
      this.dustSeed[i * 3 + 2] = -3.8 + r() * 4.5;
    }
    pos.set(this.dustSeed);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = canvas(32, 32);
    const rg = dot.ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,230,190,1)');
    rg.addColorStop(1, 'rgba(255,230,190,0)');
    dot.ctx.fillStyle = rg;
    dot.ctx.fillRect(0, 0, 32, 32);
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.035, map: dot.tex, transparent: true, depthWrite: false, opacity: 0.55, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(this.dust);
  }

  /* ───────────── 动画 ───────────── */

  animate(now: number, dur: number, fn: (k: number) => void, done?: () => void) {
    this.anims.push({ t0: now, dur, fn, done });
  }

  /** 入场：0→1，东西从天上掉进来 */
  intro(k: number) {
    for (const d of this.drops) {
      const t = Math.min(Math.max((k * 2.2 - d.delay) / 0.9, 0), 1);
      const back = 1.70158;
      const e = t === 0 ? 0 : 1 + (back + 1) * Math.pow(t - 1, 3) + back * Math.pow(t - 1, 2);
      if (d.obj.userData.thing !== undefined || d.obj instanceof THREE.Group) {
        d.obj.position.y = d.y + (1 - e) * 7;
        d.obj.visible = t > 0;
      } else {
        d.obj.scale.y = Math.max(e, 0.001);
        d.obj.position.y = d.y * Math.max(e, 0.001);
      }
    }
  }

  update(now: number, dt: number) {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      const k = Math.min((now - a.t0) / a.dur, 1);
      a.fn(k);
      if (k >= 1) {
        this.anims.splice(i, 1);
        a.done?.();
      }
    }
    const t = now / 1000;
    // 钟
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const mm = d.getMinutes() + s / 60;
    const hh = (d.getHours() % 12) + mm / 60;
    this.hands.s.rotation.z = -(s / 60) * Math.PI * 2;
    this.hands.m.rotation.z = -(mm / 60) * Math.PI * 2;
    this.hands.h.rotation.z = -(hh / 12) * Math.PI * 2;
    // 植物随风
    for (const l of this.leaves) {
      const b = l.userData.base as THREE.Euler;
      l.rotation.z = b.z + Math.sin(t * 0.9 + l.userData.phase) * 0.03;
    }
    // 模型飞机轻轻晃
    if (!this.anims.length || this.plane.scale.x === 1) {
      this.plane.rotation.z = Math.sin(t * 0.7) * 0.06;
      this.plane.position.y = 3.72 + Math.sin(t * 1.1) * 0.015;
    }
    // 热气
    for (const sp of this.steam) {
      const k = (t * 0.35 + sp.userData.phase) % 1;
      const b = sp.userData.base as THREE.Vector3;
      sp.position.set(b.x + Math.sin(k * 6 + sp.userData.phase * 9) * 0.03, b.y + k * 0.5, b.z);
      sp.scale.setScalar(0.08 + k * 0.16);
      sp.material.opacity = Math.sin(k * Math.PI) * 0.35;
    }
    // 浮尘
    const arr = (this.dust.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const ph = this.dustSeed[i] * 3.1 + this.dustSeed[i + 2];
      arr[i] = this.dustSeed[i] + Math.sin(t * 0.13 + ph) * 0.25;
      arr[i + 1] = this.dustSeed[i + 1] + Math.sin(t * 0.09 + ph * 1.7) * 0.3;
      arr[i + 2] = this.dustSeed[i + 2] + Math.cos(t * 0.11 + ph) * 0.25;
    }
    this.dust.geometry.getAttribute('position').needsUpdate = true;
    (this.dust.material as THREE.PointsMaterial).opacity = this.lampOn ? 0.6 : 0.25;
    // 窗外飞过的飞机：25 秒一趟，航行灯一秒闪一下
    const u = this.flyer.userData;
    const fk = (t % 25) / 25;
    this.flyer.visible = fk < 0.45;
    this.flyer.position.x = u.cx - u.W / 2 + (fk / 0.45) * u.W;
    this.flyer.position.y = u.cy + u.H * 0.28 + fk * 0.15;
    (this.flyer.material as THREE.MeshBasicMaterial).opacity = t % 1 < 0.12 ? 1 : 0.35;
    void dt;
  }

  /** 悬停高亮：给这件东西的材质加一点自发光 */
  highlight(g: THREE.Object3D | null, on: boolean) {
    if (!g) return;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const sm = mat as THREE.MeshStandardMaterial;
        if (!sm.isMeshStandardMaterial || sm === this.bulb) continue;
        if (sm.userData.e0 === undefined) sm.userData.e0 = { c: sm.emissive.getHex(), i: sm.emissiveIntensity };
        if (on) {
          sm.emissive.set(0xffa860);
          sm.emissiveIntensity = 0.22;
        } else {
          sm.emissive.setHex(sm.userData.e0.c);
          sm.emissiveIntensity = sm.userData.e0.i;
        }
      }
    });
  }
}
