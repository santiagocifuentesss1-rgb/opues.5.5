// UI clicks, whooshes and hits, placed from the shared timeline (measured beat grid).
import { Stereo, freeverb } from './dsp.mjs';
import * as I from './instruments.mjs';
import { makeTimeline } from '../film/timeline.js';

export function renderSfx(grid, duration = 20) {
  const { cue: c, b, P } = makeTimeline(grid);
  const bus = new Stereo(duration + 0.05), send = new Stereo(duration + 0.05);
  const thump = (t, g = 0.3) => I.kick(bus, t, { gain: g, hi: 150, lo: 70, decay: 0.07, click: 0.35, seed: Math.round(t * 1000) });
  const click = (t, g = 0.55) => { I.mouseClick(bus, t - 0.03, { gain: g, seed: Math.round(t * 100) }); I.pop(send, t, { gain: 0.08, f0: 900, f1: 1400 }); };

  // hook: a slam per word, typing dots that never resolve
  I.impact(bus, c.hook[0], { gain: 0.45, boom: 0.7, crack: 0.5, seed: 1 });
  c.hook.forEach((t, i) => thump(t, 0.3 + i * 0.03));
  I.impact(bus, c.hook[3], { gain: 0.3, boom: 0.6, crack: 0.3, seed: 2 });
  for (let t = c.dots[0], k = 0; t < c.dots[1]; t += P, k++) I.keyTick(bus, t, { gain: 0.12, seed: 300 + k, pitch: 1.2 });
  I.riser(bus, b(4), c.drop, { gain: 0.2, seed: 3 });
  I.whoosh(bus, c.hookOut - 0.05, 0.3, { gain: 0.35, f0: 300, f1: 5000, peak: 0.6, pan0: 0, pan1: 0, seed: 4 });

  // product assembles: big drop, then a pop per piece
  I.impact(bus, c.drop, { gain: 0.75, boom: 1.1, crack: 1, seed: 5, len: 1.8 });
  I.impact(send, c.drop, { gain: 0.3, boom: 0, crack: 1, seed: 5 });
  Object.values(c.parts).forEach((t, i) => {
    I.whoosh(bus, t - 0.12, 0.2, { gain: 0.12, f0: 600, f1: 4000, peak: 0.7, pan0: (i % 2 ? 0.5 : -0.5), pan1: 0, seed: 10 + i });
    I.pop(bus, t, { gain: 0.11, f0: 500 + i * 70, f1: 900 + i * 90, pan: (i % 3 - 1) * 0.35 });
  });

  // features: transition whoosh, cursor glide, click on the beat
  for (const [k, f] of [['f1', c.f1], ['f2', c.f2], ['f3', c.f3]]) {
    I.whoosh(bus, f.t0 - 0.18, 0.3, { gain: 0.38, f0: 250, f1: 5500, peak: 0.6, pan0: -0.3, pan1: 0.3, seed: 20 + k.length });
    thump(f.t0, 0.32);
    I.whoosh(bus, f.move[0], f.move[1] - f.move[0], { gain: 0.08, f0: 900, f1: 2600, peak: 0.4, pan0: 0.4, pan1: 0, seed: 30 });
    click(f.click);
    I.bell(bus, f.click + 0.04, 88, { gain: 0.06, ratio: 2, index: 1, decay: 0.3 });
  }

  // metric: slot ticks then a hit
  I.whoosh(bus, c.metric - 0.2, 0.25, { gain: 0.4, f0: 300, f1: 6000, peak: 0.8, pan0: 0, pan1: 0, seed: 40 });
  I.impact(bus, c.metric, { gain: 0.7, boom: 1.1, crack: 0.9, seed: 41, len: 1.8 });
  for (let t = c.metric + 0.05, k = 0; t < c.metricLock; t += P / 8, k++) I.flip(bus, t, { gain: 0.07, seed: 500 + k, pitch: 1.4 });
  thump(c.metricLock, 0.4);
  thump(c.metricSub, 0.25);

  // lockup
  I.whoosh(bus, c.end - 0.2, 0.3, { gain: 0.35, f0: 300, f1: 5000, peak: 0.7, pan0: 0, pan1: 0, seed: 50 });
  thump(c.wordmark, 0.3);
  I.pop(bus, c.cta, { gain: 0.12, f0: 700, f1: 1200 });
  I.whoosh(bus, c.ctaMove[0], c.ctaMove[1] - c.ctaMove[0], { gain: 0.08, f0: 900, f1: 2600, peak: 0.4, pan0: 0.4, pan1: 0, seed: 51 });
  click(c.ctaClick, 0.6);
  I.impact(bus, c.ctaClick, { gain: 0.45, boom: 0.8, crack: 0.5, seed: 52 });
  [[0.06, 84], [0.13, 88], [0.2, 91]].forEach(([d, m]) => { I.bell(bus, c.ctaClick + d, m, { gain: 0.08, ratio: 2, index: 1, decay: 0.5 }); I.bell(send, c.ctaClick + d, m, { gain: 0.05, ratio: 2, index: 1, decay: 0.5 }); });
  I.pop(bus, c.url, { gain: 0.08, f0: 900, f1: 1300 });

  freeverb(send, { room: 0.8, damp: 0.4 }).mixInto(bus, 0.8);
  return bus;
}
