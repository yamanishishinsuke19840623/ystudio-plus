# 関門カイギ プロモ用の15秒BGMを合成する（120BPM・自作なので著作権の心配なし）。
# 映像のカット点（1.0s タイトル / 3.5s アーカイブ / 8.5s 顔の壁 / 11.0s 10分 / 12.5s エンド）に合わせてある。
#   python3 tools/kanmon-kaigi-promo/music.py out.wav
import sys, wave
import numpy as np

SR, DUR, BPM = 44100, 15.0, 120
B = 60 / BPM
N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(3)

def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR); j = min(N, i + len(sig))
    if i >= N: return
    s = sig[: j - i] * gain
    L[i:j] += s * (1 - max(0, pan)); R[i:j] += s * (1 + min(0, pan))

def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)

def kick(g=1.0):
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(2.2 * np.sin(ph) * env(n, .001, .16)) * g

def snare():
    n = int(0.3 * SR); t = np.arange(n) / SR
    return (rng.uniform(-1, 1, n) * env(n, .001, .07) * .8 + np.sin(2 * np.pi * 190 * t) * env(n, .001, .05) * .5)

def hat(d=.03):
    n = int(0.12 * SR); x = rng.uniform(-1, 1, n); x = np.diff(np.concatenate([[0], x]))
    return x * env(n, .0005, d)

def saw(f, dur, d=.25, det=0.006):
    n = int(dur * SR); t = np.arange(n) / SR
    s = sum(2 * ((t * f * (1 + k * det)) % 1) - 1 for k in (-1, 0, 1)) / 3
    return s * env(n, .004, d)

def lowpass(x, a):
    a = np.broadcast_to(np.asarray(a, float), x.shape)
    y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)): acc += a[i] * (x[i] - acc); y[i] = acc
    return y

def bass(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + .35 * np.sign(np.sin(2 * np.pi * f * t))
    return np.tanh(1.5 * s) * env(n, .003, dur * .6)

def impact():
    n = int(1.6 * SR); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (38 + 60 * np.exp(-t * 6)) * t) * np.exp(-t * 2.2)
    noise = lowpass(rng.uniform(-1, 1, n), .08) * np.exp(-t * 5)
    return np.tanh(1.8 * (boom + noise * 1.4))

def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR; k = t / dur
    nz = rng.uniform(-1, 1, n); nz = nz - lowpass(nz, .02 + .5 * k ** 2)
    tone = np.sin(2 * np.pi * np.cumsum(200 + 1400 * k ** 2) / SR) * .25
    return (nz * .6 + tone) * k ** 2

def whoosh(dur=.25):
    n = int(dur * SR); t = np.arange(n) / SR
    return lowpass(rng.uniform(-1, 1, n), .25) * np.sin(np.pi * t / dur) ** 2

def stab(freqs, dur=.22):
    return sum(lowpass(saw(f, dur, .09), .35) for f in freqs) / len(freqs)

# Dm - Bb - F - C（明るすぎず前向き）
CH = [[146.8, 174.6, 220.0], [116.5, 146.8, 174.6], [174.6, 220.0, 261.6], [130.8, 164.8, 196.0]]
ROOT = [73.4, 58.3, 87.3, 65.4]

# 0–1s: 写真ストロボに合わせた16分のティック＋ライザー
for k in range(8): add(hat(.015), k * B / 4, .5, (-1) ** k * .3)
add(riser(1.0), 0.0, .5)
# 1.0s タイトルの衝撃
add(impact(), 1.0, .9); add(kick(), 1.0, 1.0)
add(stab(CH[0], .6), 1.0, .5)
# 2.0s 港へホイップ
add(whoosh(.3), 1.86, .5)
# 2–3.5s 4つ打ちで助走
for k in range(3): add(kick(.85), 2.0 + k * B)
for k in range(6): add(hat(), 2.0 + k * B / 2 + B / 2 * (k % 2 == 0), .28, .2)
add(riser(.5), 3.0, .45)
# 3.5–11s 本編グルーヴ
t = 3.5
while t < 12.49:
    beat = round((t - 3.5) / B)
    bar = beat // 4
    add(kick(), t)
    if beat % 2 == 1: add(snare(), t, .55)
    add(hat(), t + B / 2, .3, .25); add(hat(.015), t + B / 4, .14, -.25); add(hat(.015), t + 3 * B / 4, .14, -.25)
    ci = bar % 4
    for e in (0, .5): add(bass(ROOT[ci], B / 2 * .9), t + e * B, .32)
    t += B
# アーカイブ各回の切り替え（0.5秒ごと）に和音のスタブとホイップ
for n in range(10):
    ts = 3.5 + n * .5
    add(stab(CH[(n // 2) % 4]), ts, .32, (-1) ** n * .35)
    if n: add(whoosh(.14), ts - .07, .25, (-1) ** n * .5)
# 8.5s 顔の壁：衝撃＋アルペジオ
add(impact(), 8.5, .7)
arp = [293.7, 349.2, 440.0, 587.3, 440.0, 349.2]
for k in range(20):
    f = arp[k % len(arp)] * (1 if k < 10 else 1.122)
    add(lowpass(saw(f, .12, .07), .3), 8.5 + k * B / 4, .16, (-1) ** k * .4)
# 11s 10分：縦ホイップ＋ライザー
add(whoosh(.3), 10.88, .45)
add(riser(1.5), 11.0, .45)
# 12.5s エンド：大きな衝撃と和音のパッド
add(impact(), 12.5, 1.0); add(kick(), 12.5, 1.0)
pad = sum(lowpass(saw(f, 2.5, 1.1, .01), .12) for f in [146.8, 220.0, 293.7, 349.2, 440.0]) / 5
add(pad, 12.5, .7)
add(bass(ROOT[0], 2.0), 12.5, .35)
# 最後に軽いティックでループ感
for k in range(4): add(hat(.02), 14.0 + k * B / 2, .15)

mix = np.stack([L, R], 1)
fade = np.ones(N); fn = int(.35 * SR); fade[-fn:] = np.linspace(1, 0, fn)
mix *= fade[:, None]
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) / 0.89
out = (mix * 32767).astype("<i2")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print("music ->", sys.argv[1])
