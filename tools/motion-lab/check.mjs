// 動作確認: ローカルで /motion-lab/ を開き、エラーが無いか・各演出が動いたかを確かめてスクショを撮る
// 使い方: npm run check  (Chromium のパスは CHROMIUM_PATH で変更可)
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(join(root, p));
    res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/motion-lab/`;
const out = process.env.OUT_DIR || ".";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
let failed = false;
for (const [name, viewport, reduced] of [["desktop", { width: 1366, height: 820 }, false], ["mobile", { width: 390, height: 844 }, false], ["reduced", { width: 1366, height: 820 }, true]]) {
  const page = await browser.newPage({ viewport, reducedMotion: reduced ? "reduce" : "no-preference" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/fonts\.g/.test(m.location().url) && errors.push(m.text()));
  await page.goto(url);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${name}-hero.png` });
  // 下までゆっくりスクロールして inView / scroll 連動を全部発火させる
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y <= h; y += 300) {
    await page.evaluate((y) => scrollTo(0, y), y);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(1800);
  const state = await page.evaluate(() => ({
    hidden: [...document.querySelectorAll("[data-reveal], .card")].filter((e) => getComputedStyle(e).opacity < 0.99).length,
    counts: [...document.querySelectorAll("[data-count]")].map((e) => e.textContent),
    progress: getComputedStyle(document.getElementById("progress")).transform,
    hscroll: !!document.querySelector(".hscroll .row")?.style.transform,
    overflowX: document.documentElement.scrollWidth > innerWidth,
  }));
  await page.evaluate(() => document.getElementById("results").scrollIntoView());
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}-results.png` });
  const ok = errors.length === 0 && state.hidden === 0 && !state.overflowX && state.counts.join() === "30h+,¥108万,×6";
  failed ||= !ok;
  console.log(ok ? "OK " : "NG ", name, JSON.stringify({ errors, ...state }));
  await page.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
