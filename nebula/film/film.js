// Nébula — "Agentes de IA para WhatsApp". 20 s, one timeline, three formats (?fmt=v|s|h).
// Contract: window.seek(t) paints frame t. No CSS transitions, timers or frame-to-frame state.
// Every product UI element is a crop of the real site screenshot (img/*), never redrawn.
import { makeTimeline, FILM, FORMATS, HOOK } from './timeline.js';
import { clamp, lerp, prog, ease, spring, noise1, hash01, mulberry32 } from './lib.js';

const FMT = new URLSearchParams(location.search).get('fmt') || 'v';
const { width: W, height: H } = FORMATS[FMT];
const isV = FMT === 'v', isS = FMT === 's', isH = FMT === 'h';
const M = isH ? 120 : 72, MW = W - 2 * M;
const C = { bg: '#0d0b15', text: '#f1eff9', violet: '#7435dc', lav: '#a277e5', dot: '#8a58e4', muted: '#8773a5', card: '#17121f', line: '#2c2440' };
const stage = document.getElementById('stage');
stage.style.width = W + 'px';
stage.style.height = H + 'px';
let T, b, Q;

// Real crops (original screenshot pixels; files are 3x lanczos upscales of the same pixels).
const IMG = {
  logo: [118, 30], nav: [500, 34], 'cta-top': [170, 42], badge: [386, 38], headline: [822, 280], subcopy: [682, 62],
  'cta-main': [236, 56], 'cta-secondary': [160, 56], tagline: [590, 26], 'chat-widget': [240, 80], 'chat-orb': [113, 68],
};
const SHOT = [1913, 914];

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
function svgBox(parent, w, h) {
  const s = sv('svg', parent, { width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  s.style.cssText = 'position:absolute;left:0;top:0;overflow:visible';
  return s;
}
function tf(n, x = 0, y = 0, s = 1, r = 0, sy) {
  n.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg) scale(${s.toFixed(4)},${(sy ?? s).toFixed(4)})`;
}
const vis = (n, on) => { n.style.visibility = on ? 'inherit' : 'hidden'; };
const disp = (n, on) => { n.style.display = on ? 'block' : 'none'; };

// A crop, optionally clipped to the real control's rounded shape (so it sits on any background).
function crop(parent, name, k, { clip, feather = false } = {}) {
  const [w, h] = IMG[name];
  const wrap = el('div', parent, 'abs', { width: px(w * k), height: px(h * k), transformOrigin: '50% 50%' });
  const img = el('img', wrap, feather ? 'feather' : null, { width: px(w * k), height: px(h * k) });
  img.src = `img/${name}@3x.png`;
  if (clip) {
    const [t, r, bt, l, rad] = clip.map((v) => v * k);
    img.style.clipPath = `inset(${t}px ${r}px ${bt}px ${l}px round ${rad}px)`;
  }
  return { wrap, img, w: w * k, h: h * k, k };
}
function chatClip(c) {
  const k = c.k, r = 12 * k, x0 = 3 * k, y0 = 11 * k, x1 = 228 * k, y1 = 75 * k;
  const cx = 224 * k, cy = 15 * k, cr = 12.5 * k;
  const rr = `M${x0 + r} ${y0} H${x1 - r} A${r} ${r} 0 0 1 ${x1} ${y0 + r} V${y1 - r} A${r} ${r} 0 0 1 ${x1 - r} ${y1} H${x0 + r} A${r} ${r} 0 0 1 ${x0} ${y1 - r} V${y0 + r} A${r} ${r} 0 0 1 ${x0 + r} ${y0} Z`;
  const circ = `M${cx - cr} ${cy} A${cr} ${cr} 0 1 0 ${cx + cr} ${cy} A${cr} ${cr} 0 1 0 ${cx - cr} ${cy} Z`;
  c.img.style.clipPath = `path('${rr}')`;
  void circ;
  return c;
}
const CLIP = { 'cta-main': [4, 4, 4, 3, 24], 'cta-secondary': [4, 3, 4, 3, 24], badge: [4, 4, 4, 3, 15], 'cta-top': [3, 3, 0, 4, 10] };

// Display line: masked, rises into place. `parts` = [[text, lavender?], ...]
let meas;
function textWidth(html, size, cls = 'disp') {
  meas.className = cls;
  meas.style.fontSize = px(size);
  meas.innerHTML = html;
  return meas.getBoundingClientRect().width;
}
const partsHtml = (parts) => parts.map(([s, l]) => (l ? `<span class="lav">${s}</span>` : s)).join('');
function fitSize(parts, size, maxW, cls = 'disp') {
  const w = textWidth(partsHtml(parts), size, cls);
  return w > maxW ? Math.floor((size * maxW) / w) : size;
}
function line(parent, parts, size, { cls = 'disp', x = 0, y = 0, align = 'left', maxW = MW } = {}) {
  const s = fitSize(parts, size, maxW, cls);
  const w = textWidth(partsHtml(parts), s, cls);
  const h = s * 1.22;
  const wrap = el('div', parent, 'abs', { width: px(w + s * 0.2), height: px(h), overflow: 'hidden' });
  const inner = el('div', wrap, cls, { fontSize: px(s), position: 'absolute', left: '0', top: px(s * 0.06) });
  inner.innerHTML = partsHtml(parts);
  const ox = align === 'center' ? x - w / 2 : x;
  tf(wrap, ox, y);
  return { wrap, inner, w, h, s, x: ox, y };
}
function rise(L, t, t0, dur = 0.5, e = ease.outExpo) {
  const p = e(prog(t, t0, dur));
  tf(L.inner, 0, (1 - p) * L.h);
  vis(L.wrap, t >= t0);
  return p;
}

// Cursor (generic pointer, not product UI)
function makeCursor(parent, s) {
  const g = svgBox(parent, 60 * s, 76 * s);
  const p = sv('path', g, { d: 'M6 4 L6 62 L20 49 L31 72 L42 67 L31 45 L52 45 Z', fill: '#ffffff', stroke: C.bg, 'stroke-width': 4, 'stroke-linejoin': 'round' });
  p.setAttribute('transform', `scale(${s})`);
  g.style.transformOrigin = '0 0';
  return g;
}
function ripple(parent) {
  const g = svgBox(parent, 10, 10);
  const c = sv('circle', g, { cx: 0, cy: 0, r: 10, fill: 'none', stroke: C.lav, 'stroke-width': 6 });
  return { g, c };
}
function drawRipple(R, t, t0, x, y, maxR) {
  const p = prog(t, t0, 0.55);
  vis(R.g, p > 0 && p < 1);
  tf(R.g, x, y);
  R.c.setAttribute('r', (8 + ease.outCubic(p) * maxR).toFixed(1));
  R.c.setAttribute('stroke-width', (8 * (1 - p)).toFixed(2));
}
// cursor path: from off-frame corner, slight arc, lands on target; press on click
function drawCursor(cur, t, move, click, tx, ty, scale) {
  const p = ease.inOutCubic(prog(t, move[0], move[1] - move[0]));
  const sx = W + 60, sy = H * 0.86;
  const x = lerp(sx, tx, p) + Math.sin(p * Math.PI) * -80;
  const y = lerp(sy, ty, p) + Math.sin(p * Math.PI) * -60;
  const press = t >= click - 0.05 && t < click + 0.1 ? 0.84 : 1;
  tf(cur, x, y, press * scale / scale);
  vis(cur, t >= move[0]);
}

// ------------------------------------------------------------------------------------------ backdrop
let starG, stars = [], blobPath, blobG;
function buildBackdrop() {
  const g = svgBox(stage, W, H);
  starG = g;
  const r = mulberry32(7);
  const n = Math.round((W * H) / 9000);
  for (let i = 0; i < n; i++) {
    const s = { x: r() * W, y: r() * H, r: 0.8 + r() * 1.8, a: 0.2 + r() * 0.6, ph: r() * 10, sp: 0.5 + r() * 1.5, d: 0.3 + r() * 0.7 };
    s.n = sv('circle', g, { cx: s.x, cy: s.y, r: s.r, fill: '#e9e3ff' });
    stars.push(s);
  }
  blobG = svgBox(stage, W, H);
  const defs = sv('defs', blobG);
  // colours sampled from the site's blob behind the headline crop (#6a48aa avg, #7953c4 core)
  const lg = sv('radialGradient', defs, { id: 'bl', cx: 0.5, cy: 0.42, r: 0.62 });
  sv('stop', lg, { offset: '0', 'stop-color': '#7752c0' });
  sv('stop', lg, { offset: '0.5', 'stop-color': '#6947a8' });
  sv('stop', lg, { offset: '0.85', 'stop-color': '#55398f' });
  sv('stop', lg, { offset: '1', 'stop-color': '#3d2a6c' });
  blobPath = sv('path', blobG, { fill: 'url(#bl)' });
}
function drawStars(t) {
  for (const s of stars) {
    const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
    const y = (s.y - t * 6 * s.d + H) % H;
    s.n.setAttribute('cy', y.toFixed(1));
    s.n.setAttribute('opacity', (s.a * tw).toFixed(3));
  }
}
function blobD(cx, cy, R, t) {
  const N = 48, pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = R * (1 + 0.09 * Math.sin(2 * a + 0.7 * t) + 0.06 * Math.sin(3 * a - 0.9 * t + 1.3) + 0.035 * Math.sin(5 * a + 1.4 * t + 2.1));
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.06]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}
// blob pose per scene: [cx, cy, R] in frame units
function blobPose(t) {
  const u = Math.min(W, H);
  const poses = {
    product: [W / 2, H * (isV ? 0.45 : 0.52), u * (isV ? 0.6 : isS ? 0.6 : 0.62)],
    f1: [W * (isH ? 0.68 : 0.5), H * (isV ? 0.55 : isS ? 0.62 : 0.52), u * 0.4],
    f2: [W * (isH ? 0.66 : 0.5), H * (isV ? 0.56 : isS ? 0.64 : 0.52), u * 0.44],
    f3: [W * (isH ? 0.66 : 0.5), H * (isV ? 0.55 : isS ? 0.64 : 0.52), u * 0.4],
    metric: [W / 2, H * (isV ? 0.42 : 0.5), u * (isV ? 0.56 : 0.48)],
    end: [W / 2, H * (isV ? 0.46 : 0.5), u * (isV ? 0.5 : 0.45)],
  };
  const keys = [['product', Q.drop], ['f1', Q.f1.t0], ['f2', Q.f2.t0], ['f3', Q.f3.t0], ['metric', Q.metric], ['end', Q.end]];
  let cur = poses.product;
  for (let i = 1; i < keys.length; i++) {
    const p = ease.inOutCubic(prog(t, keys[i][1] - 0.25, 0.55));
    const next = poses[keys[i][0]];
    cur = [lerp(cur[0], next[0], p), lerp(cur[1], next[1], p), lerp(cur[2], next[2], p)];
  }
  return cur;
}
function drawBlob(t) {
  const [cx, cy, R0] = blobPose(t);
  const grow = spring(t - Q.drop + 0.02, 1.6, 0.55);
  const pulse = 1 + 0.07 * Math.exp(-Math.max(0, t - Q.metric) * 3) * (t >= Q.metric ? 1 : 0) + 0.03 * Math.exp(-Math.max(0, t - Q.f1.t0) * 4) * (t >= Q.f1.t0 ? 1 : 0);
  const R = R0 * Math.max(0, grow) * pulse;
  vis(blobG, R > 1);
  if (R > 1) blobPath.setAttribute('d', blobD(cx, cy, R, t * 0.9));
}

// ------------------------------------------------------------------------------------------ scenes
const S = {};
const scene = () => el('div', stage, 'abs', { width: px(W), height: px(H), display: 'none' });

// 1 · hook: the problem in five words
function buildHook() {
  const root = scene();
  const s = { root };
  const groups = isV ? [[0], [1], [2], [3], [4]] : isS ? [[0, 1], [2], [3], [4]] : [[0, 1], [2], [3, 4]];
  const base = isV ? 300 : isS ? 220 : 250;
  const size = Math.min(...groups.map((g) => fitSize([[g.map((i) => HOOK[i]).join(' '), false]], base, MW)));
  const lh = size * 0.98;
  const total = groups.length * lh;
  const y0 = H * (isV ? 0.44 : 0.47) - total / 2;
  s.words = [];
  groups.forEach((g, li) => {
    let x = M;
    g.forEach((wi) => {
      const lavw = wi >= 3;
      const L = line(root, [[HOOK[wi], lavw]], size, { x, y: y0 + li * lh });
      s.words[wi] = L;
      x += L.w + size * 0.24;
    });
  });
  // typing bubble (generic chat affordance)
  const bs = isH ? 1.1 : 1.25;
  s.bubble = el('div', root, 'abs', { width: px(190 * bs), height: px(96 * bs), borderRadius: px(48 * bs), background: C.card, boxShadow: `inset 0 0 0 2px ${C.line}`, transformOrigin: '0% 100%' });
  s.dots = [0, 1, 2].map((i) => el('div', s.bubble, 'abs', { width: px(22 * bs), height: px(22 * bs), borderRadius: '50%', background: C.lav, left: px((45 + i * 38) * bs), top: px(37 * bs) }));
  s.bubbleY = y0 + total + (isV ? 90 : 50);
  s.bubbleS = bs;
  S.hook = s;
}
function drawHook(t) {
  const s = S.hook;
  const on = t < Q.drop + 0.05;
  disp(s.root, on);
  if (!on) return;
  const out = ease.inExpo(prog(t, Q.hookOut - 0.05, 0.3));
  HOOK.forEach((_, i) => {
    const L = s.words[i];
    rise(L, t, Q.hook[i] - (i === 0 ? 0.2 : 0.02), 0.55);
    tf(L.wrap, L.x, L.y - out * H * 0.7 - out * i * 40);
  });
  // bubble: appears, dots bounce (someone is typing...) then it gives up
  const bin = spring(t - Q.dots[0], 3, 0.55);
  const bout = ease.inBack(prog(t, Q.dots[1] - 0.1, 0.22));
  const bsc = Math.max(0, bin) * (1 - bout);
  tf(s.bubble, M, s.bubbleY - out * H * 0.5, bsc);
  vis(s.bubble, t >= Q.dots[0] && bsc > 0.001);
  s.dots.forEach((d, i) => {
    const ph = (t - Q.dots[0]) * 2 * Math.PI * (1 / (T.P * 2)) - i * 0.9;
    const slow = 1 - prog(t, Q.dots[1] - 1.2, 1.1);
    tf(d, 0, -Math.max(0, Math.sin(ph)) * 16 * s.bubbleS * slow);
  });
  stage.style.transformOrigin = '50% 50%';
}

// 2 · product assembles from real crops
function buildProduct() {
  const root = scene();
  const s = { root };
  const k = Math.min(MW, isH ? 960 : isS ? 900 : 1100) / IMG.headline[0];
  const boost = { badge: 1.25, subcopy: isV ? 1.25 : 1.15, cta: isV ? 1.45 : 1.3, tagline: isV ? 1.45 : 1.3 };
  const kk = (name, bo) => Math.min(k * bo, MW / IMG[name][0]);
  s.badge = crop(root, 'badge', kk('badge', boost.badge), { clip: CLIP.badge });
  s.lines = [[0, 96], [96, 188], [188, 280]].map(([a, z]) => {
    const wrap = el('div', root, 'abs', { width: px(IMG.headline[0] * k), height: px((z - a) * k), overflow: 'hidden' });
    const inner = el('div', wrap, 'abs', { width: px(IMG.headline[0] * k), height: px(IMG.headline[1] * k) });
    const img = el('img', inner, 'feather-soft', { width: px(IMG.headline[0] * k), height: px(IMG.headline[1] * k), top: px(-a * k) });
    img.style.clipPath = `inset(${a * k}px 0 ${(IMG.headline[1] - z) * k}px 0)`; // only its own row, so the rise never shows the line above
    img.src = 'img/headline@3x.png';
    return { wrap, inner, h: (z - a) * k, a: a * k };
  });
  s.sub = crop(root, 'subcopy', kk('subcopy', boost.subcopy), { feather: true });
  const kc = Math.min(k * boost.cta, (MW * 0.96) / (IMG['cta-main'][0] + IMG['cta-secondary'][0] + 16));
  s.cta = crop(root, 'cta-main', kc, { clip: CLIP['cta-main'] });
  s.cta2 = crop(root, 'cta-secondary', kc, { clip: CLIP['cta-secondary'] });
  s.tag = crop(root, 'tagline', kk('tagline', boost.tagline), { feather: true });
  // vertical stack
  const gap = 26 * k;
  const hh = IMG.headline[1] * k;
  const stackH = s.badge.h + gap + hh + gap + s.sub.h + gap * 1.4 + s.cta.h + gap * 1.2 + s.tag.h;
  let y = H * (isV ? 0.47 : isS ? 0.53 : 0.53) - stackH / 2;
  s.pos = {};
  s.pos.badge = [W / 2 - s.badge.w / 2, y]; y += s.badge.h + gap;
  s.pos.head = [W / 2 - (IMG.headline[0] * k) / 2, y]; y += hh + gap;
  s.pos.sub = [W / 2 - s.sub.w / 2, y]; y += s.sub.h + gap * 1.4;
  const rowW = s.cta.w + s.cta2.w + 16 * kc;
  s.pos.cta = [W / 2 - rowW / 2, y];
  s.pos.cta2 = [W / 2 - rowW / 2 + s.cta.w + 16 * kc, y]; y += s.cta.h + gap * 1.2;
  s.pos.tag = [W / 2 - s.tag.w / 2, y];
  // logo top-left, chat widget bottom-right (as on the site)
  s.logo = crop(root, 'logo', isH ? 2.2 : 2.4);
  s.logo.img.style.mixBlendMode = 'screen'; // logo sat on near-black: screen keeps only the mark
  s.pos.logo = [M - 10, isV ? 120 : isS ? 52 : 50];
  s.chat = isS ? null : chatClip(crop(root, 'chat-widget', isV ? 2.4 : 1.9));
  if (s.chat) s.pos.chat = [W - M - s.chat.w + 10, isV ? H - s.chat.h - 150 : H - s.chat.h - 40];
  S.product = s;
}
function popIn(c, t, t0, x, y, mode = 'up') {
  const p = ease.outExpo(prog(t, t0, 0.55));
  vis(c.wrap, t >= t0);
  if (mode === 'up') { tf(c.wrap, x, y + (1 - p) * 60); c.wrap.style.clipPath = `inset(0 0 ${((1 - p) * 100).toFixed(2)}% 0)`; }
  if (mode === 'wipe') { tf(c.wrap, x, y); c.wrap.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`; }
  if (mode === 'center') { tf(c.wrap, x, y); const q = ((1 - p) * 50).toFixed(2); c.wrap.style.clipPath = `inset(0 ${q}% 0 ${q}%)`; }
  if (mode === 'spring') { const sp = spring(t - t0, 3, 0.5); tf(c.wrap, x, y, Math.max(0, lerp(0.6, 1, sp))); c.wrap.style.clipPath = 'none'; }
  if (mode === 'right') { const sp = spring(t - t0, 2.6, 0.6); tf(c.wrap, x + (1 - sp) * 500, y); c.wrap.style.clipPath = 'none'; }
}
function drawProduct(t) {
  const s = S.product, P = Q.parts;
  const on = t >= Q.drop - 0.01 && t < Q.f1.t0 + 0.05;
  disp(s.root, on);
  if (!on) return;
  popIn(s.logo, t, P.logo, ...s.pos.logo, 'wipe');
  popIn(s.badge, t, P.badge, ...s.pos.badge, 'center');
  [P.h1, P.h2, P.h3].forEach((t0, i) => {
    const L = s.lines[i];
    const p = ease.outExpo(prog(t, t0, 0.6));
    tf(L.wrap, s.pos.head[0], s.pos.head[1] + L.a);
    tf(L.inner, 0, (1 - p) * L.h * 1.1);
    vis(L.wrap, t >= t0);
  });
  popIn(s.sub, t, P.sub, ...s.pos.sub, 'up');
  popIn(s.cta, t, P.cta, ...s.pos.cta, 'spring');
  popIn(s.cta2, t, P.cta2, ...s.pos.cta2, 'spring');
  popIn(s.tag, t, P.tag, ...s.pos.tag, 'wipe');
  if (s.chat) popIn(s.chat, t, P.chat, ...s.pos.chat, 'right');
  sceneSlide(s.root, t, Q.drop, Q.f1.t0);
}
// horizontal whip between scenes (exit left, enter from right)
function sceneSlide(root, t, tIn, tOut, enter = true) {
  const pin = enter && tIn > Q.drop + 0.1 ? ease.outExpo(prog(t, tIn - 0.03, 0.45)) : 1;
  const pout = ease.inQuart(prog(t, tOut - 0.22, 0.22));
  root.style.transform = `translate3d(${((1 - pin) * W * 0.8 - pout * W).toFixed(2)}px,0,0)`;
}

