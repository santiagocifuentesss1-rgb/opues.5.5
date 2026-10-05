// Tiny offline DSP kit. Everything is sample-accurate and deterministic (seeded noise only).
import { mulberry32 } from '../film/lib.js';

export const SR = 48000;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = (db) => Math.pow(10, db / 20);

export class Stereo {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
  }
  add(i, l, r) {
    if (i >= 0 && i < this.n) {
      this.L[i] += l;
      this.R[i] += r;
    }
  }
  mixInto(dst, gain = 1) {
    for (let i = 0; i < Math.min(this.n, dst.n); i++) {
      dst.L[i] += this.L[i] * gain;
      dst.R[i] += this.R[i] * gain;
    }
  }
}

// Equal-power pan, p in [-1, 1].
export function panGains(p) {
  const a = ((p + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

export function noiseGen(seed) {
  const r = mulberry32(seed);
  return () => r() * 2 - 1;
}

// RBJ biquad, coefficients can be changed while running.
export class Biquad {
  constructor(type = 'lp', f = 1000, q = 0.707, gainDb = 0) {
    this.type = type;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(f, q, gainDb);
  }
  set(f, q = this.q, gainDb = 0) {
    this.q = q;
    f = Math.min(Math.max(f, 10), SR * 0.45);
    const w = (2 * Math.PI * f) / SR;
    const cs = Math.cos(w), sn = Math.sin(w);
    const alpha = sn / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (this.type) {
      case 'lp': b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'hp': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'peak': b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A; break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - (A - 1) * cs + s); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s);
        a0 = (A + 1) + (A - 1) * cs + s; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s; break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s);
        a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; break;
      }
      default: throw new Error('biquad type ' + this.type);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// Band-limited oscillators with explicit phase state.
export class Osc {
  constructor(phase = 0) { this.ph = phase; }
  saw(f) {
    const dt = f / SR;
    const v = 2 * this.ph - 1 - polyblep(this.ph, dt);
    this.ph += dt; if (this.ph >= 1) this.ph -= 1;
    return v;
  }
  square(f, pw = 0.5) {
    const dt = f / SR;
    let v = this.ph < pw ? 1 : -1;
    v += polyblep(this.ph, dt);
    v -= polyblep((this.ph - pw + 1) % 1, dt);
    this.ph += dt; if (this.ph >= 1) this.ph -= 1;
    return v;
  }
  sine(f) {
    const v = Math.sin(2 * Math.PI * this.ph);
    this.ph += f / SR; if (this.ph >= 1) this.ph -= 1;
    return v;
  }
  tri(f) {
    const v = 1 - 4 * Math.abs(this.ph - 0.5);
    this.ph += f / SR; if (this.ph >= 1) this.ph -= 1;
    return v;
  }
}

// Linear-attack / exponential-ish decay envelope evaluated at time since note-on.
export function adsr(t, dur, a, d, s, r) {
  if (t < 0) return 0;
  let v;
  if (t < a) v = t / a;
  else if (t < a + d) v = 1 - (1 - s) * ((t - a) / d);
  else v = s;
  if (t > dur) {
    const rt = (t - dur) / r;
    if (rt >= 1) return 0;
    const atRelease = dur < a ? dur / a : dur < a + d ? 1 - (1 - s) * ((dur - a) / d) : s;
    v = atRelease * (1 - rt) * (1 - rt);
  }
  return v;
}

// Freeverb (Jezar) — stereo, deterministic.
export function freeverb(input, { room = 0.82, damp = 0.35, wet = 1, width = 1 } = {}) {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => Math.round(n * scale));
  const aps = [556, 441, 341, 225].map((n) => Math.round(n * scale));
  const spread = Math.round(23 * scale);
  const fb = room * 0.28 + 0.7;
  const dmp = damp * 0.4;
  const mk = (len) => ({ buf: new Float32Array(len), i: 0, store: 0 });
  const cL = combs.map(mk), cR = combs.map((n) => mk(n + spread));
  const aL = aps.map(mk), aR = aps.map((n) => mk(n + spread));
  const out = new Stereo(input.n / SR);
  const comb = (c, x) => {
    const y = c.buf[c.i];
    c.store = y * (1 - dmp) + c.store * dmp;
    c.buf[c.i] = x + c.store * fb;
    if (++c.i >= c.buf.length) c.i = 0;
    return y;
  };
  const ap = (c, x) => {
    const b = c.buf[c.i];
    const y = -x + b;
    c.buf[c.i] = x + b * 0.5;
    if (++c.i >= c.buf.length) c.i = 0;
    return y;
  };
  const w1 = wet * (width / 2 + 0.5), w2 = wet * ((1 - width) / 2);
  for (let n = 0; n < input.n; n++) {
    const x = (input.L[n] + input.R[n]) * 0.015;
    let l = 0, r = 0;
    for (let k = 0; k < 8; k++) { l += comb(cL[k], x); r += comb(cR[k], x); }
    for (let k = 0; k < 4; k++) { l = ap(aL[k], l); r = ap(aR[k], r); }
    out.L[n] = l * w1 + r * w2;
    out.R[n] = r * w1 + l * w2;
  }
  return out;
}

// Tempo-synced stereo delay (ping-pong).
export function pingpong(input, { time = 0.234, fb = 0.35, lp = 4000, wet = 0.5 } = {}) {
  const d = Math.round(time * SR);
  const out = new Stereo(input.n / SR);
  const bl = new Float32Array(d), br = new Float32Array(d);
  const fl = new Biquad('lp', lp), fr = new Biquad('lp', lp);
  let i = 0;
  for (let n = 0; n < input.n; n++) {
    const yl = bl[i], yr = br[i];
    bl[i] = fl.p(input.L[n] + input.R[n]) * 0.5 + yr * fb;
    br[i] = fr.p(yl * fb);
    out.L[n] = yl * wet;
    out.R[n] = yr * wet;
    if (++i >= d) i = 0;
  }
  return out;
}

// ---- Loudness (ITU-R BS.1770-4) --------------------------------------------------------
export function integratedLUFS(L, R) {
  const kw = (x) => {
    const shelf = new Biquad('highshelf', 1681.97, 0.7072, 3.9998);
    const hp = new Biquad('hp', 38.13, 0.5003);
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = hp.p(shelf.p(x[i]));
    return y;
  };
  const a = kw(L), b = kw(R);
  const block = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const ms = [];
  for (let s = 0; s + block <= a.length; s += hop) {
    let acc = 0;
    for (let i = s; i < s + block; i++) acc += a[i] * a[i] + b[i] * b[i];
    ms.push(acc / block);
  }
  const lk = (m) => -0.691 + 10 * Math.log10(m + 1e-20);
  const abs = ms.filter((m) => lk(m) > -70);
  const mean = (arr) => arr.reduce((p, c) => p + c, 0) / Math.max(1, arr.length);
  const rel = lk(mean(abs)) - 10;
  const gated = abs.filter((m) => lk(m) > rel);
  return lk(mean(gated));
}

// 4x oversampled true-peak estimate (windowed-sinc interpolation).
export function truePeak(L, R) {
  const taps = 12;
  const kernel = [];
  for (let ph = 1; ph < 4; ph++) {
    const k = [];
    for (let j = -taps; j <= taps; j++) {
      const x = j - ph / 4;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const win = 0.5 + 0.5 * Math.cos((Math.PI * x) / (taps + 1));
      k.push(sinc * win);
    }
    kernel.push(k);
  }
  let peak = 0;
  for (const ch of [L, R]) {
    for (let i = taps; i < ch.length - taps; i++) {
      const v = Math.abs(ch[i]);
      if (v > peak) peak = v;
      if (v < 0.3) continue; // inter-sample overs only matter near the top
      for (const k of kernel) {
        let acc = 0;
        for (let j = -taps; j <= taps; j++) acc += ch[i + j] * k[j + taps];
        if (Math.abs(acc) > peak) peak = Math.abs(acc);
      }
    }
  }
  return 20 * Math.log10(peak + 1e-12);
}

// Look-ahead peak limiter: future-min gain curve, smoothed attack/release, hard safety at the end.
export function limit(st, ceilingDb = -1.5, lookMs = 2.5, releaseMs = 70) {
  const ceil = dbToGain(ceilingDb);
  const look = Math.max(1, Math.round((lookMs / 1000) * SR));
  const n = st.n;
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(st.L[i]), Math.abs(st.R[i]));
    need[i] = p > ceil ? ceil / p : 1;
  }
  // sliding-window minimum over [i, i + look] (monotonic deque)
  const gmin = new Float32Array(n);
  const dq = new Int32Array(n);
  let h = 0, tl = 0;
  for (let j = 0; j < n + look; j++) {
    if (j < n) {
      while (tl > h && need[dq[tl - 1]] >= need[j]) tl--;
      dq[tl++] = j;
    }
    const i = j - look;
    if (i >= 0) {
      while (dq[h] < i) h++;
      gmin[i] = need[dq[h]];
    }
  }
  const att = Math.exp(-1 / (look / 3));
  const rel = Math.exp(-1 / ((releaseMs / 1000) * SR));
  let g = 1;
  for (let i = 0; i < n; i++) {
    const target = gmin[i];
    g = target < g ? target + (g - target) * att : target + (g - target) * rel;
    const gg = Math.min(g, need[i]);
    st.L[i] *= gg;
    st.R[i] *= gg;
  }
}

export function writeWav(path, st, fs) {
  const n = st.n;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  // TPDF dither, seeded
  const r = mulberry32(1234);
  for (let i = 0; i < n; i++) {
    const d = (r() - r()) / 32768;
    const l = Math.max(-1, Math.min(1, st.L[i] + d));
    const rr = Math.max(-1, Math.min(1, st.R[i] + d));
    buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(rr * 32767), 46 + i * 4);
  }
  fs.writeFileSync(path, buf);
}
