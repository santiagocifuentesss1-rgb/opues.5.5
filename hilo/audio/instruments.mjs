// Synth voices. Each function renders one event into a Stereo bus at time t (seconds).
import { SR, Osc, Biquad, adsr, noiseGen, panGains, mtof } from './dsp.mjs';

const idx = (t) => Math.round(t * SR);

export function kick(bus, t, { gain = 1, hi = 170, lo = 46, decay = 0.42, click = 0.5, seed = 1 } = {}) {
  const o = new Osc(0);
  const nz = noiseGen(seed);
  const hp = new Biquad('hp', 2500, 0.7);
  const len = Math.round((decay * 2.2) * SR);
  const i0 = idx(t);
  for (let n = 0; n < len; n++) {
    const s = n / SR;
    const f = lo + (hi - lo) * Math.exp(-s * 38);
    const env = s < 0.004 ? s / 0.004 : Math.exp(-(s - 0.004) / decay);
    let v = o.sine(f) * env;
    v = Math.tanh(v * 1.8) / Math.tanh(1.8);
    const c = hp.p(nz()) * Math.exp(-s / 0.0035) * click;
    const y = (v + c) * gain;
    bus.add(i0 + n, y, y);
  }
}

export function clap(bus, t, { gain = 1, seed = 2, pan = 0 } = {}) {
  const nz = noiseGen(seed);
  const bp = new Biquad('bp', 1350, 1.1);
  const hp = new Biquad('hp', 600, 0.7);
  const [gl, gr] = panGains(pan);
  const len = Math.round(0.32 * SR);
  const i0 = idx(t);
  for (let n = 0; n < len; n++) {
    const s = n / SR;
    let env = 0;
    for (const o of [0, 0.011, 0.022]) if (s >= o) env = Math.max(env, Math.exp(-(s - o) / 0.006));
    if (s >= 0.03) env = Math.max(env, 0.55 * Math.exp(-(s - 0.03) / 0.085));
    const y = hp.p(bp.p(nz())) * env * gain * 2.2;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

const HAT_F = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * 1.55);
export function hat(bus, t, { gain = 1, open = false, seed = 3, pan = 0.15 } = {}) {
  const oscs = HAT_F.map((_, k) => new Osc((k * 0.137) % 1));
  const nz = noiseGen(seed);
  const bp = new Biquad('bp', 9500, 0.9);
  const hp = new Biquad('hp', 7200, 0.7);
  const [gl, gr] = panGains(pan);
  const dec = open ? 0.19 : 0.028;
  const len = Math.round((dec * 5) * SR);
  const i0 = idx(t);
  for (let n = 0; n < len; n++) {
    const s = n / SR;
    let m = 0;
    for (let k = 0; k < 6; k++) m += oscs[k].square(HAT_F[k]);
    const env = Math.exp(-s / dec) * (s < 0.0008 ? s / 0.0008 : 1);
    const y = hp.p(bp.p(m * 0.12 + nz() * 0.6)) * env * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

export function snare(bus, t, { gain = 1, tone = 190, seed = 4, decay = 0.13, pan = 0 } = {}) {
  const o = new Osc(0.25);
  const nz = noiseGen(seed);
  const bp = new Biquad('bp', 3200, 0.8);
  const hp = new Biquad('hp', 900, 0.7);
  const [gl, gr] = panGains(pan);
  const len = Math.round(decay * 4 * SR);
  const i0 = idx(t);
  for (let n = 0; n < len; n++) {
    const s = n / SR;
    const body = o.sine(tone * (1 + 0.5 * Math.exp(-s * 60))) * Math.exp(-s / 0.045);
    const sn = hp.p(bp.p(nz())) * Math.exp(-s / decay) * 1.4;
    const y = (body * 0.6 + sn) * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

// Offbeat house bass: saw + sub, low-passed with a little envelope.
export function bass(bus, t, note, dur, { gain = 1, cutoff = 900 } = {}) {
  const f = mtof(note);
  const a = new Osc(0), b = new Osc(0.5), sub = new Osc(0);
  const lp = new Biquad('lp', cutoff, 0.9);
  const len = Math.round((dur + 0.05) * SR);
  const i0 = idx(t);
  for (let n = 0; n < len; n++) {
    const s = n / SR;
    if (n % 16 === 0) lp.set(cutoff * (0.45 + 1.4 * Math.exp(-s / 0.05)), 0.9);
    const env = adsr(s, dur, 0.003, 0.08, 0.75, 0.03);
    const v = lp.p(a.saw(f) * 0.6 + b.saw(f * 1.004) * 0.4) * 0.7 + sub.sine(f) * 0.75;
    const y = v * env * gain;
    bus.add(i0 + n, y, y);
  }
}

// Detuned 7-voice supersaw stab, stereo spread.
export function stab(bus, t, notes, dur, { gain = 1, cutoff = 3800, seed = 5, decayCut = 0.12 } = {}) {
  const voices = [];
  const det = [-0.11, -0.07, -0.035, 0, 0.035, 0.07, 0.11];
  const nz = noiseGen(seed);
  for (const m of notes)
    det.forEach((d, k) => voices.push({ f: mtof(m + d), o: new Osc((nz() + 1) / 2), pan: (k / 6) * 2 - 1 }));
  const lpL = new Biquad('lp', cutoff, 0.8), lpR = new Biquad('lp', cutoff, 0.8);
  const len = Math.round((dur + 0.12) * SR);
  const i0 = idx(t);
  const norm = 1 / Math.sqrt(voices.length);
  for (let n = 0; n < len; n++) {
    const s = n / SR;
    if (n % 16 === 0) {
      const c = cutoff * (0.32 + 0.9 * Math.exp(-s / decayCut));
      lpL.set(c, 0.8); lpR.set(c, 0.8);
    }
    let l = 0, r = 0;
    for (const v of voices) {
      const x = v.o.saw(v.f);
      const [gl, gr] = panGains(v.pan * 0.8);
      l += x * gl; r += x * gr;
    }
    const env = adsr(s, dur, 0.004, 0.15, 0.55, 0.1);
    bus.add(i0 + n, lpL.p(l) * norm * env * gain, lpR.p(r) * norm * env * gain);
  }
}

// Plucky arp voice.
export function pluck(bus, t, note, { gain = 1, cutoff = 2800, pan = 0, dur = 0.12 } = {}) {
  const f = mtof(note);
  const a = new Osc(0), b = new Osc(0.3);
  const lp = new Biquad('lp', cutoff, 1.2);
  const [gl, gr] = panGains(pan);
  const len = Math.round((dur + 0.25) * SR);
  const i0 = idx(t);
  for (let n = 0; n < len; n++) {
    const s = n / SR;
    if (n % 16 === 0) lp.set(300 + cutoff * Math.exp(-s / 0.07), 1.2);
    const env = adsr(s, dur, 0.002, 0.1, 0.35, 0.12);
    const y = lp.p(a.saw(f) * 0.6 + b.square(f * 2, 0.3) * 0.25) * env * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

// Glassy FM bell (lead / UI).
export function bell(bus, t, note, { gain = 1, ratio = 3.5, index = 2.2, decay = 0.6, pan = 0, freq } = {}) {
  const f = freq ?? mtof(note);
  let pc = 0, pm = 0;
  const [gl, gr] = panGains(pan);
  const len = Math.round(decay * 4 * SR);
  const i0 = idx(t);
  for (let n = 0; n < len; n++) {
    const s = n / SR;
    const ix = index * Math.exp(-s / (decay * 0.35));
    const m = Math.sin(2 * Math.PI * pm) * ix;
    const v = Math.sin(2 * Math.PI * pc + m);
    pc += f / SR; pm += (f * ratio) / SR;
    const env = (s < 0.002 ? s / 0.002 : 1) * Math.exp(-s / decay);
    const y = v * env * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

// Sustained pad (breakdown / outro).
export function pad(bus, t, notes, dur, { gain = 1, cutoff = 1200, attack = 0.25, release = 0.6, seed = 7 } = {}) {
  const nz = noiseGen(seed);
  const voices = [];
  for (const m of notes)
    for (const d of [-0.09, 0, 0.09]) voices.push({ f: mtof(m + d), o: new Osc((nz() + 1) / 2), pan: d * 8 });
  const lpL = new Biquad('lp', cutoff, 0.6), lpR = new Biquad('lp', cutoff, 0.6);
  const len = Math.round((dur + release) * SR);
  const i0 = idx(t);
  const norm = 1 / Math.sqrt(voices.length);
  for (let n = 0; n < len; n++) {
    const s = n / SR;
    let l = 0, r = 0;
    for (const v of voices) {
      const x = v.o.saw(v.f);
      const [gl, gr] = panGains(Math.max(-1, Math.min(1, v.pan)));
      l += x * gl; r += x * gr;
    }
    const env = adsr(s, dur, attack, 0.3, 0.85, release);
    bus.add(i0 + n, lpL.p(l) * norm * env * gain, lpR.p(r) * norm * env * gain);
  }
}

// ---- Sound design ------------------------------------------------------------------------

export function impact(bus, t, { gain = 1, seed = 11, boom = 1, crack = 1, len = 1.6 } = {}) {
  const o = new Osc(0);
  const nz = noiseGen(seed);
  const lp = new Biquad('lp', 5000, 0.7);
  const L = Math.round(len * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const f = 34 + 70 * Math.exp(-s * 9);
    const b = Math.tanh(o.sine(f) * 1.6) * Math.exp(-s / 0.55) * boom;
    if (n % 32 === 0) lp.set(400 + 7000 * Math.exp(-s / 0.08), 0.7);
    const c = lp.p(nz()) * Math.exp(-s / 0.22) * crack * 0.7;
    const y = (b + c) * gain;
    bus.add(i0 + n, y, y);
  }
}

export function riser(bus, t0, t1, { gain = 1, seed = 12, f0 = 300, f1 = 9000 } = {}) {
  const nz = noiseGen(seed);
  const bpL = new Biquad('bp', f0, 2.2), bpR = new Biquad('bp', f0, 2.2);
  const o = new Osc(0);
  const L = Math.round((t1 - t0) * SR);
  const i0 = idx(t0);
  for (let n = 0; n < L; n++) {
    const p = n / L;
    const fc = f0 * Math.pow(f1 / f0, p * p);
    if (n % 32 === 0) { bpL.set(fc, 2.2); bpR.set(fc * 1.07, 2.2); }
    const env = Math.pow(p, 1.8);
    const tone = o.saw(90 * Math.pow(8, p * p)) * 0.12 * env;
    const l = (bpL.p(nz()) * 1.6 + tone) * env * gain;
    const r = (bpR.p(nz()) * 1.6 + tone) * env * gain;
    bus.add(i0 + n, l, r);
  }
}

export function reverseCymbal(bus, t1, dur, { gain = 1, seed = 13 } = {}) {
  const nz = noiseGen(seed);
  const hp = new Biquad('hp', 5000, 0.7), hp2 = new Biquad('hp', 5000, 0.7);
  const L = Math.round(dur * SR);
  const i0 = idx(t1) - L;
  for (let n = 0; n < L; n++) {
    const p = n / L;
    const env = Math.pow(p, 3.2);
    bus.add(i0 + n, hp.p(nz()) * env * gain, hp2.p(nz()) * env * gain);
  }
}

export function crash(bus, t, { gain = 1, seed = 14 } = {}) {
  const nz = noiseGen(seed);
  const hpL = new Biquad('hp', 4200, 0.6), hpR = new Biquad('hp', 4200, 0.6);
  const L = Math.round(2.2 * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const env = Math.exp(-s / 0.55) * (s < 0.002 ? s / 0.002 : 1);
    bus.add(i0 + n, hpL.p(nz()) * env * gain, hpR.p(nz()) * env * gain);
  }
}

// Whoosh: band-passed noise sweeping, bell-shaped amplitude, panning across.
export function whoosh(bus, t, dur, { gain = 1, seed = 15, f0 = 400, f1 = 5000, pan0 = -0.7, pan1 = 0.7, peak = 0.6 } = {}) {
  const nz = noiseGen(seed);
  const bp = new Biquad('bp', f0, 1.4);
  const L = Math.round(dur * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const p = n / L;
    const fc = f0 * Math.pow(f1 / f0, Math.sin(Math.min(1, p / peak) * Math.PI * 0.5));
    if (n % 32 === 0) bp.set(fc, 1.4);
    const env = p < peak ? Math.pow(p / peak, 2) : Math.pow(1 - (p - peak) / (1 - peak), 1.6);
    const [gl, gr] = panGains(pan0 + (pan1 - pan0) * p);
    const y = bp.p(nz()) * env * gain * 2.4;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

export function keyTick(bus, t, { gain = 1, seed = 20, pan = 0, pitch = 1 } = {}) {
  const nz = noiseGen(seed);
  const hp = new Biquad('hp', 2600 * pitch, 0.9);
  const o = new Osc(0);
  const [gl, gr] = panGains(pan);
  const L = Math.round(0.03 * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const y = (hp.p(nz()) * Math.exp(-s / 0.0028) * 0.9 + o.sine(1900 * pitch) * Math.exp(-s / 0.006) * 0.35) * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

export function pop(bus, t, { gain = 1, f0 = 700, f1 = 1300, dur = 0.07, pan = 0 } = {}) {
  const o = new Osc(0);
  const [gl, gr] = panGains(pan);
  const L = Math.round(dur * 2 * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const f = f0 + (f1 - f0) * Math.min(1, s / dur);
    const y = o.sine(f) * Math.exp(-s / (dur * 0.45)) * (s < 0.001 ? s / 0.001 : 1) * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

export function buzz(bus, t, { gain = 1, pulses = 2 } = {}) {
  const a = new Osc(0), b = new Osc(0.2);
  const lp = new Biquad('lp', 1800, 0.8);
  const L = Math.round(0.36 * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const k = Math.floor(s / 0.12);
    const ss = s - k * 0.12;
    const env = k < pulses ? (ss < 0.004 ? ss / 0.004 : ss > 0.085 ? Math.max(0, 1 - (ss - 0.085) / 0.01) : 1) : 0;
    const y = lp.p(a.square(98) * 0.5 + b.square(103.8) * 0.5) * env * gain;
    bus.add(i0 + n, y, y);
  }
}

export function glitch(bus, t, { gain = 1, seed = 30, pan = 0 } = {}) {
  const nz = noiseGen(seed);
  const o = new Osc(0);
  const f = 300 + ((nz() + 1) / 2) * 2400;
  const hold = 4 + Math.floor(((nz() + 1) / 2) * 18);
  const [gl, gr] = panGains(pan);
  const L = Math.round(0.045 * SR);
  const i0 = idx(t);
  let held = 0;
  for (let n = 0; n < L; n++) {
    if (n % hold === 0) held = o.square(f) * 0.6 + nz() * 0.4;
    else o.square(f);
    const s = n / SR;
    const y = held * Math.exp(-s / 0.016) * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

export function flip(bus, t, { gain = 1, seed = 40, pitch = 1, pan = 0 } = {}) {
  const nz = noiseGen(seed);
  const o = new Osc(0);
  const bp = new Biquad('bp', 3500 * pitch, 2);
  const [gl, gr] = panGains(pan);
  const L = Math.round(0.06 * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const y = (o.sine(1450 * pitch) * Math.exp(-s / 0.012) * 0.7 + bp.p(nz()) * Math.exp(-s / 0.004)) * gain;
    bus.add(i0 + n, y * gl, y * gr);
  }
}

export function mouseClick(bus, t, { gain = 1, seed = 50 } = {}) {
  keyTick(bus, t, { gain: gain * 0.9, seed, pitch: 1.4 });
  keyTick(bus, t + 0.055, { gain: gain * 0.5, seed: seed + 1, pitch: 1.7 });
}

export function bloop(bus, t, { gain = 1 } = {}) {
  const o = new Osc(0);
  const L = Math.round(0.3 * SR);
  const i0 = idx(t);
  for (let n = 0; n < L; n++) {
    const s = n / SR;
    const f = 260 + 700 * (1 - Math.exp(-s / 0.03));
    const y = o.sine(f) * Math.exp(-s / 0.09) * (s < 0.002 ? s / 0.002 : 1) * gain;
    bus.add(i0 + n, y, y);
  }
}

// Rain bed: band-limited noise with seeded droplet ticks.
export function rain(bus, t0, t1, { gain = 1, seed = 60 } = {}) {
  const nzL = noiseGen(seed), nzR = noiseGen(seed + 1), r = noiseGen(seed + 2);
  const lpL = new Biquad('lp', 5200, 0.6), lpR = new Biquad('lp', 5200, 0.6);
  const hpL = new Biquad('hp', 900, 0.6), hpR = new Biquad('hp', 900, 0.6);
  const L = Math.round((t1 - t0) * SR);
  const i0 = idx(t0);
  for (let n = 0; n < L; n++) {
    const p = n / L;
    const env = Math.min(1, p / 0.08) * Math.min(1, (1 - p) / 0.15);
    const drop = r() > 0.9993 ? 3 : 1;
    bus.add(i0 + n, hpL.p(lpL.p(nzL())) * env * gain * drop, hpR.p(lpR.p(nzR())) * env * gain * drop);
  }
}

export { mtof };
