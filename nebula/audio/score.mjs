// Music bed: 120 BPM, D minor, 10 bars = exactly 20.0 s.
// 0-1 hook (tense intro, riser) | 2-6 drop (product + features) | 7 metric (half-time hit) | 8-9 lockup.
import { SR, Stereo, freeverb, pingpong } from './dsp.mjs';
import * as I from './instruments.mjs';

export const BPM = 120;
export const P = 60 / BPM;

const CH = {
  Dm: { notes: [57, 62, 65], root: 38 },
  Bb: { notes: [58, 62, 65], root: 34 },
  F: { notes: [57, 60, 65], root: 41 },
  C: { notes: [55, 60, 64], root: 36 },
  Gm: { notes: [55, 58, 62], root: 43 },
  Fadd9: { notes: [57, 60, 65, 67], root: 41 },
};
const BARS = ['Dm', 'Bb', 'Dm', 'Bb', 'F', 'C', 'Gm', 'Bb', 'F', 'Fadd9'];

export function renderMusic(duration = 20) {
  const len = duration + 0.05;
  const drums = new Stereo(len), bassBus = new Stereo(len), synth = new Stereo(len);
  const send = new Stereo(len), dsend = new Stereo(len);
  const kicks = [];
  const s16 = (bar, i) => (bar * 16 + i) * (P / 4);
  const isDrop = (bar) => bar >= 2 && bar <= 6;

  // ---------------- drums ----------------
  for (let bar = 0; bar < 10; bar++) {
    const kb = isDrop(bar) ? [0, 1, 2, 3] : bar === 0 ? [0, 2.5] : bar === 1 ? [0] : bar === 7 ? [0, 2.5] : bar === 8 ? [0, 2] : bar === 9 ? [0] : [];
    for (const k of kb) {
      const t = (bar * 4 + k) * P;
      I.kick(drums, t, { gain: 0.92, decay: isDrop(bar) ? 0.3 : 0.4, seed: 100 + bar * 8 + k * 2 });
      kicks.push(t);
    }
    if (isDrop(bar) || bar === 8)
      for (const k of [1, 3]) {
        const t = (bar * 4 + k) * P;
        I.clap(drums, t, { gain: 0.4, seed: 200 + bar * 4 + k });
        I.clap(send, t, { gain: 0.15, seed: 200 + bar * 4 + k });
      }
    if (bar === 7) { I.clap(drums, (bar * 4 + 2) * P, { gain: 0.45, seed: 777 }); I.clap(send, (bar * 4 + 2) * P, { gain: 0.25, seed: 777 }); }
    if (bar !== 1 && bar !== 9)
      for (let i = 0; i < 16; i++) {
        const drop = isDrop(bar);
        if (!drop && i % 2) continue;
        const vel = [0.9, 0.35, 0.6, 0.35][i % 4];
        const t = s16(bar, i) + (i % 2 ? 0.008 : 0);
        if (drop && i % 4 === 2) I.hat(drums, t, { gain: 0.15, open: true, seed: 400 + bar * 16 + i, pan: -0.12 });
        else I.hat(drums, t, { gain: (drop ? 0.12 : 0.08) * vel, seed: 500 + bar * 16 + i, pan: 0.18 });
      }
  }
  // riser snare roll into the drop (bar 1)
  {
    const start = 4 * P, end = 8 * P;
    for (let t = start + 2 * P, k = 0; t < end - 1e-6; k++) {
      const p = (t - start) / (end - start);
      I.snare(drums, t, { gain: 0.05 + 0.24 * p * p, tone: 180 + 140 * p, seed: 600 + k, decay: 0.08 });
      t += p < 0.75 ? P / 4 : P / 8;
    }
  }
  I.crash(drums, 8 * P, { gain: 0.16, seed: 801 });
  I.crash(drums, 28 * P, { gain: 0.2, seed: 802 });
  I.crash(drums, 32 * P, { gain: 0.14, seed: 803 });
  I.reverseCymbal(drums, 8 * P, P * 2, { gain: 0.22, seed: 804 });
  I.reverseCymbal(drums, 28 * P, P * 1.5, { gain: 0.2, seed: 805 });

  // ---------------- bass ----------------
  for (let bar = 2; bar <= 6; bar++) {
    const c = CH[BARS[bar]];
    for (const i of [2, 6, 10, 14]) I.bass(bassBus, s16(bar, i), c.root - 12 + (i === 14 ? 12 : 0), P * 0.4, { gain: 0.36, cutoff: 820 });
    I.bass(bassBus, s16(bar, 7), c.root, P * 0.16, { gain: 0.16, cutoff: 700 });
  }
  I.bass(bassBus, 28 * P, CH.Bb.root - 12, P * 3.5, { gain: 0.4, cutoff: 480 });
  for (let bar = 8; bar <= 9; bar++) I.bass(bassBus, bar * 4 * P, CH.F.root - 12, P * 3.8, { gain: 0.32, cutoff: 420 });
  I.bass(bassBus, 0, CH.Dm.root - 12, P * 7.6, { gain: 0.2, cutoff: 220 });

  // ---------------- synths ----------------
  const ARP = [0, 2, 1, 3, 2, 4, 3, 5];
  for (let bar = 0; bar <= 8; bar++) {
    if (bar === 7) continue;
    const c = CH[BARS[bar]];
    const pool = [...c.notes, ...c.notes.map((n) => n + 12)];
    for (let i = 0; i < 16; i++) {
      const note = pool[ARP[i % 8]] + 12;
      const t = s16(bar, i) + (i % 2 ? 0.008 : 0);
      const intro = bar <= 1;
      const cut = intro ? 700 + 1600 * ((bar * 16 + i) / 32) : bar === 8 ? 1500 : 2700;
      const g = intro ? 0.1 : 0.08;
      const pan = i % 2 ? 0.4 : -0.4;
      I.pluck(synth, t, note, { gain: g, cutoff: cut, pan });
      I.pluck(dsend, t, note, { gain: g * 0.55, cutoff: cut, pan });
      I.pluck(send, t, note, { gain: g * 0.3, cutoff: cut, pan });
    }
  }
  for (let bar = 2; bar <= 6; bar++) {
    const notes = CH[BARS[bar]].notes.map((n) => n + 12);
    for (const i of [0, 3, 6, 10, 13]) {
      I.stab(synth, s16(bar, i), notes, P * 0.3, { gain: 0.19, seed: 900 + bar * 16 + i });
      I.stab(send, s16(bar, i), notes, P * 0.3, { gain: 0.08, seed: 900 + bar * 16 + i });
    }
  }
  // intro pad (dark, filtered) and riser pad
  I.pad(synth, 0, CH.Dm.notes, P * 4, { gain: 0.18, cutoff: 900, attack: 0.04 });
  I.pad(synth, 4 * P, CH.Bb.notes, P * 4, { gain: 0.2, cutoff: 1300, attack: 0.1, release: 0.1 });
  I.pad(send, 0, CH.Dm.notes, P * 8, { gain: 0.08, cutoff: 900 });
  // metric bar: one huge chord
  I.stab(synth, 28 * P, CH.Bb.notes.map((n) => n + 12), P * 3.5, { gain: 0.24, cutoff: 5000, decayCut: 0.5, seed: 990 });
  I.stab(send, 28 * P, CH.Bb.notes.map((n) => n + 12), P * 3.5, { gain: 0.14, cutoff: 5000, seed: 991 });
  // lockup: warm resolving pad + bells
  I.pad(synth, 32 * P, CH.F.notes, P * 4, { gain: 0.16, cutoff: 1600, attack: 0.03, release: 0.1 });
  I.pad(synth, 36 * P, CH.Fadd9.notes, P * 4, { gain: 0.17, cutoff: 1900, attack: 0.02, release: 0.5 });
  I.pad(send, 32 * P, CH.Fadd9.notes, P * 8, { gain: 0.1, cutoff: 1800 });
  for (const [k, m] of [[32, 77], [32.5, 81], [33, 84], [36, 84], [36.5, 88], [37, 89]]) {
    I.bell(synth, k * P, m, { gain: 0.06, decay: 0.8, pan: ((k * 2) % 3) - 1 });
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
