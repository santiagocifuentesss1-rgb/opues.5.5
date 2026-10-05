// Voices specific to this piece (reggaeton kit, marimba, crowd). Same conventions as instruments.mjs.
import { SR, Osc, Biquad, noiseGen, panGains, mtof } from './dsp.mjs';
import { noise1 } from '../film/lib.js';

const idx = (t) => Math.round(t * SR);

// 808: sine with a fast pitch drop for punch, optional glide into the note, soft-clipped for phone speakers.
export function sub808(bus, t, note, dur, { gain = 1, from = null, glide = 0.06, drive = 2.2, release = 0.08 } = {}) {
  const f1 = mtof(note), f0 = from == null ? f1 : mtof(from);
  const o = new Osc(0);
  const lp = new Biquad('lp', 1400, 0.7);
  const L = Math.round((dur + release) * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const g = from == null ? 1 : Math.min(1, s / glide);
    const base = f0 + (f1 - f0) * (g * g * (3 - 2 * g));
    const f = base * (1 + 1.2 * Math.exp(-s / 0.012));
    const env = (s < 0.003 ? s / 0.003 : 1) * (s > dur ? Math.max(0, 1 - (s - dur) / release) : 1) * (0.75 + 0.25 * Math.exp(-s / 0.25));
    const y = lp.p(Math.tanh(o.sine(f) * drive) / Math.tanh(drive)) * env * gain;
    bus.add(i0 + n, y, y);
  }
}

// Tight reggaeton snare: short tonal body + crisp noise, a little clap smear.
export function rimSnare(bus, t, { gain = 1, seed = 1, pan = 0, tone = 240 } = {}) {
  const o = new Osc(0.25);
  const nz = noiseGen(seed);
  const bp = new Biquad('bp', 2600, 0.9), hp = new Biquad('hp', 700, 0.7);
  const [gl, gr] = panGains(pan);
  const L = Math.round(0.22 * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const body = o.sine(tone * (1 + 0.6 * Math.exp(-s * 70))) * Math.exp(-s / 0.03);
    let ce = 0;
    for (const off of [0, 0.007, 0.014]) if (s >= off) ce = Math.max(ce, Math.exp(-(s - off) / 0.005));
    ce = Math.max(ce, 0.6 * Math.exp(-s / 0.06));
    const y = (body * 0.55 + hp.p(bp.p(nz())) * ce * 1.6) * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

export function shaker(bus, t, { gain = 1, seed = 2, pan = 0.25, len = 0.05 } = {}) {
  const nz = noiseGen(seed);
  const bp = new Biquad('bp', 7800, 1.2);
  const [gl, gr] = panGains(pan);
  const L = Math.round(len * 2 * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const env = s < len * 0.35 ? s / (len * 0.35) : Math.exp(-(s - len * 0.35) / (len * 0.3));
    const y = bp.p(nz()) * env * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

// Timbal hit: two detuned partials + stick noise.
export function timbal(bus, t, { gain = 1, f = 520, seed = 3, pan = 0 } = {}) {
  const a = new Osc(0), b = new Osc(0.3);
  const nz = noiseGen(seed);
  const hp = new Biquad('hp', 3000, 0.7);
  const [gl, gr] = panGains(pan);
  const L = Math.round(0.35 * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const ring = (a.sine(f * (1 + 0.04 * Math.exp(-s * 40))) * 0.7 + b.sine(f * 2.76) * 0.25 * Math.exp(-s / 0.04)) * Math.exp(-s / 0.11);
    const y = (ring + hp.p(nz()) * Math.exp(-s / 0.004) * 0.8) * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

// Marimba-ish mallet: FM with a low index and fast decay, plus a woody click.
export function marimba(bus, t, note, { gain = 1, pan = 0, decay = 0.32 } = {}) {
  const f = mtof(note);
  let pc = 0, pm = 0;
  const [gl, gr] = panGains(pan);
  const L = Math.round(decay * 4 * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const ix = 1.6 * Math.exp(-s / 0.03);
    const v = Math.sin(2 * Math.PI * pc + Math.sin(2 * Math.PI * pm) * ix) + 0.25 * Math.sin(2 * Math.PI * pc * 4) * Math.exp(-s / 0.02);
    pc += f / SR; pm += (f * 3.99) / SR;
    const y = v * (s < 0.0015 ? s / 0.0015 : 1) * Math.exp(-s / decay) * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

// Glass shard: very short bright FM ping (used in clusters).
export function shard(bus, t, { gain = 1, f = 4200, pan = 0 } = {}) {
  let pc = 0, pm = 0;
  const [gl, gr] = panGains(pan);
  const L = Math.round(0.18 * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const v = Math.sin(2 * Math.PI * pc + Math.sin(2 * Math.PI * pm) * 2.5 * Math.exp(-s / 0.01));
    pc += f / SR; pm += (f * 1.41) / SR;
    const y = v * Math.exp(-s / 0.035) * (s < 0.0005 ? s / 0.0005 : 1) * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

// Stadium crowd: formant-filtered noise layers, each with its own slow random swell.
export function crowd(bus, t0, dur, { gain = 1, seed = 9, attack = 0.25, release = 1.2 } = {}) {
  const bands = [[320, 1.4], [620, 1.6], [1050, 1.8], [1800, 2.2], [2700, 2.6], [4200, 3]];
  const layers = bands.map(([f, q], k) => ({ nz: noiseGen(seed + k * 17), bpL: new Biquad('bp', f, q), bpR: new Biquad('bp', f * 1.03, q), g: 1 / (1 + k * 0.35), k }));
  const L = Math.round((dur + release) * SR);
  const i0 = idx(t0);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const env = (s < attack ? Math.pow(s / attack, 1.5) : 1) * (s > dur ? Math.max(0, 1 - (s - dur) / release) : 1);
    let l = 0, r = 0;
    for (const ly of layers) {
      const am = 0.6 + 0.4 * noise1(s * 3.1 + ly.k * 5.3, seed + ly.k);
      const x = ly.nz();
      l += ly.bpL.p(x) * ly.g * am;
      r += ly.bpR.p(ly.nz()) * ly.g * am;
    }
    bus.add(i0 + n, l * env * gain, r * env * gain);
  }
}
