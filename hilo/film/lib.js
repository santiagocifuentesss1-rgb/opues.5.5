// Shared, dependency-free helpers. Imported by the film (browser) and the audio build (node).

// Seeded PRNG. The only source of randomness anywhere in this project.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stateless hash noise: same (i, seed) always gives the same value in [0,1).
export function hash01(i, seed = 0) {
  return mulberry32((Math.imul(i | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b)) >>> 0)();
}

// Smooth 1D value noise in [-1,1], pure function of x.
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash01(i, seed) * 2 - 1, b = hash01(i + 1, seed) * 2 - 1;
  return a + (b - a) * u;
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, p) => a + (b - a) * p;
export const prog = (t, t0, dur) => clamp((t - t0) / dur);
export const inv = (a, b, x) => clamp((x - a) / (b - a));

export const ease = {
  linear: (p) => p,
  inQuad: (p) => p * p,
  outQuad: (p) => 1 - (1 - p) * (1 - p),
  inCubic: (p) => p * p * p,
  outCubic: (p) => 1 - Math.pow(1 - p, 3),
  inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  inQuart: (p) => p * p * p * p,
  outQuart: (p) => 1 - Math.pow(1 - p, 4),
  inOutQuart: (p) => (p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2),
  outQuint: (p) => 1 - Math.pow(1 - p, 5),
  inExpo: (p) => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10)),
  outExpo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  inOutExpo: (p) =>
    p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2,
  outBack: (p, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2),
  inBack: (p, s = 1.70158) => (s + 1) * p * p * p - s * p * p,
};

// Damped spring from 0 -> 1, pure function of elapsed seconds.
export function spring(dt, freq = 4, damp = 0.45) {
  if (dt <= 0) return 0;
  const w = 2 * Math.PI * freq;
  const z = damp;
  if (z >= 1) return 1 - Math.exp(-w * dt) * (1 + w * dt);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * dt) * (Math.cos(wd * dt) + ((z * w) / wd) * Math.sin(wd * dt));
}

// Decaying impulse 1 -> 0 (for shakes, flashes in audio etc.)
export const decay = (dt, k = 10) => (dt < 0 ? 0 : Math.exp(-k * dt));
