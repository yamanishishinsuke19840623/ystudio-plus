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
// REST のルート: 通常は /wp-json/、パーマリンク未設定なら ?rest_route= を使う
let restBase = null;
const restUrl = (route, query) => restBase === "rest_route" ? `${SITE}/?rest_route=/wp/v2/${route}&${query}` : `${SITE}/wp-json/wp/v2/${route}?${query}`;
async function rest(route, query) {
  if (restBase) return getJSON(restUrl(route, query));
  try { const r = await getJSON(restUrl(route, query)); restBase = "wp-json"; return r; }
  catch (e) {
    console.warn(`/wp-json 失敗 → ?rest_route で再試行: ${e.message}`);
    restBase = "rest_route"; return getJSON(restUrl(route, query));
  }
}
function mapPost(p) {
  const media = p._embedded?.["wp:featuredmedia"]?.[0];
  const sizes = media?.media_details?.sizes || {};
  const image = (sizes.large || sizes.medium_large || sizes.full || {}).source_url || media?.source_url || "";
  const terms = (p._embedded?.["wp:term"] || []).flat();
  const cat = terms.find(t => t.taxonomy === "category");
  return { id: p.id, title: decode(p.title?.rendered), date: p.date, link: p.link, category: cat ? decode(cat.name) : "", image };
}
async function fromRest(extra = "") {
  const posts = await rest("posts", `per_page=${COUNT}&_embed=1${extra}`);
  if (!Array.isArray(posts)) throw new Error(`想定外の応答: ${JSON.stringify(posts).slice(0, 160)}`);
  return posts.map(mapPost);
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

const CAT_MAX = Number(process.env.REEL_CATEGORIES || 8); // 記事数の多い順に何カテゴリ分作るか
const CAT_MIN_POSTS = 3;

async function main() {
  let posts, source;
  try { posts = await fromRest(); source = "rest"; }
  catch (e) { console.warn(`REST API 失敗 → RSS で再試行: ${e.message}`); posts = await fromRss(); source = "rss"; }
  if (!posts.length) throw new Error("記事が0件でした");

  // カテゴリ別(REST が使えるときのみ)
  const cats = [];
  if (source === "rest") {
    try {
      const list = await rest("categories", "per_page=100&orderby=count&order=desc&hide_empty=1");
      for (const c of list.filter(c => c.count >= CAT_MIN_POSTS).slice(0, CAT_MAX)) {
        const cp = await fromRest(`&categories=${c.id}`);
        if (cp.length) cats.push({ id: c.id, name: decode(c.name), slug: c.slug, count: c.count, posts: cp });
      }
    } catch (e) { console.warn(`カテゴリ別の取得に失敗(新着のみ保存): ${e.message}`); }
  }

  await mkdir(IMG, { recursive: true });
  for (const f of await readdir(IMG)) await unlink(path.join(IMG, f)); // 古い画像を掃除
  for (const f of await readdir(OUT)) if (/^cat-.*\.json$/.test(f)) await unlink(path.join(OUT, f));
  const done = new Map(); // 同じ記事の画像は1回だけ落とす
  const withImages = async list => { for (const p of list) { if (!done.has(p.id)) done.set(p.id, await download(p.image, p.id)); p.localImage = done.get(p.id); } };

  const fetchedAt = new Date().toISOString();
  await withImages(posts);
  await writeFile(path.join(OUT, "posts.json"), JSON.stringify({ site: SITE, source, fetchedAt, posts }, null, 2) + "\n");
  console.log(`新着 ${posts.length}件を保存 (${source}):`);
  for (const p of posts) console.log(`- ${p.date.slice(0, 10)} [${p.category || "-"}] ${p.title} ${p.localImage ? "🖼" : "(画像なし)"}`);

  const index = [];
  for (const c of cats) {
    await withImages(c.posts);
    const file = `cat-${c.id}.json`;
    await writeFile(path.join(OUT, file), JSON.stringify({ site: SITE, source, fetchedAt, category: { id: c.id, name: c.name, slug: c.slug }, posts: c.posts }, null, 2) + "\n");
    index.push({ id: c.id, name: c.name, slug: c.slug, count: c.count, file });
    console.log(`カテゴリ「${c.name}」(全${c.count}件) → ${c.posts.length}件`);
  }
  await writeFile(path.join(OUT, "categories.json"), JSON.stringify({ fetchedAt, categories: index }, null, 2) + "\n");
}

main().catch(e => { console.error(e); process.exit(1); });
