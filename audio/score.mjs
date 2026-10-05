// The music bed: 128 BPM, A minor, 8 bars = exactly 15.0 s.
// Bars: 0 Am intro | 1 F intro+clap | 2 Dm→E breakdown/riser | 3-6 Am F C G drop | 7 C(add9) final.
import { SR, Stereo, freeverb, pingpong } from './dsp.mjs';
import * as I from './instruments.mjs';

export const BPM = 128;
export const P = 60 / BPM;

const CH = {
  Am: { notes: [57, 60, 64], root: 33 },
  F: { notes: [57, 60, 65], root: 29 },
  C: { notes: [55, 60, 64], root: 36 },
  G: { notes: [55, 59, 62], root: 31 },
  Dm: { notes: [57, 62, 65], root: 38 },
  E: { notes: [56, 59, 64], root: 40 },
  Cadd9: { notes: [55, 60, 62, 64, 67], root: 36 },
};
const BARS = ['Am', 'F', 'Dm', 'Am', 'F', 'C', 'G', 'Cadd9'];

export function renderMusic(duration = 15) {
  const len = duration + 0.05;
  const drums = new Stereo(len);
  const bassBus = new Stereo(len);
  const synth = new Stereo(len);
  const send = new Stereo(len); // reverb send
  const dsend = new Stereo(len); // delay send
  const kicks = [];
  const s16 = (bar, i) => (bar * 16 + i) * (P / 4);

  // ---------------- drums ----------------
  for (let bar = 0; bar < 8; bar++) {
    const drop = bar >= 3 && bar <= 6;
    // kick
    const kbeats = bar <= 1 ? [0, 2] : drop ? [0, 1, 2, 3] : bar === 7 ? [0, 2] : [];
    for (const k of kbeats) {
      const t = (bar * 4 + k) * P;
      I.kick(drums, t, { gain: drop ? 0.95 : 0.88, decay: drop ? 0.28 : 0.34, seed: 100 + bar * 4 + k });
      kicks.push(t);
    }
    if (bar === 1) { I.kick(drums, (bar * 4 + 2.75) * P, { gain: 0.5, seed: 9 }); kicks.push((bar * 4 + 2.75) * P); }
    // clap on 2 & 4
    if (bar === 1 || drop) {
      for (const k of [1, 3]) {
        const t = (bar * 4 + k) * P;
        I.clap(drums, t, { gain: 0.42, seed: 200 + bar * 4 + k });
        I.clap(send, t, { gain: 0.16, seed: 200 + bar * 4 + k });
        I.snare(drums, t, { gain: 0.14, seed: 300 + bar, tone: 210 });
      }
    }
    // hats
    if (bar <= 1 || drop) {
      for (let i = 0; i < 16; i++) {
        const vel = [0.9, 0.35, 0.6, 0.35][i % 4];
        const t = s16(bar, i) + (i % 2 ? 0.006 : 0); // tiny swing
        if (drop && i % 4 === 2) I.hat(drums, t, { gain: 0.16, open: true, seed: 400 + bar * 16 + i, pan: -0.1 });
        else I.hat(drums, t, { gain: (drop ? 0.13 : 0.1) * vel, seed: 500 + bar * 16 + i, pan: 0.18 });
      }
    }
  }
  // breakdown snare roll: 8ths -> 16ths -> 32nds, rising
  {
    const start = 8 * P, end = 12 * P;
    let t = start;
    let k = 0;
    while (t < end - 1e-6) {
      const p = (t - start) / (end - start);
      const step = p < 0.5 ? P / 2 : p < 0.75 ? P / 4 : P / 8;
      I.snare(drums, t, { gain: 0.05 + 0.22 * p * p, tone: 180 + 120 * p, seed: 600 + k, decay: 0.09 });
      I.snare(send, t, { gain: 0.05 * p, tone: 180 + 120 * p, seed: 600 + k, decay: 0.09 });
      t += step;
      k++;
    }
  }
  // fill into the final bar
  for (let i = 0; i < 4; i++) {
    const t = (27 + i / 4) * P;
    I.snare(drums, t, { gain: 0.1 + i * 0.05, tone: 220 + i * 30, seed: 700 + i, decay: 0.08 });
  }
  I.crash(drums, 12 * P, { gain: 0.16, seed: 801 });
  I.crash(drums, 28 * P, { gain: 0.18, seed: 802 });
  I.reverseCymbal(drums, 12 * P, P * 2, { gain: 0.22, seed: 803 });
  I.reverseCymbal(drums, 28 * P, P * 1, { gain: 0.16, seed: 804 });

  // ---------------- bass ----------------
  for (let bar = 3; bar <= 6; bar++) {
    const c = CH[BARS[bar]];
    for (const i of [2, 6, 10, 14]) {
      const note = c.root + (i === 14 ? 12 : 0);
      I.bass(bassBus, s16(bar, i), note, P * 0.42, { gain: 0.38, cutoff: 800 });
    }
    // a ghost 16th push before beat 3
    I.bass(bassBus, s16(bar, 7), c.root + 12, P * 0.18, { gain: 0.18, cutoff: 700 });
  }
  // final: long root
  I.bass(bassBus, 28 * P, CH.Cadd9.root, P * 3.5, { gain: 0.42, cutoff: 500 });
  // breakdown: sub drone
  I.bass(bassBus, 8 * P, CH.Dm.root, P * 2, { gain: 0.22, cutoff: 260 });
  I.bass(bassBus, 10 * P, CH.E.root, P * 2, { gain: 0.24, cutoff: 300 });

  // ---------------- synths ----------------
  // pluck arp (16ths): intro filtered, drop brighter
  const ARP = [0, 1, 2, 3, 4, 3, 2, 1];
  for (let bar = 0; bar <= 6; bar++) {
    if (bar === 2) continue;
    const c = CH[BARS[bar]];
    const pool = [...c.notes, ...c.notes.map((n) => n + 12)];
    for (let i = 0; i < 16; i++) {
      const note = pool[ARP[i % 8] + (i >= 8 && bar >= 3 ? 1 : 0)] + 12;
      const t = s16(bar, i) + (i % 2 ? 0.006 : 0);
      const intro = bar <= 1;
      const cut = intro ? 900 + 900 * ((bar * 16 + i) / 32) : 2600;
      const g = intro ? 0.11 : 0.085;
      const pan = (i % 2 ? 0.35 : -0.35);
      I.pluck(synth, t, note, { gain: g, cutoff: cut, pan });
      I.pluck(dsend, t, note, { gain: g * 0.5, cutoff: cut, pan });
      I.pluck(send, t, note, { gain: g * 0.25, cutoff: cut, pan });
    }
  }
  // drop stabs on a tresillo-ish grid
  for (let bar = 3; bar <= 6; bar++) {
    const c = CH[BARS[bar]];
    const notes = c.notes.map((n) => n + 12);
    for (const i of [0, 3, 6, 10, 13]) {
      I.stab(synth, s16(bar, i), notes, P * 0.3, { gain: 0.2, seed: 900 + bar * 16 + i });
      I.stab(send, s16(bar, i), notes, P * 0.3, { gain: 0.08, seed: 900 + bar * 16 + i });
    }
  }
  // breakdown pad
  I.pad(synth, 8 * P, CH.Dm.notes, P * 2, { gain: 0.2, cutoff: 1100, attack: 0.08 });
  I.pad(synth, 10 * P, CH.E.notes, P * 2, { gain: 0.22, cutoff: 1500, attack: 0.08, release: 0.15 });
  I.pad(send, 8 * P, CH.Dm.notes, P * 4, { gain: 0.1, cutoff: 1100 });
  // final chord: big stab + pad + bell
  I.stab(synth, 28 * P, CH.Cadd9.notes.map((n) => n + 12), P * 3.6, { gain: 0.24, cutoff: 5200, decayCut: 0.6, seed: 990 });
  I.pad(synth, 28 * P, CH.Cadd9.notes, P * 3.6, { gain: 0.16, cutoff: 1800, attack: 0.02, release: 0.4 });
  I.stab(send, 28 * P, CH.Cadd9.notes.map((n) => n + 12), P * 3.6, { gain: 0.14, cutoff: 5200, seed: 991 });
  for (const [k, m] of [[0, 79], [0.5, 84], [1, 86], [1.5, 88]]) {
    I.bell(synth, (28 + k) * P, m, { gain: 0.07, decay: 0.7, pan: k - 0.75 });
    I.bell(send, (28 + k) * P, m, { gain: 0.06, decay: 0.7 });
  }

  // ---------------- sidechain + FX ----------------
  const duck = new Float32Array(bassBus.n);
  for (const kt of kicks) {
    const i0 = Math.round(kt * SR);
    for (let n = 0; n < Math.round(0.28 * SR); n++) {
      const s = n / SR;
      const e = s < 0.004 ? s / 0.004 : Math.exp(-(s - 0.004) / 0.075);
      if (i0 + n < duck.length) duck[i0 + n] = Math.max(duck[i0 + n], e);
    }
  }
  for (let n = 0; n < bassBus.n; n++) {
    const g = 1 - 0.85 * duck[n];
    bassBus.L[n] *= g; bassBus.R[n] *= g;
    const g2 = 1 - 0.55 * duck[n];
    synth.L[n] *= g2; synth.R[n] *= g2;
  }
  const verb = freeverb(send, { room: 0.86, damp: 0.45, wet: 1, width: 1 });
  const dly = pingpong(dsend, { time: P * 0.75, fb: 0.38, lp: 3500, wet: 0.9 });
  for (let n = 0; n < verb.n; n++) {
    const g = 1 - 0.5 * duck[n];
    verb.L[n] *= g; verb.R[n] *= g;
  }

  const music = new Stereo(len);
  drums.mixInto(music, 1);
  bassBus.mixInto(music, 1);
  synth.mixInto(music, 1);
  verb.mixInto(music, 0.9);
  dly.mixInto(music, 0.5);
  return { music, drums, kicks };
}
