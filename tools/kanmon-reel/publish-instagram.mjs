// reel-out/<slug>.mp4 を Instagram にリールとして投稿する(Instagram Graph API)。
//   node tools/kanmon-reel/publish-instagram.mjs new
// 必要な環境変数(GitHub の Secrets に登録):
//   IG_USER_ID       Instagram プロアカウント(ビジネス/クリエイター)の ID
//   IG_ACCESS_TOKEN  投稿権限つきの長期アクセストークン。次のどちらでもよい(自動で判別)
//                    - Instagramログイン版(IGAA… で始まる / 権限 instagram_business_content_publish)→ graph.instagram.com
//                    - Facebookログイン版(EAA… で始まる / 権限 instagram_content_publish)→ graph.facebook.com
// 任意:
//   PUBLIC_BASE      動画を公開しているサイト (既定: https://ystudio.yamanisi.co.jp)
//   GRAPH_VERSION    Graph API のバージョン (既定: v23.0)
//   DRY_RUN=1        投稿せず、投稿内容の確認だけ行う
//
// 同じ動画を二重投稿しないよう、投稿済みの動画ハッシュを reel-out/posted.json に記録する。
import { readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const slug = process.argv[2] || "new";
const { IG_USER_ID, IG_ACCESS_TOKEN } = process.env;
const BASE = (process.env.PUBLIC_BASE || "https://ystudio.yamanisi.co.jp").replace(/\/+$/, "");
const HOST = (IG_ACCESS_TOKEN || "").startsWith("IG") ? "graph.instagram.com" : "graph.facebook.com";
const GRAPH = `https://${HOST}/${process.env.GRAPH_VERSION || "v23.0"}`;
const DRY = process.env.DRY_RUN === "1";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function graph(method, p, params) {
  const body = new URLSearchParams({ ...params, access_token: IG_ACCESS_TOKEN });
  const url = method === "GET" ? `${GRAPH}/${p}?${body}` : `${GRAPH}/${p}`;
  const res = await fetch(url, method === "GET" ? {} : { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(`Graph API ${p}: ${JSON.stringify(json.error || json)}`);
  return json;
}

async function main() {
  const video = path.join(ROOT, "reel-out", `${slug}.mp4`);
  const caption = await readFile(path.join(ROOT, "reel-out", `${slug}.txt`), "utf8");
  const buf = await readFile(video);
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  const postedPath = path.join(ROOT, "reel-out", "posted.json");
  const posted = JSON.parse(await readFile(postedPath, "utf8").catch(() => "[]"));
  if (posted.some(p => p.hash === hash)) { console.log(`投稿済みの動画なのでスキップ (${slug}, ${hash})`); return; }

  const videoUrl = `${BASE}/reel-out/${slug}.mp4?v=${hash}`;
  const coverUrl = `${BASE}/reel-out/${slug}.jpg?v=${hash}`;
  console.log(`動画: ${videoUrl}\n--- 投稿文 ---\n${caption}--------------`);
  if (DRY) { console.log("DRY_RUN=1 のため投稿しません"); return; }
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) throw new Error("IG_USER_ID / IG_ACCESS_TOKEN が未設定です(リポジトリの Secrets に登録してください)");

  // GitHub Pages への反映を待つ(サイズが一致するまで)
  const size = (await stat(video)).size;
  for (let i = 0; ; i++) {
    const r = await fetch(videoUrl, { method: "HEAD" }).catch(() => null);
    if (r && r.ok && Number(r.headers.get("content-length")) === size) break;
    if (i >= 30) throw new Error(`公開URLに動画が反映されません: ${videoUrl}`);
    console.log("公開URLへの反映待ち…"); await sleep(20000);
  }

  console.log(`API: ${HOST}`);
  const { id: creation } = await graph("POST", `${IG_USER_ID}/media`, { media_type: "REELS", video_url: videoUrl, cover_url: coverUrl, caption, share_to_feed: "true" });
  console.log(`コンテナ作成: ${creation}`);
  for (let i = 0; ; i++) {
    const { status_code, status } = await graph("GET", creation, { fields: "status_code,status" });
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`動画の処理に失敗: ${status_code} ${status || ""}`);
    if (i >= 40) throw new Error("動画の処理がタイムアウトしました");
    await sleep(15000);
  }
  const { id: mediaId } = await graph("POST", `${IG_USER_ID}/media_publish`, { creation_id: creation });
  const { permalink } = await graph("GET", mediaId, { fields: "permalink" }).catch(() => ({}));
  console.log(`投稿しました: ${permalink || mediaId}`);
  posted.push({ slug, hash, mediaId, permalink: permalink || "", postedAt: new Date().toISOString() });
  await writeFile(postedPath, JSON.stringify(posted, null, 2) + "\n");
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
