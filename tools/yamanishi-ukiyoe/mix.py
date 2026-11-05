"""山西水産 浮世絵30秒 — オリジナル楽曲（和楽器を合成）＋効果音 → out/mix.wav
80 BPM・4/4（1小節 = 3.0 s）、都節音階（D E♭ G A B♭）。サンプル音源は使わず、すべてコードで合成。
実行: LIB/.venv/bin/python mix.py  （events.json は main.js の EV から events.mjs で書き出す）"""
import json, os, sys
import numpy as np
from scipy.signal import fftconvolve
LIB = os.environ['LIB']; sys.path.insert(0, os.path.join(LIB, 'core', 'audio'))
from sfx import SR, t_, env_exp, bp, lp, hp, noise, brown, norm, add, limit

HERE = os.path.dirname(os.path.abspath(__file__))
EV = json.load(open(os.path.join(HERE, 'events.json')))
DUR = EV['dur']; N = int(DUR * SR)
rng = np.random.default_rng(147)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
BEAT = 60 / 80
D3, Eb3, G3, A3, Bb3 = 50, 51, 55, 57, 58
D4, Eb4, G4, A4, Bb4 = 62, 63, 67, 69, 70
D5, Eb5, G5, A5 = 74, 75, 79, 81


def ks(f, d, decay=.996, bright=.5, sawari=0.0):
    """Karplus-Strong（ブロック単位でベクトル化）。sawari = 三味線のさわり（ビリつき）"""
    n = int(d * SR); P = max(2, int(SR / f)); y = np.zeros(n + P + 1)
    exc = rng.uniform(-1, 1, P); exc = lp(exc, 1500 + 6000 * bright) if bright < 1 else exc
    y[:P] = exc
    i = P + 1
    while i < len(y):
        e = min(len(y), i + P)
        y[i:e] = decay * (.5 * y[i - P:e - P] + .5 * y[i - P - 1:e - P - 1])
        i = e
    out = y[P + 1:P + 1 + n]
    if sawari:
        out = out + sawari * np.tanh(out * 6) * .3 + sawari * bp(out * np.abs(out) * 4, 1800, 5000) * .5
    out *= np.minimum(1, t_(len(out) / SR) / .002)
    return out


def shamisen(m, d=1.2, v=1.0, sawari=.6):
    x = ks(hz(m), d, decay=.993, bright=.9, sawari=sawari)
    a = hp(noise(.02), 2500) * env_exp(.02, .004); x[:len(a)] += .5 * a  # 撥（ばち）のアタック
    return norm(x, .5 * v)


def koto(m, d=2.2, v=1.0):
    x = ks(hz(m), d, decay=.9985, bright=.6)
    return norm(x, .38 * v)


def shakuhachi(m, d, v=1.0, slide=True, meri=False):
    tt = t_(d); f0 = hz(m) * np.ones_like(tt)
    if slide: f0 *= 2 ** (-1.2 / 12 * np.exp(-tt / .09))           # 下から滑り込む
    if meri: f0 *= 2 ** (-1.0 / 12 * np.clip((tt - (d - .45)) / .35, 0, 1))  # 語尾のメリ
    vib = 1 + .006 * np.sin(2 * np.pi * 5.2 * tt) * np.clip((tt - .5) / .6, 0, 1)
    ph = 2 * np.pi * np.cumsum(f0 * vib) / SR
    env = np.minimum(1, tt / .14) * np.minimum(1, (d - tt) / .3) * (1 + .12 * np.sin(2 * np.pi * .7 * tt))
    tone = np.sin(ph) + .22 * np.sin(2 * ph) + .07 * np.sin(3 * ph)
    breath = bp(noise(d), 900, 4200) * (.25 + .5 * np.exp(-tt / .08))   # 息（ムライキ）
    return (tone * .5 + breath * .35) * env * .32 * v


def taiko(v=1.0, big=False):
    d = 1.6 if big else .7; tt = t_(d)
    f = 58 + 70 * np.exp(-tt / .05)
    skin = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / (.45 if big else .22))
    thud = lp(noise(d), 300) * np.exp(-tt / .03)
    stick = hp(noise(d), 1500) * np.exp(-tt / .006) * .4
    return norm(skin + thud * .6 + stick, .8 * v)


