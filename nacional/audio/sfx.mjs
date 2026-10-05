// Sound design placed from the shared timeline (measured beat grid).
import { Stereo, freeverb } from './dsp.mjs';
import * as I from './instruments.mjs';
import * as X from './extra.mjs';
import { mulberry32 } from '../film/lib.js';
import { makeTimeline } from '../film/timeline.js';

export function renderSfx(grid, duration = 20) {
  const { cue: c, b, P } = makeTimeline(grid);
  const bus = new Stereo(duration + 0.05), send = new Stereo(duration + 0.05);
  const r = mulberry32(23);

  // bar 0 · hook
  I.impact(bus, c.nueva, { gain: 0.55, boom: 0.9, crack: 0.8, seed: 1, len: 1.4 });
  I.impact(bus, c.piel, { gain: 0.45, boom: 0.7, crack: 0.7, seed: 2 });
  c.macro.forEach((t, i) => { I.whoosh(bus, t - 0.09, 0.16, { gain: 0.18, f0: 900, f1: 6000, peak: 0.7, pan0: i % 2 ? 0.6 : -0.6, pan1: 0, seed: 10 + i }); I.flip(bus, t, { gain: 0.1, seed: 20 + i, pitch: 1.2 + i * 0.1 }); });
  I.whoosh(bus, c.hookOut - 0.1, 0.3, { gain: 0.32, f0: 300, f1: 6000, peak: 0.6, pan0: -0.4, pan1: 0.4, seed: 30 });

  // bar 1 · three words, then the shards gather (glass pings accelerating into the drop)
  c.words.forEach((t, i) => I.impact(bus, t, { gain: 0.32 + i * 0.05, boom: 0.6, crack: 0.6, seed: 40 + i }));
  const [g0, g1] = c.gather;
  for (let k = 0; k < 34; k++) {
    const p = Math.pow(k / 34, 0.7);
    const t = g0 + (g1 - g0) * p + (r() - 0.5) * 0.02;
    X.shard(bus, t, { gain: 0.035 + 0.04 * p, f: 2600 + r() * 3800, pan: r() * 1.6 - 0.8 });
    X.shard(send, t, { gain: 0.03, f: 3000 + r() * 3000 });
  }
  I.riser(bus, g0 - P * 0.5, g1, { gain: 0.22, seed: 50 });

  // bar 2 · the kit lands
  I.impact(bus, c.drop, { gain: 0.85, boom: 1.2, crack: 1, seed: 60, len: 1.8 });
  I.impact(send, c.drop, { gain: 0.3, boom: 0, crack: 1, seed: 61 });
  for (let k = 0; k < 14; k++) X.shard(bus, c.drop + 0.02 + r() * 0.25, { gain: 0.05, f: 3000 + r() * 4000, pan: r() * 2 - 1 });
  I.whoosh(bus, c.trace[0], c.trace[1] - c.trace[0], { gain: 0.14, f0: 1200, f1: 7000, peak: 0.85, pan0: -0.7, pan1: 0.7, seed: 62 });
  c.call.forEach((t, i) => { I.keyTick(bus, t, { gain: 0.22, seed: 70 + i, pitch: 1.3 }); I.pop(bus, t + 0.03, { gain: 0.08, f0: 900 + i * 150, f1: 1500 + i * 150, pan: [-0.4, 0.4, 0][i] }); });

  // bar 3 · the question, then the turn
  c.q.forEach((t, i) => I.kick(bus, t, { gain: 0.25, hi: 150, lo: 70, decay: 0.08, click: 0.4, seed: 80 + i }));
  I.whoosh(bus, c.turn[0], c.turn[1] - c.turn[0], { gain: 0.35, f0: 200, f1: 3500, peak: 0.92, pan0: 0.6, pan1: -0.6, seed: 90 });
  I.riser(bus, c.turn[0], c.turn[1], { gain: 0.2, seed: 91, f0: 400, f1: 8000 });

  // bar 4 · reveal
  I.impact(bus, c.reveal, { gain: 0.9, boom: 1.3, crack: 1, seed: 100, len: 2 });
  I.impact(send, c.reveal, { gain: 0.35, boom: 0, crack: 1, seed: 101 });
  X.crowd(bus, c.reveal, P * 2.2, { gain: 0.05, seed: 102, attack: 0.06, release: 1.2 });
  I.whoosh(bus, c.scan - 0.05, 0.4, { gain: 0.12, f0: 2000, f1: 8000, peak: 0.5, pan0: -0.8, pan1: 0.8, seed: 103 });
  I.whoosh(bus, c.push[0], c.push[1] - c.push[0], { gain: 0.1, f0: 200, f1: 1200, peak: 0.9, pan0: 0, pan1: 0, seed: 104 });

  // bar 5 · the name
  I.whoosh(bus, c.james - 0.14, 0.2, { gain: 0.3, f0: 400, f1: 6000, peak: 0.7, pan0: -0.5, pan1: 0, seed: 110 });
  I.impact(bus, c.james, { gain: 0.6, boom: 1, crack: 0.8, seed: 111 });
  I.whoosh(bus, c.rodriguez - 0.14, 0.2, { gain: 0.3, f0: 400, f1: 6000, peak: 0.7, pan0: 0.5, pan1: 0, seed: 112 });
  I.impact(bus, c.rodriguez, { gain: 0.6, boom: 1, crack: 0.8, seed: 113 });
  I.whoosh(bus, c.nameOut - 0.05, 0.28, { gain: 0.3, f0: 300, f1: 5000, peak: 0.6, pan0: 0.3, pan1: -0.3, seed: 114 });

  // bar 6 · ES VERDOLAGA, crest pieces
  I.impact(bus, c.es, { gain: 0.4, boom: 0.8, crack: 0.5, seed: 120 });
  I.impact(bus, c.verdolaga, { gain: 0.5, boom: 0.9, crack: 0.7, seed: 121 });
  c.crest.forEach((t, i) => { I.pop(bus, t, { gain: 0.11, f0: 500 + i * 120, f1: 900 + i * 160, pan: (i % 3 - 1) * 0.4 }); I.whoosh(bus, t - 0.12, 0.16, { gain: 0.1, f0: 800, f1: 5000, peak: 0.8, pan0: i % 2 ? 0.5 : -0.5, pan1: 0, seed: 130 + i }); });
  I.riser(bus, b(26), c.lock, { gain: 0.18, seed: 140 });

  // bar 7 · lockup: the stadium answers
  I.impact(bus, c.lock, { gain: 0.9, boom: 1.3, crack: 1, seed: 150, len: 2.2 });
  I.impact(send, c.lock, { gain: 0.35, boom: 0, crack: 1, seed: 151 });
  X.crowd(bus, c.lock - 0.05, c.end - c.lock - 0.3, { gain: 0.085, seed: 152, attack: 0.15, release: 0.6 });
  I.pop(bus, c.club, { gain: 0.08, f0: 700, f1: 1100 });
  I.keyTick(bus, c.welcome, { gain: 0.18, seed: 153, pitch: 1.2 });

  freeverb(send, { room: 0.85, damp: 0.4 }).mixInto(bus, 0.8);
  return bus;
}
