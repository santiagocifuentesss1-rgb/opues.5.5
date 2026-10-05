// Filmstrip for motion review: node tools/strip.mjs <out.png> t0,t1,...  (renders stills, tiles them with labels)
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
const [out, list] = process.argv.slice(2);
const times = list.split(',').map(Number);
execFileSync('node', ['render.mjs', '--still', times.join(',')], { stdio: 'ignore' });
const tw = 216, th = 384, lab = 26, cols = Math.min(10, times.length);
const tiles = [];
for (let i = 0; i < times.length; i++) {
  const x = (i % cols) * (tw + 6), y = Math.floor(i / cols) * (th + lab + 6);
  tiles.push({ input: await sharp(`out/stills/v-t${times[i].toFixed(3)}.png`).resize(tw, th).toBuffer(), left: x, top: y + lab });
  tiles.push({ input: Buffer.from(`<svg width="${tw}" height="${lab}"><text x="2" y="19" font-family="DejaVu Sans" font-size="16" fill="#ddd">${times[i].toFixed(3)}s</text></svg>`), left: x, top: y });
}
const rows = Math.ceil(times.length / cols);
await sharp({ create: { width: cols * (tw + 6), height: rows * (th + lab + 6), channels: 3, background: '#222' } }).composite(tiles).png().toFile(out);
console.log(out);
