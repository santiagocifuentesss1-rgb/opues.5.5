// Prepares film/img from the real screenshot crops in assets/:
// 3x lanczos upscale; for crops that sit on the hero blob, dark background pixels (where the
// site's blob ended) are unified to the blob colour so the crop has no seam. Text pixels are
// brighter than the threshold and pass through unchanged.
import sharp from 'sharp';
import fs from 'node:fs';
const BLOB = [100, 67, 158]; // #64439e sampled behind the headline
const UNIFY = new Set(['headline', 'subcopy', 'tagline']);
for (const f of fs.readdirSync('assets').filter((f) => f.startsWith('crop-') && f !== 'crop-stars.png')) {
  const name = f.slice(5, -4);
  let img = sharp(`assets/${f}`);
  if (UNIFY.has(name)) {
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) {
      const L = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const k = Math.min(1, Math.max(0, (L - 22) / (80 - 22)));
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(BLOB[c] + (data[i + c] - BLOB[c]) * k);
    }
    img = sharp(data, { raw: info });
  }
  const m = await sharp(`assets/${f}`).metadata();
  await img.resize(m.width * 3, m.height * 3, { kernel: 'lanczos3' }).sharpen({ sigma: 0.8 }).png().toFile(`film/img/${name}@3x.png`);
}
await sharp('assets/site-hero.webp').resize(1913 * 2, 914 * 2, { kernel: 'lanczos3' }).sharpen({ sigma: 0.7 }).png().toFile('film/img/site-hero@2x.png');
console.log('assets ready');
