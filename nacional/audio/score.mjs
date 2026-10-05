// Music bed: 96 BPM dembow in F# minor, 8 bars = exactly 20.0 s.
// 0-1 hook + build (drums behind a low-pass that opens) | 2-3 drop, cut for the turn | 4-5 second drop
// 6 half-time breakdown | 7 the final chord, a stinger on beat 31.
import { SR, Stereo, Biquad, freeverb, pingpong } from './dsp.mjs';
import * as I from './instruments.mjs';
import * as X from './extra.mjs';

export const BPM = 96;
export const P = 60 / BPM;

// voice-led triads (mid register) + 808 roots
const CH = {
  'F#m': { notes: [54, 57, 61], root: 42 },
  D: { notes: [54, 57, 62], root: 38 },
  A: { notes: [52, 57, 61], root: 45 },
  E: { notes: [52, 56, 59], root: 40 },
  'F#m9': { notes: [54, 57, 61, 68], root: 42 },
};
const BARS = ['F#m', 'F#m', 'F#m', 'D', 'A', 'E', 'D', 'F#m9'];
const DEMBOW_SN = [3, 6, 11, 14];
// two-bar marimba hook (16th steps, midi) in F# minor pentatonic
const RIFF = [[0, 73], [3, 71], [6, 69], [8, 66], [10, 69], [11, 71], [14, 73], [16, 76], [19, 73], [22, 71], [24, 69], [26, 66], [27, 69], [30, 64]];

