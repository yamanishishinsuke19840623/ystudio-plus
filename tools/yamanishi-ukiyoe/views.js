// 山西水産 · 四枚の版画（縦 1080×1920）。各版は g0 墨 / g1 藍 / g2 緑・灰・木 / g3 朱・肌 に分けて描く。
import { clamp, lerp, mulberry, hash, vnoise, TAU } from '/core/lib.js';
import { W, H, FR, PAL, mk, rgba, mix, smooth, poly, carve, wob, line, fillPath, bokashi, kasumi } from './print.js';

const q = (t, fps = 8) => Math.floor(t * fps) / fps;

// —— 共通の小道具 ——
// 遠山（墨線なし、淡色）
function ridge(x, pts, base, col, a = 1) {
  x.save(); x.globalAlpha = a; x.fillStyle = col; x.beginPath();
  x.moveTo(pts[0][0], base); x.lineTo(pts[0][0], pts[0][1]); smoothTail(x, pts); x.lineTo(pts[pts.length - 1][0], base); x.closePath(); x.fill(); x.restore();
}
function smoothTail(x, p) { for (let i = 1; i < p.length - 1; i++) x.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2); x.lineTo(p[p.length - 1][0], p[p.length - 1][1]); }

// 帯になった海（藍の帯の間をぼかしでつなぐ）
function seaBands(x, y0, y1, bands) {
  x.fillStyle = bands[0][1]; x.fillRect(0, y0, W, y1 - y0);
  for (let i = 1; i < bands.length; i++) { const [yy, col] = bands[i]; bokashi(x, 0, yy - 70, W, yy + 40, col, 0, 1, { rough: 24, seed: i * 7 }); x.fillStyle = col; x.fillRect(0, yy + 40, W, y1 - yy - 40); }
}
// 波頭の白線（紙の白で抜く）: 平行な弧の列
function waveRows(x, y0, y1, step, seed, a = .85) {
  x.save(); x.globalCompositeOperation = 'destination-out'; x.strokeStyle = `rgba(0,0,0,${a})`; x.lineCap = 'round';
  const R = mulberry(seed); let row = 0;
  for (let y = y0; y < y1; y += step, row++) {
    const sc = .55 + (y - y0) / (y1 - y0) * .7, sp = 150 * sc;
    for (let X = -60 + (row % 2) * sp / 2 + R() * 30; X < W + 60; X += sp) {
      x.lineWidth = 2.2 + sc * 1.6; x.beginPath(); x.moveTo(X - 40 * sc, y); x.quadraticCurveTo(X, y - 14 * sc, X + 40 * sc, y + 2); x.stroke();
      x.lineWidth = 1.4 + sc; x.beginPath(); x.moveTo(X - 18 * sc, y + 12 * sc); x.quadraticCurveTo(X + 6 * sc, y + 3 * sc, X + 24 * sc, y + 13 * sc); x.stroke();
    }
  }
  x.restore();
}
// 松の枝（平らな葉の塊＋針の扇）
function pineBranch(x, k, gLayer) {
  const br = [[1060, 150], [930, 210], [820, 260], [700, 300], [600, 360]];
  const pads = [[930, 180, 120, 46], [800, 230, 140, 50], [660, 280, 120, 44], [990, 300, 110, 40], [860, 340, 100, 38]];
  if (gLayer === 2) {
    carve(x, br, 26, { taper: [0, .7], seed: 3, col: PAL.woodD });
    carve(x, [[900, 220], [960, 300], [990, 320]], 12, { taper: [0, .8], seed: 5, col: PAL.woodD });
    carve(x, [[760, 280], [820, 330], [860, 345]], 10, { taper: [0, .8], seed: 6, col: PAL.woodD });
    for (const [cx, cy, w, h] of pads) padShape(x, cx, cy, w, h, PAL.pine);
  } else {
    x.strokeStyle = PAL.sumi; x.lineWidth = 2.4; x.lineCap = 'round';
    x.beginPath(); smooth(x, br.map(([a, b]) => [a, b - 12])); x.stroke(); x.beginPath(); smooth(x, br.map(([a, b]) => [a, b + 12])); x.stroke();
    for (const [cx, cy, w, h] of pads) {
      x.lineWidth = 2.6; x.beginPath(); x.moveTo(cx - w / 2, cy + h * .25); x.quadraticCurveTo(cx, cy + h * .45, cx + w / 2, cy + h * .25); x.stroke();
      x.lineWidth = 1.3; for (let i = 0; i <= 14; i++) { const u = i / 14, px = cx - w / 2 + u * w, top = cy - h * .5 * Math.sin(u * Math.PI) * .9; x.beginPath(); x.moveTo(cx + (px - cx) * .3, cy + h * .25); x.lineTo(px, top); x.stroke(); }
    }
  }
}
function padShape(x, cx, cy, w, h, col) { x.fillStyle = col; x.beginPath(); x.moveTo(cx - w / 2, cy + h * .25); x.quadraticCurveTo(cx - w * .45, cy - h * .5, cx, cy - h * .55); x.quadraticCurveTo(cx + w * .45, cy - h * .5, cx + w / 2, cy + h * .25); x.quadraticCurveTo(cx, cy + h * .45, cx - w / 2, cy + h * .25); x.fill(); }

