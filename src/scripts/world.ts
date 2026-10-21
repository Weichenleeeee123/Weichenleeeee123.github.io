import * as THREE from 'three';
import type { Flight } from './flight';

/*
 * 挡风玻璃外的世界。相机永远在原点，飞机「动」靠世界往回挪：
 *   - 前进：所有灯沿 z 轴平移（shader 里取模，无限平铺）
 *   - 爬升：地面和云层沿 y 轴往下沉
 *   - 姿态：直接转相机
 * 1 英尺高度 = ALT_K 个世界单位。
 */
const ALT_K = 0.012;
const EYE = 0.6; // 在地面时眼睛离地高度（737 驾驶舱约 4 米）

const pointVert = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  attribute float seed;
  uniform float uOffset;
  uniform float uTile;
  uniform float uLen;
  uniform float uLift;
  uniform float uPixel;
  uniform float uTime;
  uniform float uStrobe;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.z += uOffset;
    if (uTile > 0.5) p.z = mod(p.z, uLen) - uLen + 40.0;
    p.y -= uLift;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float flick = 0.82 + 0.18 * sin(uTime * (2.0 + seed * 5.0) + seed * 40.0);
    // 进近灯的「兔子」：一串频闪从远处往跑道头跑
    float rabbit = uStrobe > 0.5 ? step(fract(uTime * 1.6 - seed), 0.07) * 3.0 : 1.0;
    vAlpha = flick * rabbit;
    vColor = color;
    gl_PointSize = clamp(size * uPixel * (260.0 / -mv.z), 1.0, 64.0);
  }
`;

const pointFrag = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = smoothstep(0.5, 0.0, d);
    float glow = pow(core, 3.0);
    gl_FragColor = vec4(vColor * (glow * 1.6 + core * 0.4), (core * 0.6 + glow) * vAlpha * uOpacity);
  }
`;

const cloudFrag = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vColor, a * a * uOpacity);
  }
