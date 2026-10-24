/**
 * 爬塔页的小音效，全部现场合成，没有音频文件，也没有背景音乐。
 * 开关和另外两种风格共用 localStorage 的 wc-sound，默认开。
 * 浏览器要求先有一次点击或按键才能出声，所以第一次交互时才建 AudioContext。
 */
export class Sfx {
  on: boolean;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private lastHover = 0;
  private fireNodes: { src: AudioBufferSourceNode; gain: GainNode; timer: number } | null = null;

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('wc-sound');
    } catch {
      /* 隐私模式 */
    }
    this.on = saved !== 'off';
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
    const unlock = () => this.ensure();
    addEventListener('pointerdown', unlock, { once: true, capture: true });
    addEventListener('keydown', unlock, { once: true, capture: true });
  }

  toggle() {
    this.on = !this.on;
    try {
      localStorage.setItem('wc-sound', this.on ? 'on' : 'off');
    } catch {
      /* 隐私模式 */
    }
    if (!this.on) this.fire(false);
    else this.coin();
    return this.on;
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const n = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  private go() {
    if (!this.on) return null;
    const ctx = this.ensure();
    if (!ctx) return null;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  private env(g: GainNode, t: number, attack: number, peak: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private burst(ctx: AudioContext, t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, attack = 0.004) {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, attack, peak, decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + attack + decay + 0.05);
    return f;
  }

  private tone(ctx: AudioContext, t: number, type: OscillatorType, freq: number, peak: number, decay: number, to?: number) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = ctx.createGain();
    this.env(g, t, 0.005, peak, decay);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  /** 鼠标划过地图上的一层：很轻的木头声 */
  hover() {
    const now = performance.now();
    if (now - this.lastHover < 70) return;
    this.lastHover = now;
    const ctx = this.go();
    if (!ctx) return;
    this.tone(ctx, ctx.currentTime, 'triangle', 520 + Math.random() * 60, 0.05, 0.08, 380);
  }

  /** 翻牌、发牌：纸片擦过 */
  card() {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = this.burst(ctx, t, 'bandpass', 2600, 0.9, 0.22, 0.12, 0.01);
    f.frequency.exponentialRampToValueAtTime(5200, t + 0.12);
    this.burst(ctx, t + 0.09, 'highpass', 4000, 0.7, 0.08, 0.05);
  }

  /** 走到下一层：毛笔在羊皮纸上划一下 */
  ink() {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) this.burst(ctx, t + i * 0.05 + Math.random() * 0.02, 'bandpass', 1500 + i * 500, 2.4, 0.07, 0.07, 0.008);
  }

  /** 金币 */
  coin() {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'sine', 1975, 0.1, 0.35);
    this.tone(ctx, t + 0.07, 'sine', 2637, 0.09, 0.5);
    this.tone(ctx, t + 0.07, 'sine', 5274, 0.02, 0.2);
  }

  /** 打开一层：低低的一声鼓 */
  enter(elite = false) {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'sine', elite ? 120 : 150, 0.32, 0.5, 48);
    this.burst(ctx, t, 'lowpass', 900, 0.7, 0.12, 0.18);
    if (elite) this.tone(ctx, t + 0.12, 'sawtooth', 98, 0.04, 0.9, 92);
  }

  /** 宝箱：木头闷响 + 一串亮晶晶 */
  chest() {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'sine', 110, 0.3, 0.35, 60);
    const creak = this.burst(ctx, t, 'bandpass', 420, 8, 0.14, 0.4, 0.05);
    creak.frequency.exponentialRampToValueAtTime(260, t + 0.45);
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(ctx, t + 0.25 + i * 0.06, 'sine', 1046 * 2 ** (s / 12), 0.07, 0.6));
  }

  /** 出发：一声低鼓，带点回音 */
  embark() {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'sine', 96, 0.45, 1.1, 38);
    this.tone(ctx, t + 0.18, 'sine', 96, 0.18, 0.8, 40);
    this.burst(ctx, t, 'lowpass', 600, 0.5, 0.2, 0.5);
  }

  /** 可达鸭：锯齿波过两个共振峰，音高往下掉，像一声「嘎」 */
  quack() {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = 520 + Math.random() * 80;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.62, t + 0.2);
    const g = ctx.createGain();
    this.env(g, t, 0.012, 0.22, 0.2);
    for (const [f, q, v] of [
      [1150, 6, 1],
      [2400, 8, 0.5],
    ]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = v;
      o.connect(bp).connect(gg).connect(g);
    }
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  /** 选了一个选项 */
  pick() {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'triangle', 660, 0.08, 0.16);
    this.tone(ctx, t + 0.06, 'triangle', 990, 0.06, 0.22);
  }

  /** 篝火：持续的噼啪声，进篝火那层开，离开关 */
  fire(on: boolean) {
    if (!on) {
      if (!this.fireNodes || !this.ctx) return;
      const { src, gain, timer } = this.fireNodes;
      clearInterval(timer);
      gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
      src.stop(this.ctx.currentTime + 1.2);
      this.fireNodes = null;
      return;
    }
    const ctx = this.go();
    if (!ctx || this.fireNodes) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.4);
    src.connect(lp).connect(gain).connect(this.master);
    src.start();
    const timer = window.setInterval(() => {
      if (!this.ctx || document.hidden) return;
      const t = this.ctx.currentTime;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.burst(this.ctx, t + Math.random() * 0.18, 'highpass', 1800 + Math.random() * 2500, 0.8, 0.03 + Math.random() * 0.08, 0.02 + Math.random() * 0.03, 0.001);
    }, 190);
    this.fireNodes = { src, gain, timer };
  }
}
