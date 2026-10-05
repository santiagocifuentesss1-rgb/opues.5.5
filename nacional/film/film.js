// Atlético Nacional — "La 23 ya tiene dueño". 20 s, 1080x1920, 96 BPM.
// Contract: window.seek(t) paints frame t. No CSS transitions, timers or frame-to-frame state.
// Brand pixels are the supplied shirt photos (img/front.png, img/back.png); crest, silhouette, the
// "23" numerals and JAMES are vectors traced from those same images (tools/trace.mjs).
// Higgsfield plates (plates/manifest.json) are optional layers: the turn and the stadium.
import { makeTimeline, FILM, FORMATS } from './timeline.js';
import { clamp, lerp, prog, ease, spring, noise1, hash01, mulberry32 } from './lib.js';

const FMT = new URLSearchParams(location.search).get('fmt') || 'v';
const { width: W, height: H } = FORMATS[FMT];
const M = 72, MW = W - 2 * M;
const C = { ink: '#070908', neon: '#2BFA25', white: '#F4F6F5', crest: '#00953B', shard: ['#161b1d', '#1d2326', '#252c2f'], dim: '#0f5a0b' };
const stage = document.getElementById('stage');
stage.style.width = W + 'px';
stage.style.height = H + 'px';
let T, b, Q, PL = {};

// ------------------------------------------------------------------------------------------ geometry
// Shirt placement (shared with tools/keyframes.mjs, so the Higgsfield turn plate registers 1:1).
const FRONT = { x: 84, y: 416, k: 2.52, w: 362, h: 462 }; // cutout px -> frame px
const BACK = { x: 75, y: 424, k: 2.52 * 1.03, w: 343, h: 444 };
const fpt = (x, y) => [FRONT.x + x * FRONT.k, FRONT.y + y * FRONT.k];
const bpt = (x, y) => [BACK.x + x * BACK.k, BACK.y + y * BACK.k];
const SPOT = { crest: fpt(236, 124), collar: fpt(182, 52), cuffL: fpt(40, 184), cuffR: fpt(326, 184), name: bpt(171, 136), num: bpt(178, 248), gap: bpt(183.1, 262) };
const PIVOT = [540, 1000];

