/*
 * 驾驶舱声音。分两类：
 *
 * 1. 语音：预先用神经网络 TTS 生成、再按「出声设备」处理过的 mp3（scripts/gen-voices.py）。
 *    副驾驶走耳机内话，GPWS 从驾驶舱小喇叭出来，塔台走 VHF 无线电。
 *    同一个频道里新的一句会打断上一句，跟真实驾驶舱一样。
 *
 * 2. 音效：全部现场合成，按层叠起来——
 *    轰鸣   粉红噪声 → 低通，截止频率随 N1 升高，并带两路慢速随机起伏（发动机在「呼吸」）
 *    啸叫   三个不成整数倍的正弦泛音，启动时从低到高爬升，带轻微颤动
 *    核心   一路很低的正弦，给声音一点「分量」
 *    空调   驾驶舱一直有的底噪
 *    风噪   带通噪声，随空速平方变大
 *    跑道   压过道面接缝的「咔噔」，间隔随地速变短
 *    其余   开关的机械咔哒、收轮闷响、接地的轮胎尖啸、无线电调台的沙沙声
 */

export type Clip =
  | 'pm_thrust_set' | 'pm_80' | 'pm_v1' | 'pm_rotate' | 'pm_positive' | 'pm_gear_up' | 'pm_60'
  | 'gpws_2500' | 'gpws_1000' | 'gpws_500' | 'gpws_minimums' | 'gpws_100'
  | 'gpws_50' | 'gpws_40' | 'gpws_30' | 'gpws_20' | 'gpws_10'
  | 'atc_takeoff' | 'atc_climb' | 'atc_land' | 'atc_welcome';

const CLIPS: Clip[] = [
  'pm_thrust_set', 'pm_80', 'pm_v1', 'pm_rotate', 'pm_positive', 'pm_gear_up', 'pm_60',
  'gpws_2500', 'gpws_1000', 'gpws_500', 'gpws_minimums', 'gpws_100',
  'gpws_50', 'gpws_40', 'gpws_30', 'gpws_20', 'gpws_10',
  'atc_takeoff', 'atc_climb', 'atc_land', 'atc_welcome',
];

const VOLUME = 0.6;

