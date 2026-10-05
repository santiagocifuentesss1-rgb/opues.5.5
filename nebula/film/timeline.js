// Single source of truth for WHEN things happen (visuals + sound design), on the measured beat grid.
export const FILM = { fps: 60, duration: 20, bpm: 120 };

export const FORMATS = {
  v: { width: 1080, height: 1920 },
  s: { width: 1080, height: 1080 },
  h: { width: 1920, height: 1080 },
};

// Hook: the problem in five words.
export const HOOK = ['TUS', 'CLIENTES', 'ESCRIBEN.', 'NADIE', 'RESPONDE.'];

export function makeTimeline(grid) {
  const P = grid.period, O = grid.offset;
  const b = (x) => O + x * P;
  const cue = {
    // 1 hook (bars 0-1)
    hook: [b(0), b(0.5), b(1), b(2.5), b(3)],
    dots: [b(4), b(7.5)],
    hookOut: b(7.75),
    // 2 product assembles (bars 2-3), drop on b8
    drop: b(8),
    parts: { logo: b(8.5), badge: b(9), h1: b(9.5), h2: b(10), h3: b(10.5), sub: b(11.5), cta: b(12), cta2: b(12.5), tag: b(13.5), chat: b(14) },
    // 3 features, one bar each
    f1: { t0: b(16), move: [b(16.5), b(17.75)], click: b(18), t1: b(20) },
    f2: { t0: b(20), move: [b(20.5), b(21.75)], click: b(22), t1: b(24) },
    f3: { t0: b(24), move: [b(24.5), b(25.75)], click: b(26), t1: b(28) },
    // 4 metric
    metric: b(28), metricLock: b(29.5), metricSub: b(30),
    // 5 lockup + CTA
    end: b(32), wordmark: b(32.5), cta: b(33.5), ctaMove: [b(34), b(35.75)], ctaClick: b(36), url: b(37),
  };
  return { P, b, cue, grid };
}