def shime(v=1.0):
    tt = t_(.25); f = 320 + 140 * np.exp(-tt / .01)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / .06) + bp(noise(.25), 1500, 6000) * np.exp(-tt / .012) * .7
    return norm(x, .35 * v)


def hyoshigi(v=1.0):
    tt = t_(.35)
    x = sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt / dcy) * a for f, dcy, a in [(1850, .05, 1), (2730, .03, .6), (4100, .02, .3)])
    x += bp(noise(.35), 1500, 7000) * np.exp(-tt / .004)
    return norm(x, .7 * v)


def reverb(x, sec=2.2, wet=.22):
    n = int(sec * SR); tt = np.arange(n) / SR
    ir = np.stack([rng.standard_normal(n) * np.exp(-tt / (sec / 5)) for _ in range(2)], 1)
    ir = np.stack([lp(ir[:, c], 6000) for c in range(2)], 1); ir /= np.abs(ir).sum(0) ** .5 * 30
    w = np.stack([fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], 1)
    return x + w * wet / max(1e-9, np.abs(w).max()) * np.abs(x).max()


# ===================== 楽曲 =====================
mus = np.zeros((N, 2))
add(mus, hyoshigi(), .15, .9)
# 尺八：自由リズムの息のフレーズ
for t0, d, m, kw in [(1.5, 2.6, A4, {}), (4.3, 1.1, Bb4, {}), (5.5, 1.9, A4, {}), (7.5, 1.6, G4, {'meri': True}),
                     (17.0, 1.6, D5, {}), (18.7, 2.0, Eb5, {'meri': True})]:
    add(mus, shakuhachi(m, d, **kw), t0, 1.0 if t0 < 25 else .8, -.25)
# 琴の分散和音
for t0 in (3.0, 6.0):
    for k, m in enumerate([D3, A3, D4, Eb4, G4, A4]): add(mus, koto(m), t0 + k * .17, .8, .3 - k * .08)
# 絵巻送りに三味線の駆け上がり（16分）
for k, m in enumerate([D3, Eb3, G3, A3, Bb3, D4, Eb4, G4]): add(mus, shamisen(m, .5, .8), 9.6 + k * BEAT / 4, .8, .1)
# 三味線のオスティナート（8分）
pat = [D3, D4, A3, D4, Bb3, A3, G3, A3]
t = 10.5; k = 0
while t < 21.0 - 1e-6:
    add(mus, shamisen(pat[k % 8], .9, 1.0 if k % 4 == 0 else .7), t, .8, .15); t += BEAT / 2; k += 1
t = 21.0; k = 0
while t < 24.6:
    add(mus, shamisen([D4, A3, Bb3, G3][k % 4], 1.4, .9), t, 1.0, .15); t += BEAT; k += 1
# 締太鼓（裏拍）と太鼓の心拍
t = 12.0 + BEAT / 2
while t < 21.0: add(mus, shime(), t, .7, -.2); t += BEAT
t = 16.5; gap = .75
while t < 20.9: add(mus, taiko(.55), t, .8, 0); t += gap; gap = max(.42, gap * .92)
# 琴のグリッサンド（皿）
for k, m in enumerate([D4, Eb4, G4, A4, Bb4, D5, Eb5, G5, A5, 86]): add(mus, koto(m, 2.4, .8), 22.0 + k * .065, .7, -.4 + k * .08)
add(mus, koto(D4, 2.0), 23.8, .6, 0); add(mus, koto(A3, 2.0), 23.8, .5, .2)
mus = reverb(mus)
# 落款：大太鼓一打＋三味線のさわりを鳴らし切る（残響のあとに足す＝ま の無音を守る）
end = np.zeros((N, 2))
add(end, taiko(1.0, big=True), 25.9, 1.0, 0)
add(end, shamisen(D3, 3.2, 1.0, sawari=1.0), 25.92, .9, .1)
add(end, shamisen(A3, 2.8, .6, sawari=.8), 26.5, .6, -.1)
add(end, shakuhachi(D5, 2.4, meri=True), 26.6, .8, -.25)
end = reverb(end, 2.0, .18)

