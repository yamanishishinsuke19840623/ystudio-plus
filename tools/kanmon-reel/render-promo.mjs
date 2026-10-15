// kanmonnote-promo.html (かんもんノート 15秒プロモリール) を1コマずつ描画して MP4 にする。
//   node tools/kanmon-reel/render-promo.mjs
// 出力: media/kanmonnote-promo.mp4(音あり) / media/kanmonnote-promo-silent.mp4(音なし・IGで曲を付ける用) / media/kanmonnote-promo.jpg(カバー)
// 環境変数: REEL_FPS(既定30) / FFMPEG / CHROMIUM_PATH
import http from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(ROOT, "media");
const FPS = Number(process.env.REEL_FPS || 30);
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

const srv = await new Promise(res => {
  const s = http.createServer(async (req, rsp) => {
    try {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!p.startsWith(ROOT)) throw new Error("outside root");
      rsp.writeHead(200, { "Content-Type": TYPES[path.extname(p).toLowerCase()] || "application/octet-stream" }); rsp.end(await readFile(p));
    } catch { rsp.writeHead(404); rsp.end(); }
  });
  s.listen(0, "127.0.0.1", () => res(s));
});
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 2000 } });
// Google Fonts は curl 経由で取る(プロキシ環境でもフォントが落ちないように)
await page.route(/fonts\.(googleapis|gstatic)\.com/, async route => {
  const r = spawnSync("curl", ["-sSL", "-A", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36", route.request().url()], { maxBuffer: 64 << 20 });
  if (r.status !== 0) return route.abort();
  const url = route.request().url();
  await route.fulfill({ status: 200, body: r.stdout, headers: { "Content-Type": url.includes("css") ? "text/css" : "font/woff2", "Access-Control-Allow-Origin": "*" } });
});
await page.goto(`http://127.0.0.1:${srv.address().port}/kanmonnote-promo.html`);
await page.evaluate(() => window.kanmonPromo.ready);
const fontsOk = await page.evaluate(() => document.fonts.check('100px "Dela Gothic One"', "情報"));
console.log("fonts:", fontsOk ? "ok" : "FALLBACK");

// PREVIEW="1.2,3.4" で、その秒のコマだけ PNG に書き出して終わる(確認用)
if (process.env.PREVIEW) {
  const dir = process.env.PREVIEW_DIR || path.join(ROOT, ".promo-preview"); await mkdir(dir, { recursive: true });
  for (const t of process.env.PREVIEW.split(",").map(Number)) {
    const b64 = await page.evaluate(t => { window.kanmonPromo.renderAt(t); return document.getElementById("c").toDataURL("image/jpeg", 0.85).split(",")[1]; }, t);
    await writeFile(path.join(dir, `t${t.toFixed(2)}.jpg`), Buffer.from(b64, "base64"));
  }
  await browser.close(); srv.close(); process.exit(0);
}
const tmp = path.join(ROOT, ".promo-frames");
await rm(tmp, { recursive: true, force: true }); await mkdir(tmp, { recursive: true }); await mkdir(OUT, { recursive: true });
const DUR = await page.evaluate(() => window.kanmonPromo.DUR);
const N = Math.round(DUR * FPS);
for (let f = 0; f < N; f++) {
  const b64 = await page.evaluate(t => { window.kanmonPromo.renderAt(t); return document.getElementById("c").toDataURL("image/jpeg", 0.95).split(",")[1]; }, f / FPS);
  await writeFile(path.join(tmp, `f${String(f).padStart(4, "0")}.jpg`), Buffer.from(b64, "base64"));
  if (f % 60 === 0) console.log(`frame ${f}/${N}`);
}
const wav = await page.evaluate(() => window.kanmonPromo.renderAudio());
await writeFile(path.join(tmp, "a.wav"), Buffer.from(wav, "base64"));
// カバー: ロゴが出きったあとのコマ
const cover = await page.evaluate(() => { window.kanmonPromo.renderAt(13.6); return document.getElementById("c").toDataURL("image/jpeg", 0.92).split(",")[1]; });
await writeFile(path.join(OUT, "kanmonnote-promo.jpg"), Buffer.from(cover, "base64"));
await browser.close(); srv.close();

const enc = ["-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart"];
const run = args => { const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" }); if (r.status !== 0) throw new Error("ffmpeg failed"); };
run(["-framerate", String(FPS), "-i", path.join(tmp, "f%04d.jpg"), "-i", path.join(tmp, "a.wav"), ...enc, "-c:a", "aac", "-b:a", "192k", "-shortest", path.join(OUT, "kanmonnote-promo.mp4")]);
run(["-framerate", String(FPS), "-i", path.join(tmp, "f%04d.jpg"), ...enc, "-an", path.join(OUT, "kanmonnote-promo-silent.mp4")]);
await rm(tmp, { recursive: true, force: true });
console.log("done: media/kanmonnote-promo.mp4 / -silent.mp4 / .jpg");
