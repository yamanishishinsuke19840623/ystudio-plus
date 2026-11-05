// 山西水産「ふくと生きる」浮世絵 30秒（縦 1080×1920）
import { clamp, lerp, seg, ss, eio, hash, TAU } from '/core/lib.js';
import { W, H, FR, PAL, TX, mk, buildTextures, inkify, stampLayer, stampFn, drawSeal, cartouche, rgba } from './print.js';
import { VIEWS } from './views.js';

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const QS = new URLSearchParams(location.search);
const NOSUB = QS.has('nosub');

await document.fonts.load('400 40px Yuji', '関門夜明南風泊朝市目利ふく刺山西水産創業と生きる');
await document.fonts.load('500 40px Shippori', '明治十二年、下関で創業。世界でただ一つのふぐ専門市場南風泊毎朝自らの目選ぶふくと生きて百四十七');
await document.fonts.load('700 40px Shippori', '創業明治十二年下関のふく問屋');
buildTextures();

// —— タイムライン（唯一の正） ——
export const DUR = 30;
const T = {
  print0: [0.3, 0.9, 1.5, 2.1],   // g0..g3 が刷られる時刻
  pan01: [9.0, 10.5], pan12: [16.2, 16.8], pan23: [20.7, 21.2],
  wash: [25.0, 25.6], endSeal: 25.9, endCart: 26.3, endSlip: 26.5,
};
const CART = [
  { x: 110, y: 80, title: '関門 夜明', seal: '創業', t: [3.6, 4.2] },
  { x: 970, y: 80, title: '南風泊 朝市', seal: '朝市', t: [11.2, 11.7] },
  { x: 110, y: 80, title: '目利', seal: '目利', t: [17.2, 17.6] },
  { x: 970, y: 80, title: 'ふく刺', seal: 'ふく', t: [22.0, 22.4] },
];
const SUBS = [
  { t0: 3.3, t1: 8.7, text: '明治十二年、下関で創業。' },
  { t0: 10.8, t1: 16.0, text: '世界でただ一つの ふぐ専門市場、南風泊。' },
  { t0: 16.9, t1: 20.6, text: '毎朝、自らの目で選ぶ。' },
  { t0: 21.4, t1: 24.9, text: 'ふくと生きて、百四十七年。' },
];
window.SUBS = SUBS;

// —— 版のキャッシュ ——
const REG = [[0, 0], [2.0, -1.4], [-1.8, 1.8], [1.5, 2.1]];
const SHIFT = [[4, -5], [-6, 4], [5, 5], [-5, -4]];
const cache = new Map();
function layer(v, name) {
  const k = v.id + ':' + name; if (cache.has(k)) return cache.get(k);
  const d = v.layers[name], c = mk(), x = c.getContext('2d');
  d.draw(x); const hk = hash(k.length * 7.3 + k.charCodeAt(0) + k.charCodeAt(k.length - 1));
  inkify(c, { speck: d.speck ?? .3, grain: (d.grain || 0) * 1.7, gx: hk * 400 - 200, baren: d.baren ?? (d.g ? .34 : .12), bx: (hk - .5) * 300, by: (hash(hk) - .5) * 200 });
  cache.set(k, c); return c;
}
const revFor = (i, g, t) => i === 0 ? clamp((t - T.print0[g]) / .34) : 1;