// 3 · features
function featTitle(root, kicker, parts) {
  const ts = isV ? 120 : isS ? 92 : 104;
  const tx = M, ty = isV ? 210 : isS ? 70 : 300;
  const k = line(root, [[kicker, false]], isV ? 34 : 28, { cls: 'mono', x: tx, y: ty });
  k.inner.style.color = C.lav;
  const l1 = line(root, parts[0], ts, { x: tx, y: ty + (isV ? 62 : 50), maxW: isH ? 760 : MW });
  const l2 = line(root, parts[1], ts, { x: tx, y: ty + (isV ? 62 : 50) + l1.s * 1.05, maxW: isH ? 760 : MW });
  return [k, l1, l2];
}
function drawTitle(ls, t, t0) { ls.forEach((L, i) => rise(L, t, t0 + i * 0.06, 0.5)); }
// UI area (where the product moment lives)
const UI = isV ? { x: M, y: 640, w: MW, h: 1050 } : isS ? { x: M, y: 330, w: MW, h: 680 } : { x: 940, y: 150, w: 860, h: 780 };

function buildF1() {
  const root = scene();
  const s = { root };
  s.title = featTitle(root, '01 · Agentes de WhatsApp', [[['Agentes que', false]], [['responden ', false], ['al instante', true]]]);
  const k = Math.min(UI.w / IMG['chat-widget'][0], isS ? 3 : 3.6);
  s.chat = chatClip(crop(root, 'chat-widget', k));
  s.orb = crop(root, 'chat-orb', k * 0.9);
  s.orb.img.style.clipPath = `circle(${34 * k * 0.9}px at ${53 * k * 0.9}px ${39 * k * 0.9}px)`;
  s.cx = UI.x + UI.w / 2 - s.chat.w / 2;
  s.cy = UI.y + UI.h * (isS ? 0.32 : 0.36) - s.chat.h / 2;
  s.ox = s.cx + s.chat.w - s.orb.w * 0.8;
  s.oy = s.cy + s.chat.h + 10 * k;
  s.target = [s.cx + 153 * k, s.cy + 32 * k]; // "Pregúntame"
  s.rip = ripple(root);
  s.cur = makeCursor(root, isH ? 1.4 : 1.7);
  S.f1 = s;
}
function drawF1(t) {
  const s = S.f1, F = Q.f1;
  const on = t >= F.t0 - 0.05 && t < F.t1 + 0.05;
  disp(s.root, on);
  if (!on) return;
  drawTitle(s.title, t, F.t0);
  const pin = spring(t - F.t0 - 0.05, 2.4, 0.6);
  const press = t >= F.click - 0.04 && t < F.click + 0.12 ? 0.97 : 1;
  tf(s.chat.wrap, s.cx, s.cy + (1 - Math.min(1, pin)) * 200, Math.max(0, lerp(0.7, 1, pin)) * press);
  vis(s.chat.wrap, t >= F.t0);
  const op = spring(t - F.t0 - 0.2, 2.8, 0.5);
  const glow = 1 + 0.18 * Math.exp(-Math.max(0, t - F.click) * 5) * (t >= F.click ? 1 : 0);
  tf(s.orb.wrap, s.ox, s.oy, Math.max(0, op) * glow, (t - F.t0) * 8);
  vis(s.orb.wrap, t >= F.t0 + 0.2);
  drawRipple(s.rip, t, F.click, ...s.target, s.chat.w * 0.45);
  drawCursor(s.cur, t, F.move, F.click, ...s.target, 1);
  sceneSlide(s.root, t, F.t0, F.t1);
}

