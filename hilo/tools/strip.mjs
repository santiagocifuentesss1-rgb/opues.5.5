// Filmstrip of consecutive moments for motion review: node tools/strip.mjs 3.4 4.4 0.0667 name
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
const [a, b, step = 1 / 15, name = 'strip'] = process.argv.slice(2);
const times = [];
for (let t = +a; t <= +b + 1e-6; t += +step) times.push(+t.toFixed(3));
execFileSync('node', ['render.mjs', '--still', times.join(',')], { stdio: 'ignore' });
const tw = 216, th = 384, cols = Math.min(8, times.length), rows = Math.ceil(times.length / cols);
const tiles = [];
for (let i = 0; i < times.length; i++) {
  const f = `out/stills/t${times[i].toFixed(3)}.png`;
  tiles.push({ input: await sharp(f).resize(tw, th).toBuffer(), left: (i % cols) * (tw + 6), top: Math.floor(i / cols) * (th + 30) + 26 });
  tiles.push({ input: Buffer.from(`<svg width="${tw}" height="24"><text x="2" y="18" font-family="DejaVu Sans" font-size="16" fill="#ddd">${times[i].toFixed(2)}s</text></svg>`), left: (i % cols) * (tw + 6), top: Math.floor(i / cols) * (th + 30) });
}
await sharp({ create: { width: cols * (tw + 6), height: rows * (th + 30), channels: 3, background: '#161616' } }).composite(tiles).png().toFile(`out/${name}.png`);
console.log(`out/${name}.png`);
