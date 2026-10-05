// Vectorize the crest: green-coverage field -> marching squares (sub-pixel iso-line at 0.5)
// -> closed loops -> Douglas-Peucker. Each connected green region becomes its own <path>
// (with its holes, even-odd) so the film can build the crest piece by piece.
// Usage: node tools/trace.mjs assets/up-crest.png film/crest.json
import sharp from 'sharp';
import fs from 'node:fs';

// mode: 'green' (crest ink), 'alpha' (cutout silhouette), 'white' (print on the shirt, inside `box`)
export async function traceCrest(src, { maxH = 1400, tol = 0.9, mode = 'green', box = null, minArea = 30 } = {}) {
  let img = sharp(src).ensureAlpha();
  const meta = await img.metadata();
  if (meta.height > maxH) img = img.resize({ height: maxH, kernel: 'lanczos3' });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  // greenness in [0,1]: white -> 0, brand green -> 1 (soft, so the contour lands between pixels)
  const f = new Float32Array((w + 2) * (h + 2)); // 1 px empty border so every loop closes
  const W2 = w + 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      let v;
      if (mode === 'alpha') v = a / 255;
      else if (mode === 'white') v = box && (x < box[0] || y < box[1] || x > box[2] || y > box[3]) ? 0 : Math.min(1, Math.max(0, (Math.min(r, g, b) - 90) / (200 - 90))) * (a / 255);
      else v = Math.min(1, Math.max(0, ((g - r) - 20) / (130 - 20))) * Math.min(1, Math.max(0, (255 - r) / 120));
      f[(y + 1) * W2 + x + 1] = v;
    }
  // connected components of the binary mask (8-connectivity)
  const lab = new Int32Array(f.length).fill(-1);
  const comps = [];
  for (let i = 0; i < f.length; i++) {
    if (f[i] < 0.5 || lab[i] >= 0) continue;
    const id = comps.length, st = [i];
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    lab[i] = id;
    while (st.length) {
      const j = st.pop();
      n++;
      const x = j % W2, y = (j / W2) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const k = j + dy * W2 + dx;
          if (k >= 0 && k < f.length && lab[k] < 0 && f[k] >= 0.5) { lab[k] = id; st.push(k); }
        }
    }
    comps.push({ id, n, x0, y0, x1, y1 });
  }
  const out = [];
  for (const c of comps) {
    if (c.n < minArea) continue; // specks
    // field restricted to this component (dilated by one px so the AA ramp is kept)
    const g = (x, y) => {
      if (x < 0 || y < 0 || x >= W2 || y >= h + 2) return 0;
      const k = y * W2 + x;
      if (lab[k] === c.id) return f[k];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const kk = k + dy * W2 + dx; if (lab[kk] === c.id) return Math.min(f[k], 0.499); }
      return 0;
    };
    const segs = [];
    const lerpT = (a, b) => (0.5 - a) / (b - a);
    for (let y = c.y0 - 2; y <= c.y1 + 1; y++)
      for (let x = c.x0 - 2; x <= c.x1 + 1; x++) {
        const a = g(x, y), b = g(x + 1, y), cc = g(x + 1, y + 1), d = g(x, y + 1);
        const idx = (a >= 0.5 ? 8 : 0) | (b >= 0.5 ? 4 : 0) | (cc >= 0.5 ? 2 : 0) | (d >= 0.5 ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const T = [x + lerpT(a, b), y], R = [x + 1, y + lerpT(b, cc)], B = [x + lerpT(d, cc), y + 1], L = [x, y + lerpT(a, d)];
        const key = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
        const add = (p, q) => segs.push([p, q, key(p), key(q)]);
        switch (idx) {
          case 1: case 14: add(L, B); break;
          case 2: case 13: add(B, R); break;
          case 3: case 12: add(L, R); break;
          case 4: case 11: add(T, R); break;
          case 6: case 9: add(T, B); break;
          case 7: case 8: add(L, T); break;
          case 5: add(L, T); add(B, R); break;
          case 10: add(T, R); add(L, B); break;
        }
      }
    // chain segments into loops
    const adj = new Map();
    segs.forEach((s, i) => { for (const k of [s[2], s[3]]) { if (!adj.has(k)) adj.set(k, []); adj.get(k).push(i); } });
    const used = new Uint8Array(segs.length);
    const loops = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const pts = [segs[i][0], segs[i][1]];
      let endKey = segs[i][3];
      const startKey = segs[i][2];
      for (let guard = 0; guard < 1e6 && endKey !== startKey; guard++) {
        const nxt = (adj.get(endKey) || []).find((j) => !used[j]);
        if (nxt === undefined) break;
        used[nxt] = 1;
        const s = segs[nxt];
        if (s[2] === endKey) { pts.push(s[1]); endKey = s[3]; } else { pts.push(s[0]); endKey = s[2]; }
      }
      if (pts.length > 8) loops.push(dp(pts, tol));
    }
    const sx = 1, ox = -1; // undo the 1 px border
    const d = loops
      .map((L) => 'M' + L.map((p) => `${((p[0] + ox) * sx).toFixed(1)} ${((p[1] + ox) * sx).toFixed(1)}`).join('L') + 'Z')
      .join('');
    out.push({ d, bbox: [c.x0 - 1, c.y0 - 1, c.x1 - 1, c.y1 - 1], area: c.n });
  }
  return { width: w, height: h, parts: out };
}

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  // closed loop (first == last): split at the point farthest from the start, simplify both halves
  const [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1];
  if (Math.hypot(ex - sx, ey - sy) < 1e-6) {
    let far = 1, fd = -1;
    pts.forEach((p, i) => { const d = Math.hypot(p[0] - sx, p[1] - sy); if (d > fd) { fd = d; far = i; } });
    const a = dp(pts.slice(0, far + 1), tol), b = dp(pts.slice(far), tol);
    return a.concat(b.slice(1, -1));
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const dd = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (dd > best) { best = dd; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; st.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = process.argv[4] ? JSON.parse(process.argv[4]) : {};
  const r = await traceCrest(process.argv[2], opts);
  fs.writeFileSync(process.argv[3], JSON.stringify(r));
  console.log(`${r.parts.length} parts, ${r.width}x${r.height}`, r.parts.map((p) => `${p.bbox.join(',')} n=${p.area} len=${p.d.length}`).join('\n'));
}
