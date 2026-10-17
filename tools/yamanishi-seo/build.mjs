// 山西水産ページ: facts.json から構造化データ（JSON-LD）と OGP を作り、index.html の
// <!-- seo:start --> 〜 <!-- seo:end --> の間を書き換える。
//   node tools/yamanishi-seo/build.mjs          … 書き換える
//   node tools/yamanishi-seo/build.mjs --check  … 書き換えが必要なら失敗する（CI 用）
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../yamanishi-suisan");
const facts = JSON.parse(readFileSync(join(dir, "facts.json"), "utf8"));
const htmlPath = join(dir, "index.html");
const html = readFileSync(htmlPath, "utf8");

// 画像・動画は実在するファイルだけを載せる（存在しないものを書くと AI にも検索にも嘘になる）
const abs = (p) => {
  if (/^https?:/.test(p)) return p;
  if (!existsSync(join(dir, p))) throw new Error(`facts.json のファイルが見つかりません: ${p}`);
  return new URL(p, facts.pageUrl).href;
};

const c = facts.company, o = facts.owner, v = facts.video;
const orgId = c.officialUrl + "#organization";
const graph = [
  {
    "@type": "Organization",
    "@id": orgId,
    name: c.name,
    alternateName: c.alternateName,
    url: c.officialUrl,
    description: c.description,
    foundingDate: c.foundingDate,
    telephone: c.telephone,
    address: { "@type": "PostalAddress", addressRegion: c.addressRegion, addressLocality: c.addressLocality, addressCountry: "JP" },
    logo: abs(c.logo),
    image: abs(c.image),
    sameAs: c.sameAs,
  },
  {
    "@type": "Person",
    "@id": facts.pageUrl + "#owner",
    name: o.name,
    alternateName: o.alternateName,
    jobTitle: o.jobTitle,
    image: abs(o.image),
    worksFor: { "@id": orgId },
  },
  {
    "@type": "WebPage",
    "@id": facts.pageUrl,
    url: facts.pageUrl,
    name: html.match(/<title>([^<]*)<\/title>/)[1],
    inLanguage: "ja",
    about: { "@id": orgId },
    primaryImageOfPage: abs(c.image),
    video: { "@id": facts.pageUrl + "#pv" },
    mainEntity: { "@id": facts.pageUrl + "#lineup" },
  },
  {
    "@type": "VideoObject",
    "@id": facts.pageUrl + "#pv",
    name: v.name,
    description: v.description,
    thumbnailUrl: abs(v.thumbnail),
    contentUrl: abs(v.content),
    uploadDate: v.uploadDate,
    duration: v.duration,
    publisher: { "@id": orgId },
  },
  {
    "@type": "ItemList",
    "@id": facts.pageUrl + "#lineup",
    name: "山西水産の商品ラインナップ",
    itemListElement: facts.products.map((p, i) => ({
      "@type": "ListItem", position: i + 1, name: p.name, url: p.url, image: abs(p.image),
    })),
  },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const block = [
  "<!-- seo:start（tools/yamanishi-seo/build.mjs が facts.json から自動生成。直接編集しない） -->",
  `<meta property="og:type" content="website">`,
  `<meta property="og:url" content="${esc(facts.pageUrl)}">`,
  `<meta property="og:image" content="${esc(abs(c.image))}">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<script type="application/ld+json">`,
  JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 1).replace(/</g, "\\u003c"),
  `</script>`,
  "<!-- seo:end -->",
].join("\n");

const re = /<!-- seo:start[\s\S]*?<!-- seo:end -->/;
if (!re.test(html)) throw new Error("index.html に <!-- seo:start --> 〜 <!-- seo:end --> がありません");
const next = html.replace(re, () => block);

if (process.argv.includes("--check")) {
  if (next !== html) { console.error("index.html が facts.json と合っていません。build.mjs を実行してください"); process.exit(1); }
  console.log("OK: index.html は facts.json と一致");
} else if (next !== html) {
  writeFileSync(htmlPath, next);
  console.log("index.html を更新しました");
} else {
  console.log("変更なし");
}
