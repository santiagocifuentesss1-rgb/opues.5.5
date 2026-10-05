// Motion QA: renders every frame at half resolution (no blur), measures the mean absolute
// difference between consecutive frames and plots it against the beat grid. Intended cuts show
// as spikes on beats; anything spiking off-grid is a pop to fix.  node tools/motion-check.mjs [fps]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
const FPS = +(process.argv[2] || 30), DUR = 20, dir = path.resolve('film');
const server = http.createServer((req, res) => {
  const p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  const ty = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(p)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': ty }); fs.createReadStream(p).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 0.25 });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.evaluate(() => window.ready);
const grid = JSON.parse(fs.readFileSync('film/beats.json', 'utf8'));
let prev = null;
const d = [];
for (let f = 0; f < DUR * FPS; f++) {
  await page.evaluate((t) => window.seek(t), f / FPS);
  const raw = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
  if (prev) { let s = 0; for (let i = 0; i < raw.length; i++) s += Math.abs(raw[i] - prev[i]); d.push([f / FPS, s / raw.length]); }
  prev = raw;
}
await browser.close(); server.close();
const Wc = 2000, Hc = 420, mx = Math.max(...d.map((q) => q[1]));
const X = (t) => (t / DUR) * Wc, Y = (v) => Hc - 20 - (v / mx) * (Hc - 40);
const beats = grid.beats.map((t, i) => `<line x1="${X(t)}" x2="${X(t)}" y1="0" y2="${Hc}" stroke="${i % 4 ? '#333' : '#666'}"/><text x="${X(t) + 2}" y="12" font-size="10" fill="#888" font-family="DejaVu Sans">${i}</text>`).join('');
const poly = d.map(([t, v]) => `${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
fs.writeFileSync('out/motion.json', JSON.stringify(d));
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Wc}" height="${Hc}"><rect width="100%" height="100%" fill="#111"/>${beats}<polyline points="${poly}" fill="none" stroke="#2BFA25" stroke-width="1.5"/></svg>`)).png().toFile('out/motion.png');
const top = [...d].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([t, v]) => `${t.toFixed(3)}s=${v.toFixed(1)} (beat ${((t - grid.offset) / grid.period).toFixed(2)})`);
console.log('out/motion.png  max', mx.toFixed(1), '\n' + top.join('\n'));
