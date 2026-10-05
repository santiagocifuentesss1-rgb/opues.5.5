// Pulls the Higgsfield generations into the film:
//   turn     Kling 3.0 (4K) start/end-frame turn, front -> back  -> film/plates/turn/f###.jpg
//   stadium  Cinema Studio 3.0 match-night plate                 -> film/plates/stadium/f###.jpg
//   up-*     4K upscales of the supplied shirt photos            -> film/img/front.png, back.png (HD cutouts)
// Needs network access to d8j0ntlcm91z4.cloudfront.net. Usage: node tools/fetch-plates.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { cutout } from './cutout.mjs';

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3Dos44YzJEWMWwJrlNfKDOc7io0/';
const SRC = {
  turn: 'hf_20261005_225611_83cf0595-4a60-49a5-b25f-960d2b2b0c1e.mp4', // kling3_0, mode 4k, 2160x3840
  turnAlt: 'hf_20261005_225610_4a4fec39-4541-44c0-b6a7-884f423bf9a8.mp4', // cinematic_studio_3_0 (not used)
  stadium: 'hf_20261005_225558_f0072eb4-244a-4d0e-bf1d-3461e4f8e868.mp4', // cinematic_studio_3_0, 1080p
  upFront: 'hf_20261005_224905_0502184f-4495-47b8-abff-5b5f04152395.png', // bytedance upscale 4k of src-front
  upBack: 'hf_20261005_224907_b6bd5a6b-f890-473f-a59f-0e7f1ce8d578.png',
  upCrest: 'hf_20261005_224909_c801f1f2-e103-486a-8017-2fe33a580a53.png',
};
const raw = 'plates/raw';
fs.mkdirSync(raw, { recursive: true });
const get = (name) => {
  const out = path.join(raw, name);
  if (!fs.existsSync(out)) execFileSync('curl', ['-sSfL', '--retry', '4', '-o', out, CDN + name], { stdio: 'inherit' });
  return out;
};
const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: 'inherit' });

const manifest = {};
for (const [key, file, vf] of [
  ['turn', SRC.turn, 'scale=1080:1920:flags=lanczos'],
  ['stadium', SRC.stadium, 'scale=1080:1920:flags=lanczos'],
]) {
  const mp4 = get(file);
  const dir = `film/plates/${key}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  ff('-i', mp4, '-vf', vf, '-q:v', '2', '-start_number', '0', `${dir}/f%03d.jpg`);
  const frames = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).length;
  manifest[key] = { frames, fps: 24, source: file };
  console.log(key, frames, 'frames');
}
// the turn lives between ~0.8 s (still front) and ~4.4 s (settled back) of the 5 s clip
manifest.turn.t0 = 0.8;
manifest.turn.t1 = 4.4;
fs.writeFileSync('film/plates/manifest.json', JSON.stringify(manifest, null, 1));

// HD cutouts registered to the SD ones (same crop box, scaled)
for (const [name, file, src, box] of [['front', SRC.upFront, 'assets/src-front.png', [48, 1, 362, 462]], ['back', SRC.upBack, 'assets/src-back.png', [0, 32, 343, 444]]]) {
  const up = get(file);
  const a = await sharp(src).metadata(), m = await sharp(up).metadata();
  const f = m.width / a.width;
  const hd = `assets/up-${name}.png`;
  fs.copyFileSync(up, hd);
  await cutout(hd, `assets/cut-${name}-hd.png`, { box: box.map((v) => Math.round(v * f)) });
  // the film draws shirts at ~2.5x the SD cutout: 4x keeps them crisp for the macros too
  await sharp(`assets/cut-${name}-hd.png`).resize({ width: box[2] * 4, kernel: 'lanczos3' }).png().toFile(`film/img/${name}.png`);
  console.log(name, 'hd cutout', m.width, 'x', m.height, 'scale', f.toFixed(2));
}
fs.copyFileSync(get(SRC.upCrest), 'assets/up-crest.png');
console.log('plates ready');
