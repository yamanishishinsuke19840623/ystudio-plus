// yamanishi-pv.html を1コマずつ描画し、テーマソングを合成した MP4 を作る。
//   node tools/yamanishi-pv/render.mjs
// 環境変数: PV_FPS (既定 30) / PV_FRAMES (テスト用に先頭だけ描くコマ数) / FFMPEG
// 出力: media/yamanishi-pv.mp4 / media/yamanishi-pv.jpg(サムネ) / media/yamanishi-pv-bgm.m4a(ページ再生用)
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "../..");
const MEDIA = path.join(ROOT, "media");
const FPS = Number(process.env.PV_FPS || 30);
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const CUT = 75; // テーマソングのイントロ〜1番サビ終わり(30小節 × 2.5秒)

const TYPES = { ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".m4a": "audio/mp4", ".mp4": "video/mp4" };
const serve = () => new Promise(res => {
  const srv = http.createServer(async (req, rsp) => {
    try {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!p.startsWith(ROOT)) throw 0;
      const body = await readFile(p);
      rsp.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" }); rsp.end(body);
    } catch { rsp.writeHead(404); rsp.end(); }
  });
  srv.listen(0, "127.0.0.1", () => res(srv));
});
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: "inherit" }); if (r.status) throw new Error(`${cmd} failed`); };

await mkdir(MEDIA, { recursive: true });
const tmp = os.tmpdir();
const wav = path.join(tmp, "yamanishi-pv-bgm.wav"), silent = path.join(tmp, "yamanishi-pv-video.mp4");

const srv = await serve();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://127.0.0.1:${srv.address().port}/yamanishi-pv.html?render=1`, { waitUntil: "networkidle" });
await page.evaluate(() => window.pv.ready);
const dur = await page.evaluate(() => window.pv.duration);
const total = Number(process.env.PV_FRAMES || Math.round(dur * FPS));

// 1. BGM: MIDI から合成
run("python3", [path.join(HERE, "synth.py"), path.join(ROOT, "fuku-to-ikiru.mid"), wav, String(dur), String(CUT)]);

// 2. 映像: 1コマずつスクリーンショットして ffmpeg に流す
const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", silent], { stdio: ["pipe", "inherit", "inherit"] });
for (let i = 0; i < total; i++) {
  await page.evaluate(t => window.pv.seek(t), i / FPS);
  const buf = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
  if (i % (FPS * 5) === 0) console.log(`frame ${i}/${total}`);
}
ff.stdin.end();
await new Promise((res, rej) => ff.on("close", c => c ? rej(new Error("ffmpeg")) : res()));

// サムネイル(エンドカード)
await page.evaluate(t => window.pv.seek(t), 75.5);
await page.screenshot({ path: path.join(MEDIA, "yamanishi-pv.jpg"), type: "jpeg", quality: 90 });
await browser.close(); srv.close();

// 3. 合成: 音量は -14 LUFS に揃える
const loud = "loudnorm=I=-14:TP=-1.5:LRA=11";
run(FFMPEG, ["-y", "-loglevel", "error", "-i", silent, "-i", wav, "-af", loud, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", path.join(MEDIA, "yamanishi-pv.mp4")]);
run(FFMPEG, ["-y", "-loglevel", "error", "-i", wav, "-af", loud, "-c:a", "aac", "-b:a", "128k", path.join(MEDIA, "yamanishi-pv-bgm.m4a")]);
console.log("done: media/yamanishi-pv.mp4");
