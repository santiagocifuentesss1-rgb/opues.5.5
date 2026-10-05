// Music bed: 128 BPM, A minor -> C, 8 bars = exactly 15.0 s.
// 0 hook (03:12, sparse) | 1 build (pile-up, riser) | 2-4 drop (agent, chat, scale) | 5 night breakdown
// 6 morning rebuild (hit on the "37") | 7 lockup (resolve).
import { SR, Stereo, freeverb, pingpong } from './dsp.mjs';
import * as I from './instruments.mjs';

export const BPM = 128;
export const P = 60 / BPM;

const CH = {
  Am: { notes: [57, 60, 64], root: 45 },
  F: { notes: [57, 60, 65], root: 41 },
  C: { notes: [55, 60, 64], root: 36 },
  G: { notes: [55, 59, 62], root: 43 },
  Em: { notes: [55, 59, 64], root: 40 },
  Cmaj9: { notes: [55, 59, 62, 64], root: 36 },
};
const BARS = ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'C'];

export function renderMusic(duration = 15) {
  const len = duration + 0.05;
  const drums = new Stereo(len), bassBus = new Stereo(len), synth = new Stereo(len);
  const send = new Stereo(len), dsend = new Stereo(len);
  const kicks = [];
  const s16 = (bar, i) => (bar * 16 + i) * (P / 4);
  const isDrop = (bar) => bar >= 2 && bar <= 4;
  const kick = (t, o = {}) => { I.kick(drums, t, { gain: 0.92, decay: 0.32, seed: Math.round(t * 997), ...o }); kicks.push(t); };

  // ---------------- drums ----------------
  for (let bar = 0; bar < 8; bar++) {
    const kb = isDrop(bar) ? [0, 1, 2, 3] : bar === 0 ? [0, 2.5] : bar === 1 ? [0, 2] : bar === 5 ? [0, 2.5] : bar === 6 ? [0, 1, 2, 3] : bar === 7 ? [0, 2] : [];
    for (const k of kb) kick((bar * 4 + k) * P, { decay: isDrop(bar) || bar === 6 ? 0.3 : 0.42 });
    if (isDrop(bar) || bar === 6)
      for (const k of [1, 3]) {
        const t = (bar * 4 + k) * P;
        I.clap(drums, t, { gain: 0.42, seed: 200 + bar * 4 + k });
        I.clap(send, t, { gain: 0.15, seed: 200 + bar * 4 + k });
      }
    for (let i = 0; i < 16; i++) {
      const drop = isDrop(bar) || bar === 6;
      if (bar === 7 && i > 8) continue;
      if (!drop && i % 2) continue;
      if (bar === 5 && i % 4) continue;
      const vel = [0.9, 0.35, 0.6, 0.35][i % 4];
      const t = s16(bar, i) + (i % 2 ? 0.009 : 0);
      if (drop && i % 4 === 2) I.hat(drums, t, { gain: 0.14, open: true, seed: 400 + bar * 16 + i, pan: -0.12 });
      else I.hat(drums, t, { gain: (drop ? 0.12 : 0.075) * vel, seed: 500 + bar * 16 + i, pan: 0.18 });
    }
  }
  // build: snare roll accelerating into the drop (bar 1, second half)
  {
    const start = 4 * P, end = 8 * P;
    for (let t = start + 1.5 * P, k = 0; t < end - 1e-6; k++) {
      const p = (t - start) / (end - start);
      I.snare(drums, t, { gain: 0.05 + 0.26 * p * p, tone: 180 + 160 * p, seed: 600 + k, decay: 0.08 });
      t += p < 0.7 ? P / 4 : P / 8;
    }
  }
  // night: half-time backbeat
  I.clap(drums, 22 * P, { gain: 0.34, seed: 650 });
  I.clap(send, 22 * P, { gain: 0.22, seed: 650 });
  // morning: short roll into the 37 hit (b26)
  for (let t = 25 * P, k = 0; t < 26 * P - 1e-6; t += P / 8, k++) I.snare(drums, t, { gain: 0.06 + 0.16 * (k / 8), tone: 220, seed: 700 + k, decay: 0.07 });
  I.crash(drums, 8 * P, { gain: 0.17, seed: 801 });
  I.crash(drums, 16 * P, { gain: 0.1, seed: 802 });
  I.crash(drums, 26 * P, { gain: 0.18, seed: 803 });
  I.crash(drums, 28 * P, { gain: 0.12, seed: 804 });
  I.reverseCymbal(drums, 8 * P, P * 2, { gain: 0.22, seed: 805 });
  I.reverseCymbal(drums, 24 * P, P * 1.5, { gain: 0.16, seed: 806 });

  // ---------------- bass ----------------
  for (let bar = 2; bar <= 6; bar++) {
    if (bar === 5) continue;
    const c = CH[BARS[bar]];
    for (const i of [2, 6, 10, 14]) I.bass(bassBus, s16(bar, i), c.root - 12 + (i === 14 ? 12 : 0), P * 0.4, { gain: 0.36, cutoff: 850 });
    I.bass(bassBus, s16(bar, 7), c.root, P * 0.16, { gain: 0.15, cutoff: 700 });
  }
  I.bass(bassBus, 0, CH.Am.root - 12, P * 3.8, { gain: 0.24, cutoff: 240 });
  I.bass(bassBus, 4 * P, CH.F.root - 12, P * 3.8, { gain: 0.26, cutoff: 300 });
  I.bass(bassBus, 20 * P, CH.F.root - 12, P * 3.8, { gain: 0.22, cutoff: 260 });
  I.bass(bassBus, 28 * P, CH.C.root - 12, P * 3.8, { gain: 0.32, cutoff: 420 });

  // ---------------- synths ----------------
  const ARP = [0, 2, 1, 3, 2, 4, 3, 5];
  for (let bar = 0; bar <= 6; bar++) {
    const c = CH[BARS[bar]];
    const pool = [...c.notes, ...c.notes.map((n) => n + 12)];
    for (let i = 0; i < 16; i++) {
      if (bar === 0 && i < 8) continue;
      const note = pool[ARP[i % 8]] + 12;
      const t = s16(bar, i) + (i % 2 ? 0.009 : 0);
      const intro = bar <= 1;
      const night = bar === 5;
      const cut = intro ? 600 + 1800 * ((bar * 16 + i) / 32) : night ? 900 + 2200 * (i / 16) : 2800;
      const g = intro ? 0.09 : night ? 0.13 : 0.075;
      const pan = i % 2 ? 0.4 : -0.4;
      I.pluck(synth, t, note, { gain: g, cutoff: cut, pan });
      I.pluck(dsend, t, note, { gain: g * 0.6, cutoff: cut, pan });
      I.pluck(send, t, note, { gain: g * 0.3, cutoff: cut, pan });
    }
  }
  for (const bar of [2, 3, 4, 6]) {
    const notes = CH[BARS[bar]].notes.map((n) => n + 12);
    for (const i of [0, 3, 6, 10, 13]) {
      I.stab(synth, s16(bar, i), notes, P * 0.3, { gain: 0.18, seed: 900 + bar * 16 + i });
      I.stab(send, s16(bar, i), notes, P * 0.3, { gain: 0.07, seed: 900 + bar * 16 + i });
    }
  }
  // hook: dark low pad; build: rising pad
  I.pad(synth, 0, CH.Am.notes.map((n) => n - 12), P * 4, { gain: 0.2, cutoff: 700, attack: 0.03 });
  I.pad(synth, 4 * P, CH.F.notes, P * 4, { gain: 0.2, cutoff: 1300, attack: 0.1, release: 0.08 });
  I.pad(send, 0, CH.Am.notes, P * 8, { gain: 0.08, cutoff: 800 });
  // night breakdown: warm wide pad
  I.pad(synth, 20 * P, CH.F.notes, P * 4, { gain: 0.2, cutoff: 1500, attack: 0.05, release: 0.15 });
  I.pad(send, 20 * P, CH.F.notes, P * 4, { gain: 0.12, cutoff: 1500 });
  // the 37 hit
  I.stab(synth, 26 * P, CH.C.notes.map((n) => n + 12), P * 1.8, { gain: 0.24, cutoff: 5200, decayCut: 0.4, seed: 990 });
  I.stab(send, 26 * P, CH.C.notes.map((n) => n + 12), P * 1.8, { gain: 0.14, cutoff: 5200, seed: 991 });
  // lockup: resolve + bells
  I.pad(synth, 28 * P, CH.Cmaj9.notes, P * 4, { gain: 0.19, cutoff: 1900, attack: 0.02, release: 0.4 });
  I.pad(send, 28 * P, CH.Cmaj9.notes, P * 4, { gain: 0.12, cutoff: 1800 });
  for (const [k, m] of [[29.25, 76], [29.5, 79], [29.75, 84], [30.5, 83], [31.25, 88]]) {
    I.bell(synth, k * P, m, { gain: 0.065, decay: 0.8, pan: ((k * 4) % 3) - 1 });
    I.bell(send, k * P, m, { gain: 0.05, decay: 0.8 });
  }

  // ---------------- sidechain + FX ----------------
  const duck = new Float32Array(bassBus.n);
  for (const kt of kicks) {
    const i0 = Math.round(kt * SR);
    for (let n = 0; n < Math.round(0.3 * SR); n++) {
      const s = n / SR;
      const e = s < 0.004 ? s / 0.004 : Math.exp(-(s - 0.004) / 0.09);
      if (i0 + n < duck.length) duck[i0 + n] = Math.max(duck[i0 + n], e);
    }
  }
  for (let n = 0; n < bassBus.n; n++) {
    const g = 1 - 0.85 * duck[n], g2 = 1 - 0.5 * duck[n];
    bassBus.L[n] *= g; bassBus.R[n] *= g;
    synth.L[n] *= g2; synth.R[n] *= g2;
  }
  const verb = freeverb(send, { room: 0.88, damp: 0.4 });
  const dly = pingpong(dsend, { time: P * 0.75, fb: 0.4, lp: 3500, wet: 0.9 });
  const music = new Stereo(len);
  drums.mixInto(music, 1);
  bassBus.mixInto(music, 1);
  synth.mixInto(music, 1);
  verb.mixInto(music, 0.9);
  dly.mixInto(music, 0.45);
  return { music, drums, kicks };
}
