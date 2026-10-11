// ナイトバブルショー — 「はじめての夜に、なる。」のアニメーションサイト
// Motion（旧 Framer Motion）+ Lenis。演出はカメラワークの名前で設計している：
//   オープニング＝スマッシュカット / ヒーロー＝ドリーイン＋ドリーズーム（めまい）
//   13会場＝クレーンアップ / 数字＝スピードランプ / ギャラリー＝パン＋ホイップパン＋ラックフォーカス
//   動画＝ダッチアングル→正面 / やまちゃん＝ラックフォーカス / フッター＝1文字ずつぷくっ
import { animate, inView, scroll, stagger } from "motion";
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
youtube();

if (reduce) {
  root.classList.remove("js");
  $("#loader")?.remove();
} else {
  const lenis = smoothScroll();
  splitChars();
  progress();
  hero();
  opening(lenis).then(heroIn);
  counters();
  venues();
  worries();
  cards();
  reel(lenis);
  movie();
  flowPath();
  me();
  reveals();
  footerPuff();
}

// なめらかスクロールはPC（マウス）だけ。指で動かす端末はブラウザ本来のスクロール
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

function splitChars() {
  $$(".h2, .giant").forEach((h) => {
    h.setAttribute("aria-label", h.textContent.trim());
    const walk = (node) => {
      for (const c of [...node.childNodes]) {
        if (c.nodeType === Node.TEXT_NODE) {
          const f = document.createDocumentFragment();
          let prev = null;
          for (const ch of c.textContent) {
            // 句読点は前の文字と同じ箱に入れて、行頭にぽつんと落ちないようにする
            if (prev && "、。，．！？」』）".includes(ch)) {
              prev.textContent += ch;
              continue;
            }
            const s = document.createElement("span");
            s.className = "ch";
            s.setAttribute("aria-hidden", "true");
            s.textContent = ch === " " ? "\u00a0" : ch;
            f.append(s);
            prev = s;
          }
          c.replaceWith(f);
        } else if (c.nodeType === Node.ELEMENT_NODE && c.tagName !== "BR") walk(c);
      }
    };
    walk(h);
    if (h.classList.contains("h2")) $$(".ch", h).forEach((s) => (s.style.opacity = 0));
  });
}

function progress() {
  scroll(animate("#progress", { scaleX: [0, 1] }, { ease: "linear" }));
}

// ── オープニング（スマッシュカット）：静かにシャボン玉が2回ふくらみ、パチン！で一気に本編へ ──
async function opening(lenis) {
  const loader = $("#loader");
  if (store("nb-open")) {
    loader.remove();
    return;
  }
  lenis.stop();
  const moon = $(".moon", loader), blow = $(".blow", loader), pop = $(".pop", loader);
  await animate(moon, { opacity: [0, 1], scale: [0.9, 1] }, { duration: 0.5 });
  animate(moon, { opacity: 0.35 }, { duration: 0.4 });
  await animate(blow, { scale: [0, 1], opacity: [0, 1] }, { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] });
  for (const big of [1.7, 2.6]) {
    await animate(blow, { scaleX: [null, big * 1.08, big], scaleY: [null, big * 0.9, big] }, { duration: 0.42, ease: [0.34, 1.56, 0.64, 1] });
    await new Promise((r) => setTimeout(r, 120));
  }
  // パチン！：泡が消えて、しぶきが散る
  animate(blow, { scale: 3.4, opacity: 0 }, { duration: 0.12 });
  for (let i = 0; i < 14; i++) {
    const d = document.createElement("span");
    d.className = "drop";
    loader.append(d);
    const a = (Math.PI * 2 * i) / 14, r = 130 + Math.random() * 120;
    animate(d, { x: [0, Math.cos(a) * r], y: [0, Math.sin(a) * r], opacity: [1, 0], scale: [1, 0.3] }, { duration: 0.55, ease: "easeOut" });
  }
  await animate(pop, { opacity: [0, 1], scale: [0.4, 1.15, 1], rotate: [-8, 0] }, { duration: 0.35 });
  await animate(loader, { clipPath: ["circle(80% at 50% 50%)", "circle(0% at 50% 50%)"] }, { duration: 0.5, delay: 0.15, ease: [0.7, 0, 0.3, 1] });
  loader.remove();
  store("nb-open", "1");
  lenis.start();
}

function heroIn() {
  animate(".hero h1 .l1", { opacity: [0, 1], x: [-40, 0] }, { duration: 0.8, ease: [0.2, 0.8, 0.2, 1] });
  animate(".hero h1 .l2", { opacity: [0, 1], x: [40, 0] }, { duration: 0.8, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] });
  animate(".hero h1 em", { scale: [0.4, 1.15, 1], rotate: [-10, 0] }, { duration: 0.6, delay: 0.5 });
  animate(".hero .ring", { scale: [0, 1] }, { type: "spring", stiffness: 160, damping: 11, delay: 0.2 });
  animate(".hero .sub", { opacity: [0, 1], y: [24, 0] }, { duration: 0.6, delay: 0.6 });
}

