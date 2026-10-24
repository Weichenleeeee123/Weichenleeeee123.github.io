/**
 * 房间里的小音效，全部现场合成，没有音频文件。
 * 浏览器要求先有一次点击或按键才能出声，所以第一次交互时才建 AudioContext。
 * 开关记在 localStorage（wc-sound），默认开。
 */
export class Sfx {
  on: boolean;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private verb!: ConvolverNode;
  private noise!: AudioBuffer;
  private lastTick = 0;
  /** 唱机：背景音乐。默认开，记在 wc-music */
  musicOn: boolean;
  onMusic?: (playing: boolean, startedAt: number) => void;
  private musicGain: GainNode | null = null;
  private musicSrc: AudioBufferSourceNode | null = null;
  private musicBuf: AudioBuffer | null = null;
  private musicLoading = false;
  private ducked = false;
  musicStartedAt = 0;

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('wc-sound');
    } catch {
      /* 隐私模式 */
    }
    this.on = saved !== 'off';
    let m: string | null = null;
    try {
      m = localStorage.getItem('wc-music');
    } catch {
      /* 隐私模式 */
    }
    this.musicOn = m !== 'off';
    // 切到别的标签页就停住，回来接着放
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
    if (this.on) {
      this.tick(1.3);
      this.startMusic();
    } else this.stopMusic(0.4);
    return this.on;
  }

  get playing() {
    return !!this.musicSrc;
  }

  /** 唱机上点一下：放 / 停 */
  toggleMusic() {
    this.musicOn = !this.playing;
    try {
      localStorage.setItem('wc-music', this.musicOn ? 'on' : 'off');
    } catch {
      /* 隐私模式 */
    }
    if (this.musicOn) {
      if (!this.on) this.toggle();
      this.ensure();
      this.startMusic();
    } else this.stopMusic(0.9);
    return this.musicOn;
  }

  /** 打开面板时音乐稍微让一让 */
  duck(on: boolean) {
    this.ducked = on;
    this.rampMusic(this.musicLevel(), 0.6);
  }

  fadeOutMusic() {
    this.stopMusic(1.4);
  }

  private musicLevel() {
    return this.ducked ? 0.22 : 0.36;
  }

  private rampMusic(to: number, sec: number) {
    if (!this.ctx || !this.musicGain) return;
    const g = this.musicGain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + sec);
  }

  private async startMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.on || !this.musicOn || this.musicSrc) return;
    if (!this.musicBuf) {
      if (this.musicLoading) return;
      this.musicLoading = true;
      try {
        const res = await fetch('/audio/room-lofi.mp3');
        this.musicBuf = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        this.musicLoading = false;
        return;
      }
      this.musicLoading = false;
      if (!this.on || !this.musicOn || this.musicSrc) return;
    }
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.musicBuf;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.musicSrc = src;
    this.musicStartedAt = performance.now();
    this.rampMusic(this.musicLevel(), 2.5);
    this.onMusic?.(true, this.musicStartedAt);
  }

  private stopMusic(fade: number) {
    const src = this.musicSrc;
    if (!src || !this.ctx) return;
    this.musicSrc = null;
    this.rampMusic(0, fade);
    src.stop(this.ctx.currentTime + fade + 0.05);
    this.onMusic?.(false, 0);
  }

  private ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(comp).connect(ctx.destination);

      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // 小房间的混响：1.1 秒衰减的立体声噪声
      const irLen = Math.floor(ctx.sampleRate * 1.1);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
      }
      this.verb = ctx.createConvolver();
      this.verb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.32;
      this.verb.connect(wet).connect(this.master);
      // 第一次点到页面就把唱片放起来（声音和音乐都没关的话）
      this.startMusic();
      return ctx;
    } catch {
      return null;
    }
  }

  /** 能出声就返回 AudioContext，否则 null */
  private go() {
    if (!this.on || !this.ctx) return null;
    if (this.ctx.state !== 'running') {
      this.ctx.resume();
      return null;
    }
    return this.ctx;
  }

  private out(node: AudioNode, wet = 0.2) {
    node.connect(this.master);
    if (wet > 0 && this.ctx) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.verb);
    }
  }

  private env(g: GainNode, t: number, attack: number, peak: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseThrough(ctx: AudioContext, filter: BiquadFilterNode, t: number, dur: number) {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.connect(filter);
    src.start(t, Math.random() * 1.5, dur + 0.05);
    return src;
  }

  /** 悬停：很轻的一下「嗒」 */
  tick(pitch = 1) {
    const ctx = this.go();
    if (!ctx) return;
    if (ctx.currentTime - this.lastTick < 0.05) return;
    this.lastTick = ctx.currentTime;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2600 * pitch;
    f.Q.value = 6;
    const g = ctx.createGain();
    this.env(g, t, 0.002, 0.09, 0.035);
    f.connect(g);
    this.out(g, 0.08);
    this.noiseThrough(ctx, f, t, 0.05);
  }

  /** 抽屉拉开 / 关上：一阵风 + 纸张摩擦 */
  swish(open = true) {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(open ? 320 : 1700, t);
    f.frequency.exponentialRampToValueAtTime(open ? 1700 : 320, t + 0.38);
    const g = ctx.createGain();
    this.env(g, t, 0.09, 0.16, 0.34);
    f.connect(g);
    this.out(g, 0.25);
    this.noiseThrough(ctx, f, t, 0.5);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const g2 = ctx.createGain();
    this.env(g2, t + 0.06, 0.03, 0.035, 0.16);
    hp.connect(g2);
    this.out(g2, 0.1);
    this.noiseThrough(ctx, hp, t + 0.06, 0.25);
  }

  /** 台灯开关：两下机械「咔哒」 */
  lamp() {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [dt, freq, peak] of [
      [0, 1900, 0.32],
      [0.065, 1300, 0.2],
    ]) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 3;
      const g = ctx.createGain();
      this.env(g, t + dt, 0.001, peak, 0.04);
      f.connect(g);
      this.out(g, 0.15);
      this.noiseThrough(ctx, f, t + dt, 0.06);
    }
  }

  /** 可达鸭：鼻音很重的两声「嘎嘎」 */
  quack() {
    const ctx = this.go();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (const [dt, f0] of [
      [0, 560],
      [0.17, 500],
    ]) {
      const t = t0 + dt;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.68, t + 0.13);
      const vib = ctx.createOscillator();
      vib.frequency.value = 38;
      const vibG = ctx.createGain();
      vibG.gain.value = 18;
      vib.connect(vibG).connect(osc.frequency);
      // 两个共振峰，让它像嘴里发出来的
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 1150;
      f1.Q.value = 4;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'peaking';
      f2.frequency.value = 2400;
      f2.gain.value = 8;
      f2.Q.value = 3;
      const g = ctx.createGain();
      this.env(g, t, 0.012, 0.5, 0.12);
      osc.connect(f1).connect(f2).connect(g);
      this.out(g, 0.15);
      osc.start(t);
      vib.start(t);
      osc.stop(t + 0.2);
      vib.stop(t + 0.2);
    }
  }

  /** 天亮 / 天黑：两个音，天亮往上走、天黑往下走 */
  chime(night: boolean) {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = night ? [659.25, 493.88] : [493.88, 659.25];
    notes.forEach((freq, i) => {
      const s = t + i * 0.16;
      for (const [mul, amp] of [
        [1, 0.12],
        [2.01, 0.03],
        [3.98, 0.01],
      ]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * mul;
        const g = ctx.createGain();
        this.env(g, s, 0.006, amp, 1.3);
        o.connect(g);
        this.out(g, 0.5);
        o.start(s);
        o.stop(s + 1.4);
      }
    });
  }

  /** 摸绿植：叶子沙沙几下 */
  rustle() {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const s = t + i * 0.07 + Math.random() * 0.03;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2200 + Math.random() * 1500;
      const g = ctx.createGain();
      this.env(g, s, 0.008, 0.06 * (1 - i / 7), 0.06);
      f.connect(g);
      this.out(g, 0.1);
      this.noiseThrough(ctx, f, s, 0.09);
    }
  }

  /** 椅子转一圈：低沉的一阵风 */
  spin() {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    const g = ctx.createGain();
    this.env(g, t, 0.15, 0.12, 1.1);
    f.connect(g);
    this.out(g, 0.15);
    this.noiseThrough(ctx, f, t, 1.4);
  }

  /** 起飞：喷气声越来越高越来越响，然后远去 */
  takeoff() {
    const ctx = this.go();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(220, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 1.3);
    f.frequency.exponentialRampToValueAtTime(900, t + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    f.connect(g);
    this.out(g, 0.3);
    this.noiseThrough(ctx, f, t, 2.4);

    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 1.4);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.035, t + 0.9);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
    o.connect(og);
    this.out(og, 0.2);
    o.start(t);
    o.stop(t + 2.1);
  }
}
