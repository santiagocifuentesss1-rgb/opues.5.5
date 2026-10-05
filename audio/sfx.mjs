// Sound design, placed from the shared timeline (which is built on the measured beat grid).
import { Stereo, freeverb } from './dsp.mjs';
import * as I from './instruments.mjs';
import { makeTimeline } from '../film/timeline.js';
import { hash01 } from '../film/lib.js';

export function renderSfx(grid, duration = 15) {
  const T = makeTimeline(grid);
  const c = T.cue;
  const b = T.b;
  const bus = new Stereo(duration + 0.05);
  const send = new Stereo(duration + 0.05);
  const thump = (t, g = 0.3) => I.kick(bus, t, { gain: g, hi: 150, lo: 70, decay: 0.07, click: 0.35, seed: Math.round(t * 1000) });

  // ---- hook: words slam on 8ths, keys clatter
  I.impact(bus, c.hookWords[0], { gain: 0.42, boom: 0.7, crack: 0.5, seed: 1 });
  c.hookWords.forEach((t, i) => thump(t, 0.26 + i * 0.03));
  T.typeQuery.forEach((t, i) =>
    I.keyTick(bus, t, { gain: 0.3, seed: 1000 + i, pan: (hash01(i, 3) - 0.5) * 0.5, pitch: 0.85 + hash01(i, 4) * 0.3 }));
  // Enter: key + upward swish as the search bar travels
  I.keyTick(bus, c.enter - 0.012, { gain: 0.55, seed: 77, pitch: 0.65 });
  I.whoosh(bus, c.enter - 0.04, 0.42, { gain: 0.3, f0: 250, f1: 3200, pan0: 0, pan1: 0, peak: 0.35, seed: 2 });

  // ---- results
  c.cards.forEach((t, i) => I.pop(bus, t, { gain: 0.16, f0: 520 + i * 140, f1: 980 + i * 180, pan: -0.35 + 0.35 * i }));
  c.resultsHead.forEach((t) => thump(t, 0.3));
  I.buzz(bus, c.youCard, { gain: 0.13 });
  I.whoosh(bus, c.zoomVoid[0], c.zoomVoid[1] - c.zoomVoid[0] + 0.06, { gain: 0.42, f0: 160, f1: 5200, peak: 0.92, pan0: 0, pan1: 0, seed: 3 });

  // ---- void: two slams, letters deleted, riser into the drop
  I.impact(bus, c.voidLines[0], { gain: 0.5, boom: 1, crack: 0.45, seed: 4 });
  I.impact(bus, c.voidLines[1], { gain: 0.34, boom: 0.8, crack: 0.35, seed: 5 });
  for (let k = 0; k < 8; k++)
    I.glitch(bus, c.deleteStart + k * c.deleteStep, { gain: 0.2, seed: 2000 + k, pan: (k % 2 ? 0.4 : -0.4) * (k / 8) });
  I.riser(bus, c.riser[0], c.riser[1], { gain: 0.2, seed: 6 });

  // ---- drop: open 24/7
  I.impact(bus, c.drop, { gain: 0.75, boom: 1.15, crack: 1, seed: 7, len: 1.8 });
  I.impact(send, c.drop, { gain: 0.3, boom: 0, crack: 1, seed: 7 });
  thump(c.openWord, 0.32);
  // clock counter ticks (every 32nd while the hours spin)
  for (let t = c.drop + 0.06, k = 0; t < b(15.4); t += T.P / 8, k++)
    I.flip(bus, t, { gain: 0.05 + 0.03 * Math.sin(k * 0.7) ** 2, seed: 3000 + k, pitch: 1.6, pan: 0.25 });
  c.notifs.forEach((t, i) => {
    I.bell(bus, t, 88 + [0, 2, 4][i], { gain: 0.1, ratio: 2, index: 1.3, decay: 0.32, pan: 0.2 });
    I.bell(send, t, 88 + [0, 2, 4][i], { gain: 0.05, ratio: 2, index: 1.3, decay: 0.32 });
    I.pop(bus, t, { gain: 0.08, f0: 900, f1: 1400, dur: 0.05 });
  });
  I.whoosh(bus, c.whip[0], c.whip[1] - c.whip[0], { gain: 0.5, f0: 300, f1: 6000, peak: 0.5, pan0: -0.2, pan1: 0.2, seed: 8 });

  // ---- map
  I.whoosh(bus, c.tilt[0] + 0.1, c.tilt[1] - c.tilt[0], { gain: 0.16, f0: 200, f1: 900, peak: 0.5, pan0: 0.5, pan1: -0.5, seed: 9 });
  I.bloop(bus, c.pin - 0.12, { gain: 0.16 });
  thump(c.pin, 0.42);
  I.pop(send, c.pin, { gain: 0.1, f0: 600, f1: 1200 });
  I.whoosh(bus, c.sheet - 0.08, 0.32, { gain: 0.22, f0: 300, f1: 2400, peak: 0.6, pan0: 0, pan1: 0, seed: 10 });
  thump(c.sheetHead, 0.3);
  I.pop(bus, c.sheetRow, { gain: 0.12, f0: 800, f1: 1300 });
  I.pop(bus, c.sheetBtns, { gain: 0.12, f0: 900, f1: 1500 });
  I.pop(bus, c.sheetBtns + T.P * 0.25, { gain: 0.1, f0: 1000, f1: 1700 });
  I.whoosh(bus, c.pinZoom[0], c.pinZoom[1] - c.pinZoom[0] + 0.03, { gain: 0.45, f0: 200, f1: 7000, peak: 0.95, pan0: 0, pan1: 0, seed: 11 });

  // ---- roll: one mechanical flip per word
  I.impact(bus, c.wordTimes[0], { gain: 0.4, boom: 0.6, crack: 0.6, seed: 12 });
  c.wordTimes.forEach((t, i) => {
    I.flip(bus, t, { gain: 0.32, seed: 4000 + i, pitch: 0.8 + (i % 4) * 0.12, pan: i % 2 ? 0.3 : -0.3 });
    I.flip(bus, t + 0.03, { gain: 0.12, seed: 4100 + i, pitch: 1.3, pan: i % 2 ? -0.3 : 0.3 });
  });
  I.whoosh(bus, c.wipe[0], c.wipe[1] - c.wipe[0] + 0.04, { gain: 0.42, f0: 300, f1: 5000, peak: 0.85, pan0: 0, pan1: 0, seed: 13 });

  // ---- build
  c.buildHead.forEach((t, i) => thump(t, 0.3 + i * 0.04));
  I.impact(bus, c.buildHead[2], { gain: 0.28, boom: 0.5, crack: 0.4, seed: 14 });
  c.buildParts.forEach((t, i) => I.pop(bus, t, { gain: 0.1, f0: 600 + i * 90, f1: 1000 + i * 110, dur: 0.05, pan: (i % 3 - 1) * 0.4 }));
  I.whoosh(bus, c.cursorMove[0], c.cursorMove[1] - c.cursorMove[0], { gain: 0.1, f0: 800, f1: 2500, peak: 0.4, pan0: 0.5, pan1: 0, seed: 15 });
  I.mouseClick(bus, c.click - 0.03, { gain: 0.55 });
  I.impact(bus, c.click, { gain: 0.6, boom: 1, crack: 0.8, seed: 16, len: 1.8 });

  // ---- end
  c.endHead.forEach((t, i) => thump(t, 0.3 + i * 0.05));
  I.whoosh(bus, c.urlIn - 0.05, 0.3, { gain: 0.16, f0: 400, f1: 2600, peak: 0.6, pan0: 0, pan1: 0, seed: 17 });
  T.typeUrl.forEach((t, i) => I.keyTick(bus, t, { gain: 0.3, seed: 5000 + i, pitch: 0.9 + hash01(i, 9) * 0.25 }));
  I.pop(bus, c.autocomplete, { gain: 0.1, f0: 1200, f1: 1600, dur: 0.04 });
  I.keyTick(bus, c.go - 0.01, { gain: 0.55, seed: 78, pitch: 0.65 });
  thump(c.go, 0.34);
  // success chime: rising major third + fifth
  [[0, 84], [0.07, 88], [0.14, 91]].forEach(([d, m]) => {
    I.bell(bus, c.loaded + d, m, { gain: 0.09, ratio: 2, index: 1, decay: 0.5 });
    I.bell(send, c.loaded + d, m, { gain: 0.06, ratio: 2, index: 1, decay: 0.5 });
  });

  const verb = freeverb(send, { room: 0.8, damp: 0.4 });
  verb.mixInto(bus, 0.8);
  return bus;
}