// —— 一枚の版画 ——
function drawSheet(i, t, M) {
  const v = VIEWS[i];
  ctx.save(); ctx.setTransform(...M);
  // 台紙の影
  ctx.fillStyle = 'rgba(60,40,20,.25)'; ctx.fillRect(10, 14, W, H);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.drawImage(TX.paper, 0, 0);
  const endBlank = i === 3 && t >= T.wash[1];
  if (!endBlank) {
    ctx.save(); ctx.beginPath(); ctx.rect(FR.x0, FR.y0, FR.x1 - FR.x0, FR.y1 - FR.y0); ctx.clip();
    const R = {
      L: name => { const g = v.layers[name].g; stampLayer(ctx, layer(v, name), revFor(i, g, t), REG[g], SHIFT[g]); },
      D: (g, fn) => { const r = revFor(i, g, t); if (r >= 1) { ctx.save(); ctx.translate(REG[g][0], REG[g][1]); fn(ctx); ctx.restore(); } else stampFn(ctx, fn, r, SHIFT[g]); },
    };
    v.paint(ctx, t, R);
    ctx.restore();
    // 枠
    const r = revFor(i, 0, t);
    stampFn(ctx, x => { x.strokeStyle = PAL.sumi; x.lineWidth = 3.4; x.strokeRect(FR.x0, FR.y0, FR.x1 - FR.x0, FR.y1 - FR.y0); x.lineWidth = 1.3; x.strokeRect(FR.x0 - 9, FR.y0 - 9, FR.x1 - FR.x0 + 18, FR.y1 - FR.y0 + 18); }, r, SHIFT[0]);
    // 題簽と印
    const C = CART[i];
    if (t > C.t[0]) {
      const p = clamp((t - C.t[0]) / .35), sp = clamp((t - C.t[1]) / .3);
      stampFn(ctx, x => { C._b = cartouche(x, C.x, C.y, C.title, { w: 92, size: 54, ssize: 28 }); }, p, [0, -14]);
      if (C._b) drawSeal(ctx, C.seal, C.x, C._b.y0 + C._b.h + 52, 64, sp, { seed: i + 3, rot: (hash(i) - .5) * .06 });
    }
    // 紙へ洗い戻し（最後の一枚）
    if (i === 3 && t > T.wash[0]) {
      const k = Math.min(12, Math.floor(seg(t, ...T.wash) * 12.999)), tmp = TX.tmp, x = tmp.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'copy'; x.drawImage(TX.paper, 0, 0);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(TX.reveal[k], 0, 0, W, H); x.globalCompositeOperation = 'source-over';
      ctx.drawImage(tmp, 0, 0);
    }
  } else endCard(t);
  ctx.globalAlpha = 1; ctx.drawImage(TX.fiber, 0, 0);
  ctx.restore(); ctx.restore();
}

// —— 終わり：落款だけが残る ——
function endCard(t) {
  drawSeal(ctx, '山西水産', 540, 700, 300, clamp((t - T.endSeal) / .3), { seed: 41, rot: -.02 });
  if (t > T.endCart) stampFn(ctx, x => cartouche(x, 540, 920, 'ふくと生きる', { series: '', w: 140, size: 92 }), clamp((t - T.endCart) / .35), [0, -14]);
  if (t > T.endSlip) stampFn(ctx, x => {
    const w = 420, h = 92, x0 = 540 - w / 2, y0 = 1560;
    x.fillStyle = '#f3e7c6'; x.fillRect(x0, y0, w, h); x.strokeStyle = PAL.sumi; x.lineWidth = 3; x.strokeRect(x0, y0, w, h); x.lineWidth = 1.2; x.strokeRect(x0 + 6, y0 + 6, w - 12, h - 12);
    x.fillStyle = PAL.sumi; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 38px Shippori'; x.fillText('下関のふく問屋', 540, y0 + h / 2 + 2);
  }, clamp((t - T.endSlip) / .35), [0, -10]);
}

// —— 字幕（横長の短冊） ——
function subtitle(t) {
  if (NOSUB) return;
  const s = SUBS.find(s => t >= s.t0 && t < s.t1); if (!s) return;
  const p = clamp((t - s.t0) / .22), out = clamp((t - (s.t1 - .25)) / .25);
  ctx.save(); ctx.globalAlpha = 1 - out;
  stampFn(ctx, x => {
    x.font = '500 44px Shippori'; const tw = x.measureText(s.text).width, w = tw + 140, h = 96, x0 = 540 - w / 2 + 16, y0 = 1612;
    x.fillStyle = 'rgba(243,231,198,.96)'; x.fillRect(x0, y0, w, h); x.strokeStyle = PAL.sumi; x.lineWidth = 2.6; x.strokeRect(x0, y0, w, h); x.lineWidth = 1; x.strokeRect(x0 + 6, y0 + 6, w - 12, h - 12);
    x.fillStyle = PAL.sumi; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s.text, x0 + w / 2 + 26, y0 + h / 2 + 2);
    drawSeal(x, 'ふく', x0 + 44, y0 + h / 2, 44, 1, { seed: 77, normal: true });
  }, p, [0, -8]);
  ctx.restore();
}