// ------------------------------------------------------------------------------------------ helpers
const px = (v) => `${v}px`;
function el(tag, parent, cls, style = {}) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  Object.assign(n.style, style);
  if (parent) parent.appendChild(n);
  return n;
}
const NS = 'http://www.w3.org/2000/svg';
function sv(tag, parent, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function svgBox(parent, w = W, h = H) {
  const s = sv('svg', parent, { width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  s.style.cssText = 'position:absolute;left:0;top:0;overflow:visible';
  return s;
}
function tf(n, x = 0, y = 0, s = 1, r = 0, sy) {
  n.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg) scale(${s.toFixed(4)},${(sy ?? s).toFixed(4)})`;
}
const vis = (n, on) => { n.style.visibility = on ? 'inherit' : 'hidden'; };
const disp = (n, on) => { n.style.display = on ? 'block' : 'none'; };
const between = (t, a, z) => t >= a && t < z;
const fvs = (wdth, wght) => `'wdth' ${wdth.toFixed(2)}, 'wght' ${wght}`;
const kick = (t, t0, f = 3.2, d = 0.42) => (t < t0 ? 0 : spring(t - t0, f, d)); // 0 -> 1 with overshoot

let meas;
function measure(str, size, wdth = 100, wght = 900, ls = -0.01, cls = 'disp') {
  meas.className = cls;
  meas.style.fontSize = px(size);
  meas.style.fontVariationSettings = fvs(wdth, wght);
  meas.style.letterSpacing = `${ls}em`;
  meas.textContent = str;
  return meas.offsetWidth;
}
const fitSize = (str, maxW, wdth = 100, wght = 900, ls = -0.01) => Math.floor((100 * maxW) / measure(str, 100, wdth, wght, ls));

// Display line. Caps sit in a box of height `size`; `mask` clips to that box (for rises).
class Line {
  constructor(parent, str, { size, wdth = 100, wght = 900, color = C.white, ls = -0.01, mask = false, cls = 'disp' }) {
    Object.assign(this, { str, size, wdth, wght, ls, color });
    this.pad = size * 0.26; // accent room above the caps
    this.wrap = el('div', parent, 'abs', { height: px(size * 0.86 + this.pad), overflow: mask ? 'hidden' : 'visible', transformOrigin: '50% 50%' });
    this.inner = el('div', this.wrap, cls, { position: 'absolute', left: '0', top: px(this.pad - size * 0.075), fontSize: px(size), fontVariationSettings: fvs(wdth, wght), letterSpacing: `${ls}em`, color, transformOrigin: '0 50%' });
    this.inner.textContent = str;
    this.w = this.inner.offsetWidth;
    this.h = size * 0.86;
    this.wrap.style.width = px(this.w + size * 0.1);
  }
  setWdth(v) {
    this.inner.style.fontVariationSettings = fvs(v, this.wght);
    return this.inner.offsetWidth;
  }
  html(h) { this.inner.innerHTML = h; this.w = this.inner.offsetWidth; this.wrap.style.width = px(this.w + this.size * 0.1); }
}
// Width-axis slam: lands on `wdth` from 125 with a spring, centred on cx (or left-aligned at x).
function slam(L, t, t0, { cx = null, x = M, y, from = 125, f = 3.4, d = 0.5, drop = 0 } = {}) {
  const on = t >= t0;
  vis(L.wrap, on);
  if (!on) return 0;
  const p = spring(t - t0, f, d);
  const w = L.setWdth(clamp(lerp(from, L.wdth, p), 62, 125));
  const xx = cx == null ? x : cx - w / 2;
  tf(L.wrap, xx, y - L.pad - (1 - Math.min(1, p)) * drop);
  L.wrap.style.width = px(w + L.size * 0.1);
  return p;
}
function rise(L, t, t0, x, y, dur = 0.45) {
  const p = ease.outExpo(prog(t, t0, dur));
  vis(L.wrap, t >= t0);
  tf(L.wrap, x, y - L.pad);
  tf(L.inner, 0, (1 - p) * (L.size + L.pad));
  return p;
}
const subpaths = (d) => d.split(/(?=M)/).map((s) => {
  const n = s.match(/-?\d+(\.\d+)?/g).map(Number);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  return { d: s, box: [x0, y0, x1, y1], area: (x1 - x0) * (y1 - y0) };
});

// ------------------------------------------------------------------------------------------ layers
let L = {};
function buildLayers() {
  L.cam = el('div', stage, 'abs', { width: px(W), height: px(H) });
  L.bg = el('div', L.cam, 'abs', { width: px(W), height: px(H), background: C.ink });
  L.stadium = el('div', L.cam, 'abs', { width: px(W), height: px(H), overflow: 'hidden', display: 'none' });
  L.shards = svgBox(L.cam);
  L.studio = el('div', L.cam, 'abs', { width: px(W), height: px(H), transformOrigin: `${PIVOT[0]}px ${PIVOT[1]}px` });
  L.scenes = el('div', L.cam, 'abs', { width: px(W), height: px(H) });
}

// ------------------------------------------------------------------------------------------ shards
// The kit's own pattern: angular slivers running up-right at ~35 deg, drifting along their axis.
const SH = [];
let sil = null; // silhouette sample points (with shirt colours) for the gather
function buildShards() {
  const r = mulberry32(2026);
  const N = 270;
  for (let i = 0; i < N; i++) {
    const len = 50 + r() * 170, th = 12 + r() * 34, sk = (r() - 0.5) * th * 1.4;
    const pts = [[-len / 2, -th / 2], [len / 2 + sk, -th / 2 - r() * 8], [len / 2, th / 2], [-len / 2 + sk * 0.6, th / 2 + r() * 8]];
    const p = sv('polygon', L.shards, { points: pts.map((q) => q.join(',')).join(' '), fill: C.shard[i % 3] });
    SH.push({ p, x: r() * (W + 400) - 200, y: r() * (H + 400) - 200, a: -35 + (r() - 0.5) * 22, v: 40 + r() * 90, z: 0.6 + r() * 0.8, col: C.shard[i % 3], len });
  }
}
async function buildSilhouette() {
  // sample points inside the front cutout's alpha, keep the shirt colour there
  const img = await loadImg('img/front.png');
  const cw = 362, ch = 462;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0, cw, ch);
  const d = g.getImageData(0, 0, cw, ch).data;
  const r = mulberry32(77);
  const pts = [];
  for (let guard = 0; pts.length < SH.length && guard < 20000; guard++) {
    const x = Math.floor(r() * cw), y = Math.floor(r() * ch), i = (y * cw + x) * 4;
    if (d[i + 3] < 250) continue;
    const [fx, fy] = fpt(x, y);
    pts.push({ x: fx, y: fy, col: `rgb(${d[i]},${d[i + 1]},${d[i + 2]})` });
  }
  sil = pts;
}
function drawShards(t) {
  // visible: hook + bar 1 (field), the gather, and bar 5 (name)
  const endField = t >= Q.es - 0.05 && !PL.stadium;
  const fieldOn = t < Q.drop || between(t, Q.james - 0.05, Q.nameOut + 0.3) || endField;
  disp(L.shards, fieldOn);
  if (!fieldOn) return;
  const onNeon = between(t, Q.words[1] - 0.06, Q.words[2] - 0.06);
  const [g0, g1] = Q.gather;
  SH.forEach((s, i) => {
    const rad = (s.a * Math.PI) / 180;
    const dist = s.v * t * s.z;
    let x = ((s.x + Math.cos(rad) * dist) % (W + 400) + (W + 400)) % (W + 400) - 200;
    let y = ((s.y + Math.sin(rad) * dist) % (H + 400) + (H + 400)) % (H + 400) - 200;
    let a = s.a, sc = s.z, sy = s.z, col = onNeon ? 'rgba(0,0,0,0.16)' : endField ? ['#0c2a10', '#0f3313', '#123b16'][i % 3] : s.col;
    if (t >= g0 - 0.05 && t < Q.drop && sil) {
      // staggered flights that all land a sixteenth before the drop, so the mosaic reads as the shirt
      const st = hash01(i, 5);
      const a0 = g0 + st * (g1 - g0) * 0.35, a1 = g1 - T.P * 0.3;
      const p = ease.inOutCubic(prog(t, a0, a1 - a0));
      const tg = sil[i % sil.length];
      x = lerp(x, tg.x, p);
      y = lerp(y, tg.y, p);
      a = lerp(s.a, -32, p);
      sc = lerp(s.z, 0.55, p);
      sy = lerp(s.z, 1.7, p);
      if (t > a1) { x += noise1(t * 9, i) * 3; y += noise1(t * 9, i + 50) * 3; }
      col = p > 0.55 ? tg.col : col;
    }
    s.p.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(2)}) scale(${sc.toFixed(3)} ${sy.toFixed(3)})`);
    s.p.setAttribute('fill', col);
  });
}

