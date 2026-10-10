// 動作確認: /yamanishi-suisan/ をデスクトップ・スマホ・動き控えめで開き、
// オープニング → 各セクションまでスクロールしてスクショを撮り、エラーや隠れたままの要素がないかを調べる
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".mid": "audio/midi" };
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
const shots = ["fuku", "history", "ippiki", "zenkoku", "song", "shop"];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
let failed = false;
for (const [name, viewport, reduced] of [["desktop", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, false], ["reduced", { width: 1440, height: 900 }, true]]) {
  const page = await browser.newPage({ viewport, reducedMotion: reduced ? "reduce" : "no-preference" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/fonts\.g/.test(m.location().url) && errors.push(m.text()));
  await page.goto(url);
  if (!reduced) {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/ys-${name}-0-loader.png` });
  }
  await page.waitForFunction(() => !document.getElementById("loader") || getComputedStyle(document.getElementById("loader")).display === "none", null, { timeout: 10000 });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${out}/ys-${name}-1-hero.png` });
  // 下まで少しずつスクロール（Lenis はホイール量で動くので mouse.wheel を使う）
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let i = 0; i < h / 250 + 10; i++) {
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => ({
    hidden: [...document.querySelectorAll("[data-reveal], .tl li, .split .w > span")].filter((e) => getComputedStyle(e).opacity < 0.99 || getComputedStyle(e).transform.includes("matrix(1, 0, 0, 1, 0, ") && !getComputedStyle(e).transform.endsWith(", 0)")).length,
    counts: [...document.querySelectorAll("[data-count]")].map((e) => e.textContent),
    overflowX: document.documentElement.scrollWidth > innerWidth,
    fukuVisible: getComputedStyle(document.querySelector(".fuku .to")).display !== "none",
    atBottom: Math.abs(scrollY + innerHeight - document.body.scrollHeight) < 5,
  }));
  // 各セクションのスクショ（Fuku は途中＝入れ替わり後の位置で撮る）
  for (const [i, id] of shots.entries()) {
    await page.evaluate((id) => {
      const el = document.getElementById(id);
      const y = el.getBoundingClientRect().top + scrollY + (id === "fuku" ? el.offsetHeight * 0.55 : 0);
      window.scrollTo(0, y);
    }, id);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${out}/ys-${name}-${i + 2}-${id}.png` });
  }
  const ok = errors.length === 0 && state.fukuVisible && state.hidden === 0 && !state.overflowX && state.counts.join() === "10,30,1,330";
  failed ||= !ok;
  console.log(ok ? "OK " : "NG ", name, JSON.stringify({ errors, ...state }));
  await page.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