function buildF2() {
  const root = scene();
  const s = { root };
  s.title = featTitle(root, '02 · Páginas web', [[['Webs de', false]], [['alta conversión', true]]]);
  const fw = UI.w, fh = (fw * SHOT[1]) / SHOT[0];
  s.fw = fw; s.fh = fh;
  s.frame = el('div', root, 'abs', { width: px(fw), height: px(fh), borderRadius: px(isH ? 22 : 26), overflow: 'hidden', boxShadow: `0 0 0 3px ${C.line}`, background: C.bg });
  s.inner = el('div', s.frame, 'abs', { width: px(fw), height: px(fh), transformOrigin: '0 0' });
  const img = el('img', s.inner, null, { width: px(fw), height: px(fh) });
  img.src = 'img/site-hero@2x.png';
  const k = fw / SHOT[0];
  // the real CTA, cropped from the same pixels, laid exactly over itself so it can be pressed
  s.btn = crop(s.inner, 'cta-main', k, { clip: CLIP['cta-main'] });
  tf(s.btn.wrap, 750 * k, 655 * k);
  s.k = k;
  s.fx = UI.x;
  s.fy = UI.y + (isV ? UI.h * 0.3 : isS ? UI.h * 0.42 : UI.h * 0.5) - fh / 2;
  s.btnPt = [867, 682]; // button centre in screenshot pixels
  s.rip = ripple(root);
  s.cur = makeCursor(root, isH ? 1.4 : 1.7);
  S.f2 = s;
}
function drawF2(t) {
  const s = S.f2, F = Q.f2;
  const on = t >= F.t0 - 0.05 && t < F.t1 + 0.05;
  disp(s.root, on);
  if (!on) return;
  drawTitle(s.title, t, F.t0);
  const pin = ease.outExpo(prog(t, F.t0, 0.6));
  tf(s.frame, s.fx, s.fy + (1 - pin) * 300, lerp(0.85, 1, pin));
  vis(s.frame, t >= F.t0);
  // camera inside the browser pushes in on the real CTA while the cursor travels
  const z = ease.inOutCubic(prog(t, F.move[0], F.move[1] - F.move[0]));
  const Z = lerp(1, isV ? 2.6 : 2.2, z);
  const bx = s.btnPt[0] * s.k, by = s.btnPt[1] * s.k;
  const ix = lerp(0, s.fw / 2 - bx * Z, z), iy = lerp(0, s.fh / 2 - by * Z, z);
  tf(s.inner, ix, iy, Z);
  const press = t >= F.click - 0.04 && t < F.click + 0.12 ? 0.93 : 1;
  s.btn.wrap.style.transformOrigin = '50% 50%';
  tf(s.btn.wrap, 750 * s.k, 655 * s.k, press);
  const sx = s.fx + ix + bx * Z, sy = s.fy + iy + by * Z;
  drawRipple(s.rip, t, F.click, sx, sy, 160);
  drawCursor(s.cur, t, F.move, F.click, s.fx + s.fw / 2 + 20, s.fy + s.fh / 2 + 10, 1);
  sceneSlide(s.root, t, F.t0, F.t1);
}