// 小舟（横向き、櫓をこぐ人）
export function boat(x, cx, cy, s, ph, { sail = true } = {}) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  // 船体
  const hull = [[-120, -10], [-60, 4], [60, 4], [128, -22], [112, 14], [70, 28], [-80, 28], [-118, 6]];
  x.fillStyle = PAL.wood; x.beginPath(); poly(x, hull); x.fill();
  x.fillStyle = PAL.woodD; x.fillRect(-90, 14, 170, 8);
  x.strokeStyle = PAL.sumi; x.lineWidth = 2.6; x.lineJoin = 'round'; x.beginPath(); poly(x, hull); x.stroke();
  x.lineWidth = 1.6; x.beginPath(); x.moveTo(-104, 8); x.lineTo(100, 8); x.stroke();
  if (sail) {
    // 帆（紙の白）と帆柱
    x.lineWidth = 3; x.beginPath(); x.moveTo(-6, 4); x.lineTo(-6, -170); x.stroke();
    x.fillStyle = PAL.white; x.beginPath(); x.moveTo(-2, -160); x.lineTo(70, -150); x.lineTo(74, -30); x.lineTo(-2, -26); x.closePath(); x.fill();
    x.lineWidth = 2.2; x.stroke(); x.lineWidth = 1.2; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(-2 + i * 19, -158 + i * 2.5); x.lineTo(-2 + i * 19, -28); x.stroke(); }
  }
  // こぎ手（艫に立つ）
  const sw = Math.sin(ph) * 8;
  x.fillStyle = PAL.ai; x.beginPath(); x.moveTo(-104, -6); x.lineTo(-84, -6); x.lineTo(-88, -50); x.lineTo(-100, -50); x.closePath(); x.fill();
  x.strokeStyle = PAL.sumi; x.lineWidth = 2; x.stroke();
  x.fillStyle = PAL.skin; x.beginPath(); x.arc(-94, -60, 9, 0, TAU); x.fill(); x.stroke();
  x.fillStyle = PAL.sumi; x.beginPath(); x.arc(-94, -63, 9, Math.PI, TAU); x.fill();
  x.fillStyle = PAL.white; x.fillRect(-103, -64, 18, 3);
  // 櫓
  x.lineWidth = 3; x.beginPath(); x.moveTo(-88, -40 + sw * .3); x.lineTo(-150 - sw, 30); x.stroke();
  x.lineWidth = 2; x.beginPath(); x.moveTo(-94, -42); x.lineTo(-88, -40 + sw * .3); x.stroke();
  x.restore();
}

