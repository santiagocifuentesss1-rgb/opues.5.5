// Single source of truth for WHEN things happen (visuals + sound design), on the measured beat grid.
// 96 BPM, 8 bars of 4 = 32 beats = exactly 20.0 s.
export const FILM = { fps: 60, duration: 20, bpm: 96 };

export const FORMATS = {
  v: { width: 1080, height: 1920 },
  h: { width: 1920, height: 1080 },
};

export function makeTimeline(grid) {
  const P = grid.period, O = grid.offset;
  const b = (x) => O + x * P;
  const cue = {
    // bar 0 · hook: NUEVA PIEL.
    nueva: b(0), macro: [b(1), b(1.5), b(3), b(3.5)], piel: b(2), hookOut: b(3.6),
    // bar 1 · NEGRO. NEÓN. NACIONAL. then the shards gather
    words: [b(4), b(5), b(6)], gather: [b(6.5), b(8)],
    // bar 2 · drop: the kit lands, outline traces, callouts
    drop: b(8), trace: [b(8), b(9)], call: [b(9), b(10), b(11)],
    // bar 3 · LA 23 YA TIENE DUEÑO. + the turn
    q: [b(12), b(12.5), b(13)], turn: [b(14), b(16)],
    // bar 4 · back reveal
    reveal: b(16), num: [b(16), b(17.5)], scan: b(17), push: [b(18), b(20)],
    // bar 5 · JAMES RODRÍGUEZ
    james: b(20), rodriguez: b(22), nameOut: b(23.75),
    // bar 6 · ES VERDOLAGA. + crest builds
    es: b(24), verdolaga: b(24.5), crest: [b(25), b(25.5), b(26), b(26.5), b(27)],
    // bar 7 · lockup
    lock: b(28), club: b(28.5), welcome: b(29.5), end: b(32),
  };
  return { P, b, cue, grid };
}
