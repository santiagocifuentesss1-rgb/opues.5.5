// Hilo — "Agentes de IA para WhatsApp". 15 s, 1080x1920, 128 BPM.
// Contract: window.seek(t) paints frame t (async only to fetch the footage frame t needs).
// No CSS transitions, timers or frame-to-frame state; randomness is seeded (mulberry32 / hash01).
import { makeTimeline, FILM, PLATES } from './timeline.js';
import { clamp, lerp, prog, ease, spring, noise1, hash01, mulberry32, decay } from './lib.js';

const W = FILM.width, H = FILM.height, M = 72, MW = W - 2 * M;
const C = { ink: '#0a0d0b', paper: '#eeebe3', accent: '#25d366', white: '#ffffff', line: '#d3cec1', mute: '#6c716b', grey: '#3a403b', inkSoft: '#161b18' };
const stage = document.getElementById('stage');
const PREVIEW = new URLSearchParams(location.search).has('preview');
let T, b, Q;

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
const fvs = (wdth, wght = 900) => `'wdth' ${wdth.toFixed(2)}, 'wght' ${wght}`;
const sp = (t, t0, f = 3.2, d = 0.55) => (t < t0 ? 0 : spring(t - t0, f, d));
const fmtThousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

let meas;
function runW(str, size, wdth, wght = 900, ls = -0.01) {
  meas.style.fontSize = px(size);
  meas.style.fontVariationSettings = fvs(wdth, wght);
  meas.style.letterSpacing = `${ls}em`;
  meas.textContent = str;
  return meas.getBoundingClientRect().width;
}
// Fixed size; solve the width axis so the run fits maxW (shrink size only if the axis bottoms out).
function fitWdth(str, size, maxW, { wmin = 62, wmax = 125, wght = 900, ls = -0.01 } = {}) {
  if (runW(str, size, wmax, wght, ls) <= maxW) return { size, wdth: wmax };
  if (runW(str, size, wmin, wght, ls) > maxW) {
    const s2 = (size * maxW) / runW(str, size, wmin, wght, ls);
    return { size: Math.floor(s2), wdth: wmin };
  }
  let lo = wmin, hi = wmax;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (runW(str, size, mid, wght, ls) <= maxW) lo = mid; else hi = mid;
  }
  return { size, wdth: lo };
}

// Masked display line: the glyphs travel inside a clip, never fade.
function mkLine(parent, str, { size, wdth = 100, wght = 900, color = C.paper, x = M, y = 0, ls = -0.01, maxW = MW, fit = true, wmin = 62, wmax = 125 } = {}) {
  let f = { size, wdth };
  if (fit) f = fitWdth(str, size, maxW, { wmin, wmax: Math.max(wmin, Math.min(wmax, wdth)), wght, ls });
  const h = f.size * 1.08;
  const wrap = el('div', parent, 'abs', { height: px(h), width: px(maxW + 40), overflow: 'hidden' });
  const inner = el('div', wrap, 'disp', { fontSize: px(f.size), fontVariationSettings: fvs(f.wdth, wght), color, letterSpacing: `${ls}em`, position: 'absolute', left: '0', top: px(f.size * 0.04) });
  inner.textContent = str;
  tf(wrap, x, y);
  return { wrap, inner, h, size: f.size, wdth: f.wdth, x, y, w: runW(str, f.size, f.wdth, wght, ls) };
}
// rise in from below the mask; optional exit upward
function rise(L, t, t0, { dur = 0.42, out = Infinity, outDur = 0.3, e = ease.outExpo } = {}) {
  const pin = e(prog(t, t0, dur));
  const pout = ease.inCubic(prog(t, out, outDur));
  tf(L.inner, 0, (1 - pin) * L.h * 1.05 - pout * L.h * 1.1);
  vis(L.wrap, t >= t0 && pout < 1);
}

// ------------------------------------------------------------------------------------------ footage plates
const plateMeta = {};
const frameCache = new Map();
async function loadPlates() {
  for (const [name, p] of Object.entries(PLATES)) {
    try {
      const r = await fetch(`${p.dir}/index.json`);
      plateMeta[name] = r.ok ? { ...p, ...(await r.json()) } : null;
    } catch { plateMeta[name] = null; }
  }
}
function getFrame(name, i) {
  const m = plateMeta[name];
  if (!m) return Promise.resolve(null);
  i = Math.max(0, Math.min(m.count - 1, i));
  const key = `${name}/${i}`;
  if (!frameCache.has(key)) {
    const img = new Image();
    img.src = `${m.dir}/f${String(i + 1).padStart(4, '0')}.jpg`;
    frameCache.set(key, img.decode().then(() => img));
    if (frameCache.size > 10) frameCache.delete(frameCache.keys().next().value);
  }
  return frameCache.get(key);
}
let plateCv, plateCtx;
// Footage time is remapped (speed, start offset) per scene; frame = floor(local time * fps).
async function drawPlate(name, tl, { speed = 1, start = 0, s = 1, x = 0, y = 0, filter = 'none' } = {}) {
  const m = plateMeta[name];
  const ctx = plateCtx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.fillStyle = '#121513';
  ctx.fillRect(0, 0, W, H);
  if (!m) {
    ctx.fillStyle = '#1f2421';
    ctx.font = '600 40px Geist';
    ctx.fillText(`[plate: ${name}]`, M, H - 80);
    return;
  }
  const fi = Math.floor((start + tl * speed) * m.fps);
  const img = await getFrame(name, fi);
  if (!img) return;
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight) * s;
  const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
  ctx.filter = filter;
  ctx.drawImage(img, (W - dw) / 2 + x, (H - dh) / 2 + y, dw, dh);
  ctx.filter = 'none';
}

