// Cut the supplied shirt screenshots out of their light backgrounds.
// Flood fill from the border through light, unsaturated pixels = background. A 2 px band along that
// boundary gets a luminance matte (and is un-mixed from the background colour) so edges stay smooth.
// Usage: node tools/cutout.mjs <in.png> <out.png>
import sharp from 'sharp';

export async function cutout(src, dst, { pad = 6, box = null } = {}) {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const L = (i) => 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
  const sat = (i) => Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) - Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  const isBg = (i) => L(i) > 222 && sat(i) < 22;
  const bg = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (bg[i] || !isBg(i)) continue;
    bg[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  // distance (in px, chessboard) from background, capped at 3
  const dist = new Uint8Array(w * h).fill(3);
  for (let i = 0; i < w * h; i++) if (bg[i]) dist[i] = 0;
  for (let pass = 1; pass <= 2; pass++)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (dist[i] !== 3) continue;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h && dist[yy * w + xx] === pass - 1) dist[i] = pass;
          }
      }
  const out = Buffer.alloc(w * h * 4);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < w * h; i++) {
    let a = 1;
    if (bg[i]) a = 0;
    else if (dist[i] <= 2) a = Math.min(1, Math.max(0, (250 - L(i)) / (250 - 95)));
    for (let c = 0; c < 3; c++) {
      const p = data[i * 3 + c];
      out[i * 4 + c] = a > 0.02 && a < 1 ? Math.round(Math.min(255, Math.max(0, (p - (1 - a) * 250) / a))) : p;
    }
    out[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.05) {
      const x = i % w, y = (i / w) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  // `box` = fixed crop [left, top, width, height] (keeps an HD cutout registered to the SD one)
  const left = box ? box[0] : Math.max(0, x0 - pad), top = box ? box[1] : Math.max(0, y0 - pad);
  const cw = box ? box[2] : Math.min(w, x1 + pad + 1) - left, ch = box ? box[3] : Math.min(h, y1 + pad + 1) - top;
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).extract({ left, top, width: cw, height: ch }).png().toFile(dst);
  return { left, top, width: cw, height: ch };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(await cutout(process.argv[2], process.argv[3]));
