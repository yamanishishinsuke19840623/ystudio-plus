// Motion Lab — Motion（旧 Framer Motion）のバニラJS版で、21st.dev でよく見る演出を再現する。
// React の <motion.div whileInView> などと同じエンジンを、ビルド不要の静的ページで使う。
import { animate, inView, scroll, stagger, hover, press } from "motion";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

window.__motionReady = true;

// 動きを控える設定の人には、最終状態をそのまま見せて終わる
if (reduce) {
  document.documentElement.classList.remove("js");
} else {
  heroTitle();
  reveals();
  aurora();
  marquee();
  counters();
  horizontalSteps();
  bars();
  progressBar();
  if (finePointer) {
    magnetic();
    tilt();
    spotlight();
  }
}

// 21st.dev「Text Reveal / Blur In」系: 1文字ずつ下からぼかしを外して出す
function heroTitle() {
  const h1 = $("#hero-title");
  const wrap = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const ch of child.textContent) {
          const s = document.createElement("span");
          s.className = "ch";
          s.setAttribute("aria-hidden", "true");
          s.textContent = ch;
          frag.append(s);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") {
        wrap(child);
      }
    }
  };
  wrap(h1);
  animate(
    $$(".ch", h1),
    { opacity: [0, 1], y: [40, 0], filter: ["blur(10px)", "blur(0px)"] },
    { delay: stagger(0.035, { startDelay: 0.15 }), duration: 0.7, ease: [0.22, 1, 0.36, 1] }
  );
}

// whileInView 相当: 画面に入ったら下からふわっと
function reveals() {
  inView(
    "[data-reveal]",
    (el) => {
      animate(el, { opacity: [0, 1], y: [28, 0] }, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
    },
    { margin: "0px 0px -12% 0px" }
  );
  // カードは並び順に少しずつ遅らせて出す（stagger）
  inView(".cards", (grid) => {
    animate($$(".card", grid), { opacity: [0, 1], y: [40, 0], scale: [0.96, 1] }, { delay: stagger(0.08), type: "spring", bounce: 0.25, duration: 0.9 });
  }, { amount: 0.15 });
  $$(".card").forEach((c) => (c.style.opacity = 0));
}

// 21st.dev「Aurora Background」系: 光の玉がゆっくり漂う
function aurora() {
  const paths = [
    { x: [0, 80, -40, 0], y: [0, 60, 30, 0] },
    { x: [0, -90, 30, 0], y: [0, 40, -50, 0] },
    { x: [0, 60, -70, 0], y: [0, -50, 20, 0] },
  ];
  $$(".aurora span").forEach((el, i) => {
    animate(el, { ...paths[i], scale: [1, 1.15, 0.95, 1] }, { duration: 16 + i * 4, repeat: Infinity, ease: "easeInOut" });
  });
  // スクロールでヒーローごと奥に沈む（パララックス）
  const hero = $(".hero");
  scroll(animate(".hero .wrap", { y: [0, 120], opacity: [1, 0] }, { ease: "linear" }), { target: hero, offset: ["start start", "end start"] });
}

// 21st.dev「Marquee」系: 帯が途切れず流れ続ける
function marquee() {
  const track = $(".marquee-track");
  track.append(...$$("span", track).map((s) => {
    const c = s.cloneNode(true);
    c.setAttribute("aria-hidden", "true");
    return c;
  }));
  const ctrl = animate(track, { x: ["0%", "-50%"] }, { duration: 30, repeat: Infinity, ease: "linear" });
  hover(track, () => {
    ctrl.speed = 0.25;
    return () => (ctrl.speed = 1);
  });
}

// 21st.dev「Number Ticker」系: 画面に入ったら数字をカウントアップ
function counters() {
  inView("[data-count]", (el) => {
    const to = Number(el.dataset.count);
    const pre = el.dataset.prefix || "";
    const suf = el.dataset.suffix || "";
    animate(0, to, {
      duration: 1.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (el.textContent = pre + Math.round(v).toLocaleString("ja-JP") + suf),
    });
  }, { amount: 0.6 });
}

// useScroll + useTransform 相当: 縦スクロールでカードが横に流れる（PCのみ）
function horizontalSteps() {
  if (!window.matchMedia("(min-width: 761px)").matches) return;
  const sec = $(".hscroll");
  const row = $(".row", sec);
  const distance = () => -(row.scrollWidth - window.innerWidth + 40);
  const nums = $$(".step .no", row);
  // 進み具合に合わせて、いま正面にあるカードの番号を光らせる
  scroll((p) => {
    row.style.transform = `translateX(${p * distance()}px)`;
    nums.forEach((n, i) => {
      const focus = 1 - Math.min(1, Math.abs(p * (nums.length - 1) - i));
      n.style.opacity = 0.35 + focus * 0.65;
      n.style.transform = `scale(${0.85 + focus * 0.3})`;
    });
  }, { target: sec, offset: ["start start", "end end"] });
}

// 削減率のバーが伸びる
function bars() {
  inView(".bar", (bar) => {
    const i = $("i", bar);
    animate(i, { scaleX: [0, Number(getComputedStyle(i).getPropertyValue("--v"))] }, { duration: 1.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] });
  });
}

// ページ上部のスクロール進捗バー（useScroll の scrollYProgress 相当）
function progressBar() {
  scroll(animate("#progress", { scaleX: [0, 1] }, { ease: "linear" }));
}

// 21st.dev「Magnetic Button」系: ボタンがカーソルに吸い寄せられる + 押すと縮む
function magnetic() {
  $$("[data-magnetic]").forEach((el) => {
    const move = (e) => {
      const r = el.getBoundingClientRect();
      animate(el, { x: (e.clientX - r.left - r.width / 2) * 0.3, y: (e.clientY - r.top - r.height / 2) * 0.3 }, { type: "spring", stiffness: 300, damping: 18 });
    };
    hover(el, () => {
      el.addEventListener("pointermove", move);
      return () => {
        el.removeEventListener("pointermove", move);
        animate(el, { x: 0, y: 0 }, { type: "spring", stiffness: 260, damping: 14 });
      };
    });
    press(el, () => {
      animate(el, { scale: 0.94 }, { type: "spring", stiffness: 500, damping: 20 });
      return () => animate(el, { scale: 1 }, { type: "spring", stiffness: 500, damping: 20 });
    });
  });
}

// 21st.dev「3D Card / Spotlight Card」系: カーソルの向きに傾き、光が追従する
function tilt() {
  $$("[data-tilt]").forEach((card) => {
    const move = (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", `${px * 100}%`);
      card.style.setProperty("--my", `${py * 100}%`);
      animate(card, { rotateY: (px - 0.5) * 14, rotateX: (0.5 - py) * 14 }, { type: "spring", stiffness: 220, damping: 20 });
    };
    hover(card, () => {
      card.addEventListener("pointermove", move);
      return () => {
        card.removeEventListener("pointermove", move);
        animate(card, { rotateX: 0, rotateY: 0 }, { type: "spring", stiffness: 180, damping: 16 });
      };
    });
  });
}

// 画面全体のやわらかいスポットライト
function spotlight() {
  const spot = $("#spot");
  let shown = false;
  window.addEventListener("pointermove", (e) => {
    if (!shown) {
      shown = true;
      animate(spot, { opacity: 1 }, { duration: 0.6 });
    }
    animate(spot, { x: e.clientX, y: e.clientY }, { type: "spring", stiffness: 120, damping: 20, mass: 0.6 });
  });
}