// Film grain: 6 seeded noise frames, picked by footage frame number (pure function of t).
const grain = [];
let grainCv, grainCtx;
function buildGrain() {
  const gw = 540, gh = 960;
  for (let k = 0; k < 6; k++) {
    const c = document.createElement('canvas');
    c.width = gw; c.height = gh;
    const g = c.getContext('2d');
    const id = g.createImageData(gw, gh);
    const r = mulberry32(900 + k);
    for (let i = 0; i < gw * gh; i++) {
      const v = 128 + (r() + r() + r() - 1.5) * 90;
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
      id.data[i * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    grain.push(c);
  }
  grainCv = el('canvas', stage, null, { mixBlendMode: 'overlay', pointerEvents: 'none' });
  grainCv.width = W; grainCv.height = H;
  grainCtx = grainCv.getContext('2d');
}
function drawGrain(t, amt) {
  grainCtx.clearRect(0, 0, W, H);
  if (amt <= 0) return;
  grainCtx.globalAlpha = amt;
  grainCtx.imageSmoothingEnabled = false;
  grainCtx.drawImage(grain[((Math.floor(t * 24) % 6) + 6) % 6], 0, 0, W, H);
  grainCtx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------ shared UI bits
function chatGlyph(parent, size, color) {
  const g = svgBox(parent, size, size);
  sv('path', g, { d: `M${size * 0.5} ${size * 0.2} C${size * 0.26} ${size * 0.2} ${size * 0.17} ${size * 0.36} ${size * 0.17} ${size * 0.49} C${size * 0.17} ${size * 0.57} ${size * 0.2} ${size * 0.64} ${size * 0.25} ${size * 0.69} L${size * 0.21} ${size * 0.82} L${size * 0.36} ${size * 0.76} C${size * 0.4} ${size * 0.78} ${size * 0.45} ${size * 0.79} ${size * 0.5} ${size * 0.79} C${size * 0.74} ${size * 0.79} ${size * 0.83} ${size * 0.63} ${size * 0.83} ${size * 0.49} C${size * 0.83} ${size * 0.36} ${size * 0.74} ${size * 0.2} ${size * 0.5} ${size * 0.2} Z`, fill: color });
  return g;
}
function checkSvg(parent, size, stroke, bg) {
  const g = svgBox(parent, size, size);
  if (bg) sv('circle', g, { cx: size / 2, cy: size / 2, r: size / 2, fill: bg });
  const p = sv('path', g, { d: `M${size * 0.28} ${size * 0.52} L${size * 0.44} ${size * 0.67} L${size * 0.73} ${size * 0.36}`, fill: 'none', stroke, 'stroke-width': size * 0.11, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const len = size * 0.75;
  p.setAttribute('stroke-dasharray', len);
  return { g, p, len };
}
const drawCheck = (ck, p) => ck.p.setAttribute('stroke-dashoffset', (ck.len * (1 - p)).toFixed(2));
function ripple(parent) {
  const g = svgBox(parent, 10, 10);
  const c = sv('circle', g, { cx: 0, cy: 0, r: 10, fill: 'none', stroke: C.accent, 'stroke-width': 8 });
  return { g, c };
}
function drawRipple(R, t, t0, x, y, maxR, col) {
  const p = prog(t, t0, 0.5);
  vis(R.g, p > 0 && p < 1);
  tf(R.g, x, y);
  if (col) R.c.setAttribute('stroke', col);
  R.c.setAttribute('r', (10 + ease.outCubic(p) * maxR).toFixed(1));
  R.c.setAttribute('stroke-width', (10 * (1 - p)).toFixed(2));
}

// ================================================================================== SCENE 1-2: 03:12
const NOTIFS = [
  ['Ana M.', '¿Tienen cita para mañana?'],
  ['Carlos R.', '¿Cuánto cuesta una limpieza?'],
  ['+57 310 448…', 'Hola, ¿siguen abiertos?'],
  ['Lucía', 'Me duele mucho una muela'],
];
const PILE_MSG = ['¿Precio?', '¿Hola?', '¿Hacen ortodoncia?', '¿A qué hora abren?', 'Quiero agendar una cita', '¿Aceptan transferencia?', '¿Tienen cita para hoy?', '¿Me responden?', '¿Todavía hay cupo?', 'Hola!!', '¿Hacen blanqueamiento?', '¿Cuánto vale una calza?', '¿Atienden urgencias?', '¿Abren el domingo?', '???', 'Buenas noches', '¿Me pueden llamar?', '¿Siguen ahí?', 'Para mañana temprano', '¿Tienen parqueadero?', 'Hola, info', '¿Cuál es la dirección?'];
const N_PILE = 20;
let S1;
function notifCard(parent, who, msg) {
  const card = el('div', parent, 'abs', { width: px(MW), height: px(150), borderRadius: px(38), background: C.paper, transformOrigin: '50% 0%' });
  const ic = el('div', card, 'abs', { width: px(86), height: px(86), borderRadius: px(24), background: C.accent, left: px(30), top: px(32) });
  const gl = chatGlyph(ic, 86, C.white);
  void gl;
  el('div', card, 'ui', { position: 'absolute', left: px(140), top: px(28), fontSize: px(34), fontWeight: 650, color: C.ink, whiteSpace: 'pre' }).textContent = who;
  el('div', card, 'ui', { position: 'absolute', right: px(34), top: px(30), fontSize: px(28), fontWeight: 500, color: C.mute, whiteSpace: 'pre' }).textContent = '03:12';
  el('div', card, 'ui', { position: 'absolute', left: px(140), top: px(76), fontSize: px(42), fontWeight: 480, color: C.ink, whiteSpace: 'pre', width: px(MW - 170), overflow: 'hidden', textOverflow: 'ellipsis' }).textContent = msg;
  return card;
}
function buildS1() {
  const root = el('div', stage, 'layer');
  const cam = el('div', root, 'layer', { transformOrigin: '50% 50%' });
  // clock: rolling digit columns
  const clock = el('div', cam, 'abs');
  const size = 380, wd = 70;
  const chars = '03:12'.split('');
  const cols = [];
  let x = 0;
  const r = mulberry32(31);
  for (const ch of chars) {
    const w = runW(ch, size, wd);
    const col = el('div', clock, 'abs', { width: px(w + 4), height: px(size * 0.86), overflow: 'hidden' });
    tf(col, x, 0);
    const strip = el('div', col, 'disp', { fontSize: px(size), fontVariationSettings: fvs(wd), color: C.paper, position: 'absolute', left: '0', top: px(-size * 0.07), lineHeight: '1' });
    const seq = ch === ':' ? [':'] : [ch, ...Array.from({ length: 6 }, () => String(Math.floor(r() * 10)))];
    strip.innerHTML = seq.map((s) => `<div>${s}</div>`).join('');
    cols.push({ strip, n: seq.length, colon: ch === ':' });
    x += w;
  }
  tf(clock, M - 10, 170);
  const am = mkLine(cam, 'A.M.', { size: 64, wdth: 125, color: C.accent, x: M + x + 8, y: 170 + size * 0.86 - 70, fit: false });
  // unread badge
  const badge = el('div', cam, 'abs', { width: px(132), height: px(132), borderRadius: '50%', background: C.accent, transformOrigin: '50% 50%' });
  const badgeN = el('div', badge, 'disp', { position: 'absolute', left: 0, top: px(30), width: '100%', textAlign: 'center', fontSize: px(70), fontVariationSettings: fvs(80), color: C.ink });
  // hook lines
  const h1 = mkLine(cam, 'TU CLIENTE', { size: 170, wdth: 125, y: 560 });
  const h2 = mkLine(cam, 'TE ESCRIBE.', { size: 170, wdth: 125, y: 560 + 178 });
  const q1 = mkLine(cam, '¿Y QUIÉN', { size: 190, wdth: 125, y: 560 });
  const q2 = mkLine(cam, 'RESPONDE?', { size: 190, wdth: 125, y: 560 + 198, color: C.paper });
  // notification stack + pile
  const stack = el('div', cam, 'layer');
  const notifs = NOTIFS.map(([w, m]) => notifCard(stack, w, m));
  const rp = mulberry32(77);
  const pile = [];
  for (let k = 0; k < N_PILE; k++) {
    const msg = PILE_MSG[k % PILE_MSG.length];
    const who = ['Cliente', 'Mariana', 'Jorge', 'Paula', 'Andrés', 'Sofi', 'Don Luis', 'Valentina'][Math.floor(rp() * 8)];
    const card = notifCard(stack, who, msg);
    pile.push({ card, t: 0, x: M + (rp() - 0.5) * 120, y: 1040 + rp() * 640, r: (rp() - 0.5) * 16, s: 0.84 + rp() * 0.16 });
  }
  // the thread: S-curve that floods the frame green
  const ts = svgBox(root);
  const thread = sv('path', ts, { d: 'M -120 1720 C 300 1760, 980 1500, 860 1180 C 760 900, 120 1060, 220 720 C 300 430, 1000 520, 1220 180', fill: 'none', stroke: C.accent, 'stroke-linecap': 'round', 'stroke-width': 26 });
  S1 = { root, cam, clock, cols, am, badge, badgeN, h1, h2, q1, q2, notifs, pile, thread, ts, threadLen: 0 };
}
function pileTime(k) {
  // accelerating: 8ths, then 16ths, then a smear
  const D = Q.pile[1] - Q.pile[0];
  return Q.pile[0] + D * Math.sqrt((k + 0.4) / N_PILE) * 0.98;
}
async function drawS1(t) {
  const on = t < Q.drop;
  disp(S1.root, on);
  if (!on) return false;
  // footage: slow push; darkens and desaturates as the pile grows
  const pileP = prog(t, Q.pile[0], Q.pile[1] - Q.pile[0]);
  const shakeA = 6 * decay(t - Q.clock, 6) + 10 * pileP * pileP;
  const sx = noise1(t * 9, 3) * shakeA, sy = noise1(t * 9, 4) * shakeA;
  await drawPlate('night', t, { speed: 0.85, start: 0.4, s: 1.06 + t * 0.018, x: sx * 0.6, y: sy * 0.6, filter: `brightness(${(1.0 - 0.35 * pileP).toFixed(3)}) saturate(${(1 - 0.6 * pileP).toFixed(3)}) contrast(1.08)` });
  tf(S1.cam, sx, sy);
  // clock rolls in, colon blinks on the half beat once landed
  S1.cols.forEach((c, i) => {
    if (c.colon) {
      const landed = t > Q.clock + 0.35;
      vis(c.strip, !landed || ((t - Q.clock) / T.P) % 1 < 0.8);
      tf(c.strip, 0, (1 - ease.outExpo(prog(t, Q.clock + 0.1, 0.4))) * 380);
      return;
    }
    const p = ease.outExpo(prog(t, Q.clock + i * 0.045, 0.62));
    tf(c.strip, 0, -(c.n - 1) * 380 * (1 - p));
  });
  rise(S1.am, t, Q.clock + 0.3);
  // hook -> question
  rise(S1.h1, t, Q.hook1, { out: Q.pile[0] });
  rise(S1.h2, t, Q.hook2, { out: Q.pile[0] + 0.04 });
  rise(S1.q1, t, Q.q1);
  rise(S1.q2, t, Q.q3);
  // RESPONDE? jitters harder as the pile grows
  if (t > Q.q3 + 0.3) {
    const j = 8 * pileP * pileP;
    tf(S1.q2.inner, noise1(t * 30, 9) * j, noise1(t * 30, 10) * j);
  }
  // notifications: drop into a stack, newest on top
  const pitch = 172, baseY = 1110;
  const arrived = Q.notifs.map((tn) => sp(t, tn, 3.4, 0.62));
  S1.notifs.forEach((card, i) => {
    const tn = Q.notifs[i];
    if (t < tn) { vis(card, false); return; }
    vis(card, true);
    let push = 0;
    for (let j = i + 1; j < arrived.length; j++) push += pitch * arrived[j];
    const a = arrived[i];
    const settle = prog(t, Q.pile[0], 0.6);
    tf(card, M, baseY + push - (1 - a) * 90 + settle * 0, lerp(0.86, 1, a));
  });
  // the pile
  let count = 0;
  for (const tn of Q.notifs) if (t >= tn) count++;
  S1.pile.forEach((p, k) => {
    const tk = pileTime(k);
    if (t < tk) { vis(p.card, false); return; }
    count++;
    vis(p.card, true);
    const a = sp(t, tk, 4.2, 0.5);
    tf(p.card, p.x, p.y - (1 - a) * 520, p.s * lerp(1.15, 1, a), p.r * a + (1 - a) * -p.r);
  });
  // badge: counts every unanswered message
  vis(S1.badge, t >= Q.notifs[0]);
  S1.badgeN.textContent = String(count);
  let bump = 0;
  for (const tn of [...Q.notifs, ...S1.pile.map((_, k) => pileTime(k))]) if (t >= tn) bump = Math.max(bump, decay(t - tn, 14));
  tf(S1.badge, W - M - 132, 150, (t < Q.notifs[0] ? 0 : sp(t, Q.notifs[0], 4, 0.5)) * (1 + 0.22 * bump));
  vis(S1.cam, t < Q.thread[1] - 0.12 || true);
  // the thread
  if (!S1.threadLen) S1.threadLen = S1.thread.getTotalLength();
  const tp = ease.inOutCubic(prog(t, Q.thread[0], 0.32));
  const flood = ease.inExpo(prog(t, Q.thread[0] + 0.28, Q.thread[1] - Q.thread[0] - 0.28));
  vis(S1.ts, t >= Q.thread[0]);
  S1.thread.setAttribute('stroke-dasharray', S1.threadLen);
  S1.thread.setAttribute('stroke-dashoffset', (S1.threadLen * (1 - tp)).toFixed(1));
  S1.thread.setAttribute('stroke-width', (26 + flood * 4200).toFixed(1));
  return true;
}

// ================================================================================== SCENE 3-4: the agent + the chat (one "phone" tile)
let S3;
const BAND = 600;
function bubble(parent, side, text, { size = 50 } = {}) {
  const n = el('div', parent, 'ui', {
    position: 'absolute', maxWidth: px(760), padding: '26px 36px 28px', fontSize: px(size), fontWeight: 480, color: C.ink,
    background: side === 'a' ? C.accent : C.white, borderRadius: side === 'a' ? '38px 12px 38px 38px' : '12px 38px 38px 38px',
    border: side === 'a' ? 'none' : `2px solid ${C.line}`, whiteSpace: 'pre-wrap', transformOrigin: side === 'a' ? '100% 0%' : '0% 0%',
  });
  n.textContent = text;
  return n;
}
function buildS3() {
  const root = el('div', stage, 'layer', { background: C.ink });
  const mosaic = el('canvas', root);
  mosaic.width = W; mosaic.height = H;
  const tile = el('div', root, 'layer', { transformOrigin: '540px 960px', overflow: 'hidden' });
  const chat = el('div', tile, 'layer', { background: C.paper });
  const band = el('div', tile, 'abs', { width: px(W), height: px(H), background: C.accent });
  // headline (big in full-green, then parks small in the band)
  const head = el('div', band, 'abs', { transformOrigin: '0 0' });
  const hl1 = mkLine(head, 'TU AGENTE', { size: 250, wdth: 125, color: C.ink, x: 0, y: 0 });
  const hl2 = mkLine(head, 'DE IA.', { size: 250, wdth: 125, color: C.ink, x: 0, y: 262, fit: false });
  // verbs
  const verbs = ['VENDE.', 'COBRA.', 'AGENDA.', 'ESCUCHA.'].map((v) => mkLine(band, v, { size: 330, wdth: 125, color: C.ink, x: M - 6, y: 150 }));
  // chat header
  const hdr = el('div', chat, 'abs', { width: px(W), height: px(150), top: px(BAND), borderBottom: `2px solid ${C.line}` });
  const av = el('div', hdr, 'abs', { left: px(M), top: px(29), width: px(92), height: px(92), borderRadius: '50%', background: C.ink });
  el('div', av, 'disp', { position: 'absolute', width: '100%', textAlign: 'center', top: px(22), fontSize: px(52), fontVariationSettings: fvs(100), color: C.paper }).textContent = 'S';
  el('div', hdr, 'ui', { position: 'absolute', left: px(M + 120), top: px(30), fontSize: px(42), fontWeight: 650, color: C.ink, whiteSpace: 'pre' }).textContent = 'Sonríe Odontología';
  const st = el('div', hdr, 'ui', { position: 'absolute', left: px(M + 120), top: px(84), fontSize: px(32), fontWeight: 480, color: C.mute, whiteSpace: 'pre' });
  st.innerHTML = `<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${C.accent};margin-right:10px;vertical-align:1px"></span>Agente IA · en línea`;
  // messages
  const area = el('div', chat, 'abs', { top: px(BAND + 152), width: px(W), height: px(H - BAND - 152), overflow: 'hidden' });
  const list = el('div', area, 'abs', { width: px(W) });
  const items = [];
  const add = (t, side, node, gap = 26) => { items.push({ t, side, node, gap }); return node; };
  add(Q.c1, 'c', bubble(list, 'c', '¿Tienen cita para mañana?'));
  const dots = add(Q.dots, 'a', el('div', list, 'abs', { width: px(170), height: px(96), borderRadius: '38px 12px 38px 38px', background: C.accent, transformOrigin: '100% 0%' }));
  const dotEls = [0, 1, 2].map((i) => el('div', dots, 'abs', { width: px(20), height: px(20), borderRadius: '50%', background: C.ink, left: px(42 + i * 34), top: px(38) }));
  const a1 = add(Q.a1, 'a', bubble(list, 'a', '¡Sí! Tengo espacio en la mañana.'));
  const stamp = add(Q.stamp, 'a', el('div', list, 'ui', { position: 'absolute', fontSize: px(34), fontWeight: 600, color: C.ink, whiteSpace: 'pre', transformOrigin: '100% 0%' }), 12);
  stamp.innerHTML = `<span style="display:inline-block;padding:10px 20px;border-radius:30px;border:2px solid ${C.ink}">respondido en 0,8 s</span>`;
  // product card
  const card = add(Q.card, 'a', el('div', list, 'abs', { width: px(600), borderRadius: px(38), background: C.white, border: `2px solid ${C.line}`, overflow: 'hidden', transformOrigin: '100% 0%' }));
  const ph = el('div', card, null, { width: px(596), height: px(400), background: '#2a2622', position: 'relative', overflow: 'hidden' });
  const img = el('img', ph, null, { width: px(596), height: px(596), position: 'absolute', left: 0, top: px(-110), objectFit: 'cover' });
  img.src = 'media/service.jpg';
  img.onerror = () => { img.style.display = 'none'; };
  const cb = el('div', card, null, { padding: '26px 32px 32px', position: 'relative' });
  el('div', cb, 'ui', { fontSize: px(40), fontWeight: 600, color: C.ink, whiteSpace: 'pre' }).textContent = 'Limpieza dental';
  el('div', cb, 'disp', { fontSize: px(76), fontVariationSettings: fvs(90), color: C.ink, marginTop: px(12) }).textContent = '$120.000';
  const btn = el('div', cb, null, { marginTop: px(24), height: px(96), borderRadius: px(48), background: C.ink, position: 'relative', transformOrigin: '50% 50%' });
  const btnTxt = el('div', btn, 'ui', { position: 'absolute', width: '100%', textAlign: 'center', top: px(26), fontSize: px(40), fontWeight: 600, color: C.paper, whiteSpace: 'pre' });
  const c2 = add(Q.c2, 'c', bubble(list, 'c', '¡Perfecto, esa!'));
  // payment card
  const pay = add(Q.pay, 'a', el('div', list, 'abs', { width: px(600), borderRadius: px(38), background: C.white, border: `2px solid ${C.line}`, padding: '28px 32px 30px', transformOrigin: '100% 0%' }));
  el('div', pay, 'ui', { fontSize: px(32), fontWeight: 500, color: C.mute, whiteSpace: 'pre' }).textContent = 'Abono de la cita';
  el('div', pay, 'disp', { fontSize: px(84), fontVariationSettings: fvs(90), color: C.ink, marginTop: px(10) }).textContent = '$40.000';
  const barBg = el('div', pay, null, { marginTop: px(20), height: px(12), borderRadius: px(6), background: '#e6e2d8', position: 'relative', overflow: 'hidden' });
  const bar = el('div', barBg, 'abs', { height: '100%', width: '100%', background: C.accent, transformOrigin: '0 0' });
  const payRow = el('div', pay, null, { marginTop: px(22), height: px(56), position: 'relative' });
  const payCk = checkSvg(payRow, 56, C.ink, C.accent);
  const payTxt = el('div', payRow, 'ui', { position: 'absolute', left: px(74), top: px(8), fontSize: px(38), fontWeight: 650, color: C.ink, whiteSpace: 'pre' });
  // slots
  const slots = add(Q.slots, 'a', el('div', list, 'abs', { width: px(640), transformOrigin: '100% 0%' }));
  const sq = bubble(slots, 'a', '¿Qué hora te sirve?');
  sq.style.right = '0';
  sq.style.whiteSpace = 'pre';
  const chipTop = sq.offsetHeight + 18;
  const chips = ['8:00', '9:30', '11:00'].map((s, i) => {
    const c = el('div', slots, 'abs', { width: px(196), height: px(92), borderRadius: px(46), border: `3px solid ${C.ink}`, background: C.white, top: px(chipTop), left: px(640 - 3 * 196 - 2 * 14 + i * 210), transformOrigin: '50% 50%' });
    const tx = el('div', c, 'ui', { position: 'absolute', width: '100%', textAlign: 'center', top: px(22), fontSize: px(40), fontWeight: 650, color: C.ink });
    tx.textContent = s;
    return { c, tx };
  });
  slots.style.height = px(chipTop + 92);
  // voice note
  const voice = add(Q.voice, 'c', el('div', list, 'abs', { width: px(640), height: px(124), borderRadius: '12px 38px 38px 38px', background: C.white, border: `2px solid ${C.line}`, transformOrigin: '0% 0%' }));
  const play = el('div', voice, 'abs', { left: px(26), top: px(22), width: px(76), height: px(76), borderRadius: '50%', background: C.ink });
  const pg = svgBox(play, 76, 76);
  sv('path', pg, { d: 'M30 22 L56 38 L30 54 Z', fill: C.paper });
  const wv = svgBox(voice, 640, 124);
  const rw = mulberry32(55);
  const bars = [];
  for (let i = 0; i < 30; i++) {
    const h = 14 + Math.pow(rw(), 1.4) * 60 * (0.5 + 0.5 * Math.sin(i * 0.45));
    bars.push(sv('rect', wv, { x: 130 + i * 14, y: 62 - h / 2, width: 8, height: h, rx: 4, fill: '#b9b4a8' }));
  }
  el('div', voice, 'ui', { position: 'absolute', right: px(30), top: px(42), fontSize: px(30), fontWeight: 500, color: C.mute }).textContent = '0:04';
  const vt = add(Q.voiceTxt, 'c', el('div', list, 'ui', { position: 'absolute', fontSize: px(42), fontWeight: 500, color: C.mute, whiteSpace: 'pre', transformOrigin: '0% 0%' }), 12);
  vt.textContent = '“¿Y la limpieza duele?”';
  const rip = ripple(list);

  // layout (static): measure each item once
  for (const it of items) {
    it.h = it.node.offsetHeight || parseFloat(it.node.style.height) || 100;
    it.w = it.node.offsetWidth || parseFloat(it.node.style.width) || 600;
    it.x = it.side === 'a' ? W - M - it.w : M;
  }
  // overlay type over the mosaic (screen space)
  const over = el('div', root, 'layer');
  const group = () => el('div', over, 'layer');
  const g1 = group(), g2 = group(), g3 = group();
  const plate = (g, y, h) => el('div', g, 'abs', { width: px(W), height: px(h), background: C.ink, transformOrigin: '0 0', top: px(y) });
  const p1 = plate(g1, 170, 210), p2 = plate(g2, 1150, 400), p3 = plate(g3, 1550, 300);
  const o1 = mkLine(g1, '1 AGENTE.', { size: 170, wdth: 125, color: C.paper, y: 190 });
  const counter = el('div', g2, 'disp', { position: 'absolute', left: px(M - 8), top: px(1150), fontSize: px(400), fontVariationSettings: fvs(78), color: C.accent, whiteSpace: 'pre', lineHeight: '1' });
  const o3 = mkLine(g3, 'CONVERSACIONES', { size: 120, wdth: 125, color: C.paper, y: 1572 });
  const o4 = mkLine(g3, 'A LA VEZ.', { size: 120, wdth: 125, color: C.paper, y: 1700, fit: false });
  S3 = { root, mosaic, mctx: mosaic.getContext('2d'), tile, chat, band, head, hl1, hl2, verbs, list, items, dots, dotEls, a1, stamp, card, btn, btnTxt, c2, pay, bar, payCk, payTxt, slots, chips, voice, bars, vt, rip, over, g1, g2, g3, p1, p2, p3, o1, counter, o3, o4 };
}

// camera for the zoom-out: scale + rotation about frame centre
function worldCam(t) {
  const z0 = Q.zoom[0], z1 = Q.zoom[1];
  const p = ease.inOutCubic(prog(t, z0, z1 - z0));
  const drift = prog(t, z1, Q.collapse[0] - z1);
  const s = Math.exp(lerp(Math.log(1), Math.log(0.085), p)) * lerp(1, 0.78, ease.outQuad(drift));
  const r = lerp(0, -9, ease.inOutCubic(prog(t, z0, Q.collapse[0] - z0)));
  return { s, r };
}
const PITCH_X = 1080 + 150, PITCH_Y = 1920 + 150;
function tileAnswer(i, j) {
  const d = Math.hypot(i, j * 1.4);
  return Q.zoom[0] + 0.5 * T.P + d * 0.075 + hash01(i * 131 + j, 5) * 0.25;
}
// implode: outer tiles first, converging on the live one
function tileCollapse(i, j) {
  const d = Math.hypot(i, j * 1.4);
  return Q.collapse[0] + clamp(1 - d / 11) * 0.17 + hash01(i * 71 + j, 8) * 0.03;
}
function drawMosaic(t, cam) {
  const ctx = S3.mctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  if (cam.s > 0.97) return;
  const a = (cam.r * Math.PI) / 180;
  ctx.setTransform(cam.s * Math.cos(a), cam.s * Math.sin(a), -cam.s * Math.sin(a), cam.s * Math.cos(a), W / 2, H / 2);
  const R = Math.ceil((Math.hypot(W, H) / cam.s / PITCH_X) / 2) + 1, RJ = Math.ceil((Math.hypot(W, H) / cam.s / PITCH_Y) / 2) + 1;
  for (let j = -RJ; j <= RJ; j++)
    for (let i = -R; i <= R; i++) {
      if (i === 0 && j === 0) continue;
      const cx = i * PITCH_X, cy = j * PITCH_Y;
      const ta = tileAnswer(i, j);
      const ans = t >= ta;
      const pop = ans ? 1 + 0.08 * Math.sin(Math.min(1, (t - ta) / 0.25) * Math.PI) : 1;
      const col = t >= Q.collapse[0] ? 1 - ease.inCubic(prog(t, tileCollapse(i, j), 0.13)) : 1;
      const k = pop * col;
      if (k <= 0.001) continue;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.fillStyle = C.paper;
      ctx.beginPath();
      ctx.roundRect(-540, -960, 1080, 1920, 70);
      ctx.fill();
      ctx.fillStyle = ans ? C.accent : C.grey;
      ctx.beginPath();
      ctx.roundRect(-540, -960, 1080, BAND, [70, 70, 0, 0]);
      ctx.fill();
      // abstract chat: bubbles alternate customer / agent
      const n = 5;
      for (let m = 0; m < n; m++) {
        const agent = m % 2 === 1;
        const shown = agent ? ans || m < 1 : true;
        if (!shown) continue;
        const bw = 360 + hash01(i * 7 + j * 13 + m, 2) * 360;
        const by = -960 + BAND + 220 + m * 210;
        ctx.fillStyle = agent ? C.accent : C.white;
        ctx.beginPath();
        ctx.roundRect(agent ? 540 - 72 - bw : -540 + 72, by, bw, 150, 40);
        ctx.fill();
      }
      ctx.restore();
    }
  // the live tile flattens into the thread, which slices across the frame into the next scene
  const lp = ease.inExpo(prog(t, Q.collapse[0] + 0.24, Q.night - Q.collapse[0] - 0.24));
  if (lp > 0) {
    ctx.setTransform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), W / 2, H / 2);
    ctx.fillStyle = C.accent;
    const lw = lerp(60, 2600, lp), lh = 16;
    ctx.beginPath();
    ctx.roundRect(-lw / 2, -lh / 2, lw, lh, lh / 2);
    ctx.fill();
  }
}

async function drawS3(t) {
  const on = t >= Q.drop - 0.02 && t < Q.night;
  disp(S3.root, on);
  if (!on) return false;
  const cam = worldCam(t);
  drawMosaic(t, cam);
  // centre tile (the live chat): collapses last, into a line
  const col = ease.inCubic(prog(t, Q.collapse[0] + 0.18, Q.night - Q.collapse[0] - 0.2));
  S3.tile.style.transform = `rotate(${cam.r.toFixed(3)}deg) scale(${(cam.s * (1 - col * 0.2)).toFixed(4)}, ${(cam.s * (1 - col)).toFixed(4)})`;
  S3.tile.style.borderRadius = px(cam.s < 0.98 ? 70 : 0);
  // band: full green on the drop, then parks at the top
  const bp = sp(t, Q.chatIn, 2.6, 0.72);
  const bandH = lerp(H, BAND, bp);
  S3.band.style.height = px(bandH);
  // headline: slam (width axis) then shrink into the band
  const slam = sp(t, Q.agentWord, 4.5, 0.42);
  const hs = lerp(1, 0.66, bp);
  tf(S3.head, M, lerp(560, 110, bp), hs);
  rise(S3.hl1, t, Q.agentWord - 0.001, { dur: 0.22, out: Q.verbs[0] - 0.02, outDur: 0.22 });
  rise(S3.hl2, t, Q.agentWord + T.P / 2, { dur: 0.22, out: Q.verbs[0], outDur: 0.22 });
  S3.hl1.inner.style.fontVariationSettings = fvs(lerp(125, S3.hl1.wdth, slam));
  const s2 = sp(t, Q.agentWord + T.P / 2, 4.5, 0.42);
  S3.hl2.inner.style.fontVariationSettings = fvs(lerp(125, 100, s2));
  // verbs, one per beat
  S3.verbs.forEach((L, i) => {
    const t0 = Q.verbs[i];
    const out = i < 3 ? Q.verbs[i + 1] : Q.zoom[0] - 0.04;
    rise(L, t, t0, { dur: 0.3, out, outDur: 0.18 });
    const s = sp(t, t0, 4, 0.45);
    L.inner.style.transformOrigin = '0 100%';
    L.inner.style.fontVariationSettings = fvs(lerp(Math.min(125, L.wdth + 30), L.wdth, s));
  });
  // chat list: bottom-anchored, every arrival pushes the column up (spring)
  const areaH = H - BAND - 152, bottomPad = 70;
  let total = 0;
  const arr = S3.items.map((it) => {
    const a = sp(t, it.t, 3.6, 0.7);
    total += (it.h + it.gap) * a;
    return a;
  });
  // the typing bubble leaves when the answer lands
  const dotsIt = S3.items.find((it) => it.node === S3.dots);
  const dotsGone = sp(t, Q.a1, 5, 0.9);
  total -= (dotsIt.h + dotsIt.gap) * dotsGone * arr[S3.items.indexOf(dotsIt)];
  let y = Math.min(40, areaH - bottomPad - total);
  S3.items.forEach((it, k) => {
    const a = arr[k];
    const isDots = it.node === S3.dots;
    const k2 = isDots ? a * (1 - dotsGone) : a;
    vis(it.node, t >= it.t && k2 > 0.001);
    const pop = sp(t, it.t, 4.2, 0.55);
    tf(it.node, it.x, y, lerp(0.4, 1, pop) * (isDots ? 1 - dotsGone : 1));
    y += (it.h + it.gap) * k2;
  });
  S3.dotEls.forEach((d, i) => tf(d, 0, -12 * Math.max(0, Math.sin((t - Q.dots) * 14 - i * 0.9))));
  // product card button: tap on VENDE
  const tapped = t >= Q.tap;
  S3.btnTxt.textContent = tapped ? 'Reservado  ✓' : 'Reservar';
  S3.btn.style.background = tapped ? C.accent : C.ink;
  S3.btnTxt.style.color = tapped ? C.ink : C.paper;
  const press = t >= Q.tap - 0.06 && t < Q.tap + 0.08 ? 0.93 : 1;
  tf(S3.btn, 0, 0, press * (1 + 0.05 * Math.sin(Math.min(1, Math.max(0, (t - Q.tap) / 0.22)) * Math.PI)));
  const cardIt = S3.items.find((it) => it.node === S3.card);
  const cardY = parseFloat(S3.card.style.transform.split(',')[1]);
  drawRipple(S3.rip, t, Q.tap, cardIt.x + 300, cardY + cardIt.h - 80, 170);
  // payment: bar fills, then check draws
  const fill = ease.inOutCubic(prog(t, Q.pay + 0.1, Q.paid - Q.pay - 0.1));
  S3.bar.style.transform = `scaleX(${fill.toFixed(4)})`;
  const paid = t >= Q.paid;
  drawCheck(S3.payCk, ease.outCubic(prog(t, Q.paid, 0.25)));
  vis(S3.payCk.g, paid);
  S3.payTxt.textContent = paid ? 'Pagado' : 'Procesando…';
  S3.payTxt.style.left = px(paid ? 74 : 0);
  S3.payTxt.style.color = paid ? C.ink : C.mute;
  // time slot pick
  S3.chips.forEach((c, i) => {
    const ci = sp(t, Q.slots + 0.08 + i * 0.06, 4, 0.55);
    const picked = i === 1 && t >= Q.pick;
    c.c.style.background = picked ? C.ink : C.white;
    c.tx.style.color = picked ? C.paper : C.ink;
    tf(c.c, 0, 0, ci * (picked ? 1 + 0.1 * Math.sin(Math.min(1, (t - Q.pick) / 0.25) * Math.PI) : 1));
  });
  // voice note: playhead sweeps the waveform
  const vp = prog(t, Q.voice + 0.1, 1.2);
  S3.bars.forEach((r, i) => r.setAttribute('fill', i / 30 < vp ? C.accent : '#b9b4a8'));

  // screen-space type over the mosaic
  const ov = t >= Q.zoom[0];
  disp(S3.over, ov);
  if (ov) {
    // plates wipe in (scaleX), groups wipe off left-to-right with their type
    const wipe = (pl, g, t0, out) => {
      pl.style.transform = `scaleX(${ease.outExpo(prog(t, t0, 0.35)).toFixed(4)})`;
      g.style.clipPath = `inset(0 0 0 ${(ease.inExpo(prog(t, out, 0.22)) * 100).toFixed(2)}%)`;
    };
    wipe(S3.p1, S3.g1, Q.one - 0.08, Q.collapse[0]);
    wipe(S3.p2, S3.g2, Q.one + T.P - 0.08, Q.collapse[0] + 0.03);
    wipe(S3.p3, S3.g3, Q.many - 0.08, Q.collapse[0] + 0.06);
    rise(S3.o1, t, Q.one);
    const span = Q.many + T.P * 1.5 - Q.one - T.P;
    const cp = prog(t, Q.one + T.P, span);
    // the count advances on 16ths
    const q = (Math.floor((cp * span) / (T.P / 4)) * (T.P / 4)) / span;
    S3.counter.textContent = fmtThousands(Math.round(1 + 1283 * ease.outCubic(clamp(q))));
    const cIn = ease.outExpo(prog(t, Q.one + T.P, 0.35));
    S3.counter.style.clipPath = `inset(${((1 - cIn) * 100).toFixed(2)}% 0 0 0)`;
    tf(S3.counter, 0, (1 - cIn) * 120);
    vis(S3.counter, t >= Q.one + T.P);
    rise(S3.o3, t, Q.many);
    rise(S3.o4, t, Q.many + T.P);
  }
  return true;
}

// ================================================================================== SCENE 5: night shop
let S5;
const ORDERS = [['03:14', 'Limpieza dental', 'mar 9:30 · abono pagado'], ['03:52', 'Valoración', 'mar 11:00 · confirmada'], ['04:37', 'Blanqueamiento', 'mié 8:00 · abono pagado'], ['05:20', 'Ortodoncia', 'mié 4:30 p.m. · confirmada']];
function buildS5() {
  const root = el('div', stage, 'layer');
  const scrim = el('div', root, 'layer', { background: 'linear-gradient(180deg, rgba(5,7,6,.72) 0%, rgba(5,7,6,0) 42%, rgba(5,7,6,0) 52%, rgba(5,7,6,.7) 100%)' });
  void scrim;
  const l1 = mkLine(root, 'MIENTRAS', { size: 200, wdth: 125, y: 150 });
  const l2 = mkLine(root, 'TU CLÍNICA', { size: 200, wdth: 125, y: 150 + 212 });
  const l3 = mkLine(root, 'DUERME,', { size: 200, wdth: 125, y: 150 + 424, color: C.accent });
  const rows = ORDERS.map(([tm, id, amt]) => {
    const r = el('div', root, 'abs', { width: px(MW), height: px(132), borderRadius: px(34), background: C.paper });
    el('div', r, 'disp', { position: 'absolute', left: px(34), top: px(40), fontSize: px(56), fontVariationSettings: fvs(80), color: C.ink }).textContent = tm;
    el('div', r, 'ui', { position: 'absolute', left: px(230), top: px(26), fontSize: px(38), fontWeight: 650, color: C.ink, whiteSpace: 'pre' }).textContent = id;
    el('div', r, 'ui', { position: 'absolute', left: px(230), top: px(72), fontSize: px(36), fontWeight: 500, color: C.mute, whiteSpace: 'pre' }).textContent = amt;
    const ck = checkSvg(r, 76, C.ink, C.accent);
    tf(ck.g, MW - 34 - 76, 28);
    return { r, ck };
  });
  S5 = { root, l1, l2, l3, rows };
}
async function drawS5(t) {
  const on = t >= Q.night && t < Q.morning;
  disp(S5.root, on);
  if (!on) return false;
  const tl = t - Q.night;
  const hit = decay(tl, 7);
  await drawPlate('shop', tl, { speed: 1, start: 0.3, s: 1.12 - tl * 0.02 + hit * 0.05, filter: 'brightness(0.95) contrast(1.1) saturate(0.9)' });
  rise(S5.l1, t, Q.nightWords[0]);
  rise(S5.l2, t, Q.nightWords[0] + T.P / 2);
  rise(S5.l3, t, Q.nightWords[1] + T.P / 2);
  S5.rows.forEach((o, k) => {
    const t0 = Q.orders[k];
    const a = sp(t, t0, 3.4, 0.68);
    vis(o.r, t >= t0);
    tf(o.r, M + (1 - a) * 1100, 1180 + k * 154);
    drawCheck(o.ck, ease.outCubic(prog(t, t0 + 0.16, 0.22)));
  });
  return true;
}

// ================================================================================== SCENE 6: morning, 23 new appointments
let S6;
function buildS6() {
  const root = el('div', stage, 'layer');
  el('div', root, 'layer', { background: 'linear-gradient(180deg, rgba(10,8,5,0) 45%, rgba(10,8,5,.78) 78%, rgba(10,8,5,.85) 100%)' });
  const l1 = mkLine(root, 'Y TÚ ABRES CON', { size: 116, wdth: 125, y: 1060 });
  const num = el('div', root, 'disp', { position: 'absolute', left: px(M - 14), top: px(1150), fontSize: px(520), fontVariationSettings: fvs(72), color: C.paper, lineHeight: '1', transformOrigin: '0% 80%', whiteSpace: 'pre' });
  const l3 = mkLine(root, 'CITAS NUEVAS.', { size: 168, wdth: 125, y: 1590, x: M + 0, maxW: MW, fit: true });
  const us = svgBox(root);
  const under = sv('path', us, { d: `M ${M} 1795 C 300 1782, 700 1806, ${W - M} 1788`, fill: 'none', stroke: C.accent, 'stroke-width': 18, 'stroke-linecap': 'round' });
  S6 = { root, l1, num, l3, under, ulen: 0 };
}
async function drawS6(t) {
  const on = t >= Q.morning && t < Q.end;
  disp(S6.root, on);
  if (!on) return false;
  const tl = t - Q.morning;
  const hit = decay(t - Q.countHit, 8);
  const shx = noise1(t * 40, 21) * 14 * hit, shy = noise1(t * 40, 22) * 14 * hit;
  await drawPlate('owner', tl, { speed: 1, start: 0.35, s: 1.04 + tl * 0.025 + hit * 0.03, x: shx, y: shy, filter: 'contrast(1.06) saturate(1.05)' });
  rise(S6.l1, t, Q.open1);
  // count to 23 on 16ths, slam on the beat
  const q = Math.floor(prog(t, Q.count[0], Q.count[1] - Q.count[0]) * 8) / 8;
  const n = t >= Q.countHit ? 23 : Math.round(23 * ease.outCubic(q));
  S6.num.textContent = String(n);
  const nin = ease.outExpo(prog(t, Q.count[0], 0.3));
  vis(S6.num, t >= Q.count[0]);
  S6.num.style.clipPath = `inset(0 0 ${((1 - nin) * 100).toFixed(2)}% 0)`;
  const slam = sp(t, Q.countHit, 5, 0.38);
  tf(S6.num, shx, shy + (1 - nin) * -80, t >= Q.countHit ? lerp(1.18, 1, slam) : 1);
  S6.num.style.fontVariationSettings = fvs(t >= Q.countHit ? lerp(110, 72, slam) : 72);
  S6.num.style.color = t >= Q.countHit ? C.accent : C.paper;
  rise(S6.l3, t, Q.countHit);
  if (!S6.ulen) S6.ulen = S6.under.getTotalLength();
  const up = ease.inOutCubic(prog(t, Q.underline, 0.5));
  S6.under.setAttribute('stroke-dasharray', S6.ulen);
  S6.under.setAttribute('stroke-dashoffset', (S6.ulen * (1 - up)).toFixed(1));
  vis(S6.under, up > 0);
  return true;
}

// ================================================================================== SCENE 7: lockup
let S7;
function buildS7() {
  const root = el('div', stage, 'layer', { background: C.ink });
  const g = svgBox(root);
  // speech bubble drawn by the thread, tail bottom-left; starts where the underline ended
  const x0 = 150, y0 = 520, w = 780, h = 420, r = 150;
  const d = `M ${x0 + r} ${y0 + h} H ${x0 + w - r} A ${r} ${r} 0 0 0 ${x0 + w} ${y0 + h - r} V ${y0 + r} A ${r} ${r} 0 0 0 ${x0 + w - r} ${y0} H ${x0 + r} A ${r} ${r} 0 0 0 ${x0} ${y0 + r} V ${y0 + h - 40} L ${x0 - 40} ${y0 + h + 70} L ${x0 + r} ${y0 + h}`;
  const bub = sv('path', g, { d, fill: 'none', stroke: C.accent, 'stroke-width': 22, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const lead = sv('path', g, { d: `M -60 1788 C 300 1780, 700 1500, ${x0 + r} ${y0 + h}`, fill: 'none', stroke: C.accent, 'stroke-width': 22, 'stroke-linecap': 'round' });
  const dots = [0, 1, 2].map((i) => sv('circle', g, { cx: 540 - 70 + i * 70, cy: y0 + h / 2, r: 22, fill: C.paper }));
  // wordmark fitted inside the bubble on the width axis (size drops only if the axis bottoms out)
  const WORD = 'nebula';
  const wf = fitWdth(WORD, 290, w - 170, { wmin: 62, wmax: 100, ls: -0.02 });
  const wm = el('div', root, 'disp', { position: 'absolute', left: 0, top: px(y0 + h / 2 + 15 - wf.size / 2), width: px(W), textAlign: 'center', fontSize: px(wf.size), color: C.paper, letterSpacing: '-0.02em', whiteSpace: 'pre', lineHeight: '1' });
  wm.textContent = WORD;
  wm.dataset.wdth = wf.wdth;
  const tag = el('div', root, 'ui', { position: 'absolute', left: 0, width: px(W), textAlign: 'center', top: px(1090), fontSize: px(60), fontWeight: 560, color: C.paper, whiteSpace: 'pre', overflow: 'hidden', height: px(80) });
  const tagIn = el('div', tag, null, { position: 'relative' });
  tagIn.textContent = 'Agentes de IA para WhatsApp';
  const cta = el('div', root, 'abs', { width: px(660), height: px(140), borderRadius: px(70), background: C.accent, transformOrigin: '50% 50%' });
  el('div', cta, 'ui', { position: 'absolute', width: '100%', textAlign: 'center', top: px(42), fontSize: px(52), fontWeight: 650, color: C.ink, whiteSpace: 'pre' }).textContent = 'Pruébalo gratis  →';
  const rip = ripple(root);
  S7 = { root, bub, lead, dots, wm, tag, tagIn, cta, rip, blen: 0, llen: 0 };
}
async function drawS7(t) {
  const on = t >= Q.end;
  disp(S7.root, on);
  if (!on) return false;
  if (!S7.blen) { S7.blen = S7.bub.getTotalLength(); S7.llen = S7.lead.getTotalLength(); }
  S7.root.style.transformOrigin = '540px 900px';
  S7.root.style.transform = `scale(${(1 + 0.045 * ease.outQuad(prog(t, Q.end, FILM.duration - Q.end))).toFixed(4)})`;
  // the lead line retracts while the bubble outline draws
  const lp = ease.inOutCubic(prog(t, Q.bubble[0], 0.35));
  S7.lead.setAttribute('stroke-dasharray', S7.llen);
  S7.lead.setAttribute('stroke-dashoffset', (-S7.llen * lp).toFixed(1));
  vis(S7.lead, lp < 1);
  const bp = ease.inOutCubic(prog(t, Q.bubble[0] + 0.1, Q.bubble[1] - Q.bubble[0] - 0.25));
  S7.bub.setAttribute('stroke-dasharray', S7.blen);
  S7.bub.setAttribute('stroke-dashoffset', (S7.blen * (1 - bp)).toFixed(1));
  // typing dots, then the wordmark slams in their place
  const dIn = t >= Q.bubble[0] + 0.5 && t < Q.wordmark;
  S7.dots.forEach((d, i) => {
    vis(d, dIn);
    d.setAttribute('cy', (730 - 18 * Math.max(0, Math.sin((t - Q.bubble[0]) * 13 - i * 0.9))).toFixed(1));
    d.setAttribute('r', (22 * sp(t, Q.bubble[0] + 0.5 + i * 0.05, 5, 0.6)).toFixed(1));
  });
  const ws = sp(t, Q.wordmark, 4.2, 0.42);
  vis(S7.wm, t >= Q.wordmark);
  const wd = +S7.wm.dataset.wdth;
  S7.wm.style.fontVariationSettings = fvs(lerp(Math.min(125, wd + 22), wd, ws));
  tf(S7.wm, 0, 0, lerp(0.55, 1, ws));
  const bubPulse = 1 + 0.035 * decay(t - Q.wordmark, 9) * Math.sin((t - Q.wordmark) * 30);
  S7.bub.parentNode.style.transformOrigin = '540px 730px';
  S7.bub.parentNode.style.transform = `scale(${bubPulse.toFixed(4)})`;
  const tg = ease.outExpo(prog(t, Q.tag, 0.45));
  tf(S7.tagIn, 0, (1 - tg) * 90);
  vis(S7.tag, t >= Q.tag);
  const cs = sp(t, Q.cta, 3.8, 0.5);
  const press = t >= Q.ctaTap - 0.06 && t < Q.ctaTap + 0.09 ? 0.93 : 1;
  tf(S7.cta, (W - 660) / 2, 1250, cs * press);
  vis(S7.cta, t >= Q.cta);
  drawRipple(S7.rip, t, Q.ctaTap, 540, 1320, 240);
  return true;
}

// ------------------------------------------------------------------------------------------ boot
async function boot() {
  meas = el('span', stage, 'disp', { position: 'absolute', visibility: 'hidden', left: '0', top: '0', whiteSpace: 'pre' });
  await Promise.all([document.fonts.load("900 100px 'Archivo'"), document.fonts.load("500 40px 'Geist'"), document.fonts.load("650 40px 'Geist'")]);
  await document.fonts.ready;
  const grid = await (await fetch('beats.json')).json();
  T = makeTimeline(grid); b = T.b; Q = T.cue;
  await loadPlates();
  plateCv = el('canvas', stage);
  plateCv.width = W; plateCv.height = H;
  plateCtx = plateCv.getContext('2d');
  buildS1();
  buildS3();
  buildS5();
  buildS6();
  buildS7();
  buildGrain();
  const cimg = document.querySelector('img');
  if (cimg && !cimg.complete) await new Promise((r) => { cimg.onload = r; cimg.onerror = r; });
}

window.seek = async (t) => {
  // plates live underneath scenes 1, 5, 6
  const s1 = await drawS1(t);
  const s3 = await drawS3(t);
  const s5 = await drawS5(t);
  const s6 = await drawS6(t);
  const s7 = await drawS7(t);
  disp(plateCv, s1 || s5 || s6);
  void s3; void s7;
  drawGrain(t, s1 || s5 || s6 ? 0.22 : 0.08);
};
window.ready = boot().then(() => window.seek(0));

if (PREVIEW) {
  document.body.classList.add('preview');
  window.ready.then(() => {
    const audio = new Audio('score.wav');
    let t0 = null;
    const fit = () => { const k = Math.min(innerWidth / W, innerHeight / H); stage.style.transform = `scale(${k})`; };
    fit();
    addEventListener('resize', fit);
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space') return;
      audio.currentTime = 0; audio.play(); t0 = performance.now();
      const loop = async () => {
        const t = (performance.now() - t0) / 1000;
        if (t > FILM.duration) return;
        await window.seek(t);
        requestAnimationFrame(loop);
      };
      loop();
    });
  });
}