// ------------------------------------------------------------------------------------------ bg
let bgStudio, bgHaze;
function buildBg() {
  // studio black: identical to the keyframes the turn plate was generated from
  bgStudio = svgBox(L.bg);
  const defs = sv('defs', bgStudio);
  const g = sv('radialGradient', defs, { id: 'studio', cx: 0.5, cy: 0.47, r: 0.62 });
  [['0', '#1b201d'], ['0.6', '#0d100e'], ['1', '#050605']].forEach(([o, c]) => sv('stop', g, { offset: o, 'stop-color': c }));
  sv('rect', bgStudio, { x: -400, y: -400, width: W + 800, height: H + 800, fill: 'url(#studio)' });
  // fallback for the stadium plate: green haze
  bgHaze = svgBox(L.stadium);
  const d2 = sv('defs', bgHaze);
  const h = sv('radialGradient', d2, { id: 'haze', cx: 0.5, cy: 0.42, r: 0.7 });
  [['0', '#123d14'], ['0.5', '#0a1f0c'], ['1', '#040805']].forEach(([o, c]) => sv('stop', h, { offset: o, 'stop-color': c }));
  sv('rect', bgHaze, { width: W, height: H, fill: 'url(#haze)' });
  L.stadiumImg = el('img', L.stadium, null, { width: px(W), height: px(H), objectFit: 'cover', filter: 'brightness(0.62) contrast(1.12) saturate(1.1)', transformOrigin: '50% 45%' });
}
function drawBg(t) {
  const studioOn = between(t, Q.drop - 0.02, Q.james);
  const neon = between(t, Q.words[1] - 0.06, Q.words[2] - 0.06); // flips with the word swap
  L.bg.style.background = neon ? C.neon : C.ink;
  disp(bgStudio, studioOn);
  const stadOn = t >= Q.es - 0.02;
  disp(L.stadium, stadOn);
  if (stadOn) {
    const plate = PL.stadium;
    disp(bgHaze, !plate);
    vis(L.stadiumImg, !!plate);
    if (plate) {
      const f = clamp(Math.floor((t - Q.es) * plate.fps), 0, plate.frames - 1);
      setFrame(L.stadiumImg, `plates/stadium/f${String(f).padStart(3, '0')}.jpg`);
      const z = 1.06 + 0.04 * prog(t, Q.es, Q.end - Q.es) + 0.05 * Math.exp(-Math.max(0, t - Q.lock) * 4) * (t >= Q.lock ? 1 : 0);
      tf(L.stadiumImg, 0, 0, z);
    }
  }
}

// ------------------------------------------------------------------------------------------ scene 0 · hook
const S = {};
const scene = () => el('div', L.scenes, 'abs', { width: px(W), height: px(H) }); // built visible so text can measure; draw*() hides
const MACRO = [ // [cut x, cut y, zoom] on the front photo: collar, crest, swoosh, cuff, chest, collar+crest
  [182, 44, 4.4], [236, 124, 6.2], [124, 124, 6.5], [330, 186, 5.4], [181, 160, 3.4], [210, 80, 5.2],
];
function buildHook() {
  const root = scene();
  const s = { root };
  // the collar V, drawn as the first gesture of the film
  s.v = svgBox(root);
  s.vp = sv('path', s.v, { d: `M-70 -70 L${W / 2} 540 L${W + 70} -70`, fill: 'none', stroke: C.neon, 'stroke-width': 86, 'stroke-linejoin': 'miter', 'stroke-miterlimit': 10, pathLength: 1, 'stroke-dasharray': 1 });
  // macro band: slanted window onto the real shirt
  s.band = el('div', root, 'abs', { width: px(W), height: px(H), clipPath: `polygon(0 ${1270}px, ${W}px ${1150}px, ${W}px ${H}px, 0 ${H}px)` });
  s.bandImg = el('img', s.band, null, { transformOrigin: '0 0' });
  s.bandImg.src = 'img/front.png';
  s.bandCut = sv('path', svgBox(root), { d: `M0 1270 L${W} 1150`, stroke: C.neon, 'stroke-width': 10, fill: 'none' });
  const size = Math.min(fitSize('NUEVA', MW, 100), fitSize('PIEL.', MW, 100));
  s.nueva = new Line(root, 'NUEVA', { size, wdth: 100 });
  s.piel = new Line(root, 'PIEL.', { size, wdth: 100, color: C.neon });
  s.size = size;
  S.hook = s;
}
function drawHook(t) {
  const s = S.hook;
  const on = t < Q.hookOut + 0.2;
  disp(s.root, on);
  if (!on) return;
  const out = ease.inQuart(prog(t, Q.hookOut, 0.19));
  s.root.style.transform = `translate3d(0,${(-out * H * 1.1).toFixed(1)}px,0)`;
  // V draws on through frame 0 and keeps breathing down
  const vp = ease.outExpo(prog(t, -0.18, 0.6));
  s.vp.setAttribute('stroke-dashoffset', (1 - vp).toFixed(4));
  const vy = -40 * ease.outCubic(prog(t, Q.piel - 0.05, 0.4));
  s.v.style.transform = `translate3d(0,${vy.toFixed(1)}px,0)`;
  // words
  const y1 = 610, y2 = y1 + s.size * 0.86 + 28;
  const lift = ease.outExpo(prog(t, Q.piel - 0.1, 0.4));
  slam(s.nueva, t, Q.nueva - 0.05, { cx: W / 2, y: lerp(y1 + 140, y1, lift), f: 2.6, d: 0.42 });
  const push = 1 + 0.05 * prog(t, 0, Q.hookOut);
  s.nueva.inner.style.transform = s.piel.inner.style.transform = `scale(${push.toFixed(4)})`;
  slam(s.piel, t, Q.piel - 0.04, { cx: W / 2, y: y2 });
  // macro band: hard cuts on the eighth notes, each shot drifting and landing with a short slide
  const cuts = [-1, Q.macro[0], Q.macro[1], Q.piel, Q.macro[2], Q.macro[3]];
  let k = 0;
  for (let i = 0; i < cuts.length; i++) if (t >= cuts[i] - 0.001) k = i;
  const [cx, cy, z] = MACRO[k];
  const t0 = Math.max(0, cuts[k]);
  const land = 1 - ease.outExpo(prog(t, t0, 0.35));
  const drift = (t - t0) * 60;
  const zz = z * FRONT.k / 2.52 * (1 + 0.04 * (t - t0));
  const iw = FRONT.w * zz, ih = FRONT.h * zz;
  s.bandImg.style.width = px(iw);
  s.bandImg.style.height = px(ih);
  const dir = k % 2 ? 1 : -1;
  tf(s.bandImg, W / 2 - cx * zz - drift * dir + land * 220 * dir, 1500 - cy * zz);
  const bandIn = ease.outExpo(prog(t, -0.25, 0.5));
  s.band.style.transform = `translate3d(0,${((1 - bandIn) * 700).toFixed(1)}px,0)`;
  s.bandCut.parentNode.style.transform = s.band.style.transform;
}

