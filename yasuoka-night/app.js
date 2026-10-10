// 安岡 響灘の夜 — 3D夜景マップ
// 海岸線・駅・町名の位置は公開データ（data.js / tools/build_data.py）から。
// 建物ひとつひとつの形と配置、道、灯り、列車・船の動きは演出。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import DATA from './data.js';

// ── 乱数（毎回同じ灯りになるよう固定シード） ──
let seed = 19840623;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// 緯度経度 → 3D座標（data.js と同じ投影。1単位 = 15m、x:東+ / z:南+）
const [LAT0, LON0] = DATA.origin;
const KX = Math.cos(LAT0 * Math.PI / 180) * 111320 / DATA.unitMeters;
const KZ = 110574 / DATA.unitMeters;
const fromLL = (lat, lon) => ({ x: (lon - LON0) * KX, z: -(lat - LAT0) * KZ });

const [FX0, FZ0, FX1, FZ1] = DATA.frame;
const EN = { 綾羅木: 'AYARAGI', 梶栗郷台地: 'KAJIKURIGODAICHI', 安岡: 'YASUOKA', 福江: 'FUKUE', 幡生: 'HATABU', 吉見: 'YOSHIMI' };
const STATIONS = DATA.stations.filter(s => ['綾羅木', '梶栗郷台地', '安岡', '福江'].includes(s.name))
  .map(s => ({ ...s, en: EN[s.name], main: s.name === '安岡' }));

// やすらガーデン：住所（富任町5丁目10-1）の町丁目「富任町五丁目」の代表点。施設の正確な位置ではない。
const YG = { ...fromLL(34.02351, 130.924112) };

// ── 基本セットアップ ──
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070a18, 0.0018);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 4000);
const HOME = { pos: new THREE.Vector3(230, 210, 250), target: new THREE.Vector3(5, 0, 0) };
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minDistance = 25;
controls.maxDistance = 800;
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
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(2000, 32, 16),
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
));

// 星
const starPos = [];
for (let i = 0; i < 1400; i++) {
  const th = rnd() * Math.PI * 2, ph = Math.acos(lerp(0.08, 1, rnd()));
  starPos.push(1800 * Math.sin(ph) * Math.cos(th), 1800 * Math.cos(ph), 1800 * Math.sin(ph) * Math.sin(th));
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xc8d6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
scene.add(new THREE.Points(starGeo, starMat));

// ── 地面（データ範囲の外は暗い台地） ──
const base = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ color: 0x05070e }));
base.rotation.x = -Math.PI / 2;
base.position.y = -0.8;
scene.add(base);

// ── 海（響灘） ──
const seaU = { uTime: { value: 0 }, uDusk: { value: 1 }, uNight: { value: 0 } };
const seaMat = new THREE.ShaderMaterial({
  uniforms: seaU, side: THREE.DoubleSide,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `
    uniform float uTime, uDusk, uNight; varying vec3 vW;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec3 base = mix(vec3(.03,.06,.14), vec3(.008,.02,.05), uNight);
      float far = smoothstep(-60., -900., vW.x);
      float rip = noise(vec2(vW.x*.06 + uTime*.25, vW.z*.35)) * noise(vec2(vW.x*.13 - uTime*.18, vW.z*.8));
      float path = exp(-pow((vW.z + 20.) / (30. + far*120.), 2.));
      vec3 glow = mix(vec3(.6,.75,1.), vec3(1.,.45,.2), uDusk);
      vec3 c = base + glow * pow(rip, 3.5) * path * (0.15 + far) * 1.3;
      c += vec3(.05,.2,.35) * pow(rip, 6.) * .25;
      c = mix(c, mix(vec3(.13,.12,.24), vec3(.02,.03,.07), uNight), smoothstep(700., 1700., length(vW.xz)));
      gl_FragColor = vec4(c, 1.);
    }`,
});
const toShape = (outer, holes = []) => {
  const s = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, z)));
  holes.forEach(h => s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z)))));
  return s;
};
const flat = (geo, y) => { geo.rotateX(Math.PI / 2); geo.translate(0, y, 0); return geo; };
DATA.sea.forEach(p => scene.add(new THREE.Mesh(flat(new THREE.ShapeGeometry(toShape(p.outer, p.holes)), -0.5), seaMat)));
// 範囲の西側（沖）は全部海
const offing = new THREE.Mesh(new THREE.PlaneGeometry(2400, 3000), seaMat);
offing.rotation.x = -Math.PI / 2;
offing.position.set(FX0 - 1200, -0.5, (FZ0 + FZ1) / 2);
scene.add(offing);

