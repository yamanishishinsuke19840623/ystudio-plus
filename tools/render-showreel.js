// Renders showreel.html to showreel.mp4 (1920x1080, 30fps, with the page's own Web Audio track).
// Usage: node tools/render-showreel.js [--frames 0,45,90] [--out showreel.mp4]
//   FFMPEG=/path/to/ffmpeg  (defaults to "ffmpeg" on PATH)
//   PLAYWRIGHT=/path/to/playwright (defaults to require('playwright'))
//   FONTS_VIA_CURL=1  (sandboxes where Chromium can't reach Google Fonts through the proxy: fetch them with curl instead)
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const stills = opt('--frames');
const out = path.resolve(root, opt('--out') || 'showreel.mp4');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const MIME = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/showreel.html`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }});
  if (process.env.FONTS_VIA_CURL) {
    const ua = await page.evaluate(() => navigator.userAgent.replace('Headless', ''));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => {
      const u = route.request().url();
      const body = execFileSync('curl', ['-sSL', '-A', ua, u], { maxBuffer: 64 << 20 });
      route.fulfill({ body, contentType: u.includes('googleapis') ? 'text/css' : 'font/woff2', headers: { 'Access-Control-Allow-Origin': '*' } });
    });
  }
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.__showreel.ready);
  const grab = t => page.evaluate(t => { window.__showreel.render(t); return document.getElementById('cv').toDataURL('image/png').split(',')[1]; }, t);

  if (stills) {
    for (const f of stills.split(',').map(Number)) {
      const file = path.join(path.dirname(out), `frame-${String(f).padStart(3, '0')}.png`);
      fs.writeFileSync(file, Buffer.from(await grab(f / 30), 'base64'));
      console.log(file);
    }
  } else {
    const { DUR, FPS } = await page.evaluate(() => ({ DUR: window.__showreel.DUR, FPS: window.__showreel.FPS }));
    const wav = path.join(path.dirname(out), 'showreel-audio.wav');
    fs.writeFileSync(wav, Buffer.from(await page.evaluate(() => window.__showreel.renderAudioWav()), 'base64'));
    const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', wav,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '5M', '-bufsize', '10M', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', '-shortest', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const total = Math.round(DUR * FPS);
    for (let f = 0; f < total; f++) {
      const buf = Buffer.from(await grab(f / FPS), 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f % 30 === 0) process.stderr.write(`frame ${f}/${total}\n`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    fs.unlinkSync(wav);
    console.log(out);
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