// ------------------------------------------------------------------------------------------ scene 1 · NEGRO. NEÓN. NACIONAL.
function buildWords() {
  const root = scene();
  const s = { root };
  const w = ['NEGRO.', 'NEÓN.', 'NACIONAL.'];
  s.lines = w.map((str, i) => new Line(root, str, { size: fitSize(str, MW, 92), wdth: 92, color: i === 1 ? C.ink : C.white }));
  // outlined echoes, two rows above and two below, scrolling against each other
  s.echo = w.map((str, i) => [-2, -1, 1, 2].map((row) => {
    const e = new Line(root, `${str} ${str} ${str}`, { size: s.lines[i].size, wdth: 92, color: 'transparent' });
    e.inner.style.webkitTextStroke = `2.5px ${i === 1 ? 'rgba(7,9,8,0.5)' : 'rgba(244,246,245,0.32)'}`;
    return { e, row };
  }));
  s.bar = el('div', root, 'abs', { height: px(30), width: px(MW), background: C.neon, transformOrigin: '0 50%' });
  S.words = s;
}
function drawWords(t) {
  const s = S.words, q = Q.words;
  const on = between(t, q[0] - 0.1, Q.gather[0] + 0.6);
  disp(s.root, on);
  if (!on) return;
  s.lines.forEach((Ln, i) => {
    const live = between(t, q[i] - 0.06, i < 2 ? q[i + 1] - 0.06 : 99);
    if (!live) { vis(Ln.wrap, false); return; }
    const yc = H * 0.47 - Ln.h / 2;
    const out = i === 2 ? ease.inExpo(prog(t, Q.gather[0], 0.42)) : 0;
    slam(Ln, t, q[i] - 0.06, { cx: W / 2, y: yc - out * 900 });
    s.echo[i].forEach(({ e, row }) => {
      const t0 = q[i] - 0.03 + Math.abs(row) * 0.05;
      vis(e.wrap, t >= t0);
      const p = ease.outExpo(prog(t, t0, 0.4));
      const sx = (row % 2 ? 1 : -1) * ((t - q[i]) * 260 + (1 - p) * 400);
      const unit = e.w / 3;
      tf(e.wrap, W / 2 - e.w / 2 + sx + (row > 0 ? unit * 0.5 : 0), yc - e.pad + row * (Ln.h + 34) - out * (900 + row * 60));
    });
  });
  s.echo.forEach((rows, i) => { if (!between(t, q[i] - 0.06, i < 2 ? q[i + 1] - 0.06 : 99)) rows.forEach(({ e }) => vis(e.wrap, false)); });
  // underline on NACIONAL. (wipes on the off-beat, leaves with the word)
  const up = ease.outExpo(prog(t, q[2] + T.P * 0.5, 0.35));
  const out = ease.inExpo(prog(t, Q.gather[0], 0.42));
  const L3 = s.lines[2];
  tf(s.bar, M, H * 0.47 + L3.h / 2 + 34 - out * 900, 1);
  s.bar.style.transform += ` scaleX(${up.toFixed(4)})`;
  vis(s.bar, up > 0 && t >= q[2]);
}