// ── ヒーロー（ドリーイン＋ドリーズーム）：泡の中へ寄っていくほど、中の夜空は引いて広がる ──
function hero() {
  const sec = $(".hero"), stick = $(".stick", sec);
  const copy = $(".copy", sec), cat = $(".catch", sec), hint = $(".hint", sec), ring = $(".ring", sec);
  // 泡はずっとゆらゆら息をしている
  animate($(".bub", ring), { scale: [1, 1.04, 0.98, 1], rotate: [0, 4, -3, 0] }, { duration: 5, repeat: Infinity, ease: "easeInOut" });
  scroll((p) => {
    const w = stick.clientWidth, h = stick.clientHeight;
    const r0 = Math.min(w, h) * (wide ? 0.2 : 0.22);
    // 泡は文字にかからない位置から、画面のまん中へ寄ってくる
    const cx0 = wide ? 73 : 50, cy0 = wide ? 60 : 45;
    const rMax = Math.hypot(w, h) * 0.56;
    const z = range(p, 0.05, 0.6);
    const r = r0 + (rMax - r0) * (z * z * (3 - 2 * z));
    stick.style.setProperty("--r", r + "px");
    stick.style.setProperty("--cx", cx0 + (50 - cx0) * z + "%");
    stick.style.setProperty("--cy", cy0 + (50 - cy0) * z + "%");
    stick.style.setProperty("--z", (1.45 - 0.45 * z).toFixed(4));
    ring.style.opacity = 1 - range(p, 0.3, 0.5);
    copy.style.opacity = 1 - range(p, 0.02, 0.18);
    copy.style.transform = `translateY(${-range(p, 0, 0.2) * 60}px)`;
    copy.style.pointerEvents = p > 0.15 ? "none" : "";
    hint.style.opacity = 1 - range(p, 0, 0.05);
    const c = range(p, 0.6, 0.78);
    cat.style.opacity = c;
    cat.style.transform = `translateY(${(1 - c) * 40}px)`;
  }, { target: sec, offset: ["start start", "end end"] });
}

// ── 数字（スピードランプ）：一気に回って、最後だけゆっくり止まる ──
function counters() {
  $$("[data-count]").forEach((el) => {
    const to = +el.dataset.count;
    el.textContent = "0";
    inView(el, () => {
      animate(0, to, {
        duration: 1.8,
        ease: [0.05, 0.9, 0.1, 1],
        onUpdate: (v) => (el.textContent = Math.round(v).toLocaleString("ja-JP")),
      });
    }, { amount: 0.6 });
  });
}

// ── 13会場（クレーンアップ）：会場の泡が下から昇ってきて、ふわっと止まる ──
function venues() {
  const vs = $$(".venues .v");
  vs.forEach((v) => (v.style.opacity = 0));
  inView(".venues .field", () => {
    vs.forEach((v, i) => {
      const delay = i * 0.07 + Math.random() * 0.15;
      animate(v, { opacity: [0, 1], y: [260 + Math.random() * 160, 0], scale: [0.6, 1] }, { delay, type: "spring", stiffness: 70, damping: 13 });
      // 止まったあとも、ゆっくり漂う
      setTimeout(() => {
        animate(v, { y: [0, -8 - Math.random() * 8, 0] }, { duration: 3 + Math.random() * 2, repeat: Infinity, ease: "easeInOut" });
      }, (delay + 1.6) * 1000);
    });
    if (fine) {
      vs.forEach((v) =>
        v.addEventListener("pointerenter", () => animate($(".bub", v), { scale: [1, 1.12, 1] }, { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }))
      );
    }
  }, { amount: 0.15 });
}

// ── お悩み：スクロールでひとつずつ「パチン」と割れて消える ──
function worries() {
  const lis = $$(".worry li");
  lis.forEach((li) => (li.style.opacity = 0));
  inView(".worry ul", () => {
    animate(lis, { opacity: [0, 1], y: [30, 0], rotate: () => (Math.random() - 0.5) * 6 }, { delay: stagger(0.08), type: "spring", stiffness: 260, damping: 18 });
  }, { amount: 0.3 });
  inView(".worry .answer", () => {
    lis.forEach((li, i) =>
      setTimeout(async () => {
        await animate(li, { scale: [1, 1.08, 0.96] }, { duration: 0.18 });
        li.classList.add("popped");
        animate(li, { scale: 1, rotate: 0 }, { duration: 0.2 });
      }, i * 110)
    );
  }, { amount: 0.5 });
}

// ── 理由：カードが上に重なり、下のカードは奥へ沈む ──
function cards() {
  const list = $$(".card");
  list.forEach((card, i) => {
    if (i === list.length - 1) return;
    scroll(animate(card, { scale: [1, 0.92], rotate: [0, i % 2 ? 1.5 : -1.5], filter: ["brightness(1)", "brightness(.6)"] }, { ease: "linear" }), {
      target: list[i + 1],
      offset: ["start end", "start start"],
    });
  });
  if (wide) list.forEach((card) => scroll(animate($(".img img", card), { scale: [1.18, 1] }, { ease: "linear" }), { target: card, offset: ["start end", "end start"] }));
}