// 虎河豚（横向き、左向き）。s = 体長 / 600
export function fugu(x, cx, cy, s, { blink = 0, fin = 0 } = {}) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  const body = [[-300, 10], [-280, -60], [-200, -118], [-80, -140], [60, -118], [170, -70], [240, -28], [262, -4], [240, 22], [170, 60], [50, 104], [-90, 118], [-220, 92], [-288, 50]];
  const back = PAL.sumiL, backD = '#2f2b27';
  // 尾びれ
  const tail = [[248, -6], [300, -70], [322, -40], [310, 0], [324, 44], [300, 70]];
  x.fillStyle = mix(PAL.greyD, PAL.ochre, .25); x.beginPath(); poly(x, tail); x.fill();
  // 体（腹は紙の白、背は墨茶）
  x.save(); x.beginPath(); smooth(x, body, true); x.clip();
  x.fillStyle = PAL.white; x.fillRect(-320, -160, 640, 300);
  x.fillStyle = back; x.beginPath(); x.moveTo(-320, 26); x.quadraticCurveTo(-180, -10, -60, 12); x.quadraticCurveTo(80, 34, 200, 4); x.lineTo(320, -10); x.lineTo(320, -170); x.lineTo(-320, -170); x.closePath(); x.fill();
  // 背の小さな斑
  const R = mulberry(77); x.fillStyle = backD;
  for (let i = 0; i < 70; i++) { const px = -260 + R() * 500, py = -130 + R() * 130; if (py > -10 + Math.sin(px * .01) * 14) continue; x.beginPath(); x.ellipse(px, py, 4 + R() * 7, 3 + R() * 5, R() * 3, 0, TAU); x.fill(); }
  // 腹の黄みのぼかし
  const gr = x.createLinearGradient(0, 30, 0, 120); gr.addColorStop(0, rgba(PAL.ochreL, 0)); gr.addColorStop(1, rgba(PAL.ochreL, .35)); x.fillStyle = gr; x.fillRect(-320, 30, 640, 100);
  x.restore();
  // 胸びれの後ろの大きな黒紋（白の縁取り）
  x.fillStyle = PAL.white; x.beginPath(); x.ellipse(-10, -40, 40, 34, 0, 0, TAU); x.fill();
  x.fillStyle = '#1c1916'; x.beginPath(); x.ellipse(-10, -40, 30, 25, 0, 0, TAU); x.fill();
  x.strokeStyle = PAL.sumi; x.lineWidth = 2.2; x.beginPath(); x.ellipse(-10, -40, 40, 34, 0, 0, TAU); x.stroke();
  // 輪郭（彫りの線）
  carve(x, body.slice(0, 9), 4.2, { taper: [.08, .1], seed: 11, col: PAL.sumi });
  carve(x, body.slice(8).concat([body[0]]), 4.2, { taper: [.1, .08], seed: 12, col: PAL.sumi });
  x.strokeStyle = PAL.sumi; x.lineWidth = 2.6; x.beginPath(); poly(x, tail); x.stroke();
  x.lineWidth = 1.2; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(256, -2); x.lineTo(306 + i * 3, -60 + i * 28); x.stroke(); }
  // 背びれ・しりびれ
  x.fillStyle = mix(PAL.greyD, PAL.ochre, .25); x.beginPath(); x.moveTo(150, -82); x.quadraticCurveTo(178, -120, 200, -64); x.closePath(); x.fill(); x.lineWidth = 2; x.stroke();
  x.fillStyle = PAL.white; x.beginPath(); x.moveTo(140, 70); x.quadraticCurveTo(176, 108, 196, 52); x.closePath(); x.fill(); x.stroke();
  // 胸びれ（羽ばたき）
  const fa = fin * .25;
  x.save(); x.translate(-110, -2); x.rotate(-.2 + fa);
  x.fillStyle = mix(PAL.ochre, PAL.greyD, .35); x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(30, -46, 62, -30); x.quadraticCurveTo(54, 6, 0, 18); x.closePath(); x.fill(); x.lineWidth = 2; x.stroke();
  x.lineWidth = 1; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(4, 6); x.lineTo(56 - i * 4, -30 + i * 11); x.stroke(); }
  x.restore();
  // 目
  x.fillStyle = PAL.ochreL; x.beginPath(); x.arc(-206, -52, 21, 0, TAU); x.fill(); x.lineWidth = 2.4; x.stroke();
  x.fillStyle = PAL.sumi; if (blink) { x.fillRect(-224, -54, 36, 4); } else { x.beginPath(); x.arc(-208, -52, 10, 0, TAU); x.fill(); x.fillStyle = PAL.white; x.beginPath(); x.arc(-212, -56, 3, 0, TAU); x.fill(); }
  // 口（くちばしの歯）
  x.fillStyle = PAL.white; x.beginPath(); x.moveTo(-300, 4); x.lineTo(-312, 12); x.lineTo(-298, 22); x.closePath(); x.fill(); x.lineWidth = 2; x.stroke();
  x.lineWidth = 1.6; x.beginPath(); x.moveTo(-306, 12); x.lineTo(-296, 13); x.stroke();
  x.restore();
}

// 市場の人（小さく平らなシルエット。顔は数筆）。h ≈ 130px
export function person(x, fx, fy, s, { arm = 0, face = 1, coat = PAL.ai, band = PAL.white, carry = false, step = 0 } = {}) {
  x.save(); x.translate(fx, fy); x.scale(s * face, s);
  x.strokeStyle = PAL.sumi; x.lineWidth = 2.2 / s; x.lineJoin = 'round'; x.lineCap = 'round';
  // 脚（股引）と長靴
  const st = step ? Math.sin(step) * 8 : 0;
  x.fillStyle = '#1d2c44'; x.beginPath(); poly(x, [[-12, -48], [-2, -48], [-4 + st, -6], [-14 + st, -6]]); x.fill(); x.stroke();
  x.beginPath(); poly(x, [[2, -48], [12, -48], [12 - st, -6], [2 - st, -6]]); x.fill(); x.stroke();
  x.fillStyle = PAL.sumi; x.fillRect(-16 + st, -8, 14, 8); x.fillRect(0 - st, -8, 14, 8);
  // 法被
  x.fillStyle = coat; x.beginPath(); poly(x, [[-20, -104], [20, -104], [24, -46], [-24, -46]]); x.fill(); x.stroke();
  x.strokeStyle = PAL.white; x.lineWidth = 3.4; x.beginPath(); x.moveTo(-6, -104); x.lineTo(-10, -58); x.stroke();
  x.strokeStyle = PAL.sumi; x.lineWidth = 2.2;
  // 腕
  const a = arm * Math.PI * .75;
  x.save(); x.translate(14, -98); x.rotate(-a);
  x.fillStyle = coat; x.beginPath(); poly(x, [[-5, 0], [7, 0], [8, 30], [-4, 30]]); x.fill(); x.stroke();
  x.fillStyle = PAL.skin; x.beginPath(); x.arc(2, 36, 6, 0, TAU); x.fill(); x.stroke();
  x.restore();
  x.fillStyle = coat; x.beginPath(); poly(x, [[-22, -100], [-12, -100], [-14, -66], [-26, -68]]); x.fill(); x.stroke();
  x.fillStyle = PAL.skin; x.beginPath(); x.arc(-20, -62, 6, 0, TAU); x.fill(); x.stroke();
  if (carry) { x.fillStyle = PAL.woodL; x.beginPath(); x.ellipse(-24, -70, 22, 10, 0, 0, TAU); x.fill(); x.stroke(); x.fillStyle = PAL.prusL; x.beginPath(); x.ellipse(-24, -73, 17, 5, 0, 0, TAU); x.fill(); }
  // 頭・鉢巻
  x.fillStyle = PAL.skin; x.beginPath(); x.arc(0, -118, 13, 0, TAU); x.fill(); x.stroke();
  x.fillStyle = PAL.sumi; x.beginPath(); x.arc(0, -121, 13, Math.PI * 1.05, Math.PI * 1.95); x.fill();
  x.fillStyle = band; x.fillRect(-13, -124, 26, 5); x.strokeRect(-13, -124, 26, 5);
  x.beginPath(); x.moveTo(13, -122); x.lineTo(20, -128); x.stroke();
  x.lineWidth = 1.4 / s; x.beginPath(); x.moveTo(-8, -114); x.lineTo(-4, -114); x.stroke();
  x.restore();
}

