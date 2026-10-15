// ナイトバブル 15秒PV を作る: pv.html の canvas を1コマずつ描いて、BGM と合わせて MP4 / WebM にする。
//   cd tools/nightbubble-pv && npm install && npm run render
// 出力: nightbubble/media/nightbubble-pv15.mp4（H.264・iPhone/Instagram向け）/ .webm / -poster.jpg
// PV_ONLY=stills のときは静止画だけ（PV_TIMES="0.4,1.9,..." OUT_DIR=...）。
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "nightbubble/media");
const TMP = path.join(import.meta.dirname, ".tmp");
const FPS = Number(process.env.PV_FPS || 30);
const FFMPEG = process.env.FFMPEG || "ffmpeg";
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
await page.goto(`${base}/tools/nightbubble-pv/pv.html`);
await page.addScriptTag({ url: `${base}/tools/nightbubble-pv/music.js` });
await page.evaluate(() => window.ready);
const fontsOk = await page.evaluate(() => document.fonts.check("900 150px 'Zen Maru Gothic'", "夜"));
if (!fontsOk) console.warn("⚠ Zen Maru Gothic が読み込めていません（代わりの書体で描かれます）");
const frame = (t) => page.evaluate((t) => { window.renderAt(t); return document.getElementById("v").toDataURL("image/jpeg", 0.92).split(",")[1]; }, t);

if (process.env.PV_ONLY === "stills") {
  const dir = process.env.OUT_DIR || path.join(TMP, "stills");
  await mkdir(dir, { recursive: true });
  const times = (process.env.PV_TIMES || "0.4,1.0,1.6,2.1,3.6,4.8,5.6,6.1,6.35,7.2,8.0,9.9,10.3,11.0,12.3,13.2,14.2,14.8").split(",").map(Number);
  for (const t of times) await writeFile(path.join(dir, `t${t.toFixed(2).padStart(5, "0")}.jpg`), Buffer.from(await frame(t), "base64"));
  console.log("stills:", times.length, dir, errors);
  await browser.close();
  srv.close();
  process.exit(errors.length ? 1 : 0);
}

const dur = await page.evaluate(() => window.DURATION);
console.log("BGM を生成中…");
const wav = path.join(TMP, "bgm.wav");
await writeFile(wav, Buffer.from(await page.evaluate((s) => window.renderSong(s), dur), "base64"));

const mp4 = path.join(OUT, "nightbubble-pv15.mp4");
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
  if (i % (FPS * 3) === 0) console.log(`${(i / FPS).toFixed(1)}s / ${dur}s`);
}
ff.stdin.end();
const code = await new Promise((r) => ff.on("close", r));
// カバー画像：「はじめての夜に、なる。」が出そろったところ
await writeFile(path.join(OUT, "nightbubble-pv15-poster.jpg"), Buffer.from(await frame(4.6), "base64"));
await browser.close();
srv.close();

if (code === 0) {
  console.log("WebM を作成中…");
  const w = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-i", mp4, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-row-mt", "1",
    "-deadline", "good", "-cpu-used", "4", "-c:a", "libopus", "-b:a", "128k", mp4.replace(".mp4", ".webm")], { stdio: "inherit" });
  if (w.status !== 0) errors.push("webm encode failed");
}
console.log(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-of", "default=nw=1", mp4], { encoding: "utf8" }).stdout.trim());
if (errors.length || code !== 0) {
  console.error("失敗:", errors, "ffmpeg exit", code);
  process.exit(1);
}
console.log("完成:", path.relative(ROOT, mp4));