// ------------------------------------------------------------------------------------------ studio · the kit (bars 2-4)
function buildStudio() {
  const s = { root: L.studio };
  s.num = svgBox(L.studio); // giant outline 23 behind the shirt (traced numerals)
  s.numG = sv('g', s.num);
  s.numPaths = PATHS.num23.parts.map((p) => sv('path', s.numG, { d: subpaths(p.d).filter((q) => q.area > 4000).map((q) => q.d).join(''), fill: 'none', stroke: C.neon, 'stroke-width': 7, pathLength: 1, 'stroke-dasharray': 1, 'vector-effect': 'non-scaling-stroke' }));
  s.prod = el('div', L.studio, 'abs', { width: px(W), height: px(H), transformOrigin: '50% 50%' });
  s.front = el('img', s.prod, null, { width: px(FRONT.w * FRONT.k), height: px(FRONT.h * FRONT.k), transformOrigin: '50% 50%' });
  s.front.src = 'img/front.png';
  s.back = el('img', s.prod, null, { width: px(BACK.w * BACK.k), height: px(BACK.h * BACK.k), transformOrigin: '50% 50%' });
  s.back.src = 'img/back.png';
  s.plate = el('img', s.prod, null, { width: px(W), height: px(H) });
  // no-plate turn: both photos sliced into strips wrapped on a cylinder, shaded by facing angle
  const NS_ = 48;
  s.cyl = el('div', s.prod, 'abs', { width: px(W), height: px(H) });
  s.strips = [];
  for (const [side, G, src] of [['f', FRONT, 'img/front.png'], ['b', BACK, 'img/back.png']]) {
    const iw = G.w * G.k, ih = G.h * G.k, sw = iw / NS_;
    for (let i = 0; i < NS_; i++) {
      const d = el('div', s.cyl, 'abs', { width: px(sw + 1), height: px(ih), overflow: 'hidden', transformOrigin: '0 50%' });
      const im = el('img', d, null, { width: px(iw), height: px(ih), left: px(-i * sw) });
      im.src = src;
      const R = iw / 2, cx = G.x + R;
      const u0 = (i * sw - R) / R, u1 = ((i + 1) * sw - R) / R;
      s.strips.push({ d, im, side, sw, y: G.y, cx, R, a0: Math.asin(clamp(u0, -1, 1)), a1: Math.asin(clamp(u1, -1, 1)) });
    }
  }
  // outline trace around the silhouette
  s.sil = svgBox(s.prod);
  const k = FRONT.k / 4;
  s.silP = sv('path', s.sil, { d: PATHS.sil.parts[0].d, fill: 'none', stroke: C.neon, 'stroke-width': 7 / k, 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1', transform: `translate(${FRONT.x} ${FRONT.y}) scale(${k})` });
  // JAMES, traced from the back print, laid exactly over itself for the scan
  s.jam = svgBox(s.prod);
  const kb = BACK.k / 4;
  s.jamG = sv('g', s.jam, { transform: `translate(${BACK.x} ${BACK.y}) scale(${kb})` });
  PATHS.james.parts.forEach((p) => sv('path', s.jamG, { d: p.d, fill: C.neon }));
  s.scan = el('div', s.prod, 'abs', { width: px(14), height: px(120), background: C.neon });
  // callouts
  s.call = svgBox(s.prod);
  const CALL = [
    { at: SPOT.crest, via: [SPOT.crest[0], 300], to: [W - M, 300], label: 'ESCUDO', n: '01', side: 'r' },
    { at: SPOT.collar, via: [SPOT.collar[0], 236], to: [M, 236], label: 'CUELLO EN V', n: '02', side: 'l' },
    { at: SPOT.cuffL, via: [SPOT.cuffL[0], 1688], to: [W - M, 1688], label: 'PUÑOS NEÓN', n: '03', side: 'l2' },
  ];
  s.calls = CALL.map((c) => {
    const g = sv('g', s.call);
    const line = sv('polyline', g, { points: [c.at, c.via, c.to].map((p) => p.join(',')).join(' '), fill: 'none', stroke: C.neon, 'stroke-width': 4, pathLength: 1, 'stroke-dasharray': 1 });
    const dot = sv('circle', g, { cx: c.at[0], cy: c.at[1], r: 13, fill: C.ink, stroke: C.neon, 'stroke-width': 6 });
    const lab = el('div', s.prod, 'abs', { overflow: 'hidden', height: px(60) });
    const tx = el('div', lab, 'mono', { fontSize: px(46), fontWeight: 600, color: C.white, position: 'absolute', left: 0, top: px(6) });
    tx.innerHTML = `<span style="color:${C.neon}">${c.n}</span>  ${c.label}`;
    const lw = tx.offsetWidth;
    lab.style.width = px(lw + 6);
    const lx = c.side === 'r' ? W - M - lw : M;
    const ly = c.via[1] - 76;
    return { ...c, g, line, dot, lab, tx, lw, lx, ly };
  });
  S.studio = s;
}
function setNum(s, t) {
  // giant numerals: fill the frame height, slightly cropped, behind the shirt
  const bx = PATHS.num23.parts.reduce((a, p) => [Math.min(a[0], p.bbox[0]), Math.min(a[1], p.bbox[1]), Math.max(a[2], p.bbox[2]), Math.max(a[3], p.bbox[3])], [1e9, 1e9, -1, -1]);
  const hh = bx[3] - bx[1], ww = bx[2] - bx[0];
  const k = 1330 / hh * (1 + 0.05 * prog(t, Q.reveal, Q.james - Q.reveal));
  const x = W / 2 - (bx[0] + ww / 2) * k, y = H * 0.5 - (bx[1] + hh / 2) * k;
  s.numG.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(4)})`);
}
function drawStudio(t) {
  const s = S.studio;
  const on = between(t, Q.drop - 0.02, Q.james);
  disp(s.root, on);
  if (!on) return;
  // camera on the product
  const land = t < Q.drop ? 0 : spring(t - Q.drop, 2.6, 0.5);
  let sc = lerp(1.14, 1, land) * (1 + 0.04 * ease.inOutCubic(prog(t, Q.drop + 0.4, Q.turn[0] - Q.drop - 0.4)));
  // reveal hit, then push in on name + number, then a whip-zoom through the 3
  const rv = t >= Q.reveal ? spring(t - Q.reveal, 2.4, 0.45) : 0;
  sc *= t >= Q.reveal ? lerp(1.12, 1, rv) / 1.04 * 1.04 : 1;
  const push = ease.inOutCubic(prog(t, Q.push[0], Q.push[1] - Q.push[0] - 0.3));
  const whip = ease.inExpo(prog(t, Q.james - 0.32, 0.32));
  let ox = 0, oy = 0;
  if (t >= Q.push[0]) {
    sc *= lerp(1, 1.55, push) * lerp(1, 9, whip);
    // focus: name+number during the push, then the dark gap between the 2 and the 3 for the whip
    const F = [lerp(SPOT.num[0], SPOT.gap[0], whip), lerp((SPOT.name[1] + SPOT.num[1]) / 2, SPOT.gap[1], whip)];
    const S2 = [lerp(F[0], W / 2, push), lerp(F[1], H / 2, push)];
    ox = S2[0] - PIVOT[0] - (F[0] - PIVOT[0]) * sc;
    oy = S2[1] - PIVOT[1] - (F[1] - PIVOT[1]) * sc;
  }
  const floatY = Math.sin(t * 1.7) * 6;
  L.studio.style.transform = `translate3d(${ox.toFixed(2)}px,${(oy + floatY).toFixed(2)}px,0) scale(${sc.toFixed(4)})`;
  // which shirt: front -> (turn) -> back
  const [ta, tb] = Q.turn;
  const plate = PL.turn;
  const inTurn = between(t, ta, tb);
  let fv = t < ta, bk = t >= tb;
  vis(s.plate, false);
  if (inTurn && plate) {
    const u = (t - ta) / (tb - ta);
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // speed ramp: slow, whip, settle
    const pt = lerp(plate.t0, plate.t1, e);
    const f = clamp(Math.round(pt * plate.fps), 0, plate.frames - 1);
    setFrame(s.plate, `plates/turn/f${String(f).padStart(3, '0')}.jpg`);
    vis(s.plate, true);
    fv = false;
  } else if (inTurn) {
    // fallback: cylinder turn (front strips at angle asin(u), back strips at pi + asin(u))
    const u = (t - ta) / (tb - ta);
    const th = Math.PI * (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    fv = bk = false;
    for (const st of s.strips) {
      const off = st.side === 'f' ? 0 : Math.PI;
      const al = st.a0 + off + th, ar = st.a1 + off + th;
      const xl = st.cx + st.R * Math.sin(al), xr = st.cx + st.R * Math.sin(ar);
      const facing = Math.cos((al + ar) / 2);
      const on = facing > 0.02 && xr > xl;
      vis(st.d, on);
      if (!on) continue;
      tf(st.d, xl, st.y);
      st.d.style.transform += ` scale(${((xr - xl) / st.sw).toFixed(4)},1)`;
      st.im.style.filter = `brightness(${(1 - 0.75 * Math.pow(1 - facing, 1.4)).toFixed(3)})`;
    }
  }
  vis(s.cyl, inTurn && !plate);
  if (!inTurn || plate) {
    tf(s.front, FRONT.x, FRONT.y);
    tf(s.back, BACK.x, BACK.y);
  }
  vis(s.front, fv);
  vis(s.back, bk);
  // outline trace: draws on with the drop, retracts into the question
  const d0 = ease.inOutCubic(prog(t, Q.trace[0], Q.trace[1] - Q.trace[0]));
  const d1 = ease.inCubic(prog(t, Q.q[0] - 0.3, 0.45));
  s.silP.setAttribute('stroke-dasharray', `${d0.toFixed(4)} 2`);
  s.silP.setAttribute('stroke-dashoffset', (-d1).toFixed(4));
  vis(s.sil, d0 > 0 && d1 < 1 && t < ta);
  // callouts
  s.calls.forEach((c, i) => {
    const t0 = Q.call[i];
    const lp = ease.outExpo(prog(t, t0, 0.42));
    const gone = ease.inExpo(prog(t, Q.q[0] - 0.25, 0.25));
    const live = t >= t0 && gone < 1;
    vis(c.g, live);
    c.lab.style.display = live ? 'block' : 'none';
    if (!live) return;
    c.line.setAttribute('stroke-dashoffset', (1 - lp + gone).toFixed(4));
    c.line.setAttribute('stroke-dasharray', `${(1 - gone).toFixed(4)} 2`);
    const dp = spring(t - t0, 4, 0.4);
    c.dot.setAttribute('r', (13 * Math.max(0, dp) * (1 - gone)).toFixed(2));
    const lr = ease.outExpo(prog(t, t0 + 0.12, 0.4));
    tf(c.lab, c.lx, c.ly);
    tf(c.tx, 0, (1 - lr + gone) * 64);
  });
  // giant 23 outline (reveal) + JAMES scan
  const numOn = t >= Q.reveal;
  vis(s.num, numOn);
  if (numOn) {
    setNum(s, t);
    const np = ease.inOutCubic(prog(t, Q.num[0], Q.num[1] - Q.num[0]));
    s.numPaths.forEach((p, i) => p.setAttribute('stroke-dashoffset', (1 - clamp(np * 1.25 - i * 0.25)).toFixed(4)));
  }
  const jx = ease.inOutCubic(prog(t, Q.scan, 0.42));
  const nb = [BACK.x + 135 * BACK.k, BACK.y + 120 * BACK.k, BACK.x + 210 * BACK.k, BACK.y + 152 * BACK.k];
  const scanOn = t >= Q.scan && t < Q.james;
  vis(s.jam, scanOn);
  vis(s.scan, scanOn && jx < 1);
  if (scanOn) {
    const sx = lerp(nb[0] - 40, nb[2] + 40, jx);
    s.jam.style.clipPath = `inset(0 ${(W - sx).toFixed(1)}px 0 0)`;
    tf(s.scan, sx - 7, nb[1] - 18);
    s.scan.style.height = px(nb[3] - nb[1] + 36);
  }
}

// ------------------------------------------------------------------------------------------ scene 3 · LA 23 YA TIENE DUEÑO.
function buildQuestion() {
  const root = scene();
  const s = { root };
  const size = Math.min(fitSize('YA TIENE', MW * 0.92, 88), 116);
  s.l = [
    new Line(root, 'LA 23', { size, wdth: 88, mask: true }),
    new Line(root, 'YA TIENE', { size, wdth: 88, mask: true }),
    new Line(root, 'DUEÑO.', { size, wdth: 88, mask: true, color: C.neon }),
  ];
  s.l[0].html(`LA <span style="color:${C.neon}">23</span>`);
  s.size = size;
  S.q = s;
}
function drawQuestion(t) {
  const s = S.q;
  const on = between(t, Q.q[0] - 0.05, Q.turn[1] + 0.05);
  disp(s.root, on);
  if (!on) return;
  const out = ease.inExpo(prog(t, Q.turn[1] - 0.42, 0.38));
  s.l.forEach((Ln, i) => {
    rise(Ln, t, Q.q[i], M - out * (W + 200) * (1 + i * 0.12), 52 + i * (s.size * 0.86 + 14));
  });
}

// ------------------------------------------------------------------------------------------ scene 5 · JAMES RODRÍGUEZ
function buildName() {
  const root = scene();
  const s = { root };
  const sz = fitSize('JAMES', MW, 100);
  s.hl = el('div', root, 'abs', { width: px(W + 40), background: C.neon, transformOrigin: '0 50%' });
  s.letters = [...'JAMES'].map((ch) => new Line(root, ch, { size: sz, wdth: 100 }));
  s.jw = s.letters.reduce((a, l) => a + l.w, 0);
  s.sz = sz;
  s.jk = s.letters.map((l) => { const n = l.inner.cloneNode(true); n.style.color = C.ink; l.wrap.appendChild(n); return n; });
  const rs = fitSize('RODRÍGUEZ', MW, 72);
  s.rod = new Line(root, 'RODRÍGUEZ', { size: rs, wdth: 72, color: C.neon });
  // number in the shirt's own numerals, filled white
  s.numS = svgBox(root);
  s.numG = sv('g', s.numS);
  s.numP = PATHS.num23.parts.map((p) => sv('path', s.numG, { d: p.d, 'fill-rule': 'evenodd', fill: C.white, stroke: C.white, 'stroke-width': 0 }));
  S.name = s;
}
function drawName(t) {
  const s = S.name;
  const on = between(t, Q.james - 0.02, Q.nameOut + 0.16);
  disp(s.root, on);
  if (!on) return;
  const out = ease.inQuart(prog(t, Q.nameOut - 0.06, 0.18));
  s.root.style.transform = `translate3d(0,${(out * H * 1.05).toFixed(1)}px,0)`;
  // JAMES: letters drop in on 32nds, then a neon bar knocks it out on beat 21 (block centred in frame)
  const y0 = (H - (s.sz * 0.86 + 70 + s.rod.h + 90 + 520)) / 2;
  let x = W / 2 - s.jw / 2;
  s.letters.forEach((Ln, i) => {
    const t0 = Q.james + i * 0.035 - 0.02;
    const p = t >= t0 ? spring(t - t0, 3.6, 0.48) : 0;
    vis(Ln.wrap, t >= t0);
    tf(Ln.wrap, x, y0 - Ln.pad - (1 - p) * 260, 1, (1 - Math.min(p, 1)) * (i % 2 ? 6 : -6));
    x += Ln.w;
  });
  const hp = ease.outExpo(prog(t, Q.james + T.P, 0.3));
  const hy = y0 - 26, hh = s.sz * 0.86 + 52;
  tf(s.hl, -20, hy, 1);
  s.hl.style.height = px(hh);
  s.hl.style.transform += ` scaleX(${hp.toFixed(4)})`;
  vis(s.hl, hp > 0);
  // knockout copy of JAMES, clipped to the bar
  const cut = -20 + (W + 40) * hp;
  let xx = W / 2 - s.jw / 2;
  s.letters.forEach((Ln, i) => {
    const local = cut - xx;
    s.jk[i].style.clipPath = `inset(-50% ${Math.max(0, Ln.w - local + 4).toFixed(1)}px -50% 0)`;
    vis(s.jk[i], hp > 0);
    xx += Ln.w;
  });
  // RODRÍGUEZ: width slam
  slam(s.rod, t, Q.rodriguez - 0.04, { cx: W / 2, y: y0 + s.sz * 0.86 + 70 });
  // 23 in the kit's numerals
  const bx = [454, 725, 981, 1264];
  const nh = 520, k = nh / (bx[3] - bx[1]);
  const np = t >= Q.rodriguez + T.P ? spring(t - Q.rodriguez - T.P, 3, 0.5) : 0;
  const ny = y0 + s.sz * 0.86 + 70 + s.rod.h + 90;
  const kk = k * Math.max(0, lerp(0.4, 1, np));
  const cx = W / 2 - ((bx[0] + bx[2]) / 2) * kk, cy = ny + nh / 2 - ((bx[1] + bx[3]) / 2) * kk;
  s.numG.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${kk.toFixed(4)})`);
  vis(s.numS, np > 0);
}

