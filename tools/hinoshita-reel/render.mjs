// 日下まりあさん応援リールを作る: pv.html の canvas を1コマずつ描いて、BGM と合わせて MP4 にする。
//   cd tools/hinoshita-reel && npm install && npm run render
// 先に photos/portrait.jpg を置く（写真はリポジトリに入れない。.gitignore 済み）。
// 出力: out/hinoshita-reel-a.mp4（エンドカードA）/ -b.mp4（B）/ -poster.jpg。OUT_DIR で出力先を変えられる。
// PV_ONLY=stills のときは静止画だけ（PV_TIMES="1.0,4.8,..."）。PV_END=a か b で片方だけ。
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = process.env.OUT_DIR || path.join(import.meta.dirname, "out");
const TMP = path.join(import.meta.dirname, ".tmp");
const FPS = Number(process.env.PV_FPS || 30);
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const ENDS = process.env.PV_END ? [process.env.PV_END] : ["a", "b"];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png" };
const srv = http.createServer(async (req, res) => {
  try {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(ROOT)) throw 0;
    const body = await readFile(p);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}`;
await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 500, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const open = async (end) => {
  await page.goto(`${base}/tools/hinoshita-reel/pv.html?end=${end}`);
  await page.evaluate(() => window.ready);
};
await open(ENDS[0]);
await page.addScriptTag({ url: `${base}/tools/hinoshita-reel/music.js` });
for (const f of ["800 150px 'Shippori Mincho'", "700 60px 'Zen Kaku Gothic New'"]) {
  if (!(await page.evaluate((f) => document.fonts.check(f, "下関"), f))) console.warn(`⚠ ${f} が読み込めていません（代わりの書体で描かれます）`);
}
const frame = (t) => page.evaluate((t) => { window.renderAt(t); return document.getElementById("v").toDataURL("image/jpeg", 0.92).split(",")[1]; }, t);

if (process.env.PV_ONLY === "stills") {
  const dir = path.join(OUT, "stills");
  await mkdir(dir, { recursive: true });
  const times = (process.env.PV_TIMES || "1.0,2.2,5.6,8.5,11.5,15.5,18.5,21.5,25.0,29.0").split(",").map(Number);
  for (const end of ENDS) {
    await open(end);
    for (const t of times) await writeFile(path.join(dir, `${end}-t${t.toFixed(2).padStart(5, "0")}.jpg`), Buffer.from(await frame(t), "base64"));
  }
  console.log("stills:", dir, errors);
  await browser.close();
  srv.close();
  process.exit(errors.length ? 1 : 0);
}

const dur = await page.evaluate(() => window.DURATION);
console.log("BGM を生成中…");
const wav = path.join(TMP, "bgm.wav");
await writeFile(wav, Buffer.from(await page.evaluate((s) => window.renderSong(s), dur), "base64"));

let failed = false;
for (const end of ENDS) {
  await open(end);
  const mp4 = path.join(OUT, `hinoshita-reel-${end}.mp4`);
  const ff = spawn(FFMPEG, [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-i", wav, "-map", "0:v", "-map", "1:a", "-shortest",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-movflags", "+faststart", mp4,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const frames = Math.round(dur * FPS);
  for (let i = 0; i < frames; i++) {
    const buf = Buffer.from(await frame(i / FPS), "base64");
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % (FPS * 5) === 0) console.log(`[${end}] ${(i / FPS).toFixed(1)}s / ${dur}s`);
  }
  ff.stdin.end();
  if ((await new Promise((r) => ff.on("close", r))) !== 0) failed = true;
  console.log(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-of", "default=nw=1", mp4], { encoding: "utf8" }).stdout.trim());
}
// カバー画像：名前が出そろったところ
await writeFile(path.join(OUT, "hinoshita-reel-poster.jpg"), Buffer.from(await frame(11.8), "base64"));
await browser.close();
srv.close();
if (errors.length || failed) {
  console.error("失敗:", errors);
  process.exit(1);
}
console.log("完成:", OUT);
