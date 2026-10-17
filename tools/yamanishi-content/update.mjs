// 山西水産ページの「毎日の山西水産」を自動更新する。
//   1) Instagram 連携の写真（GitHub yamanishisuisan-ig-images の posts/）の新しい順に数枚
//   2) YouTube @shimofugu の新しい動画（公開 RSS）
// どちらも本人が出している写真・動画タイトルをそのまま使う。AI で文章は作らない（盛らずに、掘る）。
// 取得に失敗した側は前回の内容を残す。
//   node tools/yamanishi-content/update.mjs           … 取得してページを書き換える
//   node tools/yamanishi-content/update.mjs --render  … 取得せず feed.json からページだけ作り直す
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const site = join(dirname(fileURLToPath(import.meta.url)), "../../yamanishi-suisan");
const feedPath = join(site, "feed.json");
const imgDir = join(site, "img/feed");
const htmlPath = join(site, "index.html");

const PHOTO_REPO = "yamanishishinsuke19840623/yamanishisuisan-ig-images";
const PHOTO_COUNT = 6;
const YT_HANDLE = "shimofugu";
const VIDEO_COUNT = 3;

const prev = existsSync(feedPath) ? JSON.parse(readFileSync(feedPath, "utf8")) : { photos: [], videos: [] };

async function get(url, as = "text") {
  const headers = { "User-Agent": "Mozilla/5.0 (yamanishi-content)", "Accept-Language": "ja" };
  if (url.startsWith("https://api.github.com/") && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === "buffer" ? Buffer.from(await res.arrayBuffer()) : res.text();
}

// 写真: ファイル名 YYYYMMDD_HHMMSS.jpg が写真リポジトリに追加された日
async function fetchPhotos() {
  const sharp = (await import("sharp")).default;
  const list = JSON.parse(await get(`https://api.github.com/repos/${PHOTO_REPO}/contents/posts`));
  const latest = list
    .filter((f) => f.type === "file" && /^\d{8}_\d{6}\.jpe?g$/i.test(f.name))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, PHOTO_COUNT);
  if (!latest.length) throw new Error("写真が見つかりません");
  mkdirSync(imgDir, { recursive: true });
  const photos = [];
  for (const f of latest) {
    const id = f.name.replace(/\.jpe?g$/i, "");
    const file = `img/feed/${id}.jpg`;
    if (!existsSync(join(site, file))) {
      // 元は数MBあるので、表示サイズに縮めてから置く
      const buf = await get(f.download_url, "buffer");
      await sharp(buf).rotate().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 78, progressive: true, mozjpeg: true }).toFile(join(site, file));
    }
    const { width, height } = await sharp(join(site, file)).metadata();
    photos.push({ file, date: `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`, width, height });
  }
  return photos;
}

// 動画: チャンネルページから channel_id を読み、公開 RSS から新しい順に
async function fetchVideos() {
  const page = await get(`https://www.youtube.com/@${YT_HANDLE}`);
  const id = (page.match(/"externalId":"(UC[\w-]{22})"/) || page.match(/channel_id=(UC[\w-]{22})/) || page.match(/\/channel\/(UC[\w-]{22})/) || [])[1];
  if (!id) throw new Error("YouTube の channel_id が読めません");
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  return parseYouTubeFeed(xml).slice(0, VIDEO_COUNT);
}

const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
export function parseYouTubeFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: (e.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/) || [])[1],
    title: unxml((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").trim(),
    date: ((e.match(/<published>([^<]+)<\/published>/) || [])[1] || "").slice(0, 10),
  })).filter((v) => v.id && v.title && v.date);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jp = (d) => { const [y, m, day] = d.split("-"); return `${y}年${+m}月${+day}日`; };
const dot = (d) => d.replace(/-/g, ".");

function render(feed) {
  const photos = feed.photos.map((p) =>
    `<li data-up><img src="${p.file}" alt="山西水産 Instagram 連携の写真（${jp(p.date)}）" width="${p.width}" height="${p.height}" loading="lazy" decoding="async"><time datetime="${p.date}">${dot(p.date)}</time></li>`).join("\n        ");
  const videos = feed.videos.map((v) =>
    `<li data-up><a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" width="320" height="180" loading="lazy" decoding="async"><span><time datetime="${v.date}">${dot(v.date)}</time>${esc(v.title)}</span></a></li>`).join("\n        ");
  const updated = feed.updated ? `<p class="upd">${dot(feed.updated)} 自動更新</p>` : "";
  return `<!-- feed:start（tools/yamanishi-content/update.mjs が毎日自動生成。直接編集しない） -->
  <section class="sec now" id="now" aria-labelledby="now-h">
    <div class="wrap">
      <div class="head2">
        <div><span class="kicker">Today</span><h2 class="h2" id="now-h">毎日の、<br>山西水産。</h2></div>
        <a class="all" href="https://www.instagram.com/yamanishisuisan/" target="_blank" rel="noopener">Instagram を見る →</a>
      </div>
      ${updated}${photos ? `
      <ul class="feed-photos">
        ${photos}
      </ul>` : ""}${videos ? `
      <h3 class="feed-h">YouTube の新しい動画</h3>
      <ul class="feed-videos">
        ${videos}
      </ul>` : ""}
    </div>
  </section>
  <!-- feed:end -->`;
}

async function main() {
  const feed = { ...prev };
  if (!process.argv.includes("--render")) {
    let changed = false;
    for (const [key, fn] of [["photos", fetchPhotos], ["videos", fetchVideos]]) {
      try {
        const next = await fn();
        if (JSON.stringify(next) !== JSON.stringify(prev[key])) changed = true;
        feed[key] = next;
        console.log(`${key}: ${next.length} 件`);
      } catch (e) {
        console.warn(`${key}: 取得できなかったので前回のまま（${e.message}）`);
      }
    }
    if (changed) feed.updated = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    // 表示から外れた写真は消す（リポジトリを太らせない）
    if (existsSync(imgDir)) {
      const keep = new Set(feed.photos.map((p) => p.file.split("/").pop()));
      for (const f of readdirSync(imgDir)) if (!keep.has(f)) unlinkSync(join(imgDir, f));
    }
    writeFileSync(feedPath, JSON.stringify(feed, null, 2) + "\n");
  }
  const html = readFileSync(htmlPath, "utf8");
  const re = /<!-- feed:start[\s\S]*?<!-- feed:end -->/;
  if (!re.test(html)) throw new Error("index.html に <!-- feed:start --> 〜 <!-- feed:end --> がありません");
  const next = html.replace(re, () => render(feed));
  if (next !== html) { writeFileSync(htmlPath, next); console.log("index.html を更新しました"); } else console.log("変更なし");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
