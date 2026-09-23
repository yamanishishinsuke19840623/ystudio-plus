# 「潮風と、ふくと。」のサビ（song.html のデモと同じメロディ・コード）から35秒のリール用BGMを合成する。
# 構成：イントロ2小節 → サビ10小節 → アウトロ2小節（96BPM・1小節2.5秒 → 計35秒）
import numpy as np, wave

SR = 44100
BEAT = 60 / 96
BAR = 4 * BEAT
MAJ, MIN = [0, 4, 7], [0, 3, 7]

intro = [(0, MAJ), (7, MAJ)]
sabi_chords = [(5, MAJ), (7, MAJ), (4, MIN), (9, MIN), (5, MAJ), (7, MAJ), (2, MIN), (7, MAJ), (0, MAJ), (0, MAJ)]
sabi_melody = [9,12,12,9, 11,14,14,11, 7,11,7,4, 9,12,9,4, 9,12,12,9, 11,14,14,11, 14,12,9,5, 7,9,11,14]
sabi_melody = [(n, 1) for n in sabi_melody] + [(16, 1), (14, 1), (12, 2), (12, 4)]
outro = [(5, MAJ), (0, MAJ)]
chords = intro + sabi_chords + outro
DUR = len(chords) * BAR
out = np.zeros(int(SR * (DUR + 1)))

def f(m): return 440 * 2 ** ((m - 69) / 12)

def add(sig, start):
    i = int(start * SR); out[i:i + len(sig)] += sig[:len(out) - i]

def env(n, atk=0.02, rel=0.15):
    e = np.ones(n); a = int(atk * SR); r = min(int(rel * SR), n // 2)
    e[:a] = np.linspace(0, 1, a); e[n - r:] *= np.linspace(1, 0, r); return e

def voice(freq, dur, kind):
    n = int(dur * SR); t = np.arange(n) / SR
    if kind == 'pad':
        s = sum(np.sin(2 * np.pi * freq * k * t + k) / k ** 2 for k in (1, 3, 5)) * 0.5
        s += 0.3 * np.sin(2 * np.pi * freq * 1.003 * t)
        return s * env(n, 0.25, 0.6)
    if kind == 'bass':
        return np.sin(2 * np.pi * freq * t) * env(n, 0.01, 0.2) * np.exp(-t * 0.6)
    if kind == 'lead':  # フルート寄りの音色＋ゆるいビブラート
        vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t * 3, 0, 1)
        ph = 2 * np.pi * freq * np.cumsum(vib) / SR
        s = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
        return s * env(n, 0.03, 0.12)
    if kind == 'bell':
        return (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2.76 * t)) * np.exp(-t * 3)

rng = np.random.default_rng(1)
def kick():
    t = np.arange(int(0.3 * SR)) / SR
    return np.sin(2 * np.pi * (50 + 90 * np.exp(-t * 30)) * t) * np.exp(-t * 12)
def hat():
    n = int(0.06 * SR); return rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 60) * 0.5

# コード＋ベース
for i, (root, q) in enumerate(chords):
    t0 = i * BAR
    for iv in q: add(0.10 * voice(f(48 + root + iv), BAR * 1.02, 'pad'), t0)
    add(0.32 * voice(f(36 + root), BAR * 0.9, 'bass'), t0)
    add(0.22 * voice(f(36 + root + 7), BEAT * 0.9, 'bass'), t0 + 2 * BEAT)

# リズム（イントロ後半から、アウトロ手前まで）
nb = len(chords) * 4
for b in range(nb):
    t0 = b * BEAT
    if 4 <= b < nb - 8:
        if b % 2 == 0: add(0.45 * kick(), t0)
        add(0.06 * hat(), t0 + BEAT / 2)
    if b < 8 and b % 2 == 1: add(0.05 * hat(), t0)

# サビのメロディ（5秒目から）
mt = 2 * BAR
for n, d in sabi_melody:
    add(0.20 * voice(f(72 + n), d * BEAT * 0.95, 'lead'), mt); mt += d * BEAT

# 場面転換のベル（5秒ごと）とラストの決め
for k in range(1, 7): add(0.10 * voice(f(84), 1.2, 'bell'), k * 5 - 0.05)
for iv in (0, 4, 7, 12): add(0.07 * voice(f(84 + iv), 2.5, 'bell'), 30 + iv * 0.03)

# 簡易リバーブ（コムフィルタ）
wet = np.zeros_like(out)
for d, g in ((0.031, .35), (0.047, .3), (0.071, .25), (0.113, .2)):
    k = int(d * SR); buf = out.copy()
    for _ in range(4): buf = np.concatenate([np.zeros(k), buf[:-k]]) * g; wet += buf
mix = out + 0.6 * wet
mix = mix[:int(DUR * SR)]
fade = int(2.0 * SR); mix[-fade:] *= np.linspace(1, 0, fade) ** 1.5
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.2) * 0.89

with wave.open('bgm.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('bgm.wav', DUR, 's')