// 桶（上から少し見下ろした楕円）とその中のふく
function tub(x, cx, cy, r, g, seed) {
  if (g === 2) {
    x.fillStyle = PAL.woodL; x.beginPath(); x.ellipse(cx, cy, r, r * .36, 0, 0, Math.PI); x.lineTo(cx - r * .92, cy + r * .5); x.ellipse(cx, cy + r * .5, r * .92, r * .3, 0, Math.PI, 0, true); x.closePath(); x.fill();
    x.fillStyle = PAL.greenD; x.fillRect(cx - r, cy + r * .12, r * 2, 7); x.fillRect(cx - r * .95, cy + r * .36, r * 1.9, 6);
  } else if (g === 1) {
    x.fillStyle = PAL.prusL; x.beginPath(); x.ellipse(cx, cy, r * .9, r * .3, 0, 0, TAU); x.fill();
  } else if (g === 0) {
    x.strokeStyle = PAL.sumi; x.lineWidth = 2.4; x.beginPath(); x.ellipse(cx, cy, r, r * .36, 0, 0, TAU); x.stroke();
    x.beginPath(); x.moveTo(cx - r, cy); x.lineTo(cx - r * .92, cy + r * .5); x.ellipse(cx, cy + r * .5, r * .92, r * .3, 0, Math.PI, 0, true); x.lineTo(cx + r, cy); x.stroke();
    const R = mulberry(seed);
    for (let i = 0; i < 3; i++) { const px = cx + (R() - .5) * r * 1.0, py = cy + (R() - .5) * r * .22; x.save(); x.beginPath(); x.ellipse(cx, cy, r * .9, r * .3, 0, 0, TAU); x.clip(); fugu(x, px, py, .085 + R() * .02); x.restore(); }
  }
}

// —— 一：関門 夜明 ——
const V0 = {
  id: 'sea',
  layers: {
    g1: { g: 1, grain: .055, draw: x => {
      // 空：上から藍のぼかし → 地平の桃色
      x.fillStyle = PAL.skyL; x.fillRect(0, 0, W, 900);
      bokashi(x, 0, 380, W, 860, PAL.beniP, 0, .95, { rough: 26, seed: 4 });
      bokashi(x, 0, 40, W, 560, PAL.prus, .95, 0, { rough: 28, seed: 2 });
      // 遠山（対岸）
      ridge(x, wob([[0, 760], [90, 712], [180, 690], [260, 706], [360, 668], [450, 700], [560, 742], [620, 780]], 4, 3), 900, PAL.sky);
      ridge(x, wob([[540, 800], [640, 762], [760, 730], [850, 748], [960, 712], [1080, 734]], 4, 5), 900, mix(PAL.sky, PAL.prusL, .45));
      // 海
      seaBands(x, 860, H, [[860, PAL.skyL], [1000, PAL.prusL], [1260, PAL.prus], [1620, PAL.prusD]]);
      // 霞（紙の白で抜く）
      x.save(); x.globalCompositeOperation = 'destination-out';
      kasumi(x, 330, 820, 620, 46, '#000000', .9); kasumi(x, 820, 880, 560, 40, '#000000', .85); kasumi(x, 700, 470, 520, 54, '#000000', .8);
      x.restore();
      waveRows(x, 990, 1880, 74, 9);
    } },
    g2: { g: 2, draw: x => { pineBranch(x, 0, 2); } },
    g3: { g: 3, draw: x => {
      x.fillStyle = PAL.beni; x.beginPath(); x.arc(320, 600, 56, 0, TAU); x.fill();
    } },
    g0: { g: 0, draw: x => { pineBranch(x, 0, 0); } },
  },
  paint(ctx, t, R) {
    R.L('g1'); R.L('g2'); R.L('g3'); R.L('g0');
    // 小舟（8fps で揺れる）
    const tq = q(t), bob = Math.sin(tq * 2.2) * 6, dx = tq * 6;
    R.D(0, x => boat(x, 600 + dx, 1250 + bob, 1.15, tq * 3.1));
    // かもめ
    R.D(0, x => gulls(x, tq, [[760, 560], [840, 520], [690, 610]]));
  },
};
export function gulls(x, tq, pos) {
  x.strokeStyle = PAL.sumi; x.lineWidth = 2.2; x.lineCap = 'round';
  pos.forEach(([gx, gy], i) => { const f = Math.sin(tq * 9 + i * 2) * 8, px = gx - tq * 10, s = .9 + i * .1; x.beginPath(); x.moveTo(px - 18 * s, gy - f * s); x.quadraticCurveTo(px - 8 * s, gy - 8 * s, px, gy); x.quadraticCurveTo(px + 8 * s, gy - 8 * s, px + 18 * s, gy - f * s); x.stroke(); });
}