// —— カメラ（絵巻の座標：シートは横に並ぶ） ——
const GAP = 200, SLOT = i => i * (W + GAP), C = i => [SLOT(i) + W / 2, H / 2];
// 押し込み：シート i の中心から (dx, dy) へ寄る。台紙が見えない範囲に収める
function push(i, u, zmax, dx, dy) {
  const z = 1 + (zmax - 1) * u, lx = W / 2 - W / (2 * z), ly = H / 2 - H / (2 * z);
  return { cx: C(i)[0] + clamp(dx * u, -lx, lx), cy: C(i)[1] + clamp(dy * u, -ly, ly), z };
}
function camera(t) {
  const P0 = push(0, 1, 1.06, 0, 200), P1 = push(1, 1, 1.035, 0, 100), P2 = push(2, 1, 1.13, -120, -120);
  const pan = (a, b, t0, t1) => { const u = eio(seg(t, t0, t1)); return { cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u), z: lerp(a.z, b.z, u) }; };
  const S = i => ({ cx: C(i)[0], cy: C(i)[1], z: 1 });
  if (t < T.pan01[0]) return push(0, ss(seg(t, 3, 9)), 1.06, 0, 200);
  if (t < T.pan01[1]) return pan(P0, S(1), ...T.pan01);
  if (t < T.pan12[0]) return push(1, ss(seg(t, 14.2, 16.2)), 1.035, 0, 100);
  if (t < T.pan12[1]) return pan(P1, S(2), ...T.pan12);
  if (t < T.pan23[0]) return push(2, ss(seg(t, 16.8, 20.7)), 1.13, -120, -120);
  if (t < T.pan23[1]) return pan(P2, S(3), ...T.pan23);
  return S(3);
}

window.DUR = DUR;
window.render = t => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PAL.mount; ctx.fillRect(0, 0, W, H);
  const { cx, cy, z } = camera(t);
  for (let i = 0; i < VIEWS.length; i++) {
    const sx = (SLOT(i) - cx) * z + W / 2, sy = (0 - cy) * z + H / 2;
    if (sx > W || sx + W * z < 0) continue;
    drawSheet(i, t, [z, 0, 0, z, sx, sy]);
  }
  subtitle(t);
};

// —— 音のきっかけ ——
window.EV = [
  { t: 0.15, type: 'clap' },
  ...T.print0.map(t => ({ t, type: 'baren' })),
  ...CART.flatMap(c => [{ t: c.t[0], type: 'paper' }, { t: c.t[1], type: 'seal' }]),
  { t: T.pan01[0], type: 'scroll', d: 1.5 }, { t: T.pan12[0], type: 'scroll', d: .6 }, { t: T.pan23[0], type: 'scroll', d: .5 },
  { t: T.wash[0], type: 'wash', d: .8 },
  { t: T.endSeal, type: 'bigseal' }, { t: T.endCart, type: 'paper' }, { t: T.endSlip, type: 'paper' },
];
// 画面上の文字（readcheck 用）
window.TEXTS = t => {
  const out = [], { cx, cy, z } = camera(t);
  CART.forEach((c, i) => {
    if (t < c.t[0] + .35 || !c._b) return;
    if (i === 3 && t > T.wash[0]) return;
    const sx = (SLOT(i) - cx) * z + W / 2, sy = (0 - cy) * z + H / 2;
    out.push({ id: 'cart' + i, text: c.title, x0: sx + c._b.x0 * z, y0: sy + c._b.y0 * z, x1: sx + (c._b.x0 + c._b.w) * z, y1: sy + (c._b.y0 + c._b.h) * z });
  });
  if (t > T.endCart + .35) out.push({ id: 'endc', text: 'ふくと生きる', x0: 470, y0: 920, x1: 610, y1: 1500 });
  if (t > T.endSlip + .35) out.push({ id: 'ends', text: '下関のふく問屋', x0: 330, y0: 1560, x1: 750, y1: 1652 });
  return out;
};
window.READY = true;
