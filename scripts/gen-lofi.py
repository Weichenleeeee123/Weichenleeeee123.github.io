"""
生成房间里唱机放的背景音乐 → public/audio/room-lofi.mp3

一首原创的 lo-fi 小循环，全部由这段代码合成，没有任何采样或现成录音：
  电钢琴（FM 合成）弹七和弦、九和弦，低音提琴一样的正弦低音，
  带摇摆的轻鼓（底鼓、刷子一样的军鼓、踩镲），黑胶底噪，整体压暗一点。
首尾无缝：混响尾巴折回开头，循环播放听不出接缝。

76 拍/分，8 小节和弦走 3 遍（第二、三遍加旋律），约 76 秒。
用法：python scripts/gen-lofi.py   （依赖 numpy、scipy、soundfile，PATH 里有 ffmpeg）
"""

import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100
BPM = 76
BEAT = 60 / BPM
BAR = 4 * BEAT
SWING = 0.17  # 反拍八分音符往后推的比例（拍长的倍数）
OUT = Path(__file__).resolve().parent.parent / 'public' / 'audio' / 'room-lofi.mp3'
rng = np.random.default_rng(2026)


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


# 和弦（MIDI 音高）和低音根音：Fmaj9 Em9 Dm9 Cmaj9 | B♭maj9 Am7 Gm9 C7sus4
CHORDS = [
    ([57, 60, 64, 67], 41),
    ([55, 59, 62, 66], 40),
    ([53, 57, 60, 64], 38),
    ([52, 55, 59, 62], 36),
    ([57, 60, 62, 65], 34),
    ([57, 60, 64, 67], 33),
    ([58, 62, 65, 69], 31),
    ([55, 58, 60, 65], 36),
]

# 旋律：F 大调五声音阶，(小节内第几拍, MIDI, 拍数)；None 小节不弹
MELODY_A = [
    [(0.5, 76, 1), (1.5, 74, 0.5), (2, 72, 1.5)],
    [(1, 74, 1), (2.5, 72, 1.5)],
    [(0.5, 69, 0.5), (1, 72, 1), (2, 74, 2)],
    None,
    [(0.5, 77, 1), (1.5, 76, 0.5), (2, 74, 1), (3, 72, 1)],
    [(1, 72, 2), (3, 69, 1)],
    [(0, 70, 1), (1, 72, 1), (2.5, 74, 1.5)],
    [(1.5, 72, 2.5)],
]
MELODY_B = [
    [(0, 81, 1.5), (2, 79, 0.5), (2.5, 77, 1.5)],
    None,
    [(0.5, 76, 0.5), (1, 77, 0.5), (1.5, 76, 1), (2.5, 74, 1.5)],
    [(1, 72, 3)],
    [(0.5, 74, 1), (1.5, 77, 1), (3, 81, 1)],
    [(0, 79, 2), (2.5, 76, 1.5)],
    [(1, 74, 1), (2, 72, 2)],
    None,
]


def env_ar(n, attack, release):
    e = np.ones(n)
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    return e


def rhodes(f, dur, vel):
    """电钢琴：FM 合成，调制指数随时间衰减，再加一点「叮」的音叉泛音"""
    n = int((dur + 1.6) * SR)
    t = np.arange(n) / SR
    index = 1.6 * np.exp(-t * 4.5) * vel + 0.25
    y = np.sin(2 * np.pi * f * t + index * np.sin(2 * np.pi * f * t))
    y += 0.1 * vel * np.sin(2 * np.pi * f * 7.02 * t) * np.exp(-t * 14)
    decay = 1.3 + 0.6 * (f / 400)
    amp = np.exp(-t * decay) * (1 - np.exp(-t * 400))
    # 松开键以后很快收掉
    hold = int(dur * SR)
    if hold < n:
        amp[hold:] *= np.exp(-np.arange(n - hold) / SR * 7)
    return y * amp * vel


def pluck(f, dur):
    """旋律：柔和的钟琴 / 拨弦"""
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 6) + 0.12 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 9)
    return y * np.exp(-t * 2.2) * env_ar(n, 0.004, 0.3)


def bass(f, dur):
    n = int((dur + 0.2) * SR)
    t = np.arange(n) / SR
    y = np.tanh(1.6 * (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)))
    return y * np.exp(-t * 1.1) * env_ar(n, 0.012, 0.12)


def kick():
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t * 28)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.15
    return np.tanh(1.4 * (y + click))


def snare():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    sos = signal.butter(2, [1200, 5200], 'bandpass', fs=SR, output='sos')
    noise = signal.sosfilt(sos, rng.standard_normal(n)) * np.exp(-t * 16)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    return (noise * 0.8 + body) * 0.6


