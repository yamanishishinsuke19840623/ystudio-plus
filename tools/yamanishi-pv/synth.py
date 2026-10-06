"""fuku-to-ikiru.mid をシンプルな音源で WAV に書き出す（外部音源・サウンドフォント不要）。
   python3 synth.py <in.mid> <out.wav> <秒数> <曲を切る秒>
"""
import sys, wave
import numpy as np
from midi import parse

SR = 44100

def f(n): return 440.0 * 2 ** ((n - 69) / 12)

def flute(n, dur, vel):
    t = np.arange(int(SR * (dur + 0.25))) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.25) / 0.3, 0, 1)
    ph = 2 * np.pi * np.cumsum(f(n) * vib) / SR
    y = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    y += 0.015 * np.random.default_rng(n).standard_normal(len(t))  # 息の成分
    env = np.clip(t / 0.06, 0, 1) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.08))
    return y * env * (vel / 127) * 0.32

def pluck(n, dur, vel, seed):
    # Karplus-Strong
    p = int(SR / f(n)); total = int(SR * (dur + 0.6))
    buf = np.random.default_rng(seed).uniform(-1, 1, p)
    out = np.empty(total)
    for k in range(0, total, p):
        m = min(p, total - k); out[k:k+m] = buf[:m]
        buf = 0.497 * (buf + np.roll(buf, -1))
    t = np.arange(total) / SR
    env = np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.12))
    return out * env * (vel / 127) * 0.22

def bass(n, dur, vel):
    t = np.arange(int(SR * (dur + 0.2))) / SR
    ph = 2 * np.pi * f(n) * t
    y = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph)
    env = np.clip(t / 0.01, 0, 1) * np.exp(-t / 1.2) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.06))
    return y * env * (vel / 127) * 0.42

def reverb(x):
    out = x.copy()
    for d, g in ((0.0297, .42), (0.0371, .40), (0.0411, .38), (0.0437, .36)):
        k = int(d * SR); y = x.copy()
        for _ in range(6):
            y = np.concatenate([np.zeros(k), y[:-k]]) * g; out += y * 0.35
    return out

def main(src, dst, length, cut):
    # cut 秒より後に始まる音は鳴らさず、cut で終わる最後の和音は length まで伸ばして余韻にする
    notes, _, _ = parse(src)
    mix = np.zeros((int(SR * (length + 2)), 2))
    for i, (st, dur, n, vel, tr, ch, prog) in enumerate(notes):
        if st >= cut - 1e-6: continue
        if abs(st + dur - cut) < 1e-3 and prog != 73: dur = length - st - 0.5
        if prog == 73:   y, pan = flute(n, dur, vel), 0.55
        elif prog == 24: st += 0.012 * (n % 5); y, pan = pluck(n, dur, vel, i), 0.38
        else:            y, pan = bass(n, dur, vel), 0.5
        a = int(st * SR); b = min(a + len(y), len(mix)); y = y[:b - a]
        mix[a:b, 0] += y * (1 - pan) * 2 ** .5; mix[a:b, 1] += y * pan * 2 ** .5
    mix[:, 0] = reverb(mix[:, 0]); mix[:, 1] = reverb(mix[:, 1])
    mix = mix[:int(SR * length)]
    fade = int(SR * 1.5); mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 1.5
    mix *= 0.89 / np.max(np.abs(mix))
    pcm = (mix * 32767).astype('<i2')
    with wave.open(dst, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]))
