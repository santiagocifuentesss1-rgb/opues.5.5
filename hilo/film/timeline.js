// Single source of truth for WHEN things happen (visuals + sound design), on the measured beat grid.
// 128 BPM, 8 bars x 4 beats = 32 beats = 15.0 s.
export const FILM = { fps: 60, duration: 15, bpm: 128, width: 1080, height: 1920 };

// Higgsfield footage plates (Seedance 2.5 image-to-video from GPT Image 2.5 keyframes), as image sequences.
export const PLATES = {
  night: { dir: 'media/night', fps: 24 }, // phone on a nightstand at 03:12
  shop: { dir: 'media/shop', fps: 24 }, // the bakery, closed, rain
  owner: { dir: 'media/owner', fps: 24 }, // the owner at sunrise
};

export function makeTimeline(grid) {
  const P = grid.period, O = grid.offset;
  const b = (x) => O + x * P;
  const cue = {
    // 1 hook: 03:12, the customer writes (bar 0)
    clock: b(0), hook1: b(1), hook2: b(1.5), hook3: b(2),
    notifs: [b(2), b(2.5), b(3), b(3.5)],
    // 2 problem: nobody answers (bar 1)
    pile: [b(4), b(7.25)], q1: b(5), q2: b(5.5), q3: b(6),
    thread: [b(7.25), b(8)],
    // 3 drop: TU AGENTE + the chat (bars 2-3)
    drop: b(8), agentWord: b(8), chatIn: b(8.75),
    c1: b(9), dots: b(9.5), a1: b(10), stamp: b(10.25), card: b(11),
    verbs: [b(12), b(13), b(14), b(15)], // VENDE, COBRA, AGENDA, ESCUCHA
    tap: b(12), c2: b(12.25), pay: b(13), paid: b(13.5), slots: b(14), pick: b(14.5), voice: b(15), voiceTxt: b(15.5),
    // 4 scale: the chat becomes one of thousands (bar 4)
    zoom: [b(16), b(18)], one: b(16.5), many: b(18), collapse: [b(19.25), b(20)],
    // 5 night: while your shop sleeps, orders land (bar 5)
    night: b(20), nightWords: [b(20.5), b(21)], orders: [b(21), b(21.75), b(22.5), b(23.25)],
    // 6 morning: you open with 37 orders (bar 6)
    morning: b(24), open1: b(24.5), count: [b(25), b(26)], countHit: b(26), underline: b(26.5),
    // 7 lockup (bar 7)
    end: b(28), bubble: [b(28), b(29.25)], wordmark: b(29.25), tag: b(30), cta: b(30.5), ctaTap: b(31.25),
  };
  // windows that move fast enough to need a denser shutter (render.mjs)
  const fastest = [[cue.thread[0], cue.drop + 0.35], [cue.zoom[0] - 0.05, cue.zoom[1] + 0.2], [cue.collapse[0], cue.night + 0.2], [cue.morning - 0.12, cue.morning + 0.2], [cue.end - 0.1, cue.end + 0.4]];
  const fast = [
    [-0.1, 0.5], ...cue.notifs.map((t) => [t - 0.02, t + 0.3]), [cue.pile[0], cue.pile[1]], [cue.q1, cue.q3 + 0.3],
    [cue.chatIn, cue.c1 + 0.3], [cue.a1, cue.a1 + 0.3], [cue.card, cue.card + 0.35], ...cue.verbs.map((t) => [t - 0.03, t + 0.3]),
    [cue.nightWords[0], cue.nightWords[1] + 0.3], ...cue.orders.map((t) => [t - 0.02, t + 0.3]), [cue.count[0], cue.countHit + 0.35],
    [cue.wordmark, cue.wordmark + 0.4], [cue.tag, cue.cta + 0.35], [cue.ctaTap, cue.ctaTap + 0.3],
  ];
  return { P, b, cue, grid, fastest, fast };
}
