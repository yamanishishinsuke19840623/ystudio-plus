# そのまま使えるレシピ（Motion バニラJS）

前提: `import { animate, inView, scroll, stagger } from "motion";`
`const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)); const range=(p,a,b)=>clamp((p-a)/(b-a));`
固定区間は `section{height:260vh} .stick{position:sticky;top:0;height:100svh;overflow:hidden}`。

## 01 パン（縦スクロール→横に流れる）
```js
scroll((p) => {
  const max = track.scrollWidth - innerWidth;
  track.style.transform = `translateX(${-p * max}px)`;
}, { target: sec, offset: ["start start", "end end"] });
```
セクション高 400〜500vh。スマホは `overflow-x:auto; scroll-snap-type:x mandatory` のスワイプにする。

## 03 ドリーイン／08 ドリーズーム（泡・円の中へ入っていく）
```css
.photo{position:absolute;inset:0;clip-path:circle(var(--r) at var(--cx) var(--cy))}
.photo img{transform:scale(var(--z))}
```
```js
scroll((p) => {
  const z = range(p, 0.05, 0.6), e = z * z * (3 - 2 * z);
  const r0 = Math.min(w, h) * 0.2, rMax = Math.hypot(w, h) * 0.56;
  stick.style.setProperty("--r", r0 + (rMax - r0) * e + "px");   // ドリーイン: 円が広がる
  stick.style.setProperty("--z", 1.45 - 0.45 * z);                // ドリーズーム: 中の写真は逆に引く
  stick.style.setProperty("--cx", 73 + (50 - 73) * z + "%");      // 文字にかからない位置から中央へ
}, { target: hero, offset: ["start start", "end end"] });
```
文字の線の中へ入る版は `premium-lp`（山西水産の `heroScroll`。canvas で一番太い線の中心を拡大の中心にする）。

## 07 クレーンアップ（下から昇って止まる）
```js
inView(field, () => items.forEach((el, i) =>
  animate(el, { opacity: [0, 1], y: [260 + Math.random() * 160, 0], scale: [0.6, 1] },
    { delay: i * 0.07, type: "spring", stiffness: 70, damping: 13 })), { amount: 0.15 });
```

## 09 ラックフォーカス（ピントを送る）
2枚入れ替え: `a.style.filter = blur(f*3px)`、`b.style.filter = blur((1-f)*6px)`（f はスクロール 0→1）。
正面だけピント: 各要素の中心と画面中央の距離 d（0〜1）で `blur(d*5px) scale(1-d*.08)`。

## 12 ダッチアングル→正面
```js
scroll(animate(frame, { scale: [0.82, 1], rotate: [-6, 0] }, { ease: "linear" }),
  { target: frame, offset: ["start end", "center center"] });
```

## 14 スピードランプ（数字）
```js
animate(0, to, { duration: 1.8, ease: [0.05, 0.9, 0.1, 1], onUpdate: (v) => (el.textContent = Math.round(v).toLocaleString("ja-JP")) });
```

## 15 タイムラプス（年号・時刻を進める）
`yr.textContent = Math.round(from + (to - from) * easeInOut(range(p, 0.16, 0.7)))`。節目で文言を切り替え、到着でばね。

## 19 ホイップパン（速く振るとブレる）
Lenis の `velocity`（スマホは自前で `scrollY` の差分を平滑化）を使う:
```js
const vel = clamp(Math.abs(lenis.velocity) / 40);
track.style.transform += ` skewX(${-lenis.velocity * 0.08}deg)`;
shot.style.filter = `blur(${vel * 6}px)`;
```
毎フレームの blur は重いのでPCだけ。

## 21 ワイプ（線・面を片側から開く）
`el.style.clipPath = \`inset(-20px ${100 - p * 100}% -20px 0)\``（SVG の点線は svg 要素ごと切る）。

## 22 スマッシュカット（静 → 一気に本編）
静かな前振り（ロゴ・泡がぷくっ×2）→ 音・言葉（「パチン！」）→ `clip-path: circle(80%→0%)` を0.5秒で。
2回目以降は `sessionStorage` で省略する（毎回だと嫌われる）。

## 18 マッチカット（形をそろえて場面転換）
前の場面の円（泡・皿・ロゴ）と、次の場面の円い写真を**同じ位置・同じ大きさ**に置き、`opacity` を入れ替えるだけで成立する。

## PVで使うとき（23 Jカット／24 Lカット）
`tools/yamanishi-pv/` の描画で、次カットの音を0.5小節前から鳴らす（J）／前カットの音を次の頭まで残す（L）。
場面の切り替え自体は小節の頭に合わせる。
