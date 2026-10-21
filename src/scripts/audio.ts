/*
 * 全部声音都是现场合成的，不下载任何音频文件：
 *   发动机 = 低通的棕噪声（轰鸣）+ 两个随 N1 升高的锯齿波（风扇啸叫）
 *   风噪   = 高通噪声，跟着空速变大
 *   呼叫   = 浏览器自带的语音合成，压低音调，像近地警告系统
 * 浏览器要求先有一次点击才能出声，所以在「开机」按钮里 start()。
 */
export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private rumble?: GainNode;
  private whine?: GainNode;
  private wind?: GainNode;
  private oscA?: OscillatorNode;
  private oscB?: OscillatorNode;
  private lowpass?: BiquadFilterNode;
  private voice?: SpeechSynthesisVoice;
  muted: boolean;

  constructor() {
    this.muted = localStorage.getItem('sound') === 'off';
  }

  start() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    const noise = this.noise(ctx, true);
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 180;
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0;
    noise.connect(this.lowpass).connect(this.rumble).connect(this.master);

    this.whine = ctx.createGain();
    this.whine.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.value = 1200;
    this.oscA = ctx.createOscillator();
    this.oscB = ctx.createOscillator();
    this.oscA.type = this.oscB.type = 'sawtooth';
    this.oscA.connect(bp);
    this.oscB.connect(bp);
    bp.connect(this.whine).connect(this.master);
    this.oscA.start();
    this.oscB.start();

    const air = this.noise(ctx, false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 900;
    hp.Q.value = 0.4;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    air.connect(hp).connect(this.wind).connect(this.master);

    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find((v) => /en-US/i.test(v.lang) && /male|david|guy|daniel/i.test(v.name)) ?? vs.find((v) => /^en/i.test(v.lang));
    };
    pick();
    speechSynthesis.onvoiceschanged = pick;
  }

  private noise(ctx: AudioContext, brown: boolean) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w * 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  /** 每帧调用 */
  update(n1: number, speed: number, inside: number) {
    if (!this.ctx || !this.rumble || !this.whine || !this.wind || !this.oscA || !this.oscB || !this.lowpass) return;
    const t = this.ctx.currentTime;
    const spool = Math.max(0, (n1 - 18) / 80);
    this.rumble.gain.setTargetAtTime(0.15 + spool * 0.6, t, 0.2);
    this.lowpass.frequency.setTargetAtTime(140 + spool * 380, t, 0.2);
    this.whine.gain.setTargetAtTime(spool * 0.05 * inside, t, 0.3);
    this.oscA.frequency.setTargetAtTime(380 + spool * 1500, t, 0.3);
    this.oscB.frequency.setTargetAtTime(384 + spool * 1510, t, 0.3);
    this.wind.gain.setTargetAtTime(Math.min(1, speed / 300) * 0.14, t, 0.4);
  }

  /** 无线电调台的沙沙声 */
  static(ms = 220) {
    if (!this.ctx || !this.master || this.muted) return;
    const src = this.noise(this.ctx, false);
    const g = this.ctx.createGain();
    g.gain.value = 0.25;
    src.connect(g).connect(this.master);
    src.stop(this.ctx.currentTime + ms / 1000);
  }

  /** 开关、按键的「咔哒」 */
  click(freq = 1800) {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 0.06);
  }

  /** 接地那一下 */
  thump() {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(90, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);
    g.gain.setValueAtTime(0.9, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  }

  say(text: string, rate = 1.05) {
    if (this.muted || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = 'en-US';
    u.rate = rate;
    u.pitch = 0.6;
    u.volume = 0.9;
    speechSynthesis.speak(u);
  }

  toggle() {
    this.muted = !this.muted;
    localStorage.setItem('sound', this.muted ? 'off' : 'on');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.1);
    if (this.muted) speechSynthesis.cancel();
    return this.muted;
  }
}
