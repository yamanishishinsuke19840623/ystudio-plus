// 山西水産 ブランドサイト — Motion（旧 Framer Motion）+ Lenis（なめらかスクロール）
import { animate, inView, scroll, stagger, hover, press } from "motion";
import Lenis from "lenis";

const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const wide = matchMedia("(min-width: 821px)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const EASE = [0.22, 1, 0.36, 1];

window.__motionReady = true;

if (reduce) {
  root.classList.remove("js");
} else {
  const lenis = smoothScroll();
  splitHeadings();
  const t = $(".hero .tate .t");
  t.innerHTML = [...t.textContent].map((c) => `<span class="c">${c}</span>`).join("");
  opening(lenis).then(heroIn);
  heroScroll();
  bubbles();
  reveals();
  fukuMorph();
  history();
  fuguDraw();
  channels();
  counters();
  songFill();
  rail();
  headerTheme();
  if (fine) {
    cursor();
    magnetic();
    tilt();
  }
}

// ── なめらかスクロール（ページ内リンクも Lenis で移動） ──
function smoothScroll() {
  const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
  const raf = (t) => {
    lenis.raf(t);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  $$('a[href^="#"]').forEach((a) =>
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const el = id === "#top" ? 0 : $(id);
      if (el === null) return;
      e.preventDefault();
      lenis.scrollTo(el, { duration: 1.6 });
    })
  );
  return lenis;
}

// 見出しを単語（読点・改行）ごとに包み、下からせり上げる準備をする
function splitHeadings() {
  $$(".split").forEach((h) => {
    h.setAttribute("aria-label", h.textContent.trim());
    h.innerHTML = h.innerHTML
      .split(/<br\s*\/?>/)
      .map((line) => line.split(/(?<=、|。)/).map((w) => `<span class="w" aria-hidden="true"><span>${w}</span></span>`).join(""))
      .join("<br>");
  });
}

// ── オープニング: 「福」が浮かび、0→147 を数えて幕が上がる ──
async function opening(lenis) {
  const loader = $("#loader");
  if (sessionStorageGet("ys-opened")) {
    loader.remove();
    return;
  }
  lenis.stop();
  const num = $("#ld-num");
  animate("#loader .kanji span", { opacity: [0, 1], scale: [1.25, 1], filter: ["blur(24px)", "blur(0px)"] }, { duration: 1.4, ease: EASE });
  animate("#loader .meta, #loader .count", { opacity: [0, 1], y: [12, 0] }, { delay: stagger(0.15, { startDelay: 0.5 }), duration: 0.9, ease: EASE });
  await animate(0, 147, { duration: 1.9, delay: 0.3, ease: [0.6, 0, 0.2, 1], onUpdate: (v) => (num.textContent = Math.round(v)) });
  await animate("#loader .mark", { opacity: 0, y: -20 }, { duration: 0.5, ease: "easeIn" });
  await animate(loader, { clipPath: ["inset(0 0 0% 0)", "inset(0 0 100% 0)"] }, { duration: 1.1, ease: [0.76, 0, 0.24, 1] });
  loader.remove();
  sessionStorageSet("ys-opened", "1");
  lenis.start();
}

function heroIn() {
  const t = $(".hero .tate .t");
  animate(".hero .photo", { scale: [1.18, 1.04] }, { duration: 2.6, ease: EASE });
  animate($$(".c", t), { opacity: [0, 1], y: [-30, 0], filter: ["blur(12px)", "blur(0px)"] }, { delay: stagger(0.12, { startDelay: 0.3 }), duration: 1.2, ease: EASE });
  animate(".hero .tate .sub", { opacity: [0, 1] }, { delay: 1.3, duration: 1.2 });
  animate(".hero .info > *", { opacity: [0, 1], y: [24, 0] }, { delay: stagger(0.12, { startDelay: 1.1 }), duration: 1, ease: EASE });
  animate(".scroll-cue i", { y: ["-100%", "100%"] }, { duration: 1.8, repeat: Infinity, ease: [0.65, 0, 0.35, 1], delay: 2 });
}

// ヒーローの写真がゆっくり沈み、文字が離れていく（パララックス）
function heroScroll() {
  const hero = $(".hero");
  const opt = { target: hero, offset: ["start start", "end start"] };
  scroll(animate(".hero .photo img", { y: ["0%", "18%"] }, { ease: "linear" }), opt);
  scroll(animate(".hero .tate", { y: [0, -120], opacity: [1, 0] }, { ease: "linear" }), opt);
  scroll(animate(".hero .info", { y: [0, 60], opacity: [1, 0] }, { ease: "linear" }), opt);
}