# ===================== 効果音 =====================
fx = np.zeros((N, 2))
def baren(d=.45):
    tt = t_(d); return bp(noise(d), 300, 2500) * (.5 + .5 * np.sin(2 * np.pi * 9 * tt)) * np.sin(np.pi * tt / d) * .28
def paper(d=.25):
    tt = t_(d); return hp(noise(d), 2000) * np.exp(-tt / .06) * .18
def seal():
    tt = t_(.4); return lp(noise(.4), 160) * np.exp(-tt / .04) * .9 + np.sin(2 * np.pi * 85 * tt) * np.exp(-tt / .07) * .5 + bp(noise(.4), 800, 3000) * np.exp(-((tt - .14) / .03) ** 2) * .08
def scroll(d):
    tt = t_(d); return bp(noise(d), 200, 1800) * np.sin(np.pi * tt / d) ** 1.5 * .3
for e in EV['ev']:
    ty, t0 = e['type'], e['t']
    if ty == 'baren': add(fx, baren(), t0, .9, rng.uniform(-.3, .3))
    elif ty == 'paper': add(fx, paper(), t0, .8, .2)
    elif ty == 'seal': add(fx, seal(), t0, .9, 0)
    elif ty == 'bigseal': add(fx, seal(), t0, 1.3, 0)
    elif ty == 'scroll': add(fx, scroll(e['d']), t0, .9, -.2)
    elif ty == 'wash': add(fx, scroll(e['d']) * .7, t0, .8, .1)
# 環境音：波（3〜21s）、かもめ、桶の木音、しずく、皿
def sea(d):
    tt = t_(d); b = lp(brown(d), 500); return norm(b, .25) * (.6 + .4 * np.sin(2 * np.pi * tt / 4.2) ** 2)
s = sea(18.5) * np.minimum(1, t_(18.5) / 1.5) * np.minimum(1, (18.5 - t_(18.5)) / 2)
add(fx, s * .9, 2.8, .7, -.3); add(fx, s * .9, 2.8, .7, .3)
def gull():
    tt = t_(.35); f = 1900 - 700 * tt / .35
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / .35) ** 2 * .05
for t0 in (4.6, 5.0, 7.2, 11.4, 11.8, 14.6): add(fx, gull(), t0, 1, rng.uniform(-.6, .6))
def knock():
    tt = t_(.15); return (np.sin(2 * np.pi * 420 * tt) + .5 * np.sin(2 * np.pi * 760 * tt)) * np.exp(-tt / .025) * .12
for t0 in (11.1, 12.3, 13.0, 14.2, 15.1, 15.8): add(fx, knock(), t0, 1, rng.uniform(-.5, .5))
def drip():
    tt = t_(.12); f = 900 + 1400 * tt / .12; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / .03) * .07
for t0 in (17.6, 18.5, 19.4, 20.2): add(fx, drip(), t0, 1, .1)
tt = t_(.5); add(fx, sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt / .12) for f in (2350, 3900, 5600)) * .04, 21.25, 1, .2)
# 紙の静けさ（ごく薄いルームトーン）
room = lp(noise(DUR), 3000) * .006; fx[:, 0] += room; fx[:, 1] += room[::-1]

# ===================== ミックス =====================
# ま：25.5 から引いて、26.4–26.7 は完全な無音（残響も切る）
tt = np.arange(N) / SR
g = np.clip(1 - (tt - 25.0) / .6, 0, 1); g[tt < 25.0] = 1; g[tt >= 25.6] = 0
gfx = np.where((tt >= 25.6) & (tt < 25.9), 0.0, 1.0)
mix = mus * .9 * g[:, None] + fx * gfx[:, None] + end
fade = np.clip((DUR - tt) / .6, 0, 1); mix *= fade[:, None]
mix = np.stack([limit(mix[:, c] / max(1e-9, np.abs(mix).max()) * .85) for c in range(2)], 1)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
import soundfile as sf
sf.write(os.path.join(HERE, 'out', 'mix.wav'), mix.astype(np.float32), SR, subtype='PCM_16')
print('out/mix.wav', mix.shape[0] / SR, 's')
