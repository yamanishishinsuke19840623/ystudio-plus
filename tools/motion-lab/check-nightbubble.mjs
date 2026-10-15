// 動作確認: /nightbubble/ を PC・スマホ（タッチ端末）・動き控えめの3通りで開き、
// エラー0・隠れたまま0・横はみ出し0 を確かめて、各セクションのスクショを撮る
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
const url = `http://127.0.0.1:${server.address().port}/nightbubble/`;
const out = process.env.OUT_DIR || ".";
const shots = [".nums", ".why", ".venues", ".venues .field", ".worry .answer", ".reasons .card:nth-child(2)", ".reel", ".movies", ".sched", ".flow", ".me", ".game", ".faq", ".contact", ".cta", "footer"];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
let failed = false;
for (const [name, viewport, reduced, mobile] of [
  ["desktop", { width: 1366, height: 820 }, false, false],
  ["mobile", { width: 390, height: 844 }, false, true],
  ["reduced", { width: 1366, height: 820 }, true, false],
]) {
  const ctx = await browser.newContext({ viewport, reducedMotion: reduced ? "reduce" : "no-preference", hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  // 外部（フォント・YouTubeサムネ）はこの環境では読めないことがあるので止める
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|fonts\.g)/, (r) => r.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // 外部を止めたことによる読み込み失敗は数えない
  page.on("console", (m) => m.type() === "error" && !/net::ERR_FAILED/.test(m.text()) && errors.push(m.text()));
  await page.goto(url);
  await page.waitForTimeout(reduced ? 600 : 4400); // オープニングが終わるまで
  await page.screenshot({ path: `${out}/${name}-0-hero.png` });
  const h0 = await page.evaluate(() => document.querySelector(".hero").offsetHeight);
  for (const f of [0.35, 0.7]) {
    await page.evaluate((y) => scrollTo(0, y), Math.round(h0 * f));
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${name}-0-hero-${Math.round(f * 100)}.png` });
  }
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y <= h; y += 300) {
    await page.evaluate((y) => scrollTo(0, y), y);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(2200);
  const state = await page.evaluate(() => ({
    hidden: [...document.querySelectorAll("[data-reveal], .v, .worry li, .h2 .ch")].filter((e) => +getComputedStyle(e).opacity < 0.99 && !e.closest(".popped")).length,
    counts: [...document.querySelectorAll("[data-count]")].map((e) => e.textContent).join(),
    popped: document.querySelectorAll(".worry li.popped").length,
    overflowX: document.documentElement.scrollWidth > innerWidth,
    loader: !!document.getElementById("loader"),
  }));
  let i = 1;
  for (const s of shots) {
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      scrollTo(0, el.getBoundingClientRect().top + scrollY - 40);
    }, s);
    await page.waitForTimeout(s === ".reel" ? 900 : 500);
    await page.screenshot({ path: `${out}/${name}-${String(i++).padStart(2, "0")}-${s.replace(/[^a-z]+/g, "")}.png` });
  }
  if (!mobile && !reduced) {
    // 横ギャラリーの途中（パン＋ラックフォーカス）
    const top = await page.evaluate(() => document.querySelector(".reel").offsetTop + document.querySelector(".reel").offsetHeight * 0.45);
    await page.evaluate((y) => scrollTo(0, y), top);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${name}-06b-reel-mid.png` });
  }
  // 15秒PV：ボタンで再生が始まるか
  await page.evaluate(() => document.querySelector(".pv").scrollIntoView());
  await page.waitForTimeout(300);
  await page.click(".phone .play");
  await page.waitForTimeout(1500);
  state.pv = await page.evaluate(() => { const v = document.getElementById("pv"); return { time: +v.currentTime.toFixed(2), src: v.currentSrc.split("/").pop(), error: v.error && v.error.code }; });
  await page.screenshot({ path: `${out}/${name}-pv.png` });
  const ok = state.pv.time > 0.3 && errors.length === 0 && state.hidden === 0 && !state.overflowX && state.counts === "20,5,000,13" && !state.loader;
  failed ||= !ok;
  console.log(ok ? "OK " : "NG ", name, JSON.stringify({ errors, ...state }));
  await ctx.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
