---
name: motion-site
description: Motion（旧 Framer Motion）と 21st.dev のコンポーネントを使って、アニメーション特化のページをつくる・直す。「アニメーションを付けて」「動きのあるサイト」「21st.dev のこれを入れて」「Framer Motion で」などのときに使う。
---

# アニメーション特化ページをつくる（Motion × 21st.dev）

このリポジトリは GitHub Pages の静的サイト（ビルドなしの HTML）。
React は使わず、**Motion のバニラJS版**（`motion` パッケージ。Framer Motion と同じエンジン）を
`tools/motion-lab/` で1ファイルにまとめ、ページと一緒に置く。CDN には頼らない。

- 見本ページ: `motion-lab/index.html`（`/motion-lab/`）、山西水産ブランドサイト `yamanishi-suisan/index.html`（`/yamanishi-suisan/`）
- アニメーションのソース: `tools/motion-lab/src/main.js`・`src/yamanishi.js` → `npm run build` で各フォルダの `app.js` に出力
- 動作確認: `cd tools/motion-lab && npm run check`（Chromium でデスクトップ/スマホ/動き控えめの3通りを開き、エラー・隠れたままの要素・横はみ出しを検査。スクショは `OUT_DIR` に保存）
- 山西水産ページの型: 写真入り文字へのズーム、横スクロールの年表、スクロールで進む年号カウンター、速度で傾く帯、重なるカード、カーソルに付いてくる商品写真、ロゴが膨らむオープニング
- **AIっぽい見た目を避ける**: 「濃紺＋金＋明朝＋細い線＋ガラス風カード＋金のカーソル」は量産型。本物の写真・ロゴ・手書き要素を主役にし、そのブランドだけの色と書体（例: Dela Gothic One＋朱＋生成り）を選ぶ

## 進め方

1. **目的を先に決める**: 何を伝えたいページか、見た人に何をしてほしいか（相談申込など）。動きは手段。
2. **21st.dev で部品を選ぶ**: https://21st.dev でほしい演出（Hero / Text Reveal / Marquee / Number Ticker / Spotlight Card など）を探し、
   部品ページの「Copy prompt」または コードをコピーして Claude に貼る。
3. **このリポジトリ向けに移植する**: 21st.dev の部品は React + Tailwind + framer-motion。下の対応表で `main.js` のバニラ版に書き換え、
   見た目は `index.html` の CSS 変数（`--accent` 等）で合わせる。Tailwind や shadcn は持ち込まない。
4. **ビルドして確認**: `npm run build` → `npm run check` が全部 OK になるまで直す。スクショも目で見る。

## Framer Motion（React）→ Motion バニラ 対応表

| React (framer-motion / motion/react) | このリポジトリでの書き方 (`import … from "motion"`) |
|---|---|
| `<motion.div animate={{x:100}} />` | `animate(el, { x: 100 })` |
| `initial` + `whileInView` | CSS で初期状態 → `inView(sel, el => animate(el, {...}))` |
| `variants` + `staggerChildren` | `animate(els, {...}, { delay: stagger(0.08) })` |
| `transition={{type:"spring", stiffness, damping}}` | `{ type: "spring", stiffness, damping }`（同じ） |
| `whileHover` | `hover(el, () => { …; return () => 戻す })` |
| `whileTap` | `press(el, () => { …; return () => 戻す })` |
| `useScroll()` の `scrollYProgress` | `scroll(animate(el, {...}, {ease:"linear"}))` または `scroll(p => …)` |
| `useScroll({ target, offset })` | `scroll(…, { target, offset: ["start start", "end end"] })` |
| `useTransform` / `useMotionValue` | `scroll(p => el.style.… = …)` で直接計算 |
| `animate(0, 100, { onUpdate })`（カウンタ） | 同じ |
| `useReducedMotion()` | `matchMedia("(prefers-reduced-motion: reduce)")` → 動かさず最終状態を見せる |
| `AnimatePresence`（退場アニメ） | `await animate(el, { opacity: 0 }).finished; el.remove()` |

## 守ること

- **盛らずに、掘る**: ページの文言・数字・実績・肩書きは、トップページ（`index.html`）など確認できる事実からだけ使う。
  21st.dev の見本に入っているダミー文（架空の会社名・レビュー・数字）は必ず消す。足りない情報は作らず本人に確認する。
- **動き控えめ設定を尊重**: `prefers-reduced-motion` のときは動かさず、最初から読める状態にする。
- **JS が読めなくても読める**: 初期状態で隠す要素は `.js [data-reveal]` のように `.js` クラス配下だけにする（`app.js` が2秒で読めなければ解除される）。
- **スマホ優先で確認**: 横スクロール演出・3D傾き・カーソル追従は PC（`hover: hover`）だけにする。横はみ出し禁止。
- **重くしない**: 動かすのは `transform` と `opacity`（と `filter` 少し）。`width/top` などのレイアウト系は動かさない。

## Claude Code に入れられる外部の道具（任意）

調べた範囲で見つかったもの。どれもコミュニティ製なので、入れる前に中身とライセンスを確認する。

- Framer Motion スキル（MIT）: `claude plugin marketplace add Schoepplake/framer-motion-skill` → `claude plugin install framer-motion@framer-motion-skill`
- 21st.dev Magic MCP（チャットから 21st.dev 風部品を生成。API キーが必要、無料枠に月の回数上限あり）: `npx @21st-dev/cli@latest install claude --api-key <key>`