// —— 二：南風泊 朝市 ——
const ROOF = { y0: 560, y1: 720 }, FLOOR = 1150;
const TUBS = [[170, 1110, 92, 1], [370, 1130, 96, 2], [575, 1112, 92, 3], [780, 1130, 96, 4], [960, 1112, 74, 5]];
const V1 = {
  id: 'market',
  layers: {
    g1: { g: 1, grain: .055, draw: x => {
      x.fillStyle = PAL.skyL; x.fillRect(0, 0, W, 760);
      bokashi(x, 0, 40, W, 420, PAL.sky, 1, 0, { rough: 26, seed: 8 });
      ridge(x, wob([[0, 470], [140, 430], [260, 446], [420, 400], [600, 432], [760, 410], [900, 440], [1080, 420]], 4, 9), 640, PAL.sky, .9);
      seaBands(x, 1230, H, [[1230, PAL.skyL], [1330, PAL.prusL], [1520, PAL.prus], [1760, PAL.prusD]]);
      TUBS.forEach(([cx, cy, r]) => tub(x, cx, cy, r, 1));
      x.save(); x.globalCompositeOperation = 'destination-out'; kasumi(x, 380, 330, 620, 50, '#000000', .85); kasumi(x, 760, 470, 520, 42, '#000000', .8); x.restore();
      waveRows(x, 1300, 1880, 68, 13);
    } },
    g2: { g: 2, draw: x => {
      // 屋根（瓦は灰）
      x.fillStyle = PAL.greyL; x.beginPath(); poly(x, [[90, ROOF.y0], [990, ROOF.y0], [1060, ROOF.y1], [20, ROOF.y1]]); x.fill();
      // 軒下（土壁）と柱
      x.fillStyle = PAL.plaster; x.fillRect(40, ROOF.y1, 1000, FLOOR - ROOF.y1);
      x.fillStyle = mix(PAL.plaster, PAL.wood, .25); x.fillRect(40, ROOF.y1, 1000, 46);
      x.fillStyle = PAL.wood; [90, 360, 720, 990].forEach(px => x.fillRect(px - 9, ROOF.y1, 18, FLOOR - ROOF.y1));
      x.fillStyle = PAL.woodD; x.fillRect(20, ROOF.y1 - 4, 1040, 16);
      // 床と岸壁
      x.fillStyle = mix(PAL.greyL, PAL.plaster, .4); x.fillRect(40, FLOOR, 1000, 80);
      x.fillStyle = PAL.grey; x.fillRect(40, FLOOR + 80, 1000, 16);
      TUBS.forEach(([cx, cy, r]) => tub(x, cx, cy, r, 2));
      // 舫った舟（遠景）
    } },
    g3: { g: 3, draw: x => { } },
    g0: { g: 0, draw: x => {
      x.strokeStyle = PAL.sumi; x.lineWidth = 3; x.lineJoin = 'round';
      x.beginPath(); poly(x, [[90, ROOF.y0], [990, ROOF.y0], [1060, ROOF.y1], [20, ROOF.y1]]); x.stroke();
      // 瓦の筋：平行で斜め（透視で収束させない）
      x.lineWidth = 1.5; for (let i = 0; i < 46; i++) { const px = 60 + i * 22; x.beginPath(); x.moveTo(px + 24, ROOF.y0 + 4); x.lineTo(px - 8, ROOF.y1 - 4); x.stroke(); }
      x.lineWidth = 1.2; for (let k = 1; k < 4; k++) { const y = ROOF.y0 + k * 40; x.beginPath(); x.moveTo(90 - k * 17, y); x.lineTo(990 + k * 17, y); x.stroke(); }
      x.lineWidth = 2.6; x.strokeRect(20, ROOF.y1 - 4, 1040, 16);
      [90, 360, 720, 990].forEach(px => { x.beginPath(); x.moveTo(px - 9, ROOF.y1 + 12); x.lineTo(px - 9, FLOOR); x.moveTo(px + 9, ROOF.y1 + 12); x.lineTo(px + 9, FLOOR); x.stroke(); });
      x.lineWidth = 2.4; x.beginPath(); x.moveTo(40, FLOOR); x.lineTo(1040, FLOOR); x.stroke(); x.beginPath(); x.moveTo(40, FLOOR + 80); x.lineTo(1040, FLOOR + 80); x.stroke();
      x.beginPath(); x.moveTo(40, FLOOR + 96); x.lineTo(1040, FLOOR + 96); x.stroke();
      // 石積みの目地
      x.lineWidth = 1.2; for (let i = 0; i < 20; i++) { x.beginPath(); x.moveTo(60 + i * 52, FLOOR + 80); x.lineTo(60 + i * 52, FLOOR + 96); x.stroke(); }
    } },
  },
  paint(ctx, t, R) {
    R.L('g1'); R.L('g2'); R.L('g0');
    const tq = q(t);
    // 人（桶の後ろに立つ）
    R.D(3, x => {
      const up = i => clamp(Math.sin(tq * 2.4 + i * 1.7) * 1.4 - .2, 0, 1);
      person(x, 270, 1100, 1.05, { arm: up(0), face: 1 });
      person(x, 470, 1105, 1.0, { arm: up(1) * .6, face: -1, coat: PAL.prusD });
      person(x, 680, 1100, 1.05, { arm: up(2), face: 1, band: PAL.beniL });
      person(x, 880, 1104, .98, { arm: .1, face: -1 });
      TUBS.forEach(([cx, cy, r, s]) => { tub(x, cx, cy, r, 2); });
    });
    R.D(1, x => TUBS.forEach(([cx, cy, r]) => tub(x, cx, cy, r, 1)));
    R.D(0, x => TUBS.forEach(([cx, cy, r, s]) => tub(x, cx, cy, r, 0, s)));
    // 岸壁を歩く人（右 → 左、8fps）
    const wx = 1000 - (t - 9) * 46;
    R.D(3, x => person(x, wx, FLOOR + 74, 1.12, { face: -1, carry: true, step: Math.floor(t * 8) * 1.6 }));
    // 提灯（揺れ）
    R.D(3, x => [[230, 0], [540, 1], [850, 2]].forEach(([lx, i]) => {
      const a = Math.sin(tq * 2 + i) * .06; x.save(); x.translate(lx, ROOF.y1 + 12); x.rotate(a);
      x.strokeStyle = PAL.sumi; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 24); x.stroke();
      x.fillStyle = PAL.beni; x.beginPath(); x.ellipse(0, 62, 26, 38, 0, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = PAL.sumi; x.fillRect(-18, 22, 36, 7); x.fillRect(-18, 96, 36, 7);
      x.lineWidth = 1.2; for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(-25, 62 + k * 18); x.quadraticCurveTo(0, 70 + k * 18, 25, 62 + k * 18); x.stroke(); } x.restore();
    }));
    // 舫った舟
    R.D(0, x => { boat(x, 300 + Math.sin(tq * 2) * 3, 1420 + Math.sin(tq * 2.3) * 4, .9, 0, { sail: false }); boat(x, 760, 1560 + Math.sin(tq * 2.1 + 1) * 4, 1.0, 1, { sail: false }); });
    R.D(0, x => gulls(x, tq, [[300, 250], [380, 210]]));
  },
};

