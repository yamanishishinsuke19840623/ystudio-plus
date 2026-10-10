// 安岡 響灘の夜 — 3D夜景マップ（模式図）
// 駅の並び（JR山陰本線）と「西が海」という位置関係だけを手がかりにした模式図。
// 建物・道路・灯り・列車の動きはすべて演出。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ── 乱数（毎回同じまちになるよう固定シード） ──
let seed = 19840623;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ── 地形の形（x:東+ / z:南+） ──
const Z_MIN = -150, Z_MAX = 150, X_MAX = 130;
const coastX = z => -58 + 9 * Math.sin(z * 0.024) + 4 * Math.sin(z * 0.071 + 1.3);
const railX = z => -18 + 7 * Math.sin(z * 0.011 + 0.4);
const roadX = z => 14 + 5 * Math.sin(z * 0.017 + 2);

// 駅（南→北）。並び順のみ事実、間隔は模式。
const STATIONS = [
  { id: 'ayaragi', name: '綾羅木', en: 'AYARAGI', z: 112 },
  { id: 'kajikuri', name: '梶栗郷台地', en: 'KAJIKURIGODAICHI', z: 44 },
  { id: 'yasuoka', name: '安岡', en: 'YASUOKA', z: -26, main: true },
  { id: 'fukue', name: '福江', en: 'FUKUE', z: -104 },
];
STATIONS.forEach(s => { s.x = railX(s.z); });

// ── 基本セットアップ ──
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070a18, 0.0024);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 3000);
const HOME = { pos: new THREE.Vector3(150, 130, 175), target: new THREE.Vector3(-20, 0, -5) };
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minDistance = 30;
controls.maxDistance = 520;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.25;
controls.addEventListener('start', () => { controls.autoRotate = false; });

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.45, 0.32);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ── 空 ──
const skyU = { uDusk: { value: 1 }, uNight: { value: 0 } };
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1400, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      uniform float uDusk, uNight; varying vec3 vD;
      void main(){
        float h = clamp(vD.y, 0., 1.);
        vec3 zen = mix(vec3(.05,.08,.2), vec3(.01,.015,.04), uNight);
        vec3 hor = mix(vec3(.16,.14,.3), vec3(.03,.04,.09), uNight);
        vec3 c = mix(hor, zen, pow(h, .45));
        float west = pow(max(0., -vD.x), 3.) * pow(1. - h, 6.);
        c += vec3(1., .42, .2) * west * uDusk * 1.6;
        c += vec3(.9, .3, .5) * pow(max(0., -vD.x), 2.) * pow(1. - h, 3.) * uDusk * .35;
        gl_FragColor = vec4(c, 1.);
      }`,
  }),
);
scene.add(sky);

// 星
const starGeo = new THREE.BufferGeometry();
const starPos = [];
for (let i = 0; i < 1400; i++) {
  const th = rnd() * Math.PI * 2, ph = Math.acos(lerp(0.08, 1, rnd()));
  starPos.push(1200 * Math.sin(ph) * Math.cos(th), 1200 * Math.cos(ph), 1200 * Math.sin(ph) * Math.sin(th));
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xc8d6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
scene.add(new THREE.Points(starGeo, starMat));

// ── 海（響灘） ──
const seaU = { uTime: { value: 0 }, uDusk: { value: 1 }, uNight: { value: 0 } };
const sea = new THREE.Mesh(
  new THREE.PlaneGeometry(2600, 2600, 1, 1),
  new THREE.ShaderMaterial({
    uniforms: seaU,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      uniform float uTime, uDusk, uNight; varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 base = mix(vec3(.03,.06,.14), vec3(.008,.02,.05), uNight);
        float far = smoothstep(-40., -700., vW.x);
        float rip = noise(vec2(vW.x*.06 + uTime*.25, vW.z*.35)) * noise(vec2(vW.x*.13 - uTime*.18, vW.z*.8));
        float path = exp(-pow((vW.z + 20.) / (25. + far*90.), 2.));
        vec3 glow = mix(vec3(.6,.75,1.), vec3(1.,.45,.2), uDusk);
        vec3 c = base + glow * pow(rip, 3.5) * path * (0.15 + far) * 1.3;
        c += vec3(.05,.2,.35) * pow(rip, 6.) * .25;
        float d = length(vW.xz);
        c = mix(c, mix(vec3(.13,.12,.24), vec3(.02,.03,.07), uNight), smoothstep(500., 1200., d));
        gl_FragColor = vec4(c, 1.);
      }`,
  }),
);
sea.rotation.x = -Math.PI / 2;
sea.position.y = -0.6;
scene.add(sea);

