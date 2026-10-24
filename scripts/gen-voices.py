"""
生成驾驶舱语音 → public/audio/*.mp3

用开源 TTS 模型 Kokoro（Apache-2.0）合成，再按「谁在说、从什么设备里出来」各做一层处理：
  pm    副驾驶，在耳机内话里说话：自然人声，去掉低频，轻微压缩
  gpws  近地警告系统，从驾驶舱小喇叭里放出来：窄频、喇叭共振、明显失真
  atc   塔台，走 VHF 无线电：更窄的频带、重压缩、底噪、按键和松键的「咔/嚓」

用法（模型文件不进仓库，放在别处）：
  python scripts/gen-voices.py --model D:/tts-work/models/kokoro-v1.0.int8.onnx \
                               --voices D:/tts-work/models/voices-v1.0.bin
依赖：kokoro-onnx、soundfile、scipy、numpy，以及 PATH 里的 ffmpeg
"""

import argparse
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

OUT = Path(__file__).resolve().parent.parent / 'public' / 'audio'

# 角色 → (Kokoro 音色, 语速)
ROLES = {
    'pm': ('am_michael', 1.05),
    'gpws': ('am_fenrir', 0.92),
    'atc': ('bm_george', 1.12),
}

LINES = {
    # 起飞：副驾驶报，机长回
    'pm_thrust_set': ('pm', 'Thrust set.'),
    'pm_80': ('pm', 'Eighty knots.'),
    'pm_v1': ('pm', 'Vee one.'),
    'pm_rotate': ('pm', 'Rotate.'),
    'pm_positive': ('pm', 'Positive rate.'),
    'pm_gear_up': ('pm', 'Gear up.'),
    'pm_60': ('pm', 'Sixty knots.'),
    # 落地：无线电高度自动报读
    'gpws_2500': ('gpws', 'Twenty five hundred.'),
    'gpws_1000': ('gpws', 'One thousand.'),
    'gpws_500': ('gpws', 'Five hundred.'),
    'gpws_minimums': ('gpws', 'Minimums.'),
    'gpws_100': ('gpws', 'One hundred.'),
    'gpws_50': ('gpws', 'Fifty.'),
    'gpws_40': ('gpws', 'Forty.'),
    'gpws_30': ('gpws', 'Thirty.'),
    'gpws_20': ('gpws', 'Twenty.'),
    'gpws_10': ('gpws', 'Ten.'),
    # 塔台和区调
    'atc_takeoff': ('atc', 'Way-chen seven three seven, Nanjing Tower, runway two four, wind two six zero at eight, cleared for takeoff.'),
    'atc_climb': ('atc', 'Way-chen seven three seven, Shanghai Control, climb and maintain flight level three five zero.'),
    'atc_land': ('atc', 'Way-chen seven three seven, Nanjing Tower, runway zero six, wind calm, cleared to land.'),
    'atc_welcome': ('atc', 'Way-chen seven three seven, welcome to Nanjing. Contact ground, one two one decimal niner. Good day.'),
}


def bandpass(x, sr, lo, hi, order=4):
    sos = signal.butter(order, [lo, hi], btype='bandpass', fs=sr, output='sos')
    return signal.sosfilt(sos, x)


def highpass(x, sr, f, order=2):
    sos = signal.butter(order, f, btype='highpass', fs=sr, output='sos')
    return signal.sosfilt(sos, x)


def lowpass(x, sr, f, order=4):
    sos = signal.butter(order, f, btype='lowpass', fs=sr, output='sos')
    return signal.sosfilt(sos, x)


def peak(x, sr, f, q, gain_db):
    """RBJ 峰值均衡：模拟喇叭的共振"""
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / sr
    alpha = np.sin(w) / (2 * q)
    b = [1 + alpha * a, -2 * np.cos(w), 1 - alpha * a]
    den = [1 + alpha / a, -2 * np.cos(w), 1 - alpha / a]
    return signal.lfilter(b, den, x)


def compress(x, drive):
    return np.tanh(x * drive) / np.tanh(drive)


def normalize(x, peak_db=-1.5):
    m = np.max(np.abs(x)) or 1
    return x / m * 10 ** (peak_db / 20)


def noise_burst(sr, ms, lo, hi, rng, decay=8.0):
    n = int(sr * ms / 1000)
    env = np.exp(-np.linspace(0, decay, n))
    return bandpass(rng.standard_normal(n), sr, lo, hi) * env


def process(role, x, sr, rng):
    x = x.astype(np.float64)
    x = x / (np.max(np.abs(x)) or 1)
    if role == 'pm':
        x = highpass(x, sr, 180)
        x = lowpass(x, sr, 6000)
        x = compress(x, 1.6)
        return normalize(x, -2.5)
    if role == 'gpws':
        x = bandpass(x, sr, 380, 3600)
        x = peak(x, sr, 1500, 1.4, 7)
        x = compress(x, 3.2)
        x = bandpass(x, sr, 300, 4200, order=2)
        return normalize(x, -2.0)
    # atc：语音在前后各留一点空，铺满无线电底噪
    pre, post = int(sr * 0.12), int(sr * 0.08)
    x = np.concatenate([np.zeros(pre), x, np.zeros(post)])
    x = bandpass(x, sr, 320, 2700)
    x = compress(x, 4.0)
    hiss = bandpass(rng.standard_normal(len(x)), sr, 500, 3200) * 0.06
    x = x * 0.85 + hiss
    key = noise_burst(sr, 25, 800, 3000, rng, decay=5) * 0.6  # 按下发射键
    tail = noise_burst(sr, 160, 400, 3800, rng, decay=4) * 0.5  # 松键后的「嚓」
    x = np.concatenate([key, x, tail])
    return normalize(x, -2.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--voices', required=True)
    ap.add_argument('--only', nargs='*')
    args = ap.parse_args()

    from kokoro_onnx import Kokoro

    kokoro = Kokoro(args.model, args.voices)
    rng = np.random.default_rng(737)
    OUT.mkdir(parents=True, exist_ok=True)

    for name, (role, text) in LINES.items():
        if args.only and name not in args.only:
            continue
        voice, speed = ROLES[role]
        samples, sr = kokoro.create(text, voice=voice, speed=speed, lang='en-us')
        y = process(role, np.asarray(samples), sr, rng)
        with tempfile.TemporaryDirectory() as td:
            wav = Path(td) / 'x.wav'
            sf.write(wav, y.astype(np.float32), sr)
            mp3 = OUT / f'{name}.mp3'
            subprocess.run(
                ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-ac', '1', '-ar', '24000', '-b:a', '56k', str(mp3)],
                check=True,
            )
        print(f'{name:16s} {role:5s} {len(y) / sr:4.1f}s  {mp3.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
