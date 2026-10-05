// Measure the beat grid from audio: onset detection on the drum stem, then fit a tempo/phase grid.
import { SR, Biquad } from './dsp.mjs';

export function detectOnsets(st) {
  const hop = Math.round(0.001 * SR); // 1 ms frames
  const W = Math.round(0.02 * SR); // causal 20 ms RMS window: smooth over the kick's sine ripple
  const lp = new Biquad('lp', 160, 0.7);
  const hpf = new Biquad('hp', 1500, 0.7);
  const sq = new Float64Array(st.n + 1);
  const hpx = new Float32Array(st.n);
  for (let i = 0; i < st.n; i++) {
    const m = (st.L[i] + st.R[i]) * 0.5;
    const x = lp.p(m);
    sq[i + 1] = sq[i] + x * x;
    hpx[i] = hpf.p(m);
  }
  const nF = Math.floor(st.n / hop);
  const lowE = new Float32Array(nF);
  for (let f = 0; f < nF; f++) {
    const e = f * hop, s = Math.max(0, e - W);
    lowE[f] = Math.sqrt((sq[e] - sq[s]) / W);
  }
  const flux = new Float32Array(nF);
  for (let f = 1; f < nF; f++) flux[f] = Math.max(0, lowE[f] - lowE[f - 1]);
  let mx = 0;
  for (const v of flux) mx = Math.max(mx, v);
  const onsets = [];
  const thr = mx * 0.2;
  const refr = 120; // ms
  let last = -1e9;
  for (let f = 2; f < nF - 2; f++) {
    if (flux[f] > thr && flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1] && f - last > refr) {
      // start of the rise = the onset (causal window), then snap to the click transient
      let s = f;
      while (s > 0 && flux[s - 1] > flux[f] * 0.12 && f - s < 25) s--;
      onsets.push({ t: refine(hpx, (s * hop) / SR), strength: flux[f] / mx });
      last = f;
    }
  }
  return onsets;
}

// Sharpest rise of high-band energy (0.5 ms blocks) within +-4 ms.
function refine(x, t) {
  const blk = Math.round(0.0005 * SR);
  const a = Math.max(1, Math.round(((t - 0.004) * SR) / blk));
  const b = Math.round(((t + 0.004) * SR) / blk);
  const e = [];
  for (let k = a - 1; k <= b + 1; k++) {
    let acc = 0;
    for (let i = k * blk; i < (k + 1) * blk && i < x.length; i++) acc += x[i] * x[i];
    e.push(Math.sqrt(acc / blk));
  }
  let best = 0, bk = Math.round((t * SR) / blk);
  for (let j = 1; j < e.length; j++) {
    const d = e[j] - e[j - 1];
    if (d > best) { best = d; bk = a - 1 + j; }
  }
  return (bk * blk) / SR;
}

export function fitGrid(onsets, { minBpm = 90, maxBpm = 170, duration = 15 } = {}) {
  // Score candidate periods by how well onsets fall on a grid (phase-free comb).
  let best = { score: -1 };
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.01) {
    const p = 60 / bpm;
    let cs = 0, sn = 0;
    for (const o of onsets) {
      const a = (2 * Math.PI * o.t) / p;
      cs += Math.cos(a) * o.strength;
      sn += Math.sin(a) * o.strength;
    }
    const score = Math.hypot(cs, sn);
    if (score > best.score) best = { score, bpm, p, phase: Math.atan2(sn, cs) };
  }
  // Least-squares refine on onsets that sit near the grid.
  let p = best.p;
  let off = ((best.phase / (2 * Math.PI)) * p + p) % p;
  for (let it = 0; it < 4; it++) {
    const pts = [];
    for (const o of onsets) {
      const k = Math.round((o.t - off) / p);
      if (Math.abs(o.t - (off + k * p)) < p * 0.12) pts.push([k, o.t]);
    }
    const n = pts.length;
    const sk = pts.reduce((s, q) => s + q[0], 0), st = pts.reduce((s, q) => s + q[1], 0);
    const skk = pts.reduce((s, q) => s + q[0] * q[0], 0), skt = pts.reduce((s, q) => s + q[0] * q[1], 0);
    p = (n * skt - sk * st) / (n * skk - sk * sk);
    off = (st - p * sk) / n;
  }
  off = ((off % p) + p) % p; // first beat at/near zero
  if (off > 0.75 * p) off -= p;
  const beats = [];
  for (let k = 0; off + k * p <= duration + 1e-6; k++) beats.push(+(off + k * p).toFixed(5));
  const resid = onsets
    .map((o) => o.t - (off + Math.round((o.t - off) / p) * p))
    .filter((d) => Math.abs(d) < p * 0.12);
  const rms = Math.sqrt(resid.reduce((s, d) => s + d * d, 0) / Math.max(1, resid.length));
  return { bpm: +(60 / p).toFixed(4), period: +p.toFixed(6), offset: +off.toFixed(5), beats, residualMs: +(rms * 1000).toFixed(2) };
}