// ------------------------------------------------------------------------------------------ scenes 6-7 · ES VERDOLAGA. + crest + lockup
function buildEnd() {
  const root = scene();
  const s = { root };
  s.es = new Line(root, 'ES', { size: 120, wdth: 100, mask: true });
  const vs = fitSize('VERDOLAGA.', MW, 80);
  s.ver = new Line(root, 'VERDOLAGA.', { size: vs, wdth: 80, color: C.neon });
  // crest, built from its traced parts on a white backing
  s.crest = svgBox(root, PATHS.crest.width, PATHS.crest.height);
  s.crest.style.transformOrigin = '0 0';
  const parts = PATHS.crest.parts;
  const outer = subpaths(parts[0].d).sort((a, b2) => b2.area - a.area)[0];
  s.base = sv('path', s.crest, { d: outer.d, fill: '#ffffff' });
  s.cp = parts.map((p) => sv('path', s.crest, { d: p.d, fill: C.crest, 'fill-rule': 'evenodd' }));
  s.cbox = parts.map((p) => p.bbox);
  const cs = fitSize('ATLÉTICO NACIONAL', MW, 78);
  s.club = new Line(root, 'ATLÉTICO NACIONAL', { size: Math.min(cs, 104), wdth: 78, mask: true });
  s.wel = new Line(root, 'BIENVENIDO, JAMES', { size: 54, wght: 500, ls: 0.14, cls: 'mono', mask: true });
  s.wel.inner.style.fontWeight = 500;
  s.wel.html(`BIENVENIDO, JAMES  <span style="color:${C.neon}">23</span>`);
  S.end = s;
}
function drawEnd(t) {
  const s = S.end;
  const on = t >= Q.es - 0.05;
  disp(s.root, on);
  if (!on) return;
  // headline
  const hx = M;
  rise(s.es, t, Q.es - 0.03, hx, 150);
  slam(s.ver, t, Q.verdolaga - 0.04, { x: hx, y: 150 + 120 * 0.86 + 18 });
  // crest: height ~ 640, centred
  const ch = 700, k0 = ch / PATHS.crest.height;
  const settle = t >= Q.lock ? spring(t - Q.lock, 2.6, 0.45) : 0;
  const stinger = t >= T.b(31) ? 0.035 * Math.exp(-(t - T.b(31)) * 7) * Math.sin((t - T.b(31)) * 30) : 0;
  const k = k0 * lerp(1, 0.9, Math.min(settle, 1.1)) * (1 + stinger);
  const cw = PATHS.crest.width * k;
  const top = lerp(560, 520, Math.min(settle, 1));
  tf(s.crest, W / 2 - cw / 2, top, k);
  const [c0, c1, c2, c3, c4] = Q.crest;
  // base + shield/tower wipe up from the point
  const wp = ease.outExpo(prog(t, c0, 0.5));
  s.base.style.clipPath = s.cp[0].style.clipPath = `inset(${((1 - wp) * 100).toFixed(2)}% 0 0 0)`;
  vis(s.base, t >= c0);
  vis(s.cp[0], t >= c0);
  const slide = (n, t0, dx, dy) => {
    const p = ease.outExpo(prog(t, t0, 0.45));
    vis(s.cp[n], t >= t0);
    s.cp[n].setAttribute('transform', `translate(${((1 - p) * dx).toFixed(1)} ${((1 - p) * dy).toFixed(1)})`);
  };
  slide(1, c1, -520, -520);
  slide(2, c2, -760, 760);
  slide(3, c3, 520, 520);
  const ap = t >= c4 ? spring(t - c4, 4, 0.4) : 0;
  vis(s.cp[4], ap > 0);
  const [ax0, ay0, ax1, ay1] = s.cbox[4], acx = (ax0 + ax1) / 2, acy = (ay0 + ay1) / 2;
  s.cp[4].setAttribute('transform', `translate(${acx} ${acy}) scale(${Math.max(0, ap).toFixed(3)}) translate(${-acx} ${-acy})`);
  // lockup type
  const cy = top + PATHS.crest.height * k + 70;
  rise(s.club, t, Q.club, W / 2 - s.club.w / 2, cy, 0.5);
  rise(s.wel, t, Q.welcome, W / 2 - s.wel.w / 2, cy + s.club.h + 60, 0.5);
}

