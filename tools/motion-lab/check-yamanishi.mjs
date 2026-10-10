// 動作確認: /yamanishi-suisan/ をデスクトップ・スマホ・動き控えめで開き、
// オープニング → 各演出の途中までスクロールしてスクショを撮り、エラーや隠れたままの要素がないかを調べる
// 使い方: OUT_DIR=スクショの保存先 node check-yamanishi.mjs
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
    res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }).end(await readFile(join(root, p)));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/yamanishi-suisan/`;
const out = process.env.OUT_DIR || ".";
// [名前, 要素id(または selector), セクション内の進み具合 0〜1]
const shots = [
  ["hero-zoom", ".hero", 0.3], ["hero-photo", ".hero", 0.75],
  ["gens-1", "#story", 0.0], ["gens-3", "#story", 0.55],
  ["ban-a", "#why", 0.12], ["ban-b", "#why", 0.45], ["ban-c", "#why", 0.9],
  ["market", ".market", 0], ["promise", "#promise", 0.55], ["lineup", "#lineup", 0], ["owner", "#owner", 0], ["shop", "#shop", 0], ["footer", "footer", 0],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
let failed = false;
for (const [name, viewport, reduced] of [["desktop", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, false], ["reduced", { width: 1440, height: 900 }, true]]) {
  const page = await browser.newPage({ viewport, reducedMotion: reduced ? "reduce" : "no-preference" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/fonts\.g/.test(m.location().url) && errors.push(m.text()));
  await page.goto(url);
  if (!reduced) {
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${out}/ys-${name}-00-loader.png` });
  }
  await page.waitForFunction(() => !document.getElementById("loader") || getComputedStyle(document.getElementById("loader")).display === "none", null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/ys-${name}-01-hero.png` });
  // 下まで少しずつスクロール（Lenis はホイール量で動くので mouse.wheel を使う）
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let i = 0; i < h / 300 + 10; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => ({
    hidden: [...document.querySelectorAll("[data-up], .ch, .item, footer .giant span")].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99).length,
    overflowX: document.documentElement.scrollWidth > innerWidth,
    atBottom: Math.abs(scrollY + innerHeight - document.body.scrollHeight) < 5,
    banYear: document.getElementById("ban-year").textContent,
  }));
  for (const [i, [label, sel, at]] of shots.entries()) {
    await page.evaluate(([sel, at]) => {
      const el = document.querySelector(sel);
      const top = el.getBoundingClientRect().top + scrollY;
      window.scrollTo(0, top + Math.max(0, el.offsetHeight - innerHeight) * at);
    }, [sel, at]);
    await page.waitForTimeout(900);
    if (label === "lineup" && name === "desktop") {
      const box = await page.locator(".item").nth(1).boundingBox();
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 8 });
      await page.waitForTimeout(700);
    }
    await page.screenshot({ path: `${out}/ys-${name}-${String(i + 2).padStart(2, "0")}-${label}.png` });
  }
  const ok = errors.length === 0 && state.hidden === 0 && !state.overflowX && state.banYear === "1888";
  failed ||= !ok;
  console.log(ok ? "OK " : "NG ", name, JSON.stringify({ errors, ...state }));
  await page.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