export function renderMusic(duration = 20) {
  const len = duration + 0.05;
  const drums = new Stereo(len), intro = new Stereo(len), bassBus = new Stereo(len), synth = new Stereo(len);
  const send = new Stereo(len), dsend = new Stereo(len);
  const kicks = [];
  const st = (bar, i) => (bar * 16 + i) * (P / 4);
  const swing = (i) => (i % 2 ? 0.012 : 0);

  const dembow = (bus, bar, { from = 0, to = 16, kg = 0.9, sg = 0.42, hats = true, shk = false } = {}) => {
    for (let i = from; i < to; i++) {
      const t = st(bar, i) + swing(i);
      if (i % 4 === 0) { I.kick(bus, st(bar, i), { gain: kg, decay: 0.28, hi: 160, lo: 48, seed: 100 + bar * 16 + i }); if (bus === drums) kicks.push(st(bar, i)); }
      if (DEMBOW_SN.includes(i)) { X.rimSnare(bus, t, { gain: sg, seed: 200 + bar * 16 + i, pan: i === 14 ? 0.1 : -0.05 }); X.rimSnare(send, t, { gain: sg * 0.18, seed: 260 + i }); }
      if (hats && i % 2 === 0) I.hat(bus, t, { gain: i % 4 === 2 ? 0.13 : 0.07, seed: 300 + bar * 16 + i, pan: 0.2 });
      if (shk) X.shaker(bus, t, { gain: i % 2 ? 0.11 : 0.06, seed: 400 + bar * 16 + i, pan: -0.3 });
    }
  };

  // ---------------- drums ----------------
  // bars 0-1: the groove is already there, behind a low-pass that opens over 8 beats
  dembow(intro, 0, { kg: 0.8, sg: 0.4 });
  dembow(intro, 1, { to: 10, kg: 0.8, sg: 0.4 });
  for (let k = 0; k < 7; k++) kicks.push(k * P); // intro kicks still mark the grid (they sit below the filter)
  const lpL = new Biquad('lp', 300, 0.9), lpR = new Biquad('lp', 300, 0.9);
  for (let n = 0; n < Math.round(8 * P * SR); n++) {
    if (n % 64 === 0) { const p = n / (8 * P * SR); const fc = 260 * Math.pow(9, p * p); lpL.set(fc, 1.1); lpR.set(fc, 1.1); }
    drums.L[n] += lpL.p(intro.L[n]) * 0.9;
    drums.R[n] += lpR.p(intro.R[n]) * 0.9;
  }
  // word hits, bar 0-1 (unfiltered, on top)
  for (const x of [0, 2, 4, 5, 6]) { I.kick(drums, x * P, { gain: 0.95, decay: 0.45, hi: 190, lo: 46, click: 0.8, seed: 900 + x * 3 }); I.clap(drums, x * P, { gain: x === 0 ? 0 : 0.35, seed: 950 + x }); I.clap(send, x * P, { gain: 0.2, seed: 960 + x }); }
  // build roll into the drop
  for (let t = 6.5 * P, k = 0; t < 8 * P - 1e-6; k++) {
    const p = (t - 6.5 * P) / (1.5 * P);
    X.rimSnare(drums, t, { gain: 0.08 + 0.32 * p * p, seed: 600 + k, tone: 200 + 160 * p });
    t += p < 0.6 ? P / 4 : P / 8;
  }
  // drop 1 (bars 2-3), out at beat 14 for the turn
  dembow(drums, 2, { shk: true });
  dembow(drums, 3, { to: 8, shk: true });
  // drop 2 (bars 4-5) with a timbal fill into bar 6
  dembow(drums, 4, { shk: true });
  dembow(drums, 5, { to: 12, shk: true });
  [[12, 760], [13, 700], [14, 600], [14.5, 560], [15, 520], [15.5, 470]].forEach(([i, f], k) => X.timbal(drums, st(5, i), { gain: 0.32 + k * 0.03, f, seed: 700 + k, pan: k % 2 ? 0.3 : -0.3 }));
  kicks.push(st(5, 12)); I.kick(drums, st(5, 12), { gain: 0.9, decay: 0.28, seed: 777 });
  // bar 6: half-time
  for (const k of [0, 2]) { I.kick(drums, (24 + k) * P, { gain: 0.95, decay: 0.4, seed: 810 + k }); kicks.push((24 + k) * P); }
  for (const k of [1, 3]) { I.clap(drums, (24 + k) * P, { gain: 0.45, seed: 820 + k }); I.clap(send, (24 + k) * P, { gain: 0.3, seed: 830 + k }); }
  for (let i = 0; i < 16; i += 2) I.hat(drums, st(6, i) + swing(i), { gain: 0.06, seed: 840 + i, pan: 0.2 });
  // bar 7: the hit, a little life, the stinger
  I.kick(drums, 28 * P, { gain: 1, decay: 0.5, hi: 200, lo: 44, click: 0.8, seed: 870 }); kicks.push(28 * P);
  for (let i = 4; i < 12; i++) X.shaker(drums, st(7, i) + swing(i), { gain: 0.05 + 0.01 * (i % 2), seed: 880 + i });
  I.kick(drums, 31 * P, { gain: 0.95, decay: 0.45, seed: 890 }); kicks.push(31 * P);
  X.rimSnare(drums, 31 * P, { gain: 0.45, seed: 891 }); I.clap(drums, 31 * P, { gain: 0.4, seed: 892 }); I.clap(send, 31 * P, { gain: 0.35, seed: 893 });
  // cymbals
  I.crash(drums, 8 * P, { gain: 0.15, seed: 901 });
  I.crash(drums, 16 * P, { gain: 0.17, seed: 902 });
  I.crash(drums, 28 * P, { gain: 0.2, seed: 903 });
  I.reverseCymbal(drums, 8 * P, P * 1.5, { gain: 0.2, seed: 904 });
  I.reverseCymbal(drums, 16 * P, P * 2, { gain: 0.24, seed: 905 });
  I.reverseCymbal(drums, 28 * P, P * 1.5, { gain: 0.2, seed: 906 });

  // ---------------- 808 ----------------
  X.sub808(bassBus, 0, CH['F#m'].root, P * 1.8, { gain: 0.5 });
  X.sub808(bassBus, 2 * P, CH['F#m'].root, P * 1.8, { gain: 0.5 });
  [4, 5, 6].forEach((x, k) => X.sub808(bassBus, x * P, [42, 45, 49][k], P * 0.8, { gain: 0.48 }));
  const line = (bar, root, steps = [[0, 5], [6, 2], [8, 5], [14, 2, 12]]) => {
    for (const [i, d, oct = 0] of steps) X.sub808(bassBus, st(bar, i), root + oct, (d * P) / 4, { gain: 0.5, from: oct ? root : null });
  };
  line(2, CH['F#m'].root);
  line(3, CH.D.root, [[0, 5], [6, 2]]);
  X.sub808(bassBus, st(3, 8), CH.D.root, P * 1.9, { gain: 0.42, from: CH.D.root - 5, glide: P * 1.6 }); // the turn: 808 slides up
  line(4, CH.A.root);
  line(5, CH.E.root, [[0, 5], [6, 2], [8, 4]]);
  X.sub808(bassBus, 24 * P, CH.D.root, P * 1.9, { gain: 0.5 });
  X.sub808(bassBus, 26 * P, CH.E.root, P * 1.9, { gain: 0.5 });
  X.sub808(bassBus, 28 * P, CH['F#m'].root, P * 2.7, { gain: 0.55 });
  X.sub808(bassBus, 31 * P, CH['F#m'].root, P * 0.9, { gain: 0.55, release: 0.25 });

  // ---------------- harmony + hooks ----------------
  // hook bed: dark pad, grows into the drop
  I.pad(synth, 0, CH['F#m'].notes, P * 7.5, { gain: 0.13, cutoff: 700, attack: 0.02, release: 0.3 });
  I.pad(send, 0, CH['F#m'].notes, P * 8, { gain: 0.07, cutoff: 900 });
  // word stabs
  [[0, 'F#m'], [2, 'F#m'], [4, 'F#m'], [5, 'A'], [6, 'D']].forEach(([x, c]) => {
    I.stab(synth, x * P, CH[c].notes.map((n) => n + 12), P * 0.35, { gain: 0.15, cutoff: 3200, seed: 1000 + x });
    I.stab(send, x * P, CH[c].notes.map((n) => n + 12), P * 0.35, { gain: 0.08, seed: 1010 + x });
  });
  // marimba riff over both drops
  const riff = (bar0, bars) => {
    for (const [s, m] of RIFF) {
      if (s >= bars * 16) continue;
      const t = st(bar0, s) + swing(s);
      const pan = s % 4 < 2 ? -0.35 : 0.35;
      X.marimba(synth, t, m, { gain: 0.16, pan });
      X.marimba(dsend, t, m, { gain: 0.07, pan });
    }
  };
  riff(2, 1.5); // stops with the drums at beat 14
  riff(4, 2);
  // off-beat chord stabs (reggaeton "piano" role), drop 2 only
  for (let bar = 4; bar <= 5; bar++)
    for (const i of DEMBOW_SN) {
      if (bar === 5 && i > 11) continue;
      const n = CH[BARS[bar]].notes;
      I.stab(synth, st(bar, i) + swing(i), n, P * 0.18, { gain: 0.1, cutoff: 2600, seed: 1100 + bar * 16 + i });
      I.stab(send, st(bar, i) + swing(i), n, P * 0.18, { gain: 0.04, cutoff: 2600, seed: 1150 + bar * 16 + i });
    }
  // sustained pads under the drops
  [[2, 'F#m'], [3, 'D'], [4, 'A'], [5, 'E']].forEach(([bar, c]) => I.pad(synth, bar * 4 * P, CH[c].notes, P * 3.8, { gain: 0.07, cutoff: 1500, attack: 0.05, release: 0.2 }));
  // the turn: a held suspended chord swells into the reveal
  I.pad(synth, 14 * P, [57, 62, 64, 69], P * 2, { gain: 0.16, cutoff: 2400, attack: P * 1.6, release: 0.05 });
  // breakdown + final chord
  I.pad(synth, 24 * P, CH.D.notes, P * 2, { gain: 0.15, cutoff: 1600, attack: 0.03, release: 0.1 });
  I.pad(synth, 26 * P, CH.E.notes, P * 2, { gain: 0.16, cutoff: 1900, attack: 0.03, release: 0.05 });
  I.pad(send, 24 * P, [...CH.D.notes, ...CH.E.notes], P * 4, { gain: 0.08, cutoff: 1600 });
  [[24, 66], [24.5, 69], [25, 73], [25.5, 74], [26, 68], [26.5, 71], [27, 76], [27.5, 78]].forEach(([x, m], k) => { X.marimba(synth, x * P, m, { gain: 0.15, pan: k % 2 ? 0.3 : -0.3 }); X.marimba(dsend, x * P, m, { gain: 0.08 }); });
  I.stab(synth, 28 * P, CH['F#m9'].notes.map((n) => n + 12), P * 2.8, { gain: 0.22, cutoff: 5200, decayCut: 0.6, seed: 1200 });
  I.stab(send, 28 * P, CH['F#m9'].notes.map((n) => n + 12), P * 2.8, { gain: 0.14, cutoff: 5200, seed: 1201 });
  I.pad(synth, 28 * P, CH['F#m9'].notes, P * 4, { gain: 0.14, cutoff: 2200, attack: 0.02, release: 0.4 });
  I.pad(send, 28 * P, CH['F#m9'].notes, P * 4, { gain: 0.1, cutoff: 2000 });
  [[28, 78], [28.5, 81], [29, 85], [29.5, 88]].forEach(([x, m]) => { I.bell(synth, x * P, m, { gain: 0.05, decay: 0.8, pan: ((x * 4) % 3) - 1 }); I.bell(send, x * P, m, { gain: 0.04, decay: 0.8 }); });
  I.stab(synth, 31 * P, CH['F#m9'].notes.map((n) => n + 12), P * 1.2, { gain: 0.2, cutoff: 4800, seed: 1210 });
  I.stab(send, 31 * P, CH['F#m9'].notes.map((n) => n + 12), P * 1.2, { gain: 0.15, cutoff: 4800, seed: 1211 });

  // ---------------- sidechain + FX ----------------
  const duck = new Float32Array(bassBus.n);
  for (const kt of kicks) {
    const i0 = Math.round(kt * SR);
    for (let n = 0; n < Math.round(0.25 * SR); n++) {
      const s = n / SR;
      const e = s < 0.004 ? s / 0.004 : Math.exp(-(s - 0.004) / 0.07);
      if (i0 + n < duck.length) duck[i0 + n] = Math.max(duck[i0 + n], e);
    }
  }
  for (let n = 0; n < bassBus.n; n++) {
    const g = 1 - 0.55 * duck[n], g2 = 1 - 0.4 * duck[n];
    bassBus.L[n] *= g; bassBus.R[n] *= g;
    synth.L[n] *= g2; synth.R[n] *= g2;
  }
  const verb = freeverb(send, { room: 0.86, damp: 0.45 });
  const dly = pingpong(dsend, { time: P * 0.75, fb: 0.35, lp: 3800, wet: 0.9 });
  const music = new Stereo(len);
  drums.mixInto(music, 1);
  bassBus.mixInto(music, 1);
  synth.mixInto(music, 1);
  verb.mixInto(music, 0.9);
  dly.mixInto(music, 0.4);
  return { music, drums, kicks };
}