// ------------------------------------------------------------------------------------------ frames + plates
const pending = [];
function loadImg(src) {
  return new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(im); im.src = src; });
}
function setFrame(img, src) {
  if (img.dataset.src === src) return;
  img.dataset.src = src;
  img.src = src;
  pending.push(img.decode().catch(() => 0));
}
async function loadPlates() {
  try {
    const r = await fetch('plates/manifest.json');
    if (r.ok) PL = await r.json();
  } catch { PL = {}; }
}

let PATHS = {};
let HITS = [];
function render(t) {
  drawBg(t);
  drawShards(t);
  drawHook(t);
  drawWords(t);
  drawStudio(t);
  drawQuestion(t);
  drawName(t);
  drawEnd(t);
  let x = 0, y = 0;
  for (const [th, a, sd] of HITS) {
    const d = t - th;
    if (d < 0 || d > 0.6) continue;
    const e = a * Math.exp(-d * 9);
    x += e * noise1(d * 34, sd);
    y += e * noise1(d * 34, sd + 7);
  }
  L.cam.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${(1 + (Math.abs(x) + Math.abs(y)) / 1400).toFixed(4)})`;
}

async function init() {
  const grid = await (await fetch('beats.json')).json();
  T = makeTimeline(grid);
  b = T.b;
  Q = T.cue;
  HITS = [[Q.nueva, 10, 1], [Q.drop, 18, 2], [Q.reveal, 20, 3], [Q.james, 10, 4], [Q.rodriguez, 10, 5], [Q.lock, 16, 6]];
  const [crest, num23, james, sil] = await Promise.all(['crest.json', 'num23.json', 'james.json', 'sil-front.json'].map(async (f) => (await fetch(f)).json()));
  PATHS = { crest, num23, james, sil };
  await loadPlates();
  await Promise.all(['900 100px Archivo', '500 30px GeistMono'].map((f) => document.fonts.load(f)));
  await document.fonts.ready;
  meas = el('span', stage, 'disp', { position: 'absolute', left: '-99999px', top: '0' });
  buildLayers();
  buildBg();
  buildShards();
  await buildSilhouette();
  buildHook();
  buildWords();
  buildStudio();
  buildQuestion();
  buildName();
  buildEnd();
  await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = r; im.onerror = r; }))));
  await Promise.all([...document.images].filter((im) => im.src).map((im) => im.decode().catch(() => 0)));
  render(0);
  await Promise.all(pending.splice(0));
  return true;
}
window.FILM = { ...FILM, width: W, height: H, fmt: FMT };
window.seek = async (t) => {
  render(t);
  if (pending.length) await Promise.all(pending.splice(0));
};
window.ready = init();