function buildF3() {
  const root = scene();
  const s = { root };
  s.title = featTitle(root, '03 · SEO / GEO', [[['Que te encuentren', false]], [['en Google y en IA', true]]]);
  // nav sub-crop: "Compañía · Precios · Resultados" (screenshot x 890..1175)
  const k = Math.min(UI.w / 285, isS ? 3 : 3.3);
  s.navWrap = el('div', root, 'abs', { width: px(285 * k), height: px(34 * k), overflow: 'hidden', borderRadius: px(10 * k), background: C.bg, boxShadow: `0 0 0 3px ${C.line}` });
  const nimg = el('img', s.navWrap, null, { width: px(500 * k), height: px(34 * k), left: px(-(890 - 676) * k) });
  nimg.src = 'img/nav@3x.png';
  s.k = k;
  s.nx = UI.x + UI.w / 2 - (285 * k) / 2;
  s.ny = UI.y + UI.h * (isS ? 0.18 : 0.2);
  s.under = el('div', root, 'abs', { height: px(4 * k), width: px(74 * k), background: C.lav, borderRadius: px(2 * k), transformOrigin: '0 50%' });
  s.target = [s.nx + 235 * k, s.ny + 16 * k];
  // tagline with "RESULTADOS MEDIBLES" boxed
  const kt = Math.min(UI.w / IMG.tagline[0], 2.2);
  s.tag = crop(root, 'tagline', kt, { feather: true });
  s.tx = UI.x + UI.w / 2 - s.tag.w / 2;
  s.ty = s.ny + 34 * k + (isS ? 110 : 170);
  s.box = svgBox(root, 200 * kt, 30 * kt);
  s.boxR = sv('rect', s.box, { x: 0, y: 0, width: 196 * kt, height: 30 * kt, rx: 15 * kt, fill: 'none', stroke: C.lav, 'stroke-width': 4, pathLength: 1, 'stroke-dasharray': 1 });
  s.kt = kt;
  s.rip = ripple(root);
  s.cur = makeCursor(root, isH ? 1.4 : 1.7);
  S.f3 = s;
}
function drawF3(t) {
  const s = S.f3, F = Q.f3;
  const on = t >= F.t0 - 0.05 && t < F.t1 + 0.05;
  disp(s.root, on);
  if (!on) return;
  drawTitle(s.title, t, F.t0);
  const pin = spring(t - F.t0, 2.4, 0.62);
  tf(s.navWrap, s.nx, s.ny + (1 - Math.min(1, pin)) * 160, Math.max(0, lerp(0.8, 1, pin)));
  vis(s.navWrap, t >= F.t0);
  const hover = ease.outExpo(prog(t, F.move[1] - 0.1, 0.3));
  tf(s.under, s.nx + 198 * s.k, s.ny + 30 * s.k, 1);
  s.under.style.transform += ` scaleX(${hover.toFixed(3)})`;
  vis(s.under, hover > 0);
  const tp = ease.outExpo(prog(t, F.click + 0.05, 0.5));
  vis(s.tag.wrap, tp > 0);
  tf(s.tag.wrap, s.tx, s.ty + (1 - tp) * 40);
  s.tag.wrap.style.clipPath = `inset(0 ${((1 - tp) * 100).toFixed(2)}% 0 0)`;
  const bp = ease.inOutCubic(prog(t, F.click + 0.25, 0.45));
  tf(s.box, s.tx + 398 * s.kt, s.ty - 2 * s.kt);
  s.boxR.setAttribute('stroke-dashoffset', (1 - bp).toFixed(3));
  vis(s.box, bp > 0);
  drawRipple(s.rip, t, F.click, ...s.target, 120);
  drawCursor(s.cur, t, F.move, F.click, ...s.target, 1);
  sceneSlide(s.root, t, F.t0, F.t1 + 10);
}