def hat(open_=False):
    n = int((0.22 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    sos = signal.butter(4, 7000, 'highpass', fs=SR, output='sos')
    return signal.sosfilt(sos, rng.standard_normal(n)) * np.exp(-t * (14 if open_ else 70))


def place(buf, y, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i < 0:
        return
    j = min(buf.shape[0], i + len(y))
    if j <= i:
        return
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    buf[i:j, 0] += y[: j - i] * gain * l
    buf[i:j, 1] += y[: j - i] * gain * r


def swung(beat_pos):
    """八分音符的反拍往后推一点，有摇摆感"""
    whole = np.floor(beat_pos)
    frac = beat_pos - whole
    return whole + (frac + SWING if abs(frac - 0.5) < 1e-6 else frac)


def reverb(x, seconds=2.2):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros((len(x), 2))
    for c in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * 3.4)
        sos = signal.butter(2, 3800, 'lowpass', fs=SR, output='sos')
        ir = signal.sosfilt(sos, ir)
        ir[: int(0.015 * SR)] = 0
        ir /= np.sqrt(np.sum(ir**2))
        out[:, c] = signal.fftconvolve(x[:, c], ir)[: len(x)]
    return out


def main():
    passes = 3
    bars = len(CHORDS) * passes
    loop = bars * BAR
    tail = 3.5
    total = int((loop + tail) * SR)
    keys = np.zeros((total, 2))
    lead = np.zeros((total, 2))
    low = np.zeros((total, 2))
    drums = np.zeros((total, 2))

    for b in range(bars):
        t0 = b * BAR
        chord, root = CHORDS[b % len(CHORDS)]
        p = b // len(CHORDS)
        # 电钢琴：第一拍长按，第二拍半偶尔再轻碰一下；音与音之间错开一点，像手指按下去
        hits = [(0.0, 3.4, 0.8)]
        if b % 2 == 1 or p == 2:
            hits.append((2.5, 1.3, 0.45))
        for beat, dur, vel in hits:
            for k, m in enumerate(chord):
                v = vel * (0.85 + 0.25 * rng.random())
                place(keys, rhodes(hz(m), dur * BEAT, v), t0 + swung(beat) * BEAT + k * 0.012 + rng.random() * 0.006, 0.17, pan=(k - 1.5) * 0.25)
        # 低音
        place(low, bass(hz(root), 1.6 * BEAT), t0, 0.5)
        place(low, bass(hz(root + (7 if b % 4 != 3 else 12)), 0.8 * BEAT), t0 + swung(2.5) * BEAT, 0.34)
        if b % 4 == 3:
            place(low, bass(hz(root + 10), 0.5 * BEAT), t0 + swung(3.5) * BEAT, 0.28)

        # 鼓：第一遍前两小节只有踩镲，慢慢进来
        quiet = p == 0 and b < 2
        if not quiet:
            for beat in (0, 2.5 if b % 2 else 2):
                place(drums, kick(), t0 + swung(beat) * BEAT, 0.62)
            if b % 4 == 3:
                place(drums, kick(), t0 + swung(3.5) * BEAT, 0.4)
            for beat in (1, 3):
                place(drums, snare(), t0 + beat * BEAT + 0.012, 0.36, pan=0.1)
        for e in range(8):
            beat = e * 0.5
            vel = 0.16 if e % 2 == 0 else 0.1
            vel *= 0.8 + 0.4 * rng.random()
            open_ = e == 7 and b % 4 == 3
            place(drums, hat(open_), t0 + swung(beat) * BEAT, vel * (1.4 if open_ else 1), pan=-0.3)

        # 旋律：第二、三遍
        if p >= 1:
            phrase = (MELODY_A if p == 1 else MELODY_B)[b % len(CHORDS)]
            for beat, m, dur in phrase or []:
                place(lead, pluck(hz(m), dur * BEAT), t0 + swung(beat) * BEAT, 0.13, pan=0.2)

    # 电钢琴轻微的颤音（音量起伏）
    t = np.arange(total) / SR
    trem = 1 + 0.08 * np.sin(2 * np.pi * 4.2 * t)
    keys[:, 0] *= trem
    keys[:, 1] *= 2 - trem

    wet = reverb(keys * 0.8 + lead)
    mix = keys + lead * 0.9 + low + drums + wet * 0.35

    # 黑胶：低低的底噪 + 稀疏的噼啪声
    sos = signal.butter(2, [300, 6000], 'bandpass', fs=SR, output='sos')
    hiss = signal.sosfilt(sos, rng.standard_normal(total)) * 0.006
    crackle = np.zeros(total)
    for _ in range(int(loop * 9)):
        i = rng.integers(0, total - 200)
        crackle[i : i + 40] += rng.standard_normal(40) * np.exp(-np.arange(40) / 6) * rng.uniform(0.02, 0.09)
    mix += (hiss + crackle)[:, None]

    # 压暗、轻微饱和，像老唱片
    sos = signal.butter(2, 7200, 'lowpass', fs=SR, output='sos')
    mix = signal.sosfilt(sos, mix, axis=0)
    sos = signal.butter(1, 45, 'highpass', fs=SR, output='sos')
    mix = signal.sosfilt(sos, mix, axis=0)
    mix = np.tanh(mix * 1.3) / 1.3

    # 无缝循环：超出循环长度的尾巴加回开头
    n = int(loop * SR)
    out = mix[:n].copy()
    out[: total - n] += mix[n:]
    out = out / np.max(np.abs(out)) * 0.85

    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / 'lofi.wav'
        sf.write(wav, out.astype(np.float32), SR)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-b:a', '80k', str(OUT)], check=True)
    print(f'{OUT.name}: {loop:.1f}s, {OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