// ── 陸地 ──
const landShape = new THREE.Shape();
landShape.moveTo(coastX(Z_MIN - 400), Z_MIN - 400);
for (let z = Z_MIN - 400; z <= Z_MAX + 400; z += 4) landShape.lineTo(coastX(z), z);
landShape.lineTo(900, Z_MAX + 400);
landShape.lineTo(900, Z_MIN - 400);
const landGeo = new THREE.ShapeGeometry(landShape);
landGeo.rotateX(Math.PI / 2);
const land = new THREE.Mesh(landGeo, new THREE.MeshBasicMaterial({ color: 0x0b0e1a, side: THREE.DoubleSide }));
scene.add(land);

// 海岸線のほのかな光
const shorePts = [];
for (let z = Z_MIN - 120; z <= Z_MAX + 120; z += 3) shorePts.push(new THREE.Vector3(coastX(z) - 0.3, 0.05, z));
const shoreLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(shorePts),
  new THREE.LineBasicMaterial({ color: new THREE.Color(0x3fd0ff).multiplyScalar(1.4), transparent: true, opacity: 0.8 }));
scene.add(shoreLine);

// 東側の山並み（シルエット）
const hillMat = new THREE.MeshBasicMaterial({ color: 0x080a14 });
for (let i = 0; i < 9; i++) {
  const h = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
  h.scale.set(lerp(70, 140, rnd()), lerp(25, 60, rnd()), lerp(70, 120, rnd()));
  h.position.set(lerp(200, 330, rnd()), 0, lerp(-260, 260, i / 8));
  scene.add(h);
}

// ── 道路 ──
const roadMat = new THREE.MeshBasicMaterial({ color: 0x1a1f33 });
const lampPos = [];
function addRoad(pts, width, lampGap) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = Math.ceil(curve.getLength() / 3);
  const verts = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n), t = curve.getTangentAt(i / n);
    const side = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(width / 2);
    verts.push(p.x + side.x, 0.04, p.z + side.z, p.x - side.x, 0.04, p.z - side.z);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  scene.add(new THREE.Mesh(g, roadMat));
  if (lampGap) {
    const m = Math.floor(curve.getLength() / lampGap);
    for (let i = 0; i <= m; i++) {
      const p = curve.getPointAt(i / m);
      lampPos.push(p.x, 0.9, p.z);
    }
  }
}
const sample = (fx, z0, z1) => { const a = []; for (let z = z0; z <= z1; z += 10) a.push(new THREE.Vector3(fx(z), 0, z)); return a; };
addRoad(sample(roadX, Z_MIN, Z_MAX), 2.6, 7);
addRoad(sample(z => coastX(z) + 9, Z_MIN, Z_MAX), 1.8, 11);
const crossZ = [];
for (let z = Z_MIN + 12; z < Z_MAX; z += lerp(20, 30, rnd())) crossZ.push(z);
crossZ.forEach(z => {
  const x0 = coastX(z) + 9, w = rnd() * 6 - 3;
  addRoad([new THREE.Vector3(x0, 0, z), new THREE.Vector3(railX(z), 0, z + w * 0.4), new THREE.Vector3(roadX(z), 0, z + w), new THREE.Vector3(X_MAX, 0, z + w * 1.5)], 1.4, 13);
});

// 街灯（スプライト）
const dotTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const lampGeo = new THREE.BufferGeometry();
lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
const lampMat = new THREE.PointsMaterial({ color: new THREE.Color(1.3, 0.8, 0.35), size: 2.6, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
scene.add(new THREE.Points(lampGeo, lampMat));

// ── 線路と駅 ──
const railCurve = new THREE.CatmullRomCurve3(sample(railX, Z_MIN - 60, Z_MAX + 60));
const railCol = new THREE.Color(0x4dffc3);
scene.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve, 300, 0.32, 6), new THREE.MeshBasicMaterial({ color: railCol.clone().multiplyScalar(1.6) })));