// ── 陸地（国土数値情報の行政区域を切り抜いたもの） ──
const landMat = new THREE.MeshBasicMaterial({ color: 0x0c0f1c, side: THREE.DoubleSide });
DATA.land.forEach(p => scene.add(new THREE.Mesh(flat(new THREE.ShapeGeometry(toShape(p)), 0), landMat)));
// 切り抜きの側面（ジオラマ風）
const side = new THREE.Mesh(new THREE.BoxGeometry(FX1 - FX0, 4, FZ1 - FZ0), new THREE.MeshBasicMaterial({ color: 0x0a0d18 }));
side.position.set((FX0 + FX1) / 2, -2.6, (FZ0 + FZ1) / 2);
scene.add(side);

// 海岸線（実データ）を光らせる
const coastMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0x3fd0ff).multiplyScalar(1.5) });
DATA.coast.forEach(c => scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.map(([x, z]) => new THREE.Vector3(x, 0.15, z))), coastMat)));
// データ範囲の枠
const frameLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(FX0, 0.1, FZ0), new THREE.Vector3(FX1, 0.1, FZ0), new THREE.Vector3(FX1, 0.1, FZ1), new THREE.Vector3(FX0, 0.1, FZ1),
]), new THREE.LineBasicMaterial({ color: 0x2a3150 }));
scene.add(frameLine);

// ── 道（町と町をつなぐ模式の道）と街灯 ──
const roadMat = new THREE.MeshBasicMaterial({ color: 0x1b2036 });
const lampPos = [];
DATA.roads.forEach(([x0, z0, x1, z1]) => {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, len), roadMat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(x1 - x0, z1 - z0);
  m.position.set((x0 + x1) / 2, 0.05, (z0 + z1) / 2);
  scene.add(m);
  const n = Math.max(1, Math.floor(len / 6));
  for (let i = 0; i <= n; i++) lampPos.push(lerp(x0, x1, i / n), 0.7, lerp(z0, z1, i / n));
});
const dotTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const lampGeo = new THREE.BufferGeometry();
lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
const lampMat = new THREE.PointsMaterial({ color: new THREE.Color(1.3, 0.8, 0.35), size: 2.2, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
scene.add(new THREE.Points(lampGeo, lampMat));

// ── 線路（山陰本線の駅を結んだ近似線）と駅 ──
const railCurve = new THREE.CatmullRomCurve3(DATA.stations.map(s => new THREE.Vector3(s.x, 0, s.z)));
const railCol = new THREE.Color(0x4dffc3);
scene.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve, 400, 0.35, 6), new THREE.MeshBasicMaterial({ color: railCol.clone().multiplyScalar(1.6) })));

const stationObjs = STATIONS.map(s => {
  const g = new THREE.Group();
  g.position.set(s.x, 0, s.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(s.main ? 6 : 4.2, s.main ? 6.8 : 4.8, 48),
    new THREE.MeshBasicMaterial({ color: railCol.clone().multiplyScalar(2), transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1;
  g.add(ring);
  const plat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, s.main ? 11 : 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.5, 1.6) }));
  plat.position.set(1.4, 0.25, 0);
  // ホームを線路の向きにそろえる
  let best = 0, bd = 1e9;
  for (let k = 0; k <= 400; k++) { const p = railCurve.getPointAt(k / 400); const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd) { bd = d; best = k / 400; } }
  const tan = railCurve.getTangentAt(best);
  g.rotation.y = Math.atan2(tan.x, tan.z);
  g.add(plat);
  scene.add(g);
  return { s, g, ring };
});

// 列車（演出。ダイヤではない）
const train = new THREE.Group();
const carMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.6) });
for (let i = 0; i < 2; i++) {
  const car = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 5.5), carMat);
  car.position.set(0, 0.8, i * 6);
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
DATA.buildings.forEach(([x, z, w, d, h, rot, isFlat]) => {
  if (Math.hypot(x - YG.x, z - YG.z) < 10.5) return; // やすらガーデンの敷地ぶん空ける
  const on = 17.3 + rnd() * 1.7;
  let off = 21 + Math.pow(rnd(), 0.8) * 5.2;
  if (rnd() < 0.03) off = 99;
  const early = rnd() < 0.05 ? 27.6 + rnd() * 1.2 : 99;
  const item = { x, z, w, d, h, rot, on, off: isFlat ? off + 0.8 : off, early, warm: rnd() < 0.72 };
  (isFlat ? flats : houses).push(item);
});

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

