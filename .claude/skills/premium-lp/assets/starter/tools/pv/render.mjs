// 山西水産 PV を作る: pv.html を1コマずつ描画して、テーマソングのBGMと合わせて MP4 にする。
//   cd tools/pv && npm install && npm run render
// 出力: __PAGE__/media/pv.mp4（H.264・Safari/iPhone向け）/ pv.webm（VP9・H.264が使えないブラウザ向け）/ pv-poster.jpg（カバー画像）
// 環境変数: PV_FPS（既定 30）、CHROMIUM_PATH（既定 /opt/pw-browsers/chromium）、FFMPEG（既定 ffmpeg）、PV_ONLY（"0-12" のように秒範囲を指定すると試し描画）
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "__PAGE__/media");
const FPS = Number(process.env.PV_FPS || 30);
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const TMP = path.join(import.meta.dirname, ".tmp");
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/tools/pv/pv.html`);
await page.addScriptTag({ url: `${base}/tools/pv/music.js` });
// 全シーンの文字を一度描いてフォントを読み込ませる
await page.evaluate(async () => {
  document.querySelectorAll(".sc").forEach((s) => (s.style.visibility = "visible"));
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
});
await page.waitForTimeout(800);
const dur = await page.evaluate(() => window.DURATION);
const [from, to] = (process.env.PV_ONLY || `0-${dur}`).split("-").map(Number);

// ── BGM ──
console.log("BGM を生成中…");
const wav = path.join(TMP, "bgm.wav");
await writeFile(wav, Buffer.from(await page.evaluate((s) => window.renderSong(s), dur + 1), "base64"));

// ── 映像（JPEG を ffmpeg に流し込む）──
const mp4 = process.env.PV_ONLY ? path.join(TMP, "preview.mp4") : path.join(OUT, "pv.mp4");
const ff = spawn(FFMPEG, [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-ss", String(from), "-i", wav,
  "-map", "0:v", "-map", "1:a", "-shortest",
  "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", mp4,
], { stdio: ["pipe", "inherit", "inherit"] });
const frames = Math.round((to - from) * FPS);
const v = page.locator("#v");
for (let i = 0; i < frames; i++) {
  const t = from + i / FPS;
  await page.evaluate((t) => window.renderAt(t), t);
  const buf = await v.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % (FPS * 5) === 0) console.log(`${t.toFixed(1)}s / ${to}s`);
}
ff.stdin.end();
const code = await new Promise((r) => ff.on("close", r));

// ── カバー画像（サビの1カット目）──
if (!process.env.PV_ONLY) {
  await page.evaluate(() => window.renderAt(38));
  await v.screenshot({ path: path.join(OUT, "pv-poster.jpg"), type: "jpeg", quality: 88 });
}
await browser.close();
srv.close();

if (!process.env.PV_ONLY && code === 0) {
  console.log("WebM を作成中…");
  const w = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-i", mp4, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1",
    "-deadline", "good", "-cpu-used", "4", "-c:a", "libopus", "-b:a", "128k", path.join(OUT, "pv.webm")], { stdio: "inherit" });
  if (w.status !== 0) errors.push("webm encode failed");
}
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-of", "default=nw=1", mp4], { encoding: "utf8" });
console.log(probe.stdout.trim());
if (errors.length || code !== 0) {
  console.error("失敗:", errors, "ffmpeg exit", code);
  process.exit(1);
}
console.log("完成:", path.relative(ROOT, mp4));