const stationObjs = STATIONS.map(s => {
  const g = new THREE.Group();
  g.position.set(s.x, 0, s.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(s.main ? 6 : 4.2, s.main ? 6.8 : 4.8, 48),
    new THREE.MeshBasicMaterial({ color: railCol.clone().multiplyScalar(2), transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1;
  g.add(ring);
  const plat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, s.main ? 16 : 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.5, 1.6) }));
  plat.position.set(2.2, 0.3, 0);
  g.add(plat);
  scene.add(g);
  return { s, g, ring };
});

// 列車（演出）
const train = new THREE.Group();
const carMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.6) });
for (let i = 0; i < 2; i++) {
  const car = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 7), carMat);
  car.position.z = i * 7.6;
  car.position.y = 0.9;
  train.add(car);
}
scene.add(train);

// ── 家並み ──
function windowTexture(rows, cols, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#20263a'; g.fillRect(0, 0, w, h);
  const cw = w / cols, rh = h / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    if (rnd() < 0.3) continue;
    const b = 150 + rnd() * 105;
    g.fillStyle = `rgb(${b},${b},${b})`;
    g.fillRect(k * cw + cw * 0.22, r * rh + rh * 0.25, cw * 0.56, rh * 0.45);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
// 屋根・底面はテクスチャの壁部分（左下の隅）を参照させる
function boxWithFlatRoof() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const uv = g.attributes.uv;
  for (let i = 8; i < 16; i++) uv.setXY(i, 0.005, 0.005);
  return g;
}

const houses = [], flats = [];
const nearStation = (x, z) => Math.min(...STATIONS.map(s => Math.hypot(x - s.x, z - s.z)));
for (let z = Z_MIN + 3; z < Z_MAX - 3; z += 4.2) {
  for (let x = coastX(z) + 13; x < X_MAX; x += 4.2) {
    const jx = x + rnd() * 1.4 - 0.7, jz = z + rnd() * 1.4 - 0.7;
    if (Math.abs(jx - railX(jz)) < 4.5 || Math.abs(jx - roadX(jz)) < 3.6) continue;
    if (crossZ.some(cz => Math.abs(jz - cz - (jx > railX(jz) ? 1.5 : 0)) < 2.6)) continue;
    const d = nearStation(jx, jz);
    const dens = 0.3 + 0.55 * Math.exp(-(d * d) / 1800) - smooth(60, X_MAX, jx) * 0.3;
    if (rnd() > dens) continue;
    const isFlat = d < 34 && rnd() < 0.16;
    const on = 17.3 + rnd() * 1.7;
    let off = 21 + Math.pow(rnd(), 0.8) * 5.2;
    if (rnd() < 0.03) off = 99;
    const early = rnd() < 0.05 ? 27.6 + rnd() * 1.2 : 99;
    const warm = rnd() < 0.72;
    const item = { x: jx, z: jz, on, off: isFlat ? off + 0.8 : off, early, warm, rot: (rnd() - 0.5) * 0.25 };
    if (isFlat) {
      item.w = lerp(4.5, 7, rnd()); item.d = lerp(3.2, 4, rnd()); item.h = lerp(5, 10, rnd());
      flats.push(item);
    } else {
      item.w = lerp(2.1, 3.1, rnd()); item.d = lerp(2, 2.8, rnd()); item.h = lerp(1.6, 2.7, rnd());
      houses.push(item);
    }
  }
}

function makeInstanced(list, tex) {
  const mesh = new THREE.InstancedMesh(boxWithFlatRoof(), new THREE.MeshBasicMaterial({ map: tex }), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  list.forEach((b, i) => {
    q.setFromEuler(e.set(0, b.rot, 0));
    m.compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(0.1, 0.1, 0.12));
  });
  scene.add(mesh);
  return mesh;
}
const houseMesh = makeInstanced(houses, windowTexture(2, 3, 48, 32));
const flatMesh = makeInstanced(flats, windowTexture(5, 8, 128, 80));