export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private engine?: GainNode;
  private sfx?: GainNode;
  private voiceBus?: GainNode;

  private roarLp?: BiquadFilterNode;
  private roar?: GainNode;
  private whine?: GainNode;
  private whineOsc: OscillatorNode[] = [];
  private core?: OscillatorNode;
  private coreGain?: GainNode;
  private packs?: GainNode;
  private wind?: GainNode;
  private windBp?: BiquadFilterNode;
  private pink?: AudioBuffer;
  private white?: AudioBuffer;

  private clips = new Map<Clip, AudioBuffer>();
  private channels = new Map<string, AudioBufferSourceNode>();
  private nextJoint = 0;
  muted: boolean;

  constructor() {
    this.muted = localStorage.getItem('sound') === 'off';
  }

  start() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;

    // 总线：发动机、音效、语音分开调，最后过一个压缩器防爆音
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : VOLUME;
    this.master.connect(comp).connect(ctx.destination);
    this.engine = this.bus(0.9);
    this.sfx = this.bus(0.8);
    this.voiceBus = this.bus(1);

    this.pink = this.noiseBuffer(ctx, 'pink', 4);
    this.white = this.noiseBuffer(ctx, 'white', 2);

    // 轰鸣
    this.roarLp = ctx.createBiquadFilter();
    this.roarLp.type = 'lowpass';
    this.roarLp.Q.value = 0.5;
    this.roarLp.frequency.value = 150;
    this.roar = ctx.createGain();
    this.roar.gain.value = 0;
    this.loop(this.pink).connect(this.roarLp).connect(this.roar).connect(this.engine);

    // 啸叫：三个泛音，比例故意不整，听起来才像风扇叶片而不是合成器
    const whineLp = ctx.createBiquadFilter();
    whineLp.type = 'lowpass';
    whineLp.frequency.value = 4200;
    this.whine = ctx.createGain();
    this.whine.gain.value = 0;
    whineLp.connect(this.whine).connect(this.engine);
    for (const [ratio, amp] of [[1, 1], [2.03, 0.45], [3.51, 0.18]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 200 * ratio;
      g.gain.value = amp;
      o.connect(g).connect(whineLp);
      o.start();
      this.whineOsc.push(o);
    }

    // 核心低频
    this.core = ctx.createOscillator();
    this.core.type = 'triangle';
    this.core.frequency.value = 40;
    this.coreGain = ctx.createGain();
    this.coreGain.gain.value = 0;
    this.core.connect(this.coreGain).connect(this.engine);
    this.core.start();

    // 空调底噪
    const packsBp = ctx.createBiquadFilter();
    packsBp.type = 'bandpass';
    packsBp.frequency.value = 2600;
    packsBp.Q.value = 0.35;
    this.packs = ctx.createGain();
    this.packs.gain.value = 0.018;
    this.loop(this.white).connect(packsBp).connect(this.packs).connect(this.engine);

    // 风噪
    this.windBp = ctx.createBiquadFilter();
    this.windBp.type = 'bandpass';
    this.windBp.Q.value = 0.6;
    this.windBp.frequency.value = 500;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    this.loop(this.pink).connect(this.windBp).connect(this.wind).connect(this.engine);

    void this.loadClips();
  }

  private bus(gain: number) {
    const g = this.ctx!.createGain();
    g.gain.value = gain;
    g.connect(this.master!);
    return g;
  }

  private noiseBuffer(ctx: AudioContext, kind: 'pink' | 'white', seconds: number) {
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Paul Kellet 的粉红噪声近似
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') {
        d[i] = w * 0.5;
        continue;
      }
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buf;
  }

  private loop(buf: AudioBuffer) {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // 每条循环从随机位置开始，几层噪声不会对齐
    src.start(0, Math.random() * buf.duration);
    return src;
  }

  private async loadClips() {
    const ctx = this.ctx!;
    await Promise.all(
      CLIPS.map(async (name) => {
        try {
          const res = await fetch(`/audio/${name}.mp3`);
          if (!res.ok) return;
          this.clips.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* 少一句语音不影响别的 */
        }
      }),
    );
  }

  /** 每帧调用 */
  update(n1: number, speed: number, alt: number) {
    const ctx = this.ctx;
    if (!ctx || !this.roar || !this.roarLp || !this.whine || !this.coreGain || !this.core || !this.wind || !this.windBp) return;
    const t = ctx.currentTime;
    const spool = Math.max(0, Math.min(1.1, (n1 - 2) / 90)); // 0 = 停车，1 ≈ 起飞推力
    const breathe = 1 + 0.09 * Math.sin(t * 0.73) + 0.05 * Math.sin(t * 1.91 + 1.3);

    this.roar.gain.setTargetAtTime(spool * spool * 0.55 + spool * 0.12, t, 0.25);
    this.roarLp.frequency.setTargetAtTime((160 + spool * 1250) * breathe, t, 0.3);

    // 啸叫：启动阶段最明显，推力上去后被轰鸣盖住
    const fan = 180 + spool * 2300;
    const jitter = 1 + 0.004 * Math.sin(t * 7.3) + 0.003 * Math.sin(t * 13.1);
    this.whineOsc.forEach((o, i) => o.frequency.setTargetAtTime(fan * [1, 2.03, 3.51][i] * jitter, t, 0.35));
    const startup = n1 < 30 ? Math.min(1, n1 / 18) : Math.max(0.35, 1 - (n1 - 30) / 80);
    this.whine.gain.setTargetAtTime(0.045 * startup * Math.min(1, spool * 3), t, 0.3);

    this.core.frequency.setTargetAtTime(32 + spool * 38, t, 0.4);
    this.coreGain.gain.setTargetAtTime(spool * 0.09, t, 0.4);

    const v = Math.min(1, speed / 320);
    this.wind.gain.setTargetAtTime(v * v * 0.22, t, 0.5);
    this.windBp.frequency.setTargetAtTime(380 + speed * 2.4, t, 0.5);

    // 跑道接缝：大约每 30 米一道，地速越快越密
    if (alt < 1 && speed > 18) {
      if (t >= this.nextJoint) {
        this.joint(Math.min(1, speed / 150));
        const metersPerSec = speed * 0.514;
        this.nextJoint = t + 30 / metersPerSec + Math.random() * 0.03;
      }
    } else this.nextJoint = t;
  }

  private burst(ms: number, type: BiquadFilterType, freq: number, q: number, gain: number, when = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.white!;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    src.connect(f).connect(g).connect(this.sfx!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + ms / 1000 + 0.02);
  }

  private thud(from: number, to: number, ms: number, gain: number, when = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(this.sfx!);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  }

  private get live() {
    return !!this.ctx && !!this.sfx && !this.muted;
  }

  private joint(k: number) {
    if (!this.live) return;
    // 前轮和主轮先后压过同一道缝：「咔—噔」
    this.thud(95, 45, 90, 0.16 * k);
    this.burst(40, 'lowpass', 600, 0.7, 0.12 * k);
    this.thud(80, 40, 110, 0.12 * k, 0.07);
  }

  /** 开关、按键、旋钮：机械的咔哒。freq 越高声音越「脆」 */
  click(freq = 1500) {
    if (!this.live) return;
    const tone = Math.max(800, Math.min(4500, freq * 1.6));
    this.burst(14, 'bandpass', tone, 2.5, 0.35);
    this.thud(220, 120, 30, 0.12);
  }

  /** 收起落架：液压的闷响加一点金属声 */
  gearClunk() {
    if (!this.live) return;
    this.thud(70, 35, 380, 0.3);
    this.burst(260, 'bandpass', 900, 1.2, 0.12, 0.05);
    this.thud(110, 50, 160, 0.22, 0.55);
  }

  /** 接地：主轮重重一下，加轮胎的尖啸 */
  thump() {
    if (!this.live) return;
    this.thud(85, 28, 520, 0.9);
    this.burst(220, 'lowpass', 400, 0.8, 0.5);
    this.burst(180, 'bandpass', 2400, 3, 0.25, 0.02);
    this.burst(150, 'bandpass', 2900, 4, 0.18, 0.11);
  }

  /** 无线电调台的沙沙声，尾巴上一声静噪 */
  static(ms = 220) {
    if (!this.live) return;
    this.burst(ms, 'bandpass', 1600, 0.5, 0.22);
    this.burst(60, 'highpass', 3000, 0.7, 0.12, ms / 1000);
  }

  /** 播一句语音。同一频道（pm/gpws 共用驾驶舱，atc 单独）里新的一句打断旧的 */
  voice(name: Clip) {
    if (!this.live || !this.voiceBus) return;
    const buf = this.clips.get(name);
    if (!buf) return;
    const channel = name.startsWith('atc') ? 'atc' : 'cockpit';
    this.channels.get(channel)?.stop();
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    const g = this.ctx!.createGain();
    g.gain.value = name.startsWith('atc') ? 0.75 : 1;
    src.connect(g).connect(this.voiceBus);
    src.start();
    this.channels.set(channel, src);
    src.onended = () => {
      if (this.channels.get(channel) === src) this.channels.delete(channel);
    };
  }

  toggle() {
    this.muted = !this.muted;
    localStorage.setItem('sound', this.muted ? 'off' : 'on');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : VOLUME, this.ctx.currentTime, 0.1);
    if (this.muted) for (const s of this.channels.values()) s.stop();
    return this.muted;
  }
}