// 4 · the number
function buildMetric() {
  const root = scene();
  const s = { root };
  const size = Math.min(isV ? 470 : isS ? 400 : 430, Math.floor((MW * 400) / textWidth('24/7', 400, 'disp lav')));
  const size0 = isV ? 470 : isS ? 400 : 430;
  void size0;
  s.big = el('div', root, 'disp lav', { fontSize: px(size), position: 'absolute', left: '0', top: '0', letterSpacing: '-0.06em', fontVariantNumeric: 'tabular-nums' });
  s.size = size;
  s.sub = line(root, [['que ', false], ['venden y atienden', true]], isV ? 92 : isS ? 76 : 80, { x: W / 2, y: 0, align: 'center' });
  s.sub2 = line(root, [['por ti, siempre.', false]], isV ? 92 : isS ? 76 : 80, { x: W / 2, y: 0, align: 'center' });
  const kt = Math.min(MW / IMG.tagline[0], 1.9);
  s.tag = crop(root, 'tagline', kt, { feather: true });
  S.metric = s;
}
function drawMetric(t) {
  const s = S.metric;
  const on = t >= Q.metric - 0.02 && t < Q.end + 0.05;
  disp(s.root, on);
  if (!on) return;
  // digits roll then lock on the beat
  let txt = '24/7';
  if (t < Q.metricLock) {
    const step = Math.floor(t * 30);
    const p = prog(t, Q.metric, Q.metricLock - Q.metric);
    const d1 = p > 0.8 ? '2' : String(Math.floor(hash01(step, 1) * 10));
    const d2 = p > 0.9 ? '4' : String(Math.floor(hash01(step, 2) * 10));
    const d3 = p > 0.95 ? '7' : String(Math.floor(hash01(step, 3) * 10));
    txt = d1 + d2 + '/' + d3;
  }
  s.big.textContent = txt;
  const w = textWidth('24/7', s.size, 'disp lav') * (1 - 0.015);
  const sp = spring(t - Q.metric, 2.2, 0.45);
  const lock = 1 + 0.06 * Math.exp(-Math.max(0, t - Q.metricLock) * 10) * (t >= Q.metricLock ? 1 : 0);
  s.big.style.transformOrigin = '50% 55%';
  const cy = H * (isV ? 0.4 : 0.38) - s.size * 0.55;
  tf(s.big, W / 2 - w / 2, cy, lerp(1.7, 1, Math.min(sp, 1.08)) * lock);
  const subY = cy + s.size * 1.08;
  tf(s.sub.wrap, s.sub.x, subY);
  tf(s.sub2.wrap, s.sub2.x, subY + s.sub.s * 1.1);
  rise(s.sub, t, Q.metricSub - 0.15, 0.5);
  rise(s.sub2, t, Q.metricSub, 0.5);
  const tp = ease.outExpo(prog(t, Q.metricSub + 0.4, 0.5));
  vis(s.tag.wrap, tp > 0);
  tf(s.tag.wrap, W / 2 - s.tag.w / 2, subY + s.sub.s * 2.6);
  s.tag.wrap.style.clipPath = `inset(0 ${((1 - tp) * 50).toFixed(2)}% 0 ${((1 - tp) * 50).toFixed(2)}%)`;
  const out = ease.inQuart(prog(t, Q.end - 0.22, 0.22));
  s.root.style.transform = `translate3d(0,${(-out * H).toFixed(1)}px,0)`;
}