`;

type Layer = { points: THREE.Points; mat: THREE.ShaderMaterial };

function makeLayer(
  positions: number[],
  colors: number[],
  sizes: number[],
  opts: { tile?: boolean; len?: number; strobe?: boolean; frag?: string; additive?: boolean } = {},
): Layer {
  const g = new THREE.BufferGeometry();
  const n = sizes.length;
  const seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) seeds[i] = opts.strobe ? i / n : Math.random();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
  g.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: pointVert,
    fragmentShader: opts.frag ?? pointFrag,
    uniforms: {
      uOffset: { value: 0 },
      uTile: { value: opts.tile ? 1 : 0 },
      uLen: { value: opts.len ?? 1000 },
      uLift: { value: 0 },
      uPixel: { value: 1 },
      uTime: { value: 0 },
      uStrobe: { value: opts.strobe ? 1 : 0 },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  return { points, mat };
}

const C = (hex: number) => new THREE.Color(hex);

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private city: Layer;
  private runway: Layer;
  private approach: Layer;
  private clouds: Layer;
  private stars: Layer;
  private moon: THREE.Sprite;
  private distance = 0;
  private landingRunway = false;

  constructor(canvas: HTMLCanvasElement, private lite: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, lite ? 1 : 1.6));
    this.renderer.setClearColor(0x03050a);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 6000);
    this.camera.rotation.order = 'YXZ';

    this.sky = this.makeSky();
    this.scene.add(this.sky);
    this.stars = this.makeStars();
    this.scene.add(this.stars.points);
    this.moon = this.makeMoon();
    this.scene.add(this.moon);
    this.city = this.makeCity();
    this.scene.add(this.city.points);
    this.runway = this.makeRunway();
    this.scene.add(this.runway.points);
    this.approach = this.makeApproach();
    this.scene.add(this.approach.points);
    this.clouds = this.makeClouds();
    this.scene.add(this.clouds.points);

    this.resize();
  }

  private makeSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uHigh: { value: 0 },
        uPitch: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uHigh;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          // 低空：城市把地平线照成暗橙；高空：一圈深蓝的大气层
          vec3 lowHorizon = vec3(0.28, 0.14, 0.09);
          vec3 highHorizon = vec3(0.05, 0.12, 0.28);
          vec3 horizon = mix(lowHorizon, highHorizon, uHigh);
          vec3 zenith = mix(vec3(0.02, 0.025, 0.05), vec3(0.0, 0.004, 0.02), uHigh);
          vec3 ground = mix(vec3(0.03, 0.025, 0.03), vec3(0.008, 0.012, 0.03), uHigh);
          float band = exp(-abs(h) * mix(9.0, 22.0, uHigh));
          vec3 col = h > 0.0 ? mix(zenith, horizon, band) : mix(ground, horizon, band);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
    return mesh;
  }

  private makeStars(): Layer {
    const pos: number[] = [], col: number[] = [], size: number[] = [];
    const n = this.lite ? 900 : 2200;
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random() * 0.95;
      const th = u * Math.PI * 2, ph = Math.acos(1 - v);
      const r = 4200;
      pos.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) - 300, r * Math.sin(ph) * Math.sin(th));
      const t = Math.random();
      const c = t < 0.1 ? C(0xffd9a8) : t < 0.25 ? C(0xbcd4ff) : C(0xffffff);
      col.push(c.r, c.g, c.b);
      size.push(18 + Math.pow(Math.random(), 6) * 70);
    }
    return makeLayer(pos, col, size);
  }

  private makeMoon() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d')!;
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,250,235,1)');
    grd.addColorStop(0.12, 'rgba(255,248,230,1)');
    grd.addColorStop(0.16, 'rgba(200,210,255,0.35)');
    grd.addColorStop(1, 'rgba(120,140,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(mat);
    s.position.set(-1400, 900, -3200);
    s.scale.setScalar(520);
    return s;
  }

  private makeCity(): Layer {
    const pos: number[] = [], col: number[] = [], size: number[] = [];
    const n = this.lite ? 7000 : 16000;
    const palette = [0xffb35c, 0xffc983, 0xffe2b0, 0xffffff, 0x9fc4ff, 0xff8a3d];
    // 先撒几十个「城镇」中心，灯沿街道成簇
    const towns = Array.from({ length: 60 }, () => [(Math.random() - 0.5) * 3600, -Math.random() * 4200, 40 + Math.random() * 260]);
    for (let i = 0; i < n; i++) {
      const [tx, tz, tr] = towns[(Math.random() * towns.length) | 0];
      const grid = Math.random() < 0.7;
      let x = tx + (Math.random() - 0.5) * tr * 2;
      let z = tz + (Math.random() - 0.5) * tr * 2;
      if (grid) {
        if (Math.random() < 0.5) x = Math.round(x / 14) * 14;
        else z = Math.round(z / 14) * 14;
      }
      if (Math.abs(x) < 90 && z > -1400) x += Math.sign(x || 1) * 120; // 机场周围留黑
      pos.push(x, 0, z);
      const c = C(palette[(Math.random() * palette.length) | 0]);
      col.push(c.r, c.g, c.b);
      size.push(1.2 + Math.random() * 2.2);
    }
    // 滑行道蓝灯
    for (let i = 0; i < 240; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      pos.push(side * (14 + Math.random() * 40), 0, -Math.random() * 1200);
      col.push(0.25, 0.45, 1);
      size.push(1.1);
    }
    return makeLayer(pos, col, size, { tile: true, len: 4200 });
  }

  private makeRunway(): Layer {
    const pos: number[] = [], col: number[] = [], size: number[] = [];
    const L = 900;
    const W = 3.2;
    for (let z = 0; z > -L; z -= 6) {
      const end = z < -L + 160; // 跑道末端 600m 边灯变黄
      for (const x of [-W, W]) {
        pos.push(x, 0, z);
        const c = end ? C(0xffc36a) : C(0xfff4dc);
        col.push(c.r, c.g, c.b);
        size.push(1.5);
      }
      // 中线灯，末端红白相间
      pos.push(0, 0, z - 3);
      const red = z < -L + 100 || (z < -L + 300 && (z / 6) % 2 === 0);
      const c = red ? C(0xff3b30) : C(0xffffff);
      col.push(c.r, c.g, c.b);
      size.push(0.9);
    }
    // 跑道头绿灯、跑道尾红灯
    for (let x = -W; x <= W; x += 0.8) {
      pos.push(x, 0, 2);
      col.push(0.2, 1, 0.45);
      size.push(1.4);
      pos.push(x, 0, -L);
      col.push(1, 0.15, 0.1);
      size.push(1.4);
    }
    // PAPI：两红两白，告诉你下滑道刚好
    [0xff2a1f, 0xff2a1f, 0xffffff, 0xffffff].forEach((h, i) => {
      pos.push(-W - 3 - i * 1.1, 0.15, -55);
      const c = C(h);
      col.push(c.r, c.g, c.b);
      size.push(2.4);
    });
    return makeLayer(pos, col, size, { tile: true, len: L });
  }

  private makeApproach(): Layer {
    const pos: number[] = [], col: number[] = [], size: number[] = [];
    // 跑道头前 900 米的进近灯，越近越靠后，「兔子」顺着 seed 从远往近跑
    const n = 30;
    for (let i = 0; i < n; i++) {
      const z = 10 + (n - i) * 9;
      pos.push(0, 0.05, z);
      col.push(1, 1, 1);
      size.push(3.2);
    }
    const layer = makeLayer(pos, col, size, { strobe: true });
    return layer;
  }

  private makeClouds(): Layer {
    const pos: number[] = [], col: number[] = [], size: number[] = [];
    const n = this.lite ? 700 : 1600;
    for (let i = 0; i < n; i++) {
      // 云层底 6000ft，顶 9000ft
      const y = (6000 + Math.random() * 3000) * ALT_K;
      pos.push((Math.random() - 0.5) * 2400, y, -Math.random() * 3000);
      const shade = 0.42 + Math.random() * 0.22;
      col.push(shade * 0.85, shade * 0.9, shade * 1.05);
      size.push(70 + Math.random() * 120);
    }
    return makeLayer(pos, col, size, { tile: true, len: 3000, frag: cloudFrag, additive: false });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const px = this.renderer.getPixelRatio();
    for (const l of [this.city, this.runway, this.approach, this.clouds, this.stars]) l.mat.uniforms.uPixel.value = px * (h / 900);
  }

  /** 每帧调用。f 是平滑后的飞行状态，look 是鼠标带来的视角偏移 */
  update(f: Flight, dt: number, time: number, look: { x: number; y: number }) {
    // 地速：节 → 世界单位/秒。故意夸大，跑道灯才冲得起来
    this.distance += f.speed * 0.42 * dt;
    const alt = f.alt * ALT_K;
    const lift = alt + EYE;
    const high = THREE.MathUtils.smoothstep(f.alt, 6000, 14000);

    const set = (l: Layer, offset: number, liftV: number, opacity = 1) => {
      l.mat.uniforms.uOffset.value = offset;
      l.mat.uniforms.uLift.value = liftV;
      l.mat.uniforms.uTime.value = time;
      l.mat.uniforms.uOpacity.value = opacity;
    };

    // 城市灯：高空时被云层挡掉一部分
    const underCloud = f.alt > 9000 ? 0.18 : 1;
    set(this.city, this.distance, lift, underCloud * (1 - 0.5 * high) + 0.15);

    // 跑道：起飞时无限平铺；落地时换成一条从远处迎上来的真跑道
    const onLanding = f.phase === 'landing';
    if (onLanding !== this.landingRunway) this.landingRunway = onLanding;
    if (onLanding) {
      this.runway.mat.uniforms.uTile.value = 0;
      const ahead = f.toThreshold; // 离跑道头的距离（世界单位）
      set(this.runway, -ahead, lift, f.alt < 4000 ? 1 : 0);
      set(this.approach, -ahead, lift, f.alt < 3000 && f.toThreshold > 0 ? 1 : 0);
    } else {
      this.runway.mat.uniforms.uTile.value = 1;
      const vis = 1 - THREE.MathUtils.smoothstep(f.alt, 1500, 5000);
      set(this.runway, this.distance, lift, vis);
      set(this.approach, 0, lift, 0);
    }

    // 云：在云层里时相机周围全是云粒子，自然起雾
    // 从地面看云底要很淡，不然像一层噪点；穿云时最浓；云上面看是一片铺开的云海
    const inCloud = 1 - Math.min(1, Math.abs(f.alt - 7500) / 2600);
    const below = f.alt < 6000 ? THREE.MathUtils.smoothstep(f.alt, 2500, 6000) * 0.12 : 0.14;
    set(this.clouds, this.distance * 0.9, alt, below + inCloud * 0.22);

    set(this.stars, 0, 0, 0.25 + high * 0.75);
    (this.moon.material as THREE.SpriteMaterial).opacity = 0.75 + high * 0.25;
    this.sky.material.uniforms.uHigh.value = high;

    // 姿态 + 跑道颠簸 + 接地冲击
    const rumble = f.alt < 30 ? Math.min(1, f.speed / 160) * 0.004 : 0;
    const shake = rumble + f.shake * 0.05 + (inCloud > 0.5 ? 0.0012 : 0);
    const cam = this.camera;
    cam.rotation.x = THREE.MathUtils.degToRad(f.pitch) + look.y * 0.08 + (Math.random() - 0.5) * shake;
    cam.rotation.y = look.x * -0.14 + (Math.random() - 0.5) * shake;
    cam.rotation.z = THREE.MathUtils.degToRad(-f.roll) + (Math.random() - 0.5) * shake * 0.6;
    const fov = 60 + Math.min(1, f.speed / 170) * 10 * (f.alt < 200 ? 1 : 0.4) + f.shake * 6;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    this.renderer.render(this.scene, cam);
  }
}
