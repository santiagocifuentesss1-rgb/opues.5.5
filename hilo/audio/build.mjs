// Score build: music -> measure beats (film/beats.json) -> SFX on the grid -> master to -14 LUFS.
// Usage: node audio/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, Stereo, Biquad, writeWav, limit, integratedLUFS, truePeak, dbToGain } from './dsp.mjs';
import { renderMusic } from './score.mjs';
import { detectOnsets, fitGrid } from './beats.mjs';
import { renderSfx } from './sfx.mjs';
import { FILM } from '../film/timeline.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, 'audio/build');
fs.mkdirSync(buildDir, { recursive: true });

export async function buildScore({ log = console.log } = {}) {
  const D = FILM.duration;
  const t0 = Date.now();
  const { music, drums } = renderMusic(D);
  writeWav(path.join(buildDir, 'music.wav'), music, fs);
  writeWav(path.join(buildDir, 'drums.wav'), drums, fs);

  // 1) measure the grid from the rendered drums
  const onsets = detectOnsets(drums);
  const grid = fitGrid(onsets, { duration: D });
  const beatsJson = {
    source: 'audio/build/drums.wav (onset detection + least-squares grid fit)',
    bpm: grid.bpm,
    period: grid.period,
    offset: grid.offset,
    residualMs: grid.residualMs,
    beats: grid.beats,
    downbeats: grid.beats.filter((_, i) => i % 4 === 0),
    onsets: onsets.map((o) => +o.t.toFixed(4)),
  };
  fs.writeFileSync(path.join(root, 'film/beats.json'), JSON.stringify(beatsJson, null, 1));
  log(`beats: ${grid.bpm} BPM, offset ${(grid.offset * 1000).toFixed(2)} ms, ${onsets.length} onsets, residual ${grid.residualMs} ms`);

  // 2) sound design on that grid
  const sfx = renderSfx(beatsJson, D);
  writeWav(path.join(buildDir, 'sfx.wav'), sfx, fs);

  // 3) mix + master
  const mix = new Stereo(D);
  music.mixInto(mix, 1);
  sfx.mixInto(mix, 1);
  const hpL = new Biquad('hp', 28, 0.7), hpR = new Biquad('hp', 28, 0.7);
  for (let i = 0; i < mix.n; i++) {
    mix.L[i] = hpL.p(mix.L[i]);
    mix.R[i] = hpR.p(mix.R[i]);
  }
  // end: short release so the final chord doesn't click off at 15.000 s
  const fade = Math.round(0.3 * SR);
  for (let i = 0; i < fade; i++) {
    const g = Math.cos(((i + 1) / fade) * Math.PI * 0.5);
    mix.L[mix.n - fade + i] *= g;
    mix.R[mix.n - fade + i] *= g;
  }

  // gain -> limit -> measure, iterate to hit -14 LUFS integrated with true peak <= -1 dBTP
  let gainDb = 0;
  let out, lufs, tp;
  for (let it = 0; it < 8; it++) {
    out = new Stereo(D);
    const g = dbToGain(gainDb);
    for (let i = 0; i < mix.n; i++) { out.L[i] = mix.L[i] * g; out.R[i] = mix.R[i] * g; }
    limit(out, -1.6, 2.5, 70);
    lufs = integratedLUFS(out.L, out.R);
    if (Math.abs(lufs + 14) < 0.05) break;
    gainDb += -14 - lufs;
  }
  tp = truePeak(out.L, out.R);
  writeWav(path.join(root, 'film/score.wav'), out, fs);
  log(`score: ${lufs.toFixed(2)} LUFS integrated, true peak ${tp.toFixed(2)} dBTP, gain ${gainDb.toFixed(2)} dB (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return { grid: beatsJson, lufs, tp };
}

if (import.meta.url === `file://${process.argv[1]}`) await buildScore();
