// Single source of truth for WHEN things happen. Imported by the film (visuals) and by
// audio/sfx.mjs (sound design), so every hit lands on the same measured beat.
import { mulberry32 } from './lib.js';

export const FILM = { width: 1080, height: 1920, fps: 60, duration: 15, bpm: 128 };

export const COPY = {
  query: 'panadería cerca de mí',
  urlTyped: 'tunego',
  urlAuto: 'cio.com',
  words: ['PANADERÍA', 'TALLER', 'CLÍNICA', 'CAFÉ', 'TIENDA', 'GIMNASIO', 'PELUQUERÍA', 'RESTAURANTE'],
};

export function makeTimeline(grid) {
  const P = grid.period;
  const O = grid.offset;
  const b = (x) => O + x * P; // time of (fractional) beat x on the measured grid

  // Scenes: one per bar (4 beats). Bar 7 runs to the end of the film.
  const scenes = [
    { id: 'hook', t0: b(0), t1: b(4) },
    { id: 'results', t0: b(4), t1: b(8) },
    { id: 'void', t0: b(8), t1: b(12) },
    { id: 'open', t0: b(12), t1: b(16) },
    { id: 'map', t0: b(16), t1: b(20) },
    { id: 'roll', t0: b(20), t1: b(24) },
    { id: 'build', t0: b(24), t1: b(28) },
    { id: 'end', t0: b(28), t1: FILM.duration },
  ];

  // Keystrokes for the opening search query (seeded human jitter, never Math.random).
  const r = mulberry32(77);
  const typeQuery = [];
  {
    let t = b(0.32);
    for (const ch of COPY.query) {
      typeQuery.push(t);
      t += 0.052 + r() * 0.022 + (ch === ' ' ? 0.035 : 0);
    }
  }
  // URL typing at the end: a few keys, then browser autocomplete, then Enter on the beat.
  const typeUrl = [];
  {
    const t0 = b(28.8), t1 = b(29.55);
    const n = COPY.urlTyped.length;
    for (let i = 0; i < n; i++) typeUrl.push(t0 + ((t1 - t0) * i) / (n - 1) + (r() - 0.5) * 0.012);
  }

  const cue = {
    // hook
    hookWords: [b(0), b(0.5), b(1), b(1.5)],
    enter: b(4) - 0.0,
    // results
    cards: [b(4.25), b(4.5), b(4.75)],
    youCard: b(6),
    resultsHead: [b(5), b(5.5)],
    zoomVoid: [b(7.25), b(8)],
    // void
    voidLines: [b(8), b(9)],
    deleteStart: b(10.5),
    deleteStep: 0.16 * P,
    riser: [b(8), b(12)],
    // open 24/7
    drop: b(12),
    openWord: b(13),
    notifs: [b(14), b(14.5), b(15)],
    whip: [b(15.6), b(16.35)],
    // map
    tilt: [b(16), b(17)],
    route: [b(16.25), b(17)],
    pin: b(17),
    sheet: b(17.25),
    sheetHead: b(17.5),
    sheetRow: b(18),
    sheetBtns: b(18.25),
    pinZoom: [b(19.5), b(20)],
    // roll
    wordTimes: COPY.words.map((_, i) => b(20 + i * 0.5)),
    wipe: [b(23.6), b(24)],
    // build
    buildHead: [b(24), b(25), b(26)],
    buildParts: [b(24.5), b(24.75), b(25), b(25.25), b(25.5), b(25.75), b(26), b(26.25), b(26.5)],
    cursorMove: [b(26.6), b(27.6)],
    click: b(28),
    // end
    endHead: [b(28.18), b(28.5)],
    urlIn: b(28.6),
    autocomplete: b(29.6),
    go: b(30),
    loaded: b(31),
    qBounce: b(31),
  };

  return { P, b, scenes, typeQuery, typeUrl, cue, grid };
}