// 海の泡（ヒーローの canvas。画面外では止める）
function bubbles() {
  const cv = $("#bubbles");
  const ctx = cv.getContext("2d");
  let w, h, dpr, run = true;
  const N = wide ? 46 : 22;
  const resize = () => {
    dpr = Math.min(devicePixelRatio, 2);
    w = cv.clientWidth;
    h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener("resize", resize);
  const ps = Array.from({ length: N }, () => seed({}, true));
  function seed(p, any) {
    p.x = Math.random() * w;
    p.y = any ? Math.random() * h : h + 20;
    p.r = 1 + Math.random() * 3.6;
    p.v = 0.25 + Math.random() * 0.7;
    p.ph = Math.random() * 6.28;
    p.a = 0.15 + Math.random() * 0.35;
    return p;
  }
  inView(cv, () => {
    run = true;
    requestAnimationFrame(tick);
    return () => (run = false);
  });
  function tick(t) {
    if (!run) return;
    ctx.clearRect(0, 0, w, h);
    for (const p of ps) {
      p.y -= p.v;
      p.x += Math.sin(t / 1400 + p.ph) * 0.25;
      if (p.y < -10) seed(p);
      const fade = Math.min(1, p.y / (h * 0.5));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.strokeStyle = `rgba(242,237,227,${p.a * fade})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    requestAnimationFrame(tick);
  }
}

// whileInView 相当: 見出しはせり上げ、その他はふわっと
function reveals() {
  inView(".split", (h) => {
    animate($$(".w > span", h), { y: ["110%", "0%"] }, { delay: stagger(0.09), duration: 1.1, ease: EASE });
  }, { amount: 0.4 });
  inView("[data-reveal]", (el) => {
    animate(el, { opacity: [0, 1], y: [30, 0] }, { duration: 1.1, ease: EASE });
  }, { margin: "0px 0px -10% 0px" });
}

// ── 「不遇」→「福」: スクロール量に応じて文字が溶けて入れ替わる ──
function fukuMorph() {
  const sec = $(".fuku");
  const from = $(".from", sec), to = $(".to", sec);
  const caps = $$(".cap p", sec);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  scroll((p) => {
    const a = clamp((p - 0.18) / 0.3); // 0→1 で入れ替わる
    from.style.opacity = 1 - a;
    from.style.filter = `blur(${a * 22}px)`;
    from.style.transform = `translateY(-50%) scale(${1 + a * 0.15})`;
    from.style.letterSpacing = `${0.06 + a * 0.4}em`;
    to.style.opacity = a;
    to.style.filter = `blur(${(1 - a) * 22}px)`;
    to.style.transform = `translateY(-50%) scale(${0.85 + a * 0.15})`;
    caps.forEach((c, i) => {
      const b = clamp((p - 0.45 - i * 0.1) / 0.12);
      c.style.opacity = b;
      c.style.transform = `translateY(${(1 - b) * 16}px)`;
    });
  }, { target: sec, offset: ["start start", "end end"] });
}

// ── 歴史: 大きな「147」が横に流れ、年表の線が伸びる ──
function history() {
  const sec = $(".years");
  scroll(animate(".years .big", { x: ["8%", "-12%"] }, { ease: "linear" }), { target: sec, offset: ["start end", "end start"] });
  const line = $(".tl .line");
  const prop = wide ? "scaleX" : "scaleY";
  scroll(animate(line, { [prop]: [0, 1] }, { ease: "linear" }), { target: $(".tl"), offset: ["start 85%", "end 60%"] });
  inView(".tl ol", (ol) => {
    animate($$("li", ol), { opacity: [0, 1], y: [30, 0] }, { delay: stagger(0.14), duration: 1, ease: EASE });
  }, { amount: 0.2 });
}

// ── 線画のふく: スクロールに合わせて筆で描かれていく ──
function fuguDraw() {
  const svg = $(".fugu");
  const paths = $$(".draw", svg);
  paths.forEach((p) => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
  });
  scroll((pr) => {
    paths.forEach((p, i) => {
      const len = parseFloat(p.style.strokeDasharray);
      const start = (i / paths.length) * 0.45;
      const k = Math.max(0, Math.min(1, (pr - start) / 0.4));
      p.style.strokeDashoffset = len * (1 - k);
    });
  }, { target: svg, offset: ["start 90%", "end 40%"] });
  inView(svg, () => {
    animate($$(".spot", svg), { opacity: [0, 1], scale: [0, 1] }, { delay: stagger(0.08, { startDelay: 0.9 }), type: "spring", bounce: 0.5 });
  }, { amount: 0.8 });
  // ふくがゆらゆら泳ぐ
  animate(svg, { y: [0, -10, 0], rotate: [0, -1.5, 0] }, { duration: 6, repeat: Infinity, ease: "easeInOut" });
}

// ── 販路: 2列がスクロール方向に逆向きに流れる ──
function channels() {
  const sec = $(".zenkoku");
  $$(".row", sec).forEach((row) => {
    row.append(...[...row.children].map((c) => {
      const d = c.cloneNode(true);
      d.setAttribute("aria-hidden", "true");
      return d;
    }));
    const dir = Number(row.dataset.dir);
    scroll(animate(row, { x: dir > 0 ? ["0%", "-30%"] : ["-30%", "0%"] }, { ease: "linear" }), { target: sec, offset: ["start end", "end start"] });
  });
}

function counters() {
  inView("[data-count]", (el) => {
    const to = Number(el.dataset.count);
    animate(0, to, { duration: 2, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => (el.textContent = Math.round(v).toLocaleString("ja-JP")) });
  }, { amount: 0.8 });
}

// ── 歌詞: 1行ずつ、スクロールで左から灯る ──
function songFill() {
  $$(".song .ln").forEach((ln) => {
    scroll((p) => (ln.style.backgroundPosition = `${100 - p * 100}% 0`), { target: ln, offset: ["start 85%", "end 55%"] });
  });
}

// 明るいセクションの上ではヘッダーの文字を墨色に切り替える
function headerTheme() {
  const head = $(".head");
  const lights = $$("[data-light]");
  const check = () => {
    const y = head.offsetHeight / 2;
    head.classList.toggle("light", lights.some((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= y && r.bottom >= y;
    }));
  };
  scroll(check);
  check();
}

function rail() {
  scroll(animate("#rail i", { scaleY: [0, 1] }, { ease: "linear" }));
}

// ── カーソル: 金の輪が遅れてついてくる。リンク上で膨らむ ──
function cursor() {
  const ring = $("#cursor"), dot = $("#dot"), label = $("b", ring);
  let shown = false;
  addEventListener("pointermove", (e) => {
    if (!shown) {
      shown = true;
      animate([ring, dot], { opacity: 1 }, { duration: 0.4 });
    }
    animate(dot, { x: e.clientX, y: e.clientY }, { duration: 0 });
    animate(ring, { x: e.clientX, y: e.clientY }, { type: "spring", stiffness: 260, damping: 26, mass: 0.5 });
  });
  hover("a, .btn", (el) => {
    const big = el.matches(".lk");
    animate(ring, { scale: big ? 2.2 : 1.6, backgroundColor: big ? "rgba(200,163,90,.95)" : "rgba(200,163,90,.15)" }, { duration: 0.35 });
    if (big) animate(label, { opacity: 1 }, { duration: 0.3 });
    return () => {
      animate(ring, { scale: 1, backgroundColor: "rgba(200,163,90,0)" }, { duration: 0.35 });
      animate(label, { opacity: 0 }, { duration: 0.2 });
    };
  });
}

function magnetic() {
  $$("[data-magnetic]").forEach((el) => {
    const move = (e) => {
      const r = el.getBoundingClientRect();
      animate(el, { x: (e.clientX - r.left - r.width / 2) * 0.25, y: (e.clientY - r.top - r.height / 2) * 0.35 }, { type: "spring", stiffness: 300, damping: 20 });
    };
    hover(el, () => {
      el.addEventListener("pointermove", move);
      return () => {
        el.removeEventListener("pointermove", move);
        animate(el, { x: 0, y: 0 }, { type: "spring", stiffness: 240, damping: 14 });
      };
    });
    press(el, () => {
      animate(el, { scale: 0.95 }, { duration: 0.15 });
      return () => animate(el, { scale: 1 }, { type: "spring", stiffness: 500, damping: 18 });
    });
  });
}

function tilt() {
  $$("[data-tilt]").forEach((card) => {
    const move = (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", `${px * 100}%`);
      card.style.setProperty("--my", `${py * 100}%`);
      animate(card, { rotateY: (px - 0.5) * 8, rotateX: (0.5 - py) * 8, transformPerspective: 800 }, { type: "spring", stiffness: 200, damping: 20 });
    };
    hover(card, () => {
      card.addEventListener("pointermove", move);
      return () => {
        card.removeEventListener("pointermove", move);
        animate(card, { rotateX: 0, rotateY: 0 }, { type: "spring", stiffness: 160, damping: 16 });
      };
    });
  });
}

// プライベートブラウズ等で storage が使えなくても止まらないように
function sessionStorageGet(k) {
  try { return sessionStorage.getItem(k); } catch { return null; }
}
function sessionStorageSet(k, v) {
  try { sessionStorage.setItem(k, v); } catch {}
}