// 5 · lockup + CTA
function buildEnd() {
  const root = scene();
  const s = { root };
  const ws = isV ? 120 : isS ? 104 : 110;
  s.mark = el('div', root, 'abs', {});
  s.dot = el('div', s.mark, 'abs', { width: px(ws * 0.32), height: px(ws * 0.32), borderRadius: '50%', background: C.dot, top: px(ws * 0.36) });
  s.word = el('div', s.mark, null, { position: 'absolute', left: px(ws * 0.62), top: '0', fontFamily: 'Inter', fontWeight: 700, fontSize: px(ws), letterSpacing: '0.36em', color: C.text, lineHeight: '1', whiteSpace: 'pre' });
  s.word.textContent = 'NÉBULA';
  s.markW = ws * 0.62 + textWidth('NÉBULA', ws, 'x') * 0 + 0;
  s.ws = ws;
  s.prod = line(root, [['Agentes de ', false], ['IA', true], [' para WhatsApp', false]], isV ? 66 : isS ? 58 : 64, { x: W / 2, y: 0, align: 'center' });
  s.cta = crop(root, 'cta-main', isH ? 2.6 : 3);
  s.cta.img.style.clipPath = `inset(${4 * s.cta.k}px ${4 * s.cta.k}px ${4 * s.cta.k}px ${3 * s.cta.k}px round ${24 * s.cta.k}px)`;
  s.url = line(root, [['nebulatechnologiesco.com', false]], isV ? 36 : 32, { cls: 'mono', x: W / 2, y: 0, align: 'center', maxW: MW });
  s.url.inner.style.color = C.muted;
  s.url.inner.style.letterSpacing = '0.08em';
  s.rip = ripple(root);
  s.cur = makeCursor(root, isH ? 1.4 : 1.7);
  S.end = s;
}
function drawEnd(t) {
  const s = S.end;
  const on = t >= Q.end - 0.25;
  disp(s.root, on);
  if (!on) return;
  const pin = ease.outExpo(prog(t, Q.end - 0.25, 0.55));
  s.root.style.transform = `translate3d(0,${((1 - pin) * H).toFixed(1)}px,0)`;
  // wordmark: tracking collapses in
  const ww = s.word.getBoundingClientRect().width;
  const mp = ease.outExpo(prog(t, Q.wordmark, 0.9));
  s.word.style.letterSpacing = `${lerp(0.9, 0.36, mp).toFixed(3)}em`;
  const totalW = s.ws * 0.62 + ww;
  const cy = H * (isV ? 0.34 : isS ? 0.28 : 0.3);
  tf(s.mark, W / 2 - totalW / 2, cy);
  vis(s.mark, t >= Q.wordmark);
  const dp = spring(t - Q.wordmark, 3, 0.45);
  tf(s.dot, 0, 0, Math.max(0, dp));
  tf(s.prod.wrap, s.prod.x, cy + s.ws * 1.5);
  rise(s.prod, t, Q.wordmark + 0.25, 0.5);
  const cs = spring(t - Q.cta, 2.8, 0.5);
  const press = t >= Q.ctaClick - 0.04 && t < Q.ctaClick + 0.12 ? 0.94 : 1;
  const ctaY = cy + s.ws * 1.5 + s.prod.h + (isV ? 120 : 70);
  const cx = W / 2 - s.cta.w / 2;
  tf(s.cta.wrap, cx, ctaY, Math.max(0, lerp(0.5, 1, cs)) * press);
  vis(s.cta.wrap, t >= Q.cta);
  const target = [cx + s.cta.w * 0.62, ctaY + s.cta.h * 0.55];
  drawRipple(s.rip, t, Q.ctaClick, ...target, s.cta.w * 0.7);
  drawCursor(s.cur, t, Q.ctaMove, Q.ctaClick, ...target, 1);
  tf(s.url.wrap, s.url.x, ctaY + s.cta.h + (isV ? 70 : 40));
  rise(s.url, t, Q.url, 0.5);
}

