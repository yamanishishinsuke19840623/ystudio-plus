// 試し見: 主要な時刻の静止画を .tmp/stills/ に書き出す（動画を全部描く前の確認用）
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = process.env.OUT_DIR || path.join(import.meta.dirname, ".tmp/stills");
const TIMES = (process.env.PV_TIMES || "1.9,4.7,8.5,10.3,12,17,27,30.8,32,34.2,37,41,43,48,52.5,57,62,68,73.5").split(",").map(Number);
const srv = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const body = await readFile(path.join(ROOT, p));
    res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : p.endsWith(".js") ? "text/javascript" : "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/tools/pv/pv.html`);
await page.evaluate(async () => {
  document.querySelectorAll(".sc").forEach((s) => (s.style.visibility = "visible"));
  await document.fonts.ready;
});
await page.waitForTimeout(800);
for (const t of TIMES) {
  await page.evaluate((t) => window.renderAt(t), t);
  await page.locator("#v").screenshot({ path: path.join(OUT, `t${String(t).padStart(5, "0")}.jpg`), type: "jpeg", quality: 80 });
}
await browser.close();
srv.close();
console.log("stills:", TIMES.length, OUT);