// —— 三：目利（手元のふく） ——
const V2 = {
  id: 'hands',
  layers: {
    g1: { g: 1, grain: .055, draw: x => {
      x.fillStyle = PAL.skyL; x.fillRect(0, 0, W, H);
      bokashi(x, 0, 40, W, 700, PAL.prusL, .9, 0, { rough: 30, seed: 21 });
      // 桶の水
      x.fillStyle = PAL.prus; x.beginPath(); x.ellipse(540, 1560, 620, 260, 0, 0, TAU); x.fill();
      bokashi(x, 0, 1330, W, 1520, PAL.prusL, .8, 0, { rough: 20, seed: 23 });
      x.save(); x.globalCompositeOperation = 'destination-out'; x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 3;
      for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(540 + (i % 2) * 60 - 30, 1560, 120 + i * 80, 40 + i * 28, 0, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); }
      x.restore();
    } },
    g2: { g: 2, draw: x => {
      // 桶の縁（木）とたが（竹）
      x.strokeStyle = PAL.woodL; x.lineWidth = 46; x.beginPath(); x.ellipse(540, 1560, 640, 280, 0, Math.PI, TAU); x.stroke();
      x.strokeStyle = PAL.greenD; x.lineWidth = 12; x.beginPath(); x.ellipse(540, 1600, 690, 300, 0, Math.PI * 1.02, Math.PI * 1.98); x.stroke();
    } },
    g3: { g: 3, draw: x => { } },
    g0: { g: 0, draw: x => {
      x.strokeStyle = PAL.sumi; x.lineWidth = 2.6;
      x.beginPath(); x.ellipse(540, 1560, 617, 257, 0, Math.PI, TAU); x.stroke();
      x.beginPath(); x.ellipse(540, 1560, 663, 303, 0, Math.PI * 1.03, Math.PI * 1.97); x.stroke();
      x.lineWidth = 1.4; for (let i = 0; i < 18; i++) { const a = Math.PI * (1.08 + i * .047), r1 = [617, 257], r2 = [663, 303]; x.beginPath(); x.moveTo(540 + Math.cos(a) * r1[0], 1560 + Math.sin(a) * r1[1]); x.lineTo(540 + Math.cos(a) * r2[0], 1560 + Math.sin(a) * r2[1]); x.stroke(); }
    } },
  },
  paint(ctx, t, R) {
    R.L('g1'); R.L('g2'); R.L('g0');
    const tq = q(t), lift = 40 * (1 - clamp((tq - 16.6) / 1.4)) ** 2, fy = 880 + lift;
    // 袖と手（左右）
    R.D(3, x => { hand(x, -1, fy); hand(x, 1, fy); });
    R.D(2, x => fugu(x, 545, fy, 1.38, { fin: Math.sin(tq * 6), blink: (tq > 19.5 && tq < 19.75) ? 1 : 0 }));
    R.D(3, x => { fingers(x, -1, fy); fingers(x, 1, fy); });
    // しずく（12fps）
    const t12 = Math.floor(t * 12) / 12;
    R.D(1, x => { for (let k = 0; k < 4; k++) { const ph = ((t12 - 16.5) * .9 + k * .27) % 1; if (t12 < 16.5 + k * .2) continue; const dx = [430, 600, 520, 690][k], y = fy + 120 + ph * (1380 - fy - 120); x.fillStyle = PAL.prusL; x.strokeStyle = PAL.sumi; x.lineWidth = 1.4; x.beginPath(); x.ellipse(dx, y, 5, 8, 0, 0, TAU); x.fill(); x.stroke(); } });
  },
};
// 腕と手のひら（ふくの腹の下から支える）。belly = 手の位置での腹の下端
const HANDS = { '-1': { hx: 360, belly: 150 }, '1': { hx: 720, belly: 108 } };
function hand(x, side, fy) {
  const { hx, belly } = HANDS[side], by = fy + belly;
  x.save(); x.strokeStyle = PAL.sumi; x.lineJoin = 'round'; x.lineCap = 'round';
  // 袖（藍、太く）
  const sx = side < 0 ? 40 : 1040;
  x.fillStyle = PAL.ai; x.lineWidth = 2.8;
  x.beginPath(); x.moveTo(sx, 1900); x.lineTo(sx, 1500); x.quadraticCurveTo(hx - side * 150, by + 260, hx - side * 120, by + 120);
  x.lineTo(hx + side * 30, by + 150); x.quadraticCurveTo(hx + side * 40, by + 420, sx + side * 330, 1900); x.closePath(); x.fill(); x.stroke();
  // 袖の折り目
  x.lineWidth = 1.6; x.beginPath(); x.moveTo(hx - side * 60, by + 200); x.quadraticCurveTo(hx - side * 100, by + 420, sx + side * 150, 1880); x.stroke();
  // 袖口の白
  x.strokeStyle = PAL.white; x.lineWidth = 8; x.beginPath(); x.moveTo(hx - side * 116, by + 128); x.lineTo(hx + side * 26, by + 156); x.stroke();
  // 手のひら（腹の下に見える厚み）
  x.fillStyle = PAL.skin; x.strokeStyle = PAL.sumi; x.lineWidth = 2.6;
  x.beginPath(); x.moveTo(hx - side * 112, by + 122); x.quadraticCurveTo(hx - side * 120, by + 10, hx - side * 40, by - 18);
  x.lineTo(hx + side * 110, by - 26); x.quadraticCurveTo(hx + side * 150, by + 4, hx + side * 120, by + 30);
  x.quadraticCurveTo(hx + side * 70, by + 60, hx + side * 30, by + 146); x.closePath(); x.fill(); x.stroke();
  // 指先の重なり（手前側の線だけ）
  x.lineWidth = 1.6; for (let i = 0; i < 3; i++) { const fx = hx + side * (40 + i * 28); x.beginPath(); x.moveTo(fx, by - 22 + i * 4); x.quadraticCurveTo(fx + side * 16, by + 6, fx + side * 6, by + 30 - i * 3); x.stroke(); }
  x.restore();
}
// 親指（ふくの脇腹にかかる）
function fingers(x, side, fy) {
  const { hx, belly } = HANDS[side], by = fy + belly;
  x.save(); x.fillStyle = PAL.skin; x.strokeStyle = PAL.sumi; x.lineWidth = 2.6; x.lineJoin = 'round';
  const b0 = [hx - side * 70, by + 40], tip = [hx - side * 8, by - 70];
  x.beginPath(); x.moveTo(b0[0] - side * 30, b0[1]); x.quadraticCurveTo(hx - side * 74, by - 40, tip[0] - side * 14, tip[1] + 2);
  x.quadraticCurveTo(tip[0] + side * 10, tip[1] - 10, tip[0] + side * 16, tip[1] + 16); x.quadraticCurveTo(hx - side * 30, by - 10, b0[0] + side * 30, b0[1] + 10); x.closePath(); x.fill(); x.stroke();
  // 爪
  x.lineWidth = 1.4; x.beginPath(); x.ellipse(tip[0] + side * 2, tip[1] + 10, 7, 10, side * .5, 0, TAU); x.stroke();
  x.restore();
}