// ── やすらガーデン（位置は富任町五丁目の代表点付近） ──
const PINK = new THREE.Color(0xff4f9a);
const yg = new THREE.Group();
yg.position.set(YG.x, 0, YG.z);
const ygLawn = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.5, 0.3), transparent: true, opacity: 0.55 }));
ygLawn.rotation.x = -Math.PI / 2; ygLawn.position.y = 0.08;
yg.add(ygLawn);
const ygRing = new THREE.Mesh(new THREE.RingGeometry(8.5, 9.3, 64), new THREE.MeshBasicMaterial({ color: PINK.clone().multiplyScalar(2), transparent: true, side: THREE.DoubleSide }));
ygRing.rotation.x = -Math.PI / 2; ygRing.position.y = 0.12;
yg.add(ygRing);
const ygTex = windowTexture(2, 10, 160, 32);
// 2棟に分けて、図書館側は早めに消灯（掲載情報の時間帯をもとにした演出）
const ygHall = new THREE.Mesh(boxWithFlatRoof(), new THREE.MeshBasicMaterial({ map: ygTex, color: OFF }));
ygHall.scale.set(7, 2, 3.2); ygHall.position.set(-2, 0, -3.5);
const ygLib = new THREE.Mesh(boxWithFlatRoof(), new THREE.MeshBasicMaterial({ map: ygTex, color: OFF }));
ygLib.scale.set(4, 1.6, 3); ygLib.position.set(4, 0, 3);
yg.add(ygHall, ygLib);
const ygBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 26, 8, 1, true), new THREE.MeshBasicMaterial({ color: PINK.clone().multiplyScalar(1.6), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
ygBeam.position.y = 13;
yg.add(ygBeam);
scene.add(yg);
const ygLamps = new THREE.BufferGeometry();
const ygl = [];
for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; ygl.push(YG.x + Math.cos(a) * 7.6, 0.6, YG.z + Math.sin(a) * 7.6); }
ygLamps.setAttribute('position', new THREE.Float32BufferAttribute(ygl, 3));
const ygLampMat = new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.3, 0.9), size: 2, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
scene.add(new THREE.Points(ygLamps, ygLampMat));

// 沖の船の灯り（演出）
const boats = Array.from({ length: 14 }, () => ({ x: lerp(FX0 - 40, FX0 - 600, rnd()), z: lerp(-400, 400, rnd()), p: rnd() * 6 }));
const boatGeo = new THREE.BufferGeometry();
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
  return el;
}
STATIONS.forEach(s => addLabel(`<div class="tag"><i>JR</i>${s.name}</div><div class="sub en">${s.en}</div>`, new THREE.Vector3(s.x, 4, s.z), s.main ? 'big' : ''));
addLabel('<div class="tag">響灘</div><div class="sub en">Hibikinada</div>', new THREE.Vector3(FX0 - 60, 2, -40), 'sea');
const ygLabel = addLabel('<div class="tag"><i class="pk">★</i>やすらガーデン</div><div class="sub" id="ygSub">富任町五丁目</div>', new THREE.Vector3(YG.x, 6, YG.z), 'yg');
// 町名（町丁目の代表点の平均位置）
const TOWN_SHOW = ['安岡町', '安岡本町', '安岡駅前', '横野町', '富任町', '梶栗町', '綾羅木新町', '綾羅木本町', '綾羅木南町', '福江', '伊倉新町', '川中本町'];
DATA.towns.filter(t => TOWN_SHOW.includes(t.name) && t.z > FZ0 + 10 && t.z < FZ1 - 10)
  .forEach(t => addLabel(`<div class="town">${t.name}</div>`, new THREE.Vector3(t.x, 1, t.z), 'tw'));

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
const closeView = (x, z, dist = 1) => [new THREE.Vector3(x + 45 * dist, 38 * dist, z + 42 * dist), new THREE.Vector3(x, 0, z)];

// ── パネル ──
const infoEl = document.getElementById('info');
function showInfo(html) {
  infoEl.innerHTML = html ? `<button class="x" aria-label="閉じる">×</button>${html}` : '';
  infoEl.classList.toggle('open', !!html);
  const x = infoEl.querySelector('.x');
  if (x) x.onclick = () => showInfo('');
}
const select = b => { document.querySelectorAll('.st,.sp').forEach(x => x.classList.remove('on')); b.classList.add('on'); };

const yas = STATIONS.find(s => s.main);
const kmFrom = (a, b) => (Math.hypot(a.x - b.x, a.z - b.z) * DATA.unitMeters / 1000).toFixed(1);

