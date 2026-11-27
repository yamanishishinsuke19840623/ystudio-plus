// 墨絵の筆エンジン（山西水産 線画アニメ）
// 筆の線（入り・押さえ・抜き）、かすれ・にじみ・淡墨のフィルター、とらふぐ・店長の描画をまとめたもの。
// 使い方: Sumi.defs(svg) でフィルターを入れ、Sumi.fugu(親g) / Sumi.tencho(親g) で描く。
// 各キャラは update(drawT, t, 状態) を毎フレーム呼ぶ。drawT＝描き始めからの秒（書き順の進み）、t＝経過ミリ秒（揺れ）。
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, a, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); p && p.appendChild(e); return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  let uid = 0;

  /* 曲線：Catmull-Rom で通過点をなめらかにつなぐ */
  function spline(pts, n = 48) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(k => .5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  /* 筆の線：中心線に太さをつけて塗りの形にする。shape: nara=入りを押さえて抜く / even=ほぼ均一 / tip=両端を細く */
  function brushPath(c, maxW, prog = 1, shape = 'nara') {
    const n = Math.max(2, Math.floor(c.length * clamp(prog, 0, 1)));
    if (prog <= 0 || n < 2) return '';
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const t = i / (c.length - 1);
      let w;
      if (shape === 'nara') w = t < .12 ? Math.pow(t / .12, .5) : 1 - .75 * Math.pow((t - .12) / .88, 1.6);
      else if (shape === 'even') w = Math.sin(Math.PI * clamp(t, .04, .96)) ** .35;
      else w = Math.sin(Math.PI * t) ** .7;
      w *= maxW * (1 + .18 * Math.sin(i * .9) * Math.sin(i * .23));
      L.push([c[i][0] - dy * w / 2, c[i][1] + dx * w / 2]); R.push([c[i][0] + dy * w / 2, c[i][1] - dx * w / 2]);
    }
    const f = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
    return 'M' + L.map(f).join('L') + 'L' + R.reverse().map(f).join('L') + 'Z';
  }
  const stroke = (pts, w, prog, shape, n) => brushPath(spline(pts, n || 16), w, prog, shape);
  const mix = (A, B, k) => A.map((p, i) => [lerp(p[0], B[i][0], k), lerp(p[1], B[i][1], k)]);
  const poly = pts => 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z';
  const circlePts = (cx, cy, r, a0 = -2.2, sweep = 6.1, n = 10) => [...Array(n + 1)].map((_, i) => { const a = a0 + sweep * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  const ellipse = (cx, cy, rx, ry) => rx > 0 ? `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 -${rx * 2},0` : '';

  /* フィルター（紙・かすれ・にじみ・淡墨） */
  function defs(svg) {
    if (svg.querySelector('#sumi')) return;
    const d = svg.querySelector('defs') || el('defs', {}, svg);
    d.insertAdjacentHTML('beforeend', `
      <filter id="paper" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" seed="7"/>
        <feColorMatrix values="0 0 0 0 .45  0 0 0 0 .4  0 0 0 0 .32  0 0 0 .09 0"/>
      </filter>
      <filter id="sumi" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency=".03 .3" numOctaves="2" seed="4" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -6 4.3" result="m"/>
        <feComposite in="SourceGraphic" in2="m" operator="in" result="k"/>
        <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="9" result="d"/>
        <feDisplacementMap in="k" in2="d" scale="4"/>
      </filter>
      <filter id="bleed" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="2" result="d"/>
        <feDisplacementMap in="SourceGraphic" in2="d" scale="14" result="w"/>
        <feGaussianBlur in="w" stdDeviation="5"/>
      </filter>
      <filter id="wash" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves="3" seed="5" result="d"/>
        <feDisplacementMap in="SourceGraphic" in2="d" scale="30" result="w"/>
        <feGaussianBlur in="w" stdDeviation="9"/>
      </filter>`);
  }
  /* 3層（淡墨・にじみ・墨）と、名前つきの筆パーツ */
  function layers(parent) {
    const g = el('g', {}, parent);
    const wash = el('g', { filter: 'url(#wash)' }, g);
    const bleed = el('g', { filter: 'url(#bleed)', opacity: .28 }, g);
    const ink = el('g', { filter: 'url(#sumi)' }, g);
    const P = {};
    const part = name => { if (!P[name]) P[name] = [el('path', { fill: '#1b1a18' }, ink), el('path', { fill: '#1b1a18' }, bleed)]; return P[name]; };
    const set = (name, d) => part(name).forEach(e => e.setAttribute('d', d || ''));
    return { g, wash, bleed, ink, part, set };
  }
  /* 書き順の進み */
  const progOf = (order, drawT) => key => { const d = order.find(x => x[0] === key); return d ? clamp((drawT - d[1]) / d[2], 0, 1) : 1; };

  /* ───────── とらふぐ（左向き。原点が魚の中心、全長およそ 650） ───────── */
  function fugu(parent) {
    const L = layers(parent);
    const id = 'washG' + (++uid);
    const grad = el('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: -120, y2: 10 }, parent.ownerSVGElement.querySelector('defs'));
    [[0, 1], [.6, .7], [1, 0]].forEach(([o, a]) => el('stop', { offset: o, 'stop-color': '#1b1a18', 'stop-opacity': a }, grad));
    const washBack = el('path', { fill: `url(#${id})`, opacity: 0 }, L.wash);
    const S = {
      back: [[[-292, -12], [-262, -72], [-160, -118], [-10, -114], [130, -78], [222, -36], [252, -22]],
        [[-292, -22], [-268, -160], [-145, -250], [0, -252], [135, -182], [218, -76], [252, -26]]],
      belly: [[[-286, 16], [-226, 72], [-84, 108], [62, 98], [182, 52], [252, 18]],
        [[-286, 26], [-258, 168], [-124, 252], [34, 256], [170, 166], [252, 22]]],
      mid: [[[-270, 30], [-120, 40], [40, 40], [230, 20]], [[-270, 40], [-120, 70], [40, 70], [230, 20]]],
      eye: [[-196, -58, 17], [-196, -122, 19]], spot: [[-8, 26, 40], [10, 58, 58]],
      pect: [[-112, 6], [-104, 36]], dorsal: [[150, -68], [150, -148]], anal: [[152, 62], [150, 138]],
    };
    const spots = [[-120, -80], [-60, -95], [0, -88], [60, -70], [110, -55], [-90, -55], [-20, -60], [40, -45], [160, -40], [-150, -45], [90, -30], [10, -30]];
    const dots = spots.map(() => el('ellipse', { fill: '#1b1a18' }, L.ink));
    const spines = [...Array(16)].map(() => el('path', { fill: '#1b1a18' }, L.ink));
    const ORDER = [['back', 0, .7], ['belly', .55, .6], ['tail', 1.05, .45], ['mouth', 1.4, .15], ['eye', 1.55, .25], ['gill', 1.8, .2], ['pect', 1.95, .25], ['fins', 2.15, .3], ['spot', 2.45, .35], ['wash', 2.6, .9], ['dots', 2.9, .5]];
    const DRAWN = 3.4;
    function update(drawT, t, k, swim = 1) {
      const prog = progOf(ORDER, drawT), sw = t / 1000, set = L.set;
      const back = spline(mix(...S.back, k)), belly = spline(mix(...S.belly, k));
      set('back', brushPath(back, lerp(30, 26, k), prog('back'), 'nara'));
      set('belly', brushPath(belly, lerp(18, 16, k), prog('belly'), 'nara'));
      const fl = Math.sin(sw * 5) * 8 * swim, tp = prog('tail');
      const tb = [252, lerp(-22, -26, k)], bb = [252, lerp(18, 22, k)];
      set('tail1', stroke([tb, [300, -46 + fl * .5], [340, -66 + fl]], 11, tp, 'nara'));
      set('tail2', stroke([[340, -66 + fl], [352, fl], [338, 64 + fl]], 9, clamp(tp * 1.5 - .3, 0, 1), 'even'));
      set('tail3', stroke([bb, [300, 44 + fl * .5], [338, 64 + fl]], 10, clamp(tp * 1.4 - .2, 0, 1), 'nara'));
      set('mouth', stroke([[-282, -14], [-306, -2], [-296, 6], [-306, 12], [-282, 20]], 10, prog('mouth'), 'tip', 8));
      const [ex, ey, er] = S.eye[0].map((v, i) => lerp(v, S.eye[1][i], k));
      set('eye', brushPath(spline(circlePts(ex, ey, er), 6), 7, prog('eye'), 'even') + ' ' + stroke([[ex - er - 10, ey - er + 2], [ex, ey - er - 12], [ex + er + 12, ey - er + 4]], 9, prog('eye'), 'nara', 8));
      set('pupil', prog('eye') > .8 ? ellipse(ex - er * .1, ey, er * .48, er * .48) : '');
      const [gx, gy] = mix([S.pect[0]], [S.pect[1]], k)[0];
      set('gill', stroke([[gx - 14, gy - 34], [gx - 22, gy - 6], [gx - 12, gy + 22]], 9, prog('gill'), 'tip', 10));
      const pf = Math.sin(sw * 7) * 6 * swim, pp = prog('pect');
      set('pect1', stroke([[gx, gy - 6], [gx + 26, gy - 22 + pf], [gx + 46, gy - 30 + pf]], 9, pp, 'nara', 10) + ' ' + stroke([[gx + 2, gy], [gx + 30, gy - 4 + pf], [gx + 50, gy - 6 + pf]], 7, clamp(pp * 1.3 - .15, 0, 1), 'nara', 10));
      set('pect2', stroke([[gx + 2, gy + 6], [gx + 26, gy + 14 + pf], [gx + 44, gy + 18 + pf]], 6, clamp(pp * 1.4 - .3, 0, 1), 'nara', 10));
      const [dx, dy] = mix([S.dorsal[0]], [S.dorsal[1]], k)[0], [ax, ay] = mix([S.anal[0]], [S.anal[1]], k)[0], fp = prog('fins');
      set('dorsal', stroke([[dx - 22, dy + 4], [dx + 4, dy - 34 + pf * .6], [dx + 30, dy + 8]], 9, fp, 'nara', 10));
      set('anal', stroke([[ax - 20, ay - 4], [ax + 6, ay + 30 - pf * .6], [ax + 30, ay - 6]], 8, fp, 'nara', 10));
      const [sx, sy, sr] = S.spot[0].map((v, i) => lerp(v, S.spot[1][i], k));
      const r = sr * easeOut(prog('spot'));
      set('spot', r > 0 ? `M${sx - r * 1.25},${sy} C${sx - r * 1.2},${sy - r * .95} ${sx + r * .9},${sy - r * 1.05} ${sx + r * 1.3},${sy - r * .1} C${sx + r * 1.4},${sy + r * .8} ${sx - r * .6},${sy + r * 1.05} ${sx - r * 1.25},${sy} Z` : '');
      const mid = spline(mix(...S.mid, k), 12).reverse(), top = back.filter((_, i) => i % 4 === 0);
      washBack.setAttribute('d', poly(top.concat(mid)));
      washBack.setAttribute('opacity', lerp(.4, .3, k) * prog('wash'));
      grad.setAttribute('y1', lerp(-120, -250, k)); grad.setAttribute('y2', lerp(20, 40, k));
      const dp = prog('dots');
      dots.forEach((d, i) => { const [x, y] = spots[i], s = clamp(dp * spots.length - i, 0, 1);
        d.setAttribute('cx', x * lerp(1, 1.05, k)); d.setAttribute('cy', y * lerp(1, 2.05, k) - k * 8); d.setAttribute('rx', s * (4 + i % 3 * 1.5)); d.setAttribute('ry', s * (3 + i % 2)); });
      spines.forEach((sp, i) => { const a = .35 + i / 15 * 2.4, cx = -60 + Math.cos(a) * lerp(150, 230, k), cy = Math.sin(a) * lerp(90, 220, k) + lerp(0, 30, k);
        const len = lerp(0, 14, clamp(k * 1.6 - .5, 0, 1));
        sp.setAttribute('d', len > 1 ? brushPath([[cx, cy], [cx + Math.cos(a) * len, cy + Math.sin(a) * len]], 4, 1, 'tip') : ''); });
    }
    return { g: L.g, update, DRAWN };
  }

  /* ───────── 店長（左向き。原点が足もと、背の高さおよそ 870） ─────────
     raise: 0＝ふぐを腹の前に持つ / 1＝ふぐを目の高さに上げて目利き */
  function tencho(parent) {
    const root = el('g', {}, parent);
    const W = el('g', { filter: 'url(#wash)' }, root);
    const washBody = el('path', { fill: '#1b1a18', opacity: 0 }, W);
    const washApron = el('path', { fill: '#1b1a18', opacity: 0 }, W);
    const washPants = el('path', { fill: '#1b1a18', opacity: 0 }, W);
    const washHair = el('path', { fill: '#1b1a18', opacity: 0 }, W);
    const body = layers(root);           // 胴・前掛け・足
    const fishG = el('g', {}, root);     // 手前の腕より奥にふぐ
    const fish = fugu(fishG);
    const arm = layers(root);            // 手前の腕
    const head = layers(root);           // 頭
    const ORDER = [['head', 0, .45], ['face', .35, .35], ['band', .6, .35], ['eye', .85, .2], ['torso', .95, .5], ['apron', 1.3, .55], ['backArm', 1.6, .35], ['arm', 1.75, .4], ['legs', 2.0, .3], ['boots', 2.2, .45], ['ground', 2.5, .4], ['wash', 2.5, .9]];
    const FISH_AT = 1.9;
    const DRAWN = FISH_AT + fish.DRAWN;

    function update(drawT, t, st = {}) {
      const raise = st.raise || 0, puff = st.puff || 0;
      const prog = progOf(ORDER, drawT), sw = t / 1000;
      const k = ease(clamp(raise, 0, 1));
      const breath = Math.sin(sw * 1.4) * 3;
      root.setAttribute('transform', `translate(0,${breath * .3})`);

      // ── 頭（少し前に傾けて、ふぐをのぞき込む）
      head.g.setAttribute('transform', `rotate(${-6 * k},-10,-708) translate(0,${breath * .4})`);
      head.set('crown', stroke([[-50, -815], [-5, -834], [42, -820], [68, -782], [62, -742], [40, -716], [12, -706]], 24, prog('head'), 'nara', 14));
      head.set('face', stroke([[-48, -815], [-62, -792], [-64, -774], [-81, -763], [-64, -753], [-66, -739], [-58, -724], [-40, -712], [-12, -706]], 12, prog('face'), 'nara', 10));
      const fl = Math.sin(sw * 3.2) * 6, bpr = clamp(prog('band') * 1.4 - .4, 0, 1);
      head.set('band', stroke([[-68, -797], [-14, -811], [38, -807], [68, -793]], 26, prog('band'), 'even', 12)
        + ' ' + stroke([[66, -795], [96, -786 + fl * .5], [120, -766 + fl]], 15, bpr, 'nara', 10)
        + ' ' + stroke([[66, -792], [100, -800 + fl * .6], [130, -794 + fl]], 12, bpr, 'nara', 10));
      const blink = (t % 4300) < 130 && !st.noBlink;
      const lx = -4 * k, ly = -5 * k; // 目線をふぐへ
      head.set('eye', blink ? stroke([[-52, -771], [-36, -771]], 4, prog('eye'), 'tip', 4) : stroke([[-52 + lx, -773 + ly], [-36 + lx, -771 + ly]], 10, prog('eye'), 'tip', 4));
      head.set('brow', stroke([[-58, -789 - k * 3], [-44, -795 - k * 4], [-28, -792 - k * 2]], 9, prog('eye'), 'nara', 6));
      head.set('ear', stroke([[8, -780], [20, -767], [9, -752]], 9, prog('eye'), 'tip', 6));
      head.set('mouth', stroke([[-62, -735], [-50, -733]], 5, prog('eye'), 'tip', 4));
      washHair.setAttribute('d', poly([[-48, -812], [-5, -832], [42, -818], [68, -782], [62, -756], [20, -796], [-36, -802]]));
      washHair.setAttribute('transform', head.g.getAttribute('transform'));
      washHair.setAttribute('opacity', .5 * prog('wash'));

      // ── 胴と前掛け（背中を丸め、裾は広がる）
      body.set('neck', stroke([[-28, -712], [-30, -690]], 10, prog('torso'), 'tip', 4) + ' ' + stroke([[12, -708], [16, -688]], 10, prog('torso'), 'tip', 4));
      body.set('back', stroke([[14, -694], [72, -668], [102, -590], [106, -480], [94, -360]], 28, prog('torso'), 'nara', 14));
      body.set('chest', stroke([[-30, -694], [-68, -668], [-86, -596]], 20, prog('torso'), 'nara', 10));
      const ap = prog('apron'), ap2 = clamp(ap * 1.5 - .5, 0, 1);
      body.set('apronF', stroke([[-82, -620], [-98, -500], [-114, -380], [-128, -262]], 22, ap, 'nara', 14));
      body.set('apronB', stroke([[54, -626], [74, -500], [88, -380], [94, -262]], 13, clamp(ap * 1.3 - .2, 0, 1), 'nara', 14));
      body.set('apronHem', stroke([[-130, -258], [-20, -244], [96, -258]], 15, ap2, 'tip', 10));
      body.set('strap', stroke([[-70, -622], [-46, -670], [-26, -702]], 7, ap, 'tip', 8) + ' ' + stroke([[-82, -622], [54, -628]], 8, ap, 'tip', 8));
      const tf = Math.sin(sw * 2.6) * 5;
      body.set('tie', stroke([[78, -456], [114, -440 + tf], [132, -414 + tf]], 12, ap2, 'nara', 8) + ' ' + stroke([[78, -452], [110, -426 + tf * .7], [120, -396 + tf]], 9, ap2, 'nara', 8));
      washBody.setAttribute('d', poly([[-30, -706], [14, -706], [72, -668], [102, -590], [106, -480], [94, -360], [-110, -360], [-96, -500], [-86, -596], [-68, -668]]));
      washBody.setAttribute('opacity', .2 * prog('wash'));
      washApron.setAttribute('d', poly([[-82, -622], [54, -628], [74, -500], [88, -380], [94, -262], [-20, -246], [-128, -262], [-114, -380], [-98, -500]]));
      washApron.setAttribute('opacity', .62 * prog('wash'));

      // ── 奥の腕
      body.set('backArm', stroke([[76, -662], [102, -570], [100, -490], [92, -448]], 30, prog('backArm'), 'nara', 12));
      body.set('backHand', prog('backArm') > .9 ? ellipse(92, -436, 14, 16) : '');

      // ── 足（前の足を一歩出す）と長靴
      const lp = prog('legs');
      body.set('legs', [[[-100, -250], [-112, -172]], [[-44, -246], [-50, -172]], [[2, -246], [18, -172]], [[70, -250], [84, -172]]].map(q => stroke(q, 10, lp, 'tip', 6)).join(' '));
      washPants.setAttribute('d', poly([[-100, -250], [-44, -246], [-50, -172], [-112, -172]]) + ' ' + poly([[2, -246], [70, -250], [84, -172], [18, -172]]));
      washPants.setAttribute('opacity', .3 * prog('wash'));
      const bp = easeOut(prog('boots'));
      const boot = q => bp > 0 ? poly(q.map(([x, y]) => [x, lerp(-178, y, bp)])) : '';
      body.set('bootL', boot([[-116, -178], [-118, -42], [-142, -30], [-168, -16], [-176, 0], [-164, 10], [-46, 10], [-44, -178]]));
      body.set('bootR', boot([[14, -178], [20, -36], [-4, -22], [-12, -2], [2, 10], [98, 10], [88, -178]]));
      body.set('ground', stroke([[-360, 14], [-80, 20], [200, 12], [360, 18]], 10, prog('ground'), 'tip', 16));

      // ── 手前の腕（肩→ひじ→手）とふぐ
      const sh = [-42, -660], el_ = [lerp(-72, -132, k), lerp(-540, -612, k)], hd = [lerp(-152, -194, k), lerp(-490, -738, k)];
      const apm = prog('arm');
      arm.set('upper', stroke([sh, [lerp(-62, -94, k), lerp(-600, -648, k)], el_], 32, apm, 'nara', 10));
      arm.set('fore', stroke([el_, [lerp(-110, -168, k), lerp(-512, -676, k)], hd], 24, clamp(apm * 1.4 - .3, 0, 1), 'nara', 10));
      arm.set('hand', apm > .9 ? ellipse(hd[0], hd[1], 16, 14) : '');
      const fx = hd[0] - 112, fy = hd[1] - 6 + (raise ? 0 : Math.sin(sw * 1.6) * 2);
      fishG.setAttribute('transform', `translate(${fx},${fy}) rotate(${lerp(6, -4, k)}) scale(.45)`);
      fish.update(drawT - FISH_AT, t, puff, .4);
    }
    return { g: root, update, DRAWN };
  }

  window.Sumi = { el, clamp, lerp, ease, easeOut, spline, brushPath, stroke, mix, poly, ellipse, defs, layers, fugu, tencho };
})();
