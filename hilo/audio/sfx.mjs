// Sound design placed from the shared timeline (measured beat grid): buzzes, pops, whooshes, hits, clicks.
import { Stereo, freeverb } from './dsp.mjs';
import * as I from './instruments.mjs';
import { makeTimeline } from '../film/timeline.js';

// Two-tone message pop (generic, not any app's trademark sound).
function msgPop(bus, t, g = 0.14, pan = 0) {
  I.pop(bus, t, { gain: g, f0: 880, f1: 1180, dur: 0.05, pan });
  I.pop(bus, t + 0.075, { gain: g * 0.8, f0: 1320, f1: 1560, dur: 0.06, pan });
}

export function renderSfx(grid, duration = 15) {
  const { cue: c, P } = makeTimeline(grid);
  const bus = new Stereo(duration + 0.05), send = new Stereo(duration + 0.05);
  const thump = (t, g = 0.3) => I.kick(bus, t, { gain: g, hi: 150, lo: 70, decay: 0.07, click: 0.35, seed: Math.round(t * 1000) });
  const tap = (t, g = 0.5) => { I.keyTick(bus, t, { gain: g, seed: Math.round(t * 100), pitch: 1.5 }); I.pop(send, t, { gain: 0.07, f0: 900, f1: 1400 }); };

  // 1 hook: clock digits roll (flips), slam, phone buzzes per notification
  I.impact(bus, c.clock, { gain: 0.42, boom: 0.8, crack: 0.45, seed: 1 });
  for (let k = 0; k < 10; k++) I.flip(bus, c.clock + k * 0.035, { gain: 0.06, seed: 10 + k, pitch: 1.1 + k * 0.03 });
  thump(c.hook1, 0.26); thump(c.hook2, 0.28);
  c.notifs.forEach((t, i) => { I.buzz(bus, t - 0.01, { gain: 0.1, pulses: 1 }); msgPop(bus, t, 0.12, (i % 2 ? 0.3 : -0.3)); });
  // 2 pile-up: a pop per message, denser and higher
  for (let k = 0; k < 20; k++) {
    const D = c.pile[1] - c.pile[0];
    const t = c.pile[0] + D * Math.sqrt((k + 0.4) / 20) * 0.98;
    msgPop(bus, t, 0.05 + 0.04 * (k / 20), ((k * 7) % 5) / 2.5 - 0.8);
    if (k % 3 === 0) I.buzz(bus, t, { gain: 0.05, pulses: 1 });
  }
  thump(c.q1, 0.3); I.impact(bus, c.q3, { gain: 0.3, boom: 0.6, crack: 0.3, seed: 2 });
  I.riser(bus, c.pile[0], c.drop, { gain: 0.2, seed: 3 });
  I.whoosh(bus, c.thread[0], c.drop - c.thread[0], { gain: 0.42, f0: 250, f1: 6500, peak: 0.85, pan0: -0.8, pan1: 0.6, seed: 4 });

  // 3 drop + chat
  I.impact(bus, c.drop, { gain: 0.75, boom: 1.1, crack: 1, seed: 5, len: 1.8 });
  I.impact(send, c.drop, { gain: 0.3, boom: 0, crack: 1, seed: 5 });
  thump(c.agentWord + P / 2, 0.3);
  I.whoosh(bus, c.chatIn - 0.12, 0.3, { gain: 0.22, f0: 400, f1: 3000, peak: 0.6, pan0: 0, pan1: 0, seed: 6 });
  msgPop(bus, c.c1, 0.13, -0.3);
  for (let t = c.dots, k = 0; t < c.a1 - 0.05; t += P / 4, k++) I.keyTick(bus, t, { gain: 0.08, seed: 40 + k, pitch: 1.1 });
  msgPop(bus, c.a1, 0.14, 0.3);
  I.bell(bus, c.stamp, 91, { gain: 0.05, ratio: 2, index: 1, decay: 0.25 });
  I.whoosh(bus, c.card - 0.12, 0.2, { gain: 0.14, f0: 600, f1: 4000, peak: 0.7, pan0: 0.5, pan1: 0, seed: 7 });
  I.pop(bus, c.card, { gain: 0.12, f0: 500, f1: 900 });
  // verbs: a hit on each, plus the UI action it names
  c.verbs.forEach((t, i) => { thump(t, 0.34); I.whoosh(bus, t - 0.1, 0.16, { gain: 0.12, f0: 800, f1: 5000, peak: 0.8, pan0: 0, pan1: 0, seed: 50 + i }); });
  tap(c.tap); msgPop(bus, c.c2, 0.11, -0.3);
  for (let t = c.pay + 0.1, k = 0; t < c.paid; t += P / 8, k++) I.flip(bus, t, { gain: 0.04, seed: 60 + k, pitch: 1.6 + k * 0.05 });
  [[0, 84], [0.07, 88], [0.14, 91]].forEach(([d, m]) => I.bell(bus, c.paid + d, m, { gain: 0.06, ratio: 2, index: 1, decay: 0.35 }));
  I.pop(bus, c.slots, { gain: 0.1, f0: 700, f1: 1100 }); tap(c.pick);
  msgPop(bus, c.voice, 0.1, -0.3);

  // 4 zoom-out: whoosh down, then a tick per answered wave ring
  I.whoosh(bus, c.zoom[0] - 0.05, c.zoom[1] - c.zoom[0], { gain: 0.38, f0: 4000, f1: 200, peak: 0.25, pan0: 0, pan1: 0, seed: 70 });
  for (let k = 0; k < 14; k++) I.pop(bus, c.zoom[0] + 0.25 + k * (P / 4), { gain: 0.035, f0: 1500 + k * 60, f1: 1900 + k * 60, dur: 0.03, pan: ((k % 3) - 1) * 0.6 });
  thump(c.one, 0.3); thump(c.many, 0.3);
  I.whoosh(bus, c.collapse[0], c.night - c.collapse[0], { gain: 0.32, f0: 300, f1: 7000, peak: 0.9, pan0: 0.6, pan1: -0.6, seed: 71 });

  // 5 night: soft hit, an order "ding" per row
  I.impact(bus, c.night, { gain: 0.32, boom: 0.9, crack: 0.2, seed: 80, len: 1.6 });
  I.rain(bus, c.night - 0.05, c.morning + 0.05, { gain: 0.09, seed: 61 });
  I.riser(bus, c.night + 2 * P, c.morning, { gain: 0.1, seed: 62, f0: 500, f1: 7000 });
  c.orders.forEach((t, i) => { I.whoosh(bus, t - 0.1, 0.18, { gain: 0.1, f0: 900, f1: 3500, peak: 0.6, pan0: 0.7, pan1: 0, seed: 81 + i }); I.bell(bus, t + 0.16, 84 + i * 2, { gain: 0.06, ratio: 2, index: 1, decay: 0.4 }); I.bell(send, t + 0.16, 84 + i * 2, { gain: 0.04, ratio: 2, index: 1, decay: 0.4 }); });

  // 6 morning: count ticks on 16ths, slam on 37
  I.whoosh(bus, c.morning - 0.18, 0.22, { gain: 0.3, f0: 300, f1: 6000, peak: 0.8, pan0: 0, pan1: 0, seed: 90 });
  for (let k = 0; k < 8; k++) I.flip(bus, c.count[0] + k * (P / 8), { gain: 0.06, seed: 91 + k, pitch: 1.2 + k * 0.06 });
  I.impact(bus, c.countHit, { gain: 0.7, boom: 1.1, crack: 0.9, seed: 99, len: 1.6 });
  I.whoosh(bus, c.underline, 0.45, { gain: 0.1, f0: 1200, f1: 3000, peak: 0.5, pan0: -0.6, pan1: 0.6, seed: 98 });

  // 7 lockup
  I.whoosh(bus, c.end - 0.15, 0.6, { gain: 0.16, f0: 800, f1: 2500, peak: 0.5, pan0: -0.5, pan1: 0.5, seed: 100 });
  thump(c.wordmark, 0.42);
  I.impact(bus, c.wordmark, { gain: 0.35, boom: 0.8, crack: 0.4, seed: 101 });
  I.pop(bus, c.cta, { gain: 0.12, f0: 700, f1: 1200 });
  tap(c.ctaTap, 0.55);
  msgPop(bus, c.ctaTap + 0.06, 0.12, 0);

  freeverb(send, { room: 0.8, damp: 0.4 }).mixInto(bus, 0.8);
  return bus;
}
