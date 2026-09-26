// kanmon-reel.html を1コマずつ描画して MP4 と投稿文を作る(ブラウザ録画より確実・なめらか)。
//   node tools/kanmon-reel/render.mjs
// 環境変数:
//   REEL_FEEDS  作るリール。"カテゴリのスラッグ:本数" をカンマ区切り (既定: gourmet:3)
//               new = 新着(全カテゴリ)。データファイル名(cat-5.json など)も指定可
//   REEL_FPS    フレームレート (既定: 30)
//   FFMPEG      ffmpeg のパス (既定: ffmpeg)
// 出力: reel-out/<slug>.mp4 / <slug>.jpg(カバー) / <slug>.txt(投稿文) / manifest.json
//
// 投稿文は記事データ(タイトル・日付・カテゴリ)と既知の事実だけで組み立て、宣伝文句は足さない。
import http from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(ROOT, "reel-out");
const FPS = Number(process.env.REEL_FPS || 30);
const DUR = 15;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FEEDS = (process.env.REEL_FEEDS || "gourmet:3").split(",").map(s => s.trim()).filter(Boolean).map(s => {
  const [file, count = "3"] = s.split(":"); return { file, count: Number(count) };
});

const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
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

const md = iso => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
const tag = s => "#" + s.replace(/[\s　（）()・/／、。!！?？「」【】]/g, "");
export function buildCaption(data, n) {
  const posts = data.posts.slice(0, n);
  const dates = posts.map(p => p.date).filter(Boolean).sort();
  const range = dates.length ? (md(dates[0]) === md(dates.at(-1)) ? md(dates[0]) : `${md(dates[0])}〜${md(dates.at(-1))}`) : "";
  const head = `かんもんノート｜${data.category ? `${data.category.name}の` : ""}新着記事${range ? `(${range})` : ""}`;
  const body = posts.map(p => `▼${p.title}`).join("\n\n");
  const cats = data.category ? [data.category.name] : [...new Set(posts.map(p => p.category).filter(Boolean))];
  const tags = [...new Set(["#かんもんノート", "#関門海峡", "#下関", ...cats.map(tag)])].join(" ");
  return `${head}\n\n${body}\n\n記事の続きは kanmonnote.com で公開中です。\n\n${tags}\n`;
}

// "gourmet" → reel-data/categories.json から cat-<id>.json を引く / "new" → posts.json
async function resolveFeed(name) {
  if (name === "new") return "posts.json";
  if (/^(posts|cat-\d+)\.json$/.test(name)) return name;
  const { categories } = JSON.parse(await readFile(path.join(ROOT, "reel-data", "categories.json"), "utf8"));
  const c = categories.find(c => c.slug === name || c.name === name);
  if (!c) throw new Error(`カテゴリ「${name}」が reel-data/categories.json にありません(あるもの: ${categories.map(c => c.slug).join(", ")})`);
  return c.file;
}

async function renderFeed(page, base, feed) {
  const file = await resolveFeed(feed.file), count = feed.count;
  const data = JSON.parse(await readFile(path.join(ROOT, "reel-data", file), "utf8"));
  const slug = data.category ? data.category.slug : "new";
  await page.goto(`${base}/kanmon-reel.html?feed=${file}&count=${count}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("自動取得"), null, { timeout: 60000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => window.kanmonReel.info);
  if (info.mode !== "local") throw new Error(`データが読み込めていません: ${JSON.stringify(info)}`);

  const tmp = path.join(OUT, `.frames-${slug}`);
  await rm(tmp, { recursive: true, force: true }); await mkdir(tmp, { recursive: true });
  const total = Math.round(DUR * FPS);
  for (let f = 0; f < total; f++) {
    const b64 = await page.evaluate(t => { window.kanmonReel.renderAt(t); return document.getElementById("c").toDataURL("image/jpeg", 0.92).split(",")[1]; }, f / FPS);
    await writeFile(path.join(tmp, `f${String(f).padStart(4, "0")}.jpg`), Buffer.from(b64, "base64"));
    if (f % 90 === 0) console.log(`  ${slug}: frame ${f}/${total}`);
  }
  const wav = await page.evaluate(() => window.kanmonReel.renderAudio());
  await writeFile(path.join(tmp, "audio.wav"), Buffer.from(wav, "base64"));

  const mp4 = path.join(OUT, `${slug}.mp4`);
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(tmp, "f%04d.jpg"), "-i", path.join(tmp, "audio.wav"),
    "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", mp4], { stdio: "inherit" });
  if (r.error) throw new Error(`ffmpeg を起動できません(${FFMPEG}): ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status})`);
  // cover: the intro frame with logo + date range
  await writeFile(path.join(OUT, `${slug}.jpg`), await readFile(path.join(tmp, `f${String(Math.round(1.7 * FPS)).padStart(4, "0")}.jpg`)));
  const caption = buildCaption(data, count);
  await writeFile(path.join(OUT, `${slug}.txt`), caption);
  await rm(tmp, { recursive: true, force: true });
  return { slug, file, count, video: `reel-out/${slug}.mp4`, cover: `reel-out/${slug}.jpg`, caption: `reel-out/${slug}.txt`, fetchedAt: data.fetchedAt, posts: data.posts.slice(0, count).map(p => ({ id: p.id, title: p.title, link: p.link })) };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  page.on("pageerror", e => console.error("page error:", e.message));
  const reels = [];
  try {
    for (const feed of FEEDS) { console.log(`render ${feed.file} (${feed.count}本)`); reels.push(await renderFeed(page, base, feed)); }
  } finally { await browser.close(); srv.close(); }
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify({ renderedAt: new Date().toISOString(), reels }, null, 2) + "\n");
  for (const r of reels) console.log(`\n=== ${r.video} ===\n${await readFile(path.join(ROOT, r.caption), "utf8")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
