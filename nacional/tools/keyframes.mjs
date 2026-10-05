// Start/end keyframes for the Higgsfield jersey turn: the real front and back cutouts on the same
// studio black, registered on the torso (width at 95% height and hem line) so the model only has to rotate.
import sharp from 'sharp';

const W = 1080, H = 1920;
const S = 2.52; // front scale: hem width 214 px -> 540 px
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><radialGradient id="g" cx="0.5" cy="0.47" r="0.62"><stop offset="0" stop-color="#1b201d"/><stop offset="0.6" stop-color="#0d100e"/><stop offset="1" stop-color="#050605"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/></svg>`);

async function frame(name, scale, hemCx, hemY, out) {
  const m = await sharp(`assets/cut-${name}.png`).metadata();
  const w = Math.round(m.width * scale), h = Math.round(m.height * scale);
  const img = await sharp(`assets/cut-${name}.png`).resize(w, h, { kernel: 'lanczos3' }).sharpen({ sigma: 1 }).png().toBuffer();
  const left = Math.round(W / 2 - hemCx * scale), top = Math.round(H * 0.79 - hemY * scale);
  await sharp(bg).composite([{ input: img, left, top }]).png().toFile(out);
  console.log(out, { w, h, left, top });
}
await frame('front', S, 181, 437, 'assets/key-front.png');
await frame('back', S * 1.03, 179, 421, 'assets/key-back.png');