// —— 四：ふく刺 ——
const PC = [540, 860], PR = 430;
export const PETALS = (() => {
  const out = []; const ring = (n, r0, r1, off, w) => { for (let i = 0; i < n; i++) out.push({ a: off + i / n * TAU, r0, r1, w }); };
  ring(34, 160, 392, 0, .3); ring(22, 92, 262, .09, .34); ring(12, 60, 160, .2, .42);
  return out;
})();
const V3 = {
  id: 'plate',
  layers: {
    g2: { g: 2, grain: .16, draw: x => {
      // 漆の卓（濃い木）
      x.fillStyle = mix(PAL.woodD, PAL.sumi, .35); x.fillRect(0, 0, W, H);
      x.fillStyle = PAL.woodD; x.fillRect(0, 1500, W, 420);
      // 箸と箸置き
      carve(x, [[1060, 1520], [880, 1360], [690, 1230]], 18, { taper: [0, .5], seed: 31, col: PAL.woodL });
      carve(x, [[1060, 1560], [870, 1400], [700, 1270]], 18, { taper: [0, .5], seed: 32, col: PAL.woodL });
    } },
    g1: { g: 1, grain: .055, draw: x => {
      // 藍の大皿
      x.fillStyle = PAL.prus; x.beginPath(); x.arc(PC[0], PC[1], PR, 0, TAU); x.fill();
      x.strokeStyle = PAL.prusL; x.lineWidth = 26; x.beginPath(); x.arc(PC[0], PC[1], PR - 30, 0, TAU); x.stroke();
      // 皿の波文（紙の白で抜く）
      x.save(); x.beginPath(); x.arc(PC[0], PC[1], PR - 50, 0, TAU); x.clip(); x.globalCompositeOperation = 'destination-out'; x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 3;
      for (let y = PC[1] - PR; y < PC[1] + PR; y += 46) for (let X = PC[0] - PR + ((y / 46) % 2) * 35; X < PC[0] + PR; X += 70) { x.beginPath(); x.arc(X, y + 30, 30, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); }
      x.restore();
      // ポン酢の小皿
      x.fillStyle = PAL.prusL; x.beginPath(); x.arc(220, 1440, 104, 0, TAU); x.fill();
      x.fillStyle = mix(PAL.woodD, PAL.ochre, .3); x.beginPath(); x.arc(220, 1440, 76, 0, TAU); x.fill();
    } },
    g3: { g: 3, draw: x => {
      x.fillStyle = PAL.beni; x.beginPath(); x.ellipse(PC[0] + 70, PC[1] + 54, 30, 20, .3, 0, TAU); x.fill();
      x.fillStyle = PAL.beniL; x.fillRect(830, 1290, 70, 34);
    } },
    g0: { g: 0, draw: x => {
      x.strokeStyle = PAL.sumi; x.lineWidth = 3; x.beginPath(); x.arc(PC[0], PC[1], PR, 0, TAU); x.stroke();
      x.lineWidth = 1.6; x.beginPath(); x.arc(PC[0], PC[1], PR - 50, 0, TAU); x.stroke();
      x.lineWidth = 2.4; x.beginPath(); x.arc(220, 1440, 104, 0, TAU); x.stroke(); x.beginPath(); x.arc(220, 1440, 76, 0, TAU); x.stroke();
      x.strokeRect(830, 1290, 70, 34);
      x.beginPath(); x.ellipse(PC[0] + 70, PC[1] + 54, 30, 20, .3, 0, TAU); x.stroke();
    } },
  },
  paint(ctx, t, R) {
    R.L('g2'); R.L('g1');
    // 薄造り：紙の白、身越しに藍が透ける。8fps で一枚ずつ並ぶ
    const n = Math.floor(clamp((q(t) - 21.0) / 1.5) * PETALS.length + (t >= 22.6 ? PETALS.length : 0));
    R.D(2, x => {
      x.save(); x.lineJoin = 'round';
      for (let i = 0; i < Math.min(n, PETALS.length); i++) {
        const p = PETALS[i], ca = Math.cos(p.a), sa = Math.sin(p.a), na = -sa, nb = ca, mid = (p.r0 + p.r1) / 2, hw = mid * p.w * .5;
        const P = (r, o) => [PC[0] + ca * r + na * o, PC[1] + sa * r + nb * o];
        const pts = [P(p.r0, 0), P(mid - 40, hw), P(p.r1 - 10, hw * .7), P(p.r1, 0), P(p.r1 - 10, -hw * .6), P(mid - 30, -hw * .9)];
        x.fillStyle = rgba(PAL.white, .5); x.beginPath(); smooth(x, pts, true); x.fill();
        x.strokeStyle = rgba(PAL.greyD, .55); x.lineWidth = 1.2; x.stroke();
      }
      x.restore();
    });
    R.D(2, x => {
      // 薬味：あさつき
      const R = mulberry(5);
      for (let i = 0; i < 26; i++) { const a = R() * TAU, r = R() * 44; x.fillStyle = R() < .5 ? PAL.green : PAL.greenL; x.save(); x.translate(PC[0] + Math.cos(a) * r, PC[1] + Math.sin(a) * r * .8); x.rotate(R() * 3); x.fillRect(-16, -4, 32, 8); x.restore(); }
      x.strokeStyle = PAL.sumi; x.lineWidth = 1.2;
    });
    R.L('g3'); R.L('g0');
  },
};

export const VIEWS = [V0, V1, V2, V3];
