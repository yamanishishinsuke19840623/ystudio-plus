// かんもんノート(WordPress)から最新記事を取得し、リール用データを reel-data/ に保存する。
// 依存なし(Node 20+ の fetch を使用)。
//   node tools/kanmon-reel/fetch.mjs
// 環境変数:
//   KANMON_SITE  取得元サイト (既定: https://www.kanmonnote.com)
//   REEL_COUNT   取得する記事数 (既定: 5)
//
// 方針(盛らずに、掘る): 記事タイトル・日付・カテゴリ・アイキャッチは WordPress が返した値だけを使う。
// 取れなかった項目は空のまま保存し、補完はしない。
import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

const SITE = (process.env.KANMON_SITE || "https://www.kanmonnote.com").replace(/\/+$/, "");
const COUNT = Number(process.env.REEL_COUNT || 5);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(ROOT, "reel-data");
const IMG = path.join(OUT, "img");
// 一部のWAFはボット風UAを弾くため、ブラウザ相当のUAを名乗る(取得するのは公開記事のみ)
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 kanmon-reel-fetch/1.1";

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, accept = "*/*") {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "ja,en;q=0.8", Referer: `${SITE}/` }, redirect: "follow" });
      if (res.ok) return res;
      last = new Error(`${res.status} ${res.statusText} ${url}`);
      if (res.status < 500 && res.status !== 429) break; // 4xx は再試行しても同じ
    } catch (e) { last = e; }
    await sleep(2000 * 2 ** i);
  }
  throw last;
}

const decode = (s = "") =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .trim();

async function getJSON(url) {
  const res = await get(url, "application/json");
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`JSONではない応答 (${res.headers.get("content-type")}): ${text.slice(0, 120)}`); }
}

// 1st: WP REST API
async function fromRest() {
  let posts;
  try { posts = await getJSON(`${SITE}/wp-json/wp/v2/posts?per_page=${COUNT}&_embed=1`); }
  catch (e) { // パーマリンク未設定サイト向けの別ルート
    console.warn(`/wp-json 失敗 → ?rest_route で再試行: ${e.message}`);
    posts = await getJSON(`${SITE}/?rest_route=/wp/v2/posts&per_page=${COUNT}&_embed=1`);
  }
  if (!Array.isArray(posts)) throw new Error(`想定外の応答: ${JSON.stringify(posts).slice(0, 160)}`);
  return posts.map(p => {
    const media = p._embedded?.["wp:featuredmedia"]?.[0];
    const sizes = media?.media_details?.sizes || {};
    const image = (sizes.large || sizes.medium_large || sizes.full || {}).source_url || media?.source_url || "";
    const terms = (p._embedded?.["wp:term"] || []).flat();
    const cat = terms.find(t => t.taxonomy === "category");
    return { id: p.id, title: decode(p.title?.rendered), date: p.date, link: p.link, category: cat ? decode(cat.name) : "", image };
  });
}

// 2nd: RSS feed (REST API が無効化されているサイト向け)
async function fromRss() {
  const xml = await (await get(`${SITE}/feed/`, "application/rss+xml, application/xml, text/xml")).text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, COUNT).map(m => m[1]);
  const pick = (s, tag) => { const m = s.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`)); return m ? m[1] : ""; };
  return items.map((s, i) => {
    const content = pick(s, "content:encoded") || pick(s, "description");
    const img = (s.match(/<enclosure[^>]+url="([^"]+)"/) || content.match(/<img[^>]+src="([^"]+)"/) || [])[1] || "";
    return { id: i + 1, title: decode(pick(s, "title")), date: new Date(pick(s, "pubDate")).toISOString(), link: decode(pick(s, "link")), category: decode(pick(s, "category")), image: img };
  });
}

async function download(url, id) {
  if (!url) return "";
  try {
    const res = await get(url, "image/*");
    const type = res.headers.get("content-type") || "";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const file = `${id}.${ext}`;
    await writeFile(path.join(IMG, file), Buffer.from(await res.arrayBuffer()));
    return `img/${file}`;
  } catch (e) {
    console.warn(`画像を取得できませんでした: ${url} (${e.message})`);
    return "";
  }
}

async function main() {
  let posts, source;
  try { posts = await fromRest(); source = "rest"; }
  catch (e) { console.warn(`REST API 失敗 → RSS で再試行: ${e.message}`); posts = await fromRss(); source = "rss"; }
  if (!posts.length) throw new Error("記事が0件でした");

  await mkdir(IMG, { recursive: true });
  for (const f of await readdir(IMG)) await unlink(path.join(IMG, f)); // 古い画像を掃除
  for (const p of posts) p.localImage = await download(p.image, p.id);

  const data = { site: SITE, source, fetchedAt: new Date().toISOString(), posts };
  await writeFile(path.join(OUT, "posts.json"), JSON.stringify(data, null, 2) + "\n");
  console.log(`${posts.length}件を保存 (${source}):`);
  for (const p of posts) console.log(`- ${p.date.slice(0, 10)} [${p.category || "-"}] ${p.title} ${p.localImage ? "🖼" : "(画像なし)"}`);
}

main().catch(e => { console.error(e); process.exit(1); });
