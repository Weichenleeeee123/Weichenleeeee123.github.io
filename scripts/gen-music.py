"""
生成巡航段的背景音乐 → public/audio/jasmine.mp3

曲调：江苏民歌《茉莉花》（传统曲调，公有领域）。
编曲：全部由这段代码合成，往航空公司登机音乐的感觉靠——
  古筝弹主旋律（加法合成的拨弦，长音有揉弦），竖琴分解和弦，弦乐铺底，低音，大厅混响。
没有使用任何现成录音。

用法：python scripts/gen-music.py   （依赖 numpy、scipy、soundfile，PATH 里有 ffmpeg）
"""

import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100
EIGHTH = 60 / 66 / 2  # 四分音符 66 拍/分，舒缓
TONIC = 329.63  # 1 = E4
SCALE = {1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11}
OUT = Path(__file__).resolve().parent.parent / 'public' / 'audio' / 'jasmine.mp3'

# (简谱音级, 八度, 时值/八分音符)；每小节 4 个八分音符
A = [(3, 0, 2), (3, 0, 1), (5, 0, 1), (6, 0, 1), (1, 1, 1), (1, 1, 1), (6, 0, 1), (5, 0, 2), (5, 0, 1), (6, 0, 1), (5, 0, 4)]
B = [(5, 0, 2), (5, 0, 2), (5, 0, 2), (3, 0, 1), (5, 0, 1), (6, 0, 2), (6, 0, 2), (5, 0, 4)]
C = [(3, 0, 2), (2, 0, 1), (3, 0, 1), (5, 0, 1), (3, 0, 1), (2, 0, 2), (1, 0, 2), (1, 0, 1), (2, 0, 1), (1, 0, 4)]
D = [(3, 0, 1), (2, 0, 1), (1, 0, 1), (3, 0, 1), (2, 0, 3), (3, 0, 1), (5, 0, 2), (6, 0, 1), (1, 1, 1), (5, 0, 4)]
E = [(2, 0, 2), (3, 0, 1), (5, 0, 1), (2, 0, 1), (3, 0, 1), (1, 0, 1), (6, -1, 1), (5, -1, 4)]
F = [(6, -1, 1), (1, 0, 1), (2, 0, 1), (3, 0, 1), (1, 0, 1), (2, 0, 1), (1, 0, 1), (6, -1, 1), (5, -1, 8)]
MELODY = A + A + B + C + D + E + F

# 每小节的和弦（相对主音的半音）：I = E，vi = 升 C 小调，V = B
I, VI, V = [0, 4, 7], [9, 12, 16], [7, 11, 14]
CHORDS = [I, VI, V, I] * 2 + [I, I, VI, I] + [I, V, I, I] + [I, V, VI, I] + [V, I, I] + [VI, V, I, I]


def freq(semis):
    return TONIC * 2 ** (semis / 12)


def note_freq(deg, octv):
    return freq(SCALE[deg] + 12 * octv)


def env_adsr(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def guzheng(f, dur, rng, vibrato=False):
    """拨弦：高次谐波衰减更快，带一点非谐性和拨弦噪声；长音加揉弦"""
    n = int((dur + 1.8) * SR)
    t = np.arange(n) / SR
    pitch = np.ones(n)
    pitch *= 1 - 0.006 * np.exp(-t * 30)  # 起音时从略低处滑上来
    if vibrato:
        pitch *= 1 + 0.0055 * np.sin(2 * np.pi * 5.3 * t) * np.clip((t - 0.35) * 2, 0, 1)
    phase = 2 * np.pi * f * np.cumsum(pitch) / SR
    y = np.zeros(n)
    for k in range(1, 15):
        amp = abs(np.sin(np.pi * k * 0.17)) / k ** 1.05
        inh = np.sqrt(1 + 0.00035 * k * k)
        y += amp * np.exp(-t * (1.1 + 0.85 * k)) * np.sin(k * inh * phase)
    click = rng.standard_normal(int(0.012 * SR)) * np.exp(-np.linspace(0, 6, int(0.012 * SR)))
    sos = signal.butter(2, 2500, 'highpass', fs=SR, output='sos')
    y[: len(click)] += signal.sosfilt(sos, click) * 0.25
    y *= env_adsr(n, 0.002, 0.25)
    return y


def harp(f):
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    y = sum(np.exp(-t * (1.6 + 0.6 * k)) * np.sin(2 * np.pi * f * k * t) / k ** 2 for k in range(1, 7))
    return y * env_adsr(n, 0.003, 0.3)


def strings(f, dur):
    n = int((dur + 0.9) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for cents in (-4, 4):
        ff = f * 2 ** (cents / 1200)
        for k in range(1, 9):
            y += np.sin(2 * np.pi * ff * k * t + k) / k ** 1.4
    return y * env_adsr(n, 0.7, 0.9)


def bass(f, dur):
    n = int((dur + 0.8) * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t)
    return y * np.exp(-t * 0.9) * env_adsr(n, 0.02, 0.6)


def place(buf, y, start):
    i = int(start * SR)
    j = min(len(buf), i + len(y))
    buf[i:j] += y[: j - i]


def reverb(x, rng, seconds=2.6):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = []
    for _ in range(2):  # 左右声道各一条不同的冲激响应，听起来更宽
        ir = rng.standard_normal(n) * np.exp(-t * 3.2)
        sos = signal.butter(2, 4500, 'lowpass', fs=SR, output='sos')
        ir = signal.sosfilt(sos, ir)
        ir[: int(0.012 * SR)] = 0  # 预延迟
        ir /= np.sqrt(np.sum(ir ** 2))
        out.append(signal.fftconvolve(x, ir)[: len(x)])
    return np.stack(out, axis=1)


def main():
    rng = np.random.default_rng(1949)
    total_eighths = sum(d for _, _, d in MELODY)
    intro = 4 * EIGHTH
    length = intro + total_eighths * EIGHTH + 3.5
    mel = np.zeros(int(length * SR))
    acc = np.zeros_like(mel)

    t = intro
    for deg, octv, d in MELODY:
        place(mel, guzheng(note_freq(deg, octv), d * EIGHTH, rng, vibrato=d >= 3), t)
        t += d * EIGHTH

    # 伴奏：前奏一小节也铺和弦
    bars = [I] + CHORDS
    for b, chord in enumerate(bars):
        start = b * 4 * EIGHTH
        bar_len = 4 * EIGHTH
        for s in chord:
            place(acc, strings(freq(s - 12), bar_len) * 0.18, start)
        place(acc, bass(freq(chord[0] - 24), bar_len) * 0.35, start)
        for i, s in enumerate([chord[0] - 12, chord[2] - 12, chord[0], chord[1]]):
            place(acc, harp(freq(s)) * 0.28, start + i * EIGHTH)

    dry = mel / np.max(np.abs(mel)) + acc / np.max(np.abs(acc)) * 0.55
    wet = reverb(dry, rng)
    mix = np.stack([dry, dry], axis=1) * 0.75 + wet * 0.55
    fade = int(0.8 * SR)
    mix[:fade] *= np.linspace(0, 1, fade)[:, None]
    mix[-int(2.5 * SR):] *= np.linspace(1, 0, int(2.5 * SR))[:, None]
    mix = mix / np.max(np.abs(mix)) * 0.89

    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / 'm.wav'
        sf.write(wav, mix.astype(np.float32), SR)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-b:a', '96k', str(OUT)], check=True)
    print(f'{OUT.name}: {length:.1f}s, {OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
