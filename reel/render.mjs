// 使い方: node render.mjs [stills]  （stills を付けると確認用の静止画だけ書き出す）
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30, DUR = 35;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + path.join(dir, 'reel.html'));
await page.evaluate(async () => {
  const txt = 'AIYouTube@shimofugu0123456789MALLlp.yamanisi.co.jpBGM';
  for (const f of ['900 100px Inter', '700 100px Inter', '900 100px "Noto Sans JP"', '700 100px "Noto Sans JP"', '500 100px "Noto Sans JP"'])
    await document.fonts.load(f, txt + document.body.innerText);
  await document.fonts.ready;
});
await page.waitForTimeout(500);

if (process.argv[2] === 'stills') {
  for (const t of (process.argv[3] || '4.5,9.5,14.5,19.5,24.5,29.5,34.5').split(',').map(Number)) {
    await page.evaluate((t) => window.seek(t), t);
    await page.screenshot({ path: path.join(dir, `still-${t}.png`) });
  }
} else {
  const out = path.join(dir, 'video-only.mp4');
  const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < FPS * DUR; f++) {
    await page.evaluate((t) => window.seek(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
}
await browser.close();