// ------------------------------------------------------------------------------------------ frame
let HITS = [];
function render(t) {
  drawStars(t);
  drawBlob(t);
  drawHook(t);
  drawProduct(t);
  drawF1(t);
  drawF2(t);
  drawF3(t);
  drawMetric(t);
  drawEnd(t);
  let x = 0, y = 0;
  for (const [th, a, sd] of HITS) {
    const d = t - th;
    if (d < 0 || d > 0.6) continue;
    const e = a * Math.exp(-d * 9);
    x += e * noise1(d * 34, sd);
    y += e * noise1(d * 34, sd + 7);
  }
  const s = 1 + Math.abs(x) / W * 2 + Math.abs(y) / H * 2;
  stage.style.transformOrigin = '50% 50%';
  for (const c of stage.children) if (c !== meas) c.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
  void s;
}

async function init() {
  const grid = await (await fetch('beats.json')).json();
  T = makeTimeline(grid);
  b = T.b;
  Q = T.cue;
  HITS = [[Q.hook[0], 8, 1], [Q.drop, 18, 2], [Q.metric, 18, 3], [Q.ctaClick, 8, 4]];
  await Promise.all(['800 100px Inter', '700 100px Inter', '500 30px GeistMono'].map((f) => document.fonts.load(f)));
  await document.fonts.ready;
  meas = el('span', stage, 'disp', { position: 'absolute', left: '-99999px', top: '0' });
  buildBackdrop();
  buildHook();
  buildProduct();
  buildF1();
  buildF2();
  buildF3();
  buildMetric();
  buildEnd();
  await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = r; im.onerror = r; }))));
  await Promise.all([...document.images].map((im) => im.decode().catch(() => 0)));
  render(0);
  return true;
}
window.FILM = { ...FILM, width: W, height: H, fmt: FMT };
window.seek = (t) => render(t);
window.ready = init();