// ── ギャラリー（パン＋ホイップパン＋ラックフォーカス）──
// 縦スクロールで横にパン。速く回すほどブレ（ホイップパン）、正面の写真にだけピントが合う
function reel(lenis) {
  if (!wide) return;
  const sec = $(".reel"), track = $(".track", sec), bar = $(".bar i", sec);
  const shots = $$(".shot", track);
  let p = 0;
  scroll((v) => (p = v), { target: sec, offset: ["start start", "end end"] });
  const tick = () => {
    const r = sec.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) {
      const max = track.scrollWidth - innerWidth;
      const vel = clamp(Math.abs(lenis.velocity || 0) / 40, 0, 1);
      track.style.transform = `translateX(${-p * max}px) skewX(${-(lenis.velocity || 0) * 0.08}deg)`;
      bar.style.transform = `scaleX(${p})`;
      const mid = innerWidth / 2;
      shots.forEach((s) => {
        if (s.classList.contains("title")) return;
        const b = s.getBoundingClientRect();
        const d = Math.min(1, Math.abs(b.left + b.width / 2 - mid) / (innerWidth * 0.6));
        const blur = Math.max(d * 5, vel * 6);
        s.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "";
        s.style.transform = `scale(${1 - d * 0.08})`;
        s.style.opacity = 1 - d * 0.35;
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ── 動画（ダッチアングル→正面）：斜めに傾いた額縁が、スクロールでまっすぐ大きくなる ──
function movie() {
  // 縦のPVも、傾いたスマホが正面を向く
  scroll(animate(".phone", { scale: [0.86, 1], rotate: [7, 0] }, { ease: "linear" }), { target: $(".phone"), offset: ["start end", "center center"] });
  scroll(animate(".frame", { scale: [0.82, 1], rotate: [-6, 0] }, { ease: "linear" }), { target: $(".frame"), offset: ["start end", "center center"] });
}

function flowPath() {
  const svg = $(".steps svg");
  if (!svg || !wide) return;
  scroll((p) => (svg.style.clipPath = `inset(-20px ${100 - p * 100}% -20px 0)`), { target: $(".steps"), offset: ["start 85%", "end 60%"] });
  $$(".step .dot").forEach((d) => inView(d, () => animate(d, { scale: [0.3, 1], rotate: [-30, 0] }, { type: "spring", stiffness: 260, damping: 12 }), { amount: 1 }));
}

// ── やまちゃん（ラックフォーカス）：奥のショー写真から、手前の顔へピントが移る ──
function me() {
  const a = $(".me .pics .a"), b = $(".me .pics .b"), st = $(".me .sticker");
  scroll((p) => {
    const f = range(p, 0.15, 0.5);
    a.style.filter = `blur(${(f * 3).toFixed(2)}px) brightness(${1 - f * 0.25})`;
    b.style.filter = `blur(${((1 - f) * 6).toFixed(2)}px)`;
    b.style.transform = `rotate(${4 - f * 2}deg) scale(${0.94 + f * 0.06})`;
  }, { target: $(".me"), offset: ["start end", "end start"] });
  inView(st, () => animate(st, { scale: [0, 1], rotate: [-120, -12] }, { type: "spring", stiffness: 200, damping: 11, delay: 0.3 }));
}

function reveals() {
  $$(".h2").forEach((h) =>
    inView(h, () => {
      animate($$(".ch", h), { opacity: [0, 1], y: [-36, 0], rotate: () => [(Math.random() - 0.5) * 40, 0] }, { delay: stagger(0.025), ...SPRING });
    }, { amount: 0.4 })
  );
  $$("[data-reveal]").forEach((el) =>
    inView(el, () => {
      animate(el, { opacity: [0, 1], y: [40, 0] }, { duration: 0.8, ease: [0.2, 0.8, 0.2, 1] });
    }, { amount: 0.2 })
  );
  inView(".tag", (t) => {
    animate(t, { scale: [0.5, 1], rotate: [-8, 0] }, SPRING);
  });
}

function footerPuff() {
  const chs = $$(".giant .ch");
  inView(".giant", () => {
    animate(chs, { scale: [0, 1.3, 1], y: [40, 0] }, { delay: stagger(0.05), duration: 0.6, ease: [0.34, 1.56, 0.64, 1] });
  }, { amount: 0.5 });
  if (fine) chs.forEach((c) => c.addEventListener("pointerenter", () => animate(c, { scale: [1, 1.35, 1] }, { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] })));
}

// YouTube はクリックするまで読み込まない（軽さのため）
function youtube() {
  $$(".yt").forEach((b) => {
    const id = b.dataset.id;
    b.style.backgroundImage = `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)`;
    b.addEventListener("click", () => {
      const f = document.createElement("iframe");
      f.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      f.title = b.getAttribute("aria-label") || "動画";
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      f.allowFullscreen = true;
      b.append(f);
      b.style.cursor = "default";
    }, { once: true });
  });
}

function store(k, v) {
  try {
    if (v === undefined) return sessionStorage.getItem(k);
    sessionStorage.setItem(k, v);
  } catch {
    return null;
  }
}
