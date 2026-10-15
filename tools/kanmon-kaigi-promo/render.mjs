// kanmon-kaigi-promo.html を1コマずつ描画して、インスタグラムリール用の MP4（1080×1920 / 30fps / 15秒）を作る。
//   node tools/kanmon-kaigi-promo/render.mjs            … 本番書き出し
//   node tools/kanmon-kaigi-promo/render.mjs --stills 0.5,1.2,...  … 指定秒のコマだけ PNG で書き出す（確認用）
// 音は tools/kanmon-kaigi-promo/music.py で作った自作トラック（著作権フリー）を重ねる。
// 出力: kanmon-kaigi/video/kanmon-kaigi-promo-9x16.mp4 と同名 .jpg（カバー）
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUTDIR = path.join(ROOT, "kanmon-kaigi/video");
const FPS = 30, DUR = 15, FFMPEG = process.env.FFMPEG || "ffmpeg";
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg" };

function serve() {
  return new Promise(res => {
    const srv = http.createServer(async (req, rsp) => {
      try {
        const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
        if (!p.startsWith(ROOT)) throw new Error("outside root");
        const body = await readFile(p);
        rsp.writeHead(200, { "Content-Type": TYPES[path.extname(p).toLowerCase()] || "application/octet-stream" }); rsp.end(body);
      } catch { rsp.writeHead(404); rsp.end(); }
    });
    srv.listen(0, "127.0.0.1", () => res(srv));
  });
}

const args = process.argv.slice(2);
const stillsArg = args.includes("--stills") ? args[args.indexOf("--stills") + 1] : null;
const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

const srv = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on("pageerror", e => console.error("page error:", e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/kanmon-kaigi-promo.html?render`);
await page.evaluate(() => window.READY);
const grab = async t => {
  const url = await page.evaluate(t => { window.draw(t); return document.getElementById("cv").toDataURL("image/png"); }, t);
  return Buffer.from(url.split(",")[1], "base64");
};

if (stillsArg) {
  const dir = outArg || path.join(ROOT, "kanmon-kaigi/video/stills");
  await mkdir(dir, { recursive: true });
  for (const s of stillsArg.split(",").map(Number)) await writeFile(path.join(dir, `t${s.toFixed(2)}.png`), await grab(s));
  console.log("stills ->", dir);
} else {
  await mkdir(OUTDIR, { recursive: true });
  const silent = path.join(OUTDIR, ".promo-video.mp4");
  const ff = spawn(FFMPEG, ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
  const N = FPS * DUR;
  for (let f = 0; f < N; f++) {
    const buf = await grab(f / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (f % 30 === 0) process.stdout.write(`\r${f}/${N}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  const wav = path.join(OUTDIR, ".promo-music.wav");
  const py = spawnSync("python3", [path.join(ROOT, "tools/kanmon-kaigi-promo/music.py"), wav], { stdio: "inherit" });
  if (py.status !== 0) throw new Error("music.py failed");
  const mp4 = path.join(OUTDIR, "kanmon-kaigi-promo-9x16.mp4");
  spawnSync(FFMPEG, ["-y", "-v", "error", "-i", silent, "-i", wav, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", mp4], { stdio: "inherit" });
  await writeFile(path.join(OUTDIR, "kanmon-kaigi-promo-9x16.jpg"), await (async () => {
    const png = await grab(13.6); const r = spawnSync(FFMPEG, ["-v", "error", "-f", "png_pipe", "-i", "-", "-q:v", "3", "-f", "mjpeg", "-"], { input: png });
    return r.stdout;
  })());
  spawnSync("rm", ["-f", silent, wav]);
  console.log("\n->", mp4);
}
await browser.close(); srv.close();