const WARM = new THREE.Color(1.9, 1.15, 0.5), COOL = new THREE.Color(1.15, 1.4, 1.9), OFF = new THREE.Color(0.09, 0.09, 0.12);
function applyLights(t) {
  let lit = 0;
  const paint = (mesh, list) => {
    list.forEach((b, i) => {
      const isOn = (t >= b.on && t < b.off) || t >= b.early;
      if (isOn) lit++;
      mesh.setColorAt(i, isOn ? (b.warm ? WARM : COOL) : OFF);
    });
    mesh.instanceColor.needsUpdate = true;
  };
  paint(houseMesh, houses);
  paint(flatMesh, flats);
  return lit;
}

// 沖の船の灯り（演出）
const boatGeo = new THREE.BufferGeometry();
const boats = Array.from({ length: 14 }, () => ({ x: lerp(-160, -520, rnd()), z: lerp(-320, 320, rnd()), p: rnd() * 6 }));
boatGeo.setAttribute('position', new THREE.Float32BufferAttribute(boats.flatMap(b => [b.x, 1.2, b.z]), 3));
const boatMat = new THREE.PointsMaterial({ color: new THREE.Color(2.2, 2.1, 1.6), size: 4, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
scene.add(new THREE.Points(boatGeo, boatMat));

// ── ラベル ──
const labelsEl = document.getElementById('labels');
const labels = [];
function addLabel(html, pos, cls = '') {
  const el = document.createElement('div');
  el.className = 'lb ' + cls;
  el.innerHTML = html;
  labelsEl.appendChild(el);
  labels.push({ el, pos });
}
STATIONS.forEach(s => addLabel(`<div class="tag"><i>JR</i>${s.name}</div><div class="sub en">${s.en}</div>`, new THREE.Vector3(s.x, 4, s.z), s.main ? 'big' : ''));
addLabel('<div class="tag">響灘</div><div class="sub en">Hibikinada</div>', new THREE.Vector3(-150, 2, -30), 'sea');
addLabel('<div class="tag">安岡海岸</div><div class="sub">海沿い（模式）</div>', new THREE.Vector3(coastX(-40) + 2, 2, -40));

const v = new THREE.Vector3();
function updateLabels() {
  labels.forEach(l => {
    v.copy(l.pos).project(camera);
    const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
    l.el.style.opacity = vis ? 1 : 0;
    if (vis) l.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px,${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-100%)`;
  });
}

// ── カメラ移動 ──
let fly = null;
function flyTo(pos, target) {
  controls.autoRotate = false;
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, s: performance.now() };
}
function stationView(s) {
  return [new THREE.Vector3(s.x + 55, 45, s.z + 50), new THREE.Vector3(s.x, 0, s.z)];
}

// ── パネル ──
const stList = document.getElementById('stList');
[...STATIONS].reverse().forEach(s => {
  const b = document.createElement('button');
  b.className = 'st';
  b.innerHTML = `<span class="dot">JR</span><span><b>${s.name}</b><small>${s.en}</small></span>`;
  b.onclick = () => {
    document.querySelectorAll('.st,.sp').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    flyTo(...stationView(s));
  };
  stList.appendChild(b);
});

const yas = STATIONS.find(s => s.main);
const VIEWS = [
  { name: '全体を見る', en: 'Overview', c: '#ffffff', go: () => [HOME.pos.clone(), HOME.target.clone()] },
  { name: '安岡駅のまわり', en: 'Yasuoka Sta.', c: '#4dffc3', go: () => stationView(yas) },
  { name: '海から陸を見る', en: 'From the sea', c: '#3fd0ff', go: () => [new THREE.Vector3(-210, 40, -20), new THREE.Vector3(10, 0, -20)] },
  { name: '陸から響灘を見る', en: 'To Hibikinada', c: '#ffb347', go: () => [new THREE.Vector3(90, 32, -10), new THREE.Vector3(-120, 0, -30)] },
  { name: '真上から', en: 'Top down', c: '#ff4f9a', go: () => [new THREE.Vector3(-5, 330, 1), new THREE.Vector3(-5, 0, 0)] },
];
const spList = document.getElementById('spList');
VIEWS.forEach((vw, i) => {
  const b = document.createElement('button');
  b.className = 'sp';
  b.innerHTML = `<i style="background:${vw.c}">${i + 1}</i><span style="flex:1"><b>${vw.name}</b><small class="en">${vw.en}</small><div class="bar" style="background:${vw.c};opacity:.5;width:${40 + i * 12}%"></div></span>`;
  b.onclick = () => {
    document.querySelectorAll('.st,.sp').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    flyTo(...vw.go());
  };
  spList.appendChild(b);
});

const aboutEl = document.getElementById('about');
document.getElementById('aboutBtn').onclick = () => aboutEl.classList.add('open');
document.getElementById('aboutClose').onclick = () => aboutEl.classList.remove('open');
aboutEl.onclick = e => { if (e.target === aboutEl) aboutEl.classList.remove('open'); };

// ── 時間 ──
const slider = document.getElementById('slider');
const clockEl = document.getElementById('clock');
const litEl = document.getElementById('lit');
const playBtn = document.getElementById('play');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let simT = 17, playing = !reduce, lastApplied = -1;
playBtn.textContent = playing ? '❚❚' : '▶';
playBtn.onclick = () => {
  playing = !playing;
  playBtn.textContent = playing ? '❚❚' : '▶';
  playBtn.setAttribute('aria-label', playing ? '一時停止' : '再生');
};
slider.oninput = () => { simT = +slider.value; };

const phase = t => t < 18.3 ? '夕暮れ' : t < 20 ? '宵のくち' : t < 23 ? '夜' : t < 26 ? '深夜' : t < 28 ? '未明' : '夜明け前';
const fmt = t => { const h = Math.floor(t) % 24, m = Math.floor((t % 1) * 60); return `${h}:${String(m).padStart(2, '0')}`; };

function setTime(t) {
  const dusk = 1 - smooth(17.2, 19.2, t) + smooth(27.6, 29, t) * 0.55;
  const night = smooth(17.6, 20, t) - smooth(27.8, 29, t) * 0.6;
  skyU.uDusk.value = dusk; skyU.uNight.value = night;
  seaU.uDusk.value = dusk; seaU.uNight.value = night;
  starMat.opacity = night * 0.9;
  boatMat.opacity = smooth(18.5, 20, t) * (1 - smooth(28, 29, t));
  lampMat.opacity = smooth(17.2, 18, t) * (1 - smooth(28.6, 29, t) * 0.7);
  scene.fog.color.setRGB(lerp(0.09, 0.027, night), lerp(0.08, 0.035, night), lerp(0.16, 0.075, night));
  bloom.strength = lerp(0.55, 0.8, night);
  if (Math.abs(t - lastApplied) > 0.015) {
    litEl.textContent = applyLights(t).toLocaleString();
    lastApplied = t;
  }
  clockEl.innerHTML = `${fmt(t)}<small>${phase(t)}</small>`;
  slider.value = t;

  // 列車：深夜は走らせない（ダイヤではなく演出）
  const running = t < 24.3 || t > 28.4;
  train.visible = running;
  if (running) {
    const cyc = (t * 1.3) % 2, dir = cyc < 1;
    const u = dir ? cyc : 2 - cyc;
    const p = railCurve.getPointAt(u), tan = railCurve.getTangentAt(u);
    train.position.copy(p);
    train.rotation.y = Math.atan2(tan.x, tan.z);
  }
}

// ── ループ ──
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();
  if (playing) {
    simT += dt / 5;
    if (simT > 29) simT = 17;
  }
  setTime(simT);
  seaU.uTime.value += dt;

  const pos = boatGeo.attributes.position;
  boats.forEach((b, i) => pos.setY(i, 1.2 + Math.sin(now / 900 + b.p) * 0.4));
  pos.needsUpdate = true;

  stationObjs.forEach(({ ring }, i) => {
    const k = (now / 1600 + i * 0.3) % 1;
    ring.scale.setScalar(1 + k * 0.5);
    ring.material.opacity = 0.9 * (1 - k);
  });

  if (fly) {
    const k = clamp01((now - fly.s) / 1500), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (k >= 1) fly = null;
  }
  controls.update();
  composer.render();
  updateLabels();
  requestAnimationFrame(loop);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

if (innerWidth < 760) { camera.position.set(170, 190, 240); }
setTime(simT);
loop();
