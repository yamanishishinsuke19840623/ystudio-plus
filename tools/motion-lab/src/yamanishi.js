// 山西水産 — 「顔の見えるふぐ屋」のアニメーションサイト
// Motion（旧 Framer Motion）+ Lenis（なめらかスクロール）
import { animate, inView, scroll, stagger, hover } from "motion";
import Lenis from "lenis";

const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const wide = matchMedia("(min-width: 861px)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const range = (p, a, b) => clamp((p - a) / (b - a));
const SPRING = { type: "spring", stiffness: 380, damping: 16 };

window.__motionReady = true;

if (reduce) {
  root.classList.remove("js");
} else {
  const lenis = smoothScroll();
  splitChars();
  heroScroll();
  opening(lenis).then(heroIn);
  movie();
  generations();
  ban();
  market(lenis);
  cards();
  reveals();
  owner();
  footerPuff();
  if (fine) lineupFloat();
}

// なめらかスクロール。指で動かす端末では使わず、ブラウザ本来のスクロールにする
// （スマホで Lenis や長い固定区間があると「スクロールしにくい」と言われたため）
function smoothScroll() {
  const jump = (lenis) =>
    $$('a[href^="#"]').forEach((a) =>
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        const el = id === "#top" ? 0 : $(id);
        if (el === null) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(el, { duration: 1.4 });
        else window.scrollTo({ top: el === 0 ? 0 : el.getBoundingClientRect().top + scrollY, behavior: "smooth" });
      })
    );
  if (!fine) {
    // Lenis と同じ形（stop/start/velocity）だけ持つ代わり
    const native = { velocity: 0, stop() { root.style.overflow = "hidden"; }, start() { root.style.overflow = ""; } };
    let last = scrollY;
    const tick = () => {
      native.velocity = native.velocity * 0.8 + (scrollY - last) * 0.2;
      last = scrollY;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    jump(null);
    return native;
  }
  const lenis = new Lenis({ lerp: 0.1 });
  const raf = (t) => {
    lenis.raf(t);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  jump(lenis);
  return lenis;
}

// 見出しを1文字ずつに分ける（読み上げ用に元の文は aria-label に残す）
function splitChars() {
  $$(".h2, .chars").forEach((h) => {
    h.setAttribute("aria-label", h.textContent.trim());
    const walk = (node) => {
      for (const c of [...node.childNodes]) {
        if (c.nodeType === Node.TEXT_NODE) {
          const f = document.createDocumentFragment();
          for (const ch of c.textContent) {
            const s = document.createElement("span");
            s.className = "ch";
            s.setAttribute("aria-hidden", "true");
            s.textContent = ch;
            f.append(s);
          }
          c.replaceWith(f);
        } else if (c.nodeType === Node.ELEMENT_NODE && c.tagName !== "BR") walk(c);
      }
    };
    walk(h);
    $$(".ch", h).forEach((s) => (s.style.opacity = 0));
  });
}

// ── オープニング：ロゴのふぐが「ぷくっ」と2回膨らんで、丸く抜けてヒーローへ ──
async function opening(lenis) {
  const loader = $("#loader");
  if (store("ys-fugu")) {
    loader.remove();
    return;
  }
  lenis.stop();
  const fish = $(".fish", loader), say = $(".say", loader);
  await animate(fish, { scale: [0, 1], rotate: [-25, 0] }, { type: "spring", stiffness: 260, damping: 14 });
  for (const big of [1.18, 1.38]) {
    animate(say, { opacity: [0, 1], scale: [0.6, 1], y: [8, 0] }, SPRING);
    await animate(fish, { scaleX: [1, big * 1.05, big], scaleY: [1, big * 0.92, big] }, { duration: 0.42, ease: [0.34, 1.56, 0.64, 1] });
    await animate(fish, { scaleX: 1, scaleY: 1 }, { duration: 0.28 });
  }
  say.textContent = "いらっしゃい！";
  animate(say, { opacity: [0, 1], scale: [0.6, 1] }, SPRING);
  await animate(fish, { scale: [1, 1.6], opacity: [1, 0] }, { duration: 0.45, delay: 0.25, ease: "easeIn" });
  await animate(loader, { clipPath: ["circle(75% at 50% 50%)", "circle(0% at 50% 50%)"] }, { duration: 0.8, ease: [0.7, 0, 0.3, 1] });
  loader.remove();
  store("ys-fugu", "1");
  lenis.start();
}

function heroIn() {
  // 墨がにじむように「ふく」が左から書かれ、最後に朱の落款がドンと押される
  animate(".hero .big", { clipPath: ["inset(-10% 100% -10% 0)", "inset(-10% 0% -10% 0)"], filter: ["blur(14px)", "blur(0px)"], opacity: [0.2, 1] }, { duration: 1.5, ease: [0.65, 0, 0.35, 1] });
  animate(".hero .hanko", { opacity: [0, 1], scale: [2.4, 1], rotate: [-24, -6] }, { delay: 1.45, type: "spring", stiffness: 500, damping: 18 });
  animate(".stamp", { scale: [0, 1], rotate: [-120, 0] }, { type: "spring", stiffness: 200, damping: 12, delay: 0.35 });
  animate(".hero .lead, .hero .scroll", { opacity: [0, 1], y: [20, 0] }, { delay: stagger(0.1, { startDelay: 0.5 }), duration: 0.6 });
}

// ── HERO：墨の「ふく」の線の中へ、スクロールで吸い込まれる（墨一色 → 料理の写真へ）──
function heroScroll() {
  const hero = $(".hero");
  const type = $(".type", hero), big = $(".big", hero);
  const full = $(".full", hero), cat = $(".catch", hero);
  const fades = $$(".stamp, .lead, .scroll", hero);
  // 文字の線の「中」に向かってズームすると、画面いっぱいが写真になる。
  // 実際のフォントで文字を描いて、いちばん太い線のまん中を拡大の中心にする
  const setOrigin = () => {
    const r = big.getBoundingClientRect();
    const cs = getComputedStyle(big);
    const w = Math.ceil(big.offsetWidth), h = Math.ceil(big.offsetHeight);
    if (!w || !h) return;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = cs.letterSpacing;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(big.textContent, w / 2, h / 2);
    const data = ctx.getImageData(0, 0, w, h).data;
    let best = { d: 0, x: w / 2, y: h / 2 };
    const step = Math.max(2, Math.round(h / 120));
    for (let y = Math.round(h * 0.2); y < h * 0.8; y += step) {
      let run = 0;
      for (let x = 0; x < w; x++) {
        run = data[(y * w + x) * 4 + 3] > 128 ? run + 1 : 0;
        if (run > best.d) best = { d: run, x: x - run / 2, y };
      }
    }
    // 拡大中でも位置がずれないよう、変形前のレイアウト位置で計算する
    const left = (type.offsetWidth - w) / 2, top = (type.offsetHeight - h) / 2;
    type.style.transformOrigin = `${left + best.x}px ${top + best.y}px`;
    void r;
  };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(setOrigin);
  addEventListener("resize", setOrigin);

  scroll((p) => {
    const z = range(p, 0.04, 0.55);
    type.style.transform = `scale(${Math.pow(40, z * z)})`;
    type.style.opacity = 1 - range(p, 0.44, 0.55);
    full.style.opacity = range(p, 0.34, 0.5);
    full.style.transform = `scale(${1.3 - 0.3 * range(p, 0.34, 0.85)})`;
    const c = range(p, 0.58, 0.72);
    cat.style.opacity = c;
    cat.style.transform = `translateY(${(1 - c) * 40}px)`;
    fades.forEach((f) => (f.style.opacity = 1 - range(p, 0, 0.08)));
  }, { target: hero, offset: ["start start", "end end"] });
}

// ── PV：額縁が傾いた状態から、スクロールでまっすぐ大きくなる ──
function movie() {
  scroll(animate(".frame", { scale: [0.82, 1], rotate: [-4, 0] }, { ease: "linear" }), { target: $(".movie"), offset: ["start end", "center center"] });
}

// ── 四代：縦スクロールで、色の違う5枚が横に流れる ──
function generations() {
  if (!wide) {
    inView(".gen", (g) => {
      animate($(".num", g), { scale: [0.3, 1], rotate: [-20, 0] }, { type: "spring", stiffness: 160, damping: 12 });
    }, { amount: 0.3 });
    return;
  }
  const sec = $(".gens"), track = $(".track", sec), bar = $(".bar i", sec);
  const nums = $$(".gen .num", sec);
  scroll((p) => {
    const max = track.scrollWidth - innerWidth;
    track.style.transform = `translateX(${-p * max}px)`;
    bar.style.transform = `scaleX(${p})`;
    // いま正面にあるパネルの漢数字は大きく、出入りするものは傾ける
    const pos = p * (nums.length - 1);
    nums.forEach((n, i) => {
      const d = clamp(i - pos, -1, 1);
      n.style.transform = `translateX(${d * 24}vw) rotate(${d * -24}deg) scale(${1 - Math.abs(d) * 0.45})`;
    });
  }, { target: sec, offset: ["start start", "end end"] });
}

// ── 300年の禁：1592 から 1888 へ、スクロールで年号が進み、禁が解ける ──
function ban() {
  const sec = $(".ban");
  const yr = $("#ban-year"), who = $("#ban-who"), what = $("#ban-what"), note = $("#ban-note");
  const xs = $$(".mark path", sec), o = $(".mark circle", sec);
  [...xs, o].forEach((el) => {
    const len = el.getTotalLength();
    el.style.strokeDasharray = len;
    el.style.strokeDashoffset = len;
  });
  const texts = {
    a: ["1592年　豊臣秀吉", "ふぐ食禁止の令", "朝鮮出兵に向かう兵士がふぐを食べて命を落とし、戦力を失ったためとされています。"],
    b: ["それから約300年", "ふぐは、禁じられた。", "豊臣秀吉の「ふぐ食禁止の令」から、およそ300年。"],
    c: ["明治21年（1888年）　伊藤博文", "山口県で、ふぐ食を解禁。", "一人の女将の勇気と一人の政治家の決断が、300年の禁を解きました。"],
  };
  let phase = "";
  const setPhase = (k) => {
    if (k === phase) return;
    phase = k;
    [who.textContent, what.textContent, note.textContent] = texts[k];
    animate([who, what], { opacity: [0, 1], y: [14, 0] }, { duration: 0.4 });
    sec.classList.toggle("lifted", k === "c");
    if (k === "c") animate(yr.parentElement, { scale: [1.25, 1], rotate: [-4, 0] }, { type: "spring", stiffness: 300, damping: 10 });
  };
  scroll((p) => {
    // バツ印が描かれる → 年号が進む → 1888 で丸に変わる
    const draw = range(p, 0.02, 0.14);
    xs.forEach((x, i) => {
      const len = parseFloat(x.style.strokeDasharray);
      x.style.strokeDashoffset = len * (1 - range(draw, i * 0.5, i * 0.5 + 0.5));
      x.style.opacity = 1 - range(p, 0.68, 0.72);
    });
    const t = range(p, 0.16, 0.7);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    yr.textContent = Math.round(1592 + (1888 - 1592) * eased);
    const len = parseFloat(o.style.strokeDasharray);
    o.style.strokeDashoffset = len * (1 - range(p, 0.72, 0.86));
    setPhase(p < 0.16 ? "a" : p < 0.7 ? "b" : "c");
  }, { target: sec, offset: ["start start", "end end"] });
}

// ── 南風泊市場：流れ続ける帯。スクロールが速いほど速く、斜めに傾く ──
function market(lenis) {
  const belts = $$(".market .belt");
  const pos = [0, 0];
  let skew = 0, visible = false;
  inView(".market", () => {
    visible = true;
    return () => (visible = false);
  });
  const tick = () => {
    if (visible) {
      const v = lenis.velocity || 0;
      skew += (clamp(v * 0.6, -14, 14) - skew) * 0.12;
      belts.forEach((b, i) => {
        const half = b.scrollWidth / 2;
        const dir = i ? 1 : -1;
        pos[i] = (pos[i] + 0.6 + Math.abs(v) * 0.5) % half;
        const x = dir < 0 ? -pos[i] : pos[i] - half;
        b.style.transform = `translateX(${x}px) skewX(${-skew * dir}deg)`;
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ── 三つの約束：カードが上に重なり、下のカードは少し奥に沈む ──
function cards() {
  const cs = $$(".card");
  cs.forEach((c, i) => {
    const img = $(".ph img", c);
    if (wide) scroll(animate(img, { y: ["-10%", "0%"] }, { ease: "linear" }), { target: c, offset: ["start end", "end start"] });
    const next = cs[i + 1];
    if (!next) return;
    scroll(animate(c, { scale: [1, 0.9], rotate: [0, i % 2 ? 2 : -2] }, { ease: "linear" }), { target: next, offset: ["start end", "start 30%"] });
  });
}

// 見出しは1文字ずつ跳ねて落ちてくる。本文はふわっと
function reveals() {
  inView(".h2, .chars", (h) => {
    const chs = $$(".ch", h);
    animate(chs, { opacity: [0, 1], y: [-60, 0] }, { delay: stagger(0.03), type: "spring", stiffness: 420, damping: 15 });
    chs.forEach((c, i) => animate(c, { rotate: [(Math.random() - 0.5) * 50, 0] }, { delay: i * 0.03, type: "spring", stiffness: 300, damping: 10 }));
  }, { amount: 0.5 });
  inView("[data-up]", (el) => {
    animate(el, { opacity: [0, 1], y: [30, 0] }, { duration: 0.7, ease: [0.22, 1, 0.36, 1] });
  }, { margin: "0px 0px -10% 0px" });
  $$(".item").forEach((el) => (el.style.opacity = 0));
  inView(".item", (el) => {
    animate(el, { opacity: [0, 1], x: [-40, 0] }, { type: "spring", stiffness: 200, damping: 20 });
  }, { amount: 0.4 });
  inView(".kicker", (k) => {
    animate(k, { scale: [0, 1], rotate: [-30, -3] }, SPRING);
  });
}

// ── ラインナップ：行に乗ると、その商品の写真がカーソルについてくる ──
function lineupFloat() {
  const fl = $("#float"), imgs = $$("img", fl);
  let lastX = 0, rot = 0;
  addEventListener("pointermove", (e) => {
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    rot += (clamp(dx * 0.8, -18, 18) - rot) * 0.3;
    animate(fl, { x: e.clientX, y: e.clientY, rotate: rot }, { type: "spring", stiffness: 220, damping: 22, mass: 0.6 });
  });
  hover(".item", (item) => {
    imgs.forEach((im, i) => im.classList.toggle("on", i === Number(item.dataset.img)));
    animate(fl, { opacity: 1, scale: 1 }, { type: "spring", stiffness: 300, damping: 18 });
    return () => animate(fl, { opacity: 0, scale: 0.6 }, { duration: 0.2 });
  });
}

function owner() {
  const sec = $(".owner");
  scroll(animate(".owner .photo", { rotate: [-8, 3], y: [80, -40] }, { ease: "linear" }), { target: sec, offset: ["start end", "end start"] });
  inView(".owner .sticker", (s) => {
    animate(s, { scale: [0, 1.15, 1], rotate: [30, 4] }, { duration: 0.6, delay: 0.3 });
  });
}

// ── フッター：「山西水産」の4文字が、ふぐみたいにぷくっと膨らんで出てくる ──
function footerPuff() {
  const chars = $$("footer .giant span");
  chars.forEach((c) => (c.style.opacity = 0));
  inView("footer .giant", () => {
    animate(chars, { opacity: [0, 1], scale: [0, 1.3, 1], y: [80, 0] }, { delay: stagger(0.08), duration: 0.7, ease: [0.34, 1.56, 0.64, 1] });
  }, { amount: 0.5 });
  if (fine) {
    hover(chars, (c) => {
      animate(c, { scaleX: 1.25, scaleY: 1.15 }, { type: "spring", stiffness: 500, damping: 9 });
      return () => animate(c, { scaleX: 1, scaleY: 1 }, { type: "spring", stiffness: 500, damping: 9 });
    });
  }
}

// プライベートブラウズ等で storage が使えなくても止まらないように
function store(k, v) {
  try {
    if (v === undefined) return sessionStorage.getItem(k);
    sessionStorage.setItem(k, v);
  } catch {
    return null;
  }
}