const stList = document.getElementById('stList');
[...STATIONS].sort((a, b) => a.z - b.z).forEach(s => {
  const b = document.createElement('button');
  b.className = 'st';
  b.innerHTML = `<span class="dot">JR</span><span><b>${s.name}</b><small>${s.en}${s.main ? '' : ` · 安岡駅から約${kmFrom(s, yas)}km`}</small></span>`;
  b.onclick = () => { select(b); showInfo(''); flyTo(...closeView(s.x, s.z)); };
  stList.appendChild(b);
});

const YG_INFO = `
  <div class="ph en">Spot</div>
  <div class="pt">やすらガーデン</div>
  <p>2025年1月オープンの複合施設。はまゆう図書館、安岡コミュニティーセンター、芝生広場のある公園など。</p>
  <dl>
    <dt>住所</dt><dd>下関市富任町5丁目10-1</dd>
    <dt>アクセス</dt><dd>JR安岡駅から徒歩13分</dd>
    <dt>時間</dt><dd>9:00〜22:00（はまゆう図書館は9:30〜18:30）</dd>
  </dl>
  <p class="src">出典：山口県観光サイト（yamaguchi-tourism.jp）の掲載情報を検索で確認。最新の情報は施設へ。地図上の位置は「富任町五丁目」の代表点で、建物の形はイメージです。</p>`;

const VIEWS = [
  { name: '全体を見る', en: 'Overview', c: '#ffffff', go: () => [HOME.pos.clone(), HOME.target.clone()] },
  { name: 'やすらガーデン', en: 'Yasura Garden', c: '#ff4f9a', go: () => closeView(YG.x, YG.z, 0.8), info: YG_INFO },
  { name: '安岡駅のまわり', en: 'Yasuoka Sta.', c: '#4dffc3', go: () => closeView(yas.x, yas.z) },
  { name: '海から陸を見る', en: 'From the sea', c: '#3fd0ff', go: () => [new THREE.Vector3(-260, 55, -10), new THREE.Vector3(10, 0, -10)] },
  { name: '陸から響灘を見る', en: 'To Hibikinada', c: '#ffb347', go: () => [new THREE.Vector3(110, 36, 10), new THREE.Vector3(-160, 0, -30)] },
  { name: '真上から', en: 'Top down', c: '#a78bfa', go: () => [new THREE.Vector3(0, 560, 1), new THREE.Vector3(0, 0, 0)] },
];
const spList = document.getElementById('spList');
VIEWS.forEach((vw, i) => {
  const b = document.createElement('button');
  b.className = 'sp';
  b.innerHTML = `<i style="background:${vw.c}">${i + 1}</i><span style="flex:1"><b>${vw.name}</b><small class="en">${vw.en}</small><div class="bar" style="background:${vw.c};opacity:.5;width:${40 + i * 10}%"></div></span>`;
  b.onclick = () => { select(b); showInfo(vw.info || ''); flyTo(...vw.go()); };
  spList.appendChild(b);
});
ygLabel.style.pointerEvents = 'auto';
ygLabel.style.cursor = 'pointer';
ygLabel.onclick = () => spList.children[1].click();

const aboutEl = document.getElementById('about');
document.getElementById('aboutBtn').onclick = () => aboutEl.classList.add('open');
document.getElementById('aboutClose').onclick = () => aboutEl.classList.remove('open');
aboutEl.onclick = e => { if (e.target === aboutEl) aboutEl.classList.remove('open'); };

// ── 時間 ──
const slider = document.getElementById('slider');
const clockEl = document.getElementById('clock');
const litEl = document.getElementById('lit');
const playBtn = document.getElementById('play');
const ygSub = document.getElementById('ygSub');
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

  // やすらガーデン：掲載の時間帯（〜22:00、図書館〜18:30）に合わせて灯す
  const hallOn = t < 22, libOn = t < 18.5;
  ygHall.material.color.copy(hallOn ? WARM : OFF);
  ygLib.material.color.copy(libOn ? COOL : OFF);
  ygLampMat.opacity = hallOn ? 1 : 0.15;
  ygBeam.visible = hallOn;
  ygRing.material.opacity = hallOn ? 1 : 0.25;
  ygSub.textContent = hallOn ? (libOn ? '図書館も開いている時間' : '22:00まで') : '本日は終了';

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
    const cyc = (t * 1.1) % 2, u = 0.12 + 0.76 * (cyc < 1 ? cyc : 2 - cyc);
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
  const k = (now / 2200) % 1;
  ygRing.scale.setScalar(1 + k * 0.35);

  if (fly) {
    const f = clamp01((now - fly.s) / 1500), e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (f >= 1) fly = null;
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

if (innerWidth < 760) camera.position.set(260, 300, 360);
setTime(simT);
loop();
