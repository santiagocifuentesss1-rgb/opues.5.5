// "Todo negocio necesita una web" — a 15 s kinetic piece.
// Contract: window.seek(t) paints frame t. No transitions, timers or frame-to-frame state.
import { makeTimeline, FILM, COPY } from './timeline.js';
import { clamp, lerp, prog, ease, spring, noise1, hash01, mulberry32 } from './lib.js';

const W = FILM.width, H = FILM.height, M = 72, MW = W - 2 * M;
const C = {
  ink: '#0b0b0c', paper: '#f1eee6', accent: '#3b1d66', lite: '#b394ea', white: '#ffffff',
  mute: '#7a766c', hair: 'rgba(11,11,12,0.12)', land: '#e7e2d6', road: '#fbfaf6', ink2: '#262628', tint: '#ddd0f5',
  // dark metallic purple: brushed base + a specular band that travels with time
  metal: 'linear-gradient(115deg, #24104a 0%, #3b1d66 30%, #6a46a6 46%, #a98ad8 50%, #6a46a6 54%, #3b1d66 70%, #24104a 100%)',
};
const stage = document.getElementById('stage');
let T, b, Q;

// ------------------------------------------------------------------------------------------
// DOM helpers
const px = (v) => `${v}px`;
function el(tag, parent, cls, style = {}) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  Object.assign(n.style, style);
  if (parent) parent.appendChild(n);
  return n;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, parent, attrs = {}) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function svgBox(parent, w, h, style = {}) {
  return sv('svg', parent, { width: w, height: h, viewBox: `0 0 ${w} ${h}`, style: Object.entries({ position: 'absolute', left: 0, top: 0, overflow: 'visible', ...style }).map(([k, v]) => `${k}:${typeof v === 'number' && k !== 'opacity' ? v + 'px' : v}`).join(';') });
}
function tf(n, x = 0, y = 0, s = 1, r = 0, sy) {
  n.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg) scale(${s.toFixed(4)},${(sy ?? s).toFixed(4)})`;
}
const vis = (n, on) => { n.style.visibility = on ? 'inherit' : 'hidden'; };
const disp = (n, on) => { n.style.display = on ? 'block' : 'none'; };
function metal(n, t, speed = 0.18) {
  n.style.backgroundImage = C.metal;
  n.style.backgroundSize = '320% 320%';
  const p = ((t * speed) % 1 + 1) % 1;
  n.style.backgroundPosition = `${(100 - p * 100).toFixed(2)}% ${(100 - p * 100).toFixed(2)}%`;
}
const fvs = (wdth, wght) => `'wdth' ${wdth.toFixed(2)}, 'wght' ${wght}`;

// ------------------------------------------------------------------------------------------
// Type metrics + fitting
const MET = {};
let measurer, ctx2d;
function initMetrics() {
  for (const f of ['disp', 'ui']) {
    const probe = el('div', stage, f, { position: 'absolute', left: '-9999px', top: '0', fontSize: '1000px', lineHeight: '1' });
    probe.textContent = 'H';
    const mark = el('span', probe, null, { display: 'inline-block', width: '1px', height: '0', verticalAlign: 'baseline' });
    MET[f + 'Base'] = mark.offsetTop / 1000;
    probe.remove();
  }
  ctx2d = document.createElement('canvas').getContext('2d');
  ctx2d.font = '900 1000px Archivo';
  MET.cap = ctx2d.measureText('H').actualBoundingBoxAscent / 1000;
  measurer = el('span', stage, 'disp', { position: 'absolute', left: '-99999px', top: '0' });
}
const wcache = new Map();
function runWidth(str, size, wdth, wght = 900, font = 'disp', ls = -0.01) {
  const k = `${str}|${size}|${wdth}|${wght}|${font}|${ls}`;
  if (wcache.has(k)) return wcache.get(k);
  measurer.className = font;
  measurer.style.fontSize = px(size);
  measurer.style.fontVariationSettings = fvs(wdth, wght);
  measurer.style.fontWeight = wght;
  measurer.style.letterSpacing = `${ls}em`;
  measurer.textContent = str;
  const w = measurer.getBoundingClientRect().width / (stageScale || 1);
  wcache.set(k, w);
  return w;
}
// Fixed size, solve the width axis down so the run fits maxW (shrink size only if wdth bottoms out).
function fitWdth(str, size, maxW, { wght = 900, wmin = 62, wmax = 100, ls = -0.01 } = {}) {
  if (runWidth(str, size, wmax, wght, 'disp', ls) <= maxW) return { size, wdth: wmax };
  if (runWidth(str, size, wmin, wght, 'disp', ls) > maxW) {
    const s2 = (size * maxW) / runWidth(str, size, wmin, wght, 'disp', ls);
    return { size: Math.floor(s2), wdth: wmin };
  }
  let lo = wmin, hi = wmax;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (runWidth(str, size, mid, wght, 'disp', ls) > maxW) hi = mid; else lo = mid;
  }
  return { size, wdth: lo };
}
// Justify: pick the size so the run exactly fills maxW at a given width-axis value.
function fitSize(str, maxW, { wdth = 100, wght = 900, ls = -0.01, smax = 9999 } = {}) {
  const w = runWidth(str, 100, wdth, wght, 'disp', ls);
  return Math.min(smax, Math.floor((100 * maxW) / w));
}
function uiWidth(str, size, wght = 500) {
  ctx2d.font = `${wght} ${size}px Geist`;
  return ctx2d.measureText(str).width;
}
function lsb(ch) {
  ctx2d.font = '900 1000px Archivo';
  return -ctx2d.measureText(ch).actualBoundingBoxLeft / 1000; // left side bearing in em
}

// ------------------------------------------------------------------------------------------
// Text: one line, positioned by baseline, kerned per-char spans inside a clip window.
class Text {
  constructor(parent, str, o) {
    const { size, wdth = 100, wght = 900, color = C.ink, ls = -0.01, x = M, y, padTop = 0.32, padBot = 0.26, clip = true, font = 'disp', optical = true } = o;
    Object.assign(this, { str, size, wdth, wght, color, ls, y, font });
    const base = MET[font + 'Base'];
    this.h = (base + padTop + padBot) * size;
    this.x = x - (optical && font === 'disp' ? lsb(str[0]) * size * 0.9 : 0);
    this.top = y - (base + padTop) * size;
    this.wrap = el('div', parent, null, { position: 'absolute', left: '0', top: '0', height: px(this.h), overflow: clip ? 'hidden' : 'visible' });
    const style = { position: 'absolute', top: px(padTop * size), fontSize: px(size), fontVariationSettings: fvs(wdth, wght), fontWeight: wght, letterSpacing: `${ls}em`, color, lineHeight: '1' };
    // kerned positions from a single shaped run
    const ref = el('span', stage, font, { ...style, position: 'absolute', left: '-99999px', top: '0' });
    ref.textContent = str;
    const node = ref.firstChild;
    const rr = ref.getBoundingClientRect();
    const range = document.createRange();
    const chars = [...str];
    this.pos = [];
    let off = 0;
    for (const ch of chars) {
      range.setStart(node, off);
      range.setEnd(node, off + ch.length);
      const r = range.getBoundingClientRect();
      this.pos.push({ x: (r.left - rr.left) / stageScale, w: r.width / stageScale });
      off += ch.length;
    }
    this.width = rr.width / stageScale;
    ref.remove();
    this.wrap.style.width = px(this.width + size * 0.6);
    this.chars = chars.map((ch, i) => {
      const s = el('span', this.wrap, font, { ...style, left: px(this.pos[i].x) });
      s.textContent = ch;
      return s;
    });
    tf(this.wrap, this.x, this.top);
  }
  place(dx = 0, dy = 0, s = 1, r = 0) {
    this.wrap.style.transformOrigin = `0 ${px(this.h * 0.6)}`;
    tf(this.wrap, this.x + dx, this.top + dy, s, r);
  }
  // Per-char mask rise. Returns progress of the last char.
  rise(t, t0, { stagger = 0.022, dur = 0.55, e = ease.outExpo, dir = 1, order } = {}) {
    let last = 0;
    this.chars.forEach((c, i) => {
      const k = order ? order[i] : i;
      const p = e(prog(t, t0 + k * stagger, dur));
      tf(c, 0, (1 - p) * this.h * dir);
      last = p;
    });
    return last;
  }
  exitUp(t, t0, { stagger = 0.012, dur = 0.35, e = ease.inExpo } = {}) {
    this.chars.forEach((c, i) => {
      const p = e(prog(t, t0 + i * stagger, dur));
      tf(c, 0, -p * this.h);
    });
  }
  charEnd(i) { return this.x + this.pos[i].x + this.pos[i].w; }
  set visible(on) { vis(this.wrap, on); }
}

// Run: one shaped span whose width axis can be animated (keeps kerning).
class Run {
  constructor(parent, str, o) {
    const { size, wdth = 100, wght = 900, color = C.ink, ls = -0.01, x = M, y, font = 'disp' } = o;
    Object.assign(this, { str, size, wdth, wght, color, ls, x, y, font });
    this.base = MET[font + 'Base'];
    this.node = el('div', parent, font, { position: 'absolute', left: '0', top: '0', fontSize: px(size), fontWeight: wght, letterSpacing: `${ls}em`, color, lineHeight: '1', transformOrigin: `0 ${px(this.base * size)}` });
    this.node.textContent = str;
    this.setW(wdth);
    this.place();
  }
  setW(w) { this.node.style.fontVariationSettings = fvs(w, this.wght); }
  place(dx = 0, dy = 0, s = 1, r = 0, sy) { tf(this.node, this.x + dx, this.y - this.base * this.size + dy, s, r, sy); }
  set visible(on) { vis(this.node, on); }
}

// ------------------------------------------------------------------------------------------
// Shared UI bits
function starPath(cx, cy, R, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`;
  }
  return d + 'Z';
}
function stars(parent, x, y, size, n = 5, color = C.accent) {
  const g = svgBox(parent, size * n * 1.18, size, { left: x, top: y });
  const items = [];
  for (let i = 0; i < n; i++) items.push(sv('path', g, { d: starPath(size / 2 + i * size * 1.18, size / 2, size / 2, size / 4.6), fill: color }));
  return { g, items };
}
function magnifier(parent, x, y, s = 56, color = C.ink) {
  const g = svgBox(parent, s, s, { left: x, top: y });
  sv('circle', g, { cx: s * 0.42, cy: s * 0.42, r: s * 0.3, fill: 'none', stroke: color, 'stroke-width': s * 0.11 });
  sv('line', g, { x1: s * 0.64, y1: s * 0.64, x2: s * 0.9, y2: s * 0.9, stroke: color, 'stroke-width': s * 0.11, 'stroke-linecap': 'round' });
  return g;
}
function lockIcon(parent, x, y, s = 52, color = C.ink) {
  const g = svgBox(parent, s, s, { left: x, top: y });
  sv('rect', g, { x: s * 0.16, y: s * 0.44, width: s * 0.68, height: s * 0.5, rx: s * 0.1, fill: color });
  sv('path', g, { d: `M${s * 0.3} ${s * 0.46} V${s * 0.32} a${s * 0.2} ${s * 0.2} 0 0 1 ${s * 0.4} 0 V${s * 0.46}`, fill: 'none', stroke: color, 'stroke-width': s * 0.1 });
  return g;
}

// Search / URL pill. Text is set per frame; caret is computed from measured text width.
class Pill {
  constructor(parent, { icon = 'search', size = 50 } = {}) {
    this.size = size;
    this.root = el('div', parent, null, { position: 'absolute', left: '0', top: '0', height: '128px', borderRadius: '64px', background: C.white, border: `4px solid ${C.ink}`, overflow: 'hidden' });
    this.icon = icon === 'search' ? magnifier(this.root, 36, 32, 58) : lockIcon(this.root, 38, 32, 54);
    this.sel = el('div', this.root, null, { position: 'absolute', left: '0', top: '30px', height: '64px', background: C.tint, borderRadius: '6px' });
    this.txt = el('div', this.root, 'ui', { position: 'absolute', left: '116px', top: px(64 - 4 - size * 0.5 - 3), fontSize: px(size), fontWeight: 500, color: C.ink, lineHeight: '1' });
    this.caret = el('div', this.root, null, { position: 'absolute', left: '0', top: '31px', width: '5px', height: '62px', background: C.accent });
    this.bar = el('div', this.root, null, { position: 'absolute', left: '0', bottom: '0', height: '8px', width: '100%', background: C.ink, transformOrigin: '0 0' });
  }
  set({ x, y, w, text = '', caret = false, sel = '', bar = 0, s = 1 }) {
    this.root.style.width = px(w);
    tf(this.root, x, y, s);
    this.txt.textContent = text + sel;
    const tw = uiWidth(text, this.size, 500);
    const sw = uiWidth(sel, this.size, 500);
    vis(this.caret, caret);
    this.caret.style.transform = `translateX(${(116 + tw + 3).toFixed(1)}px)`;
    vis(this.sel, sel.length > 0);
    this.sel.style.transform = `translateX(${(116 + tw).toFixed(1)}px)`;
    this.sel.style.width = px(sw + 4);
    this.bar.style.transform = `scaleX(${bar})`;
    vis(this.bar, bar > 0);
  }
}

// ------------------------------------------------------------------------------------------
// Scenes
const S = {};

function sceneRoot(bg) {
  const r = el('div', stage, 'scene');
  r.style.background = bg;
  return r;
}

// ---------- 0+1: hook + results (one continuous space, the search bar travels) ------------
function buildSearch() {
  const root = sceneRoot(C.paper);
  const cam = el('div', root, 'abs', { width: px(W), height: px(H) });
  const s = { root, cam };
  // Hook headline: four stacked lines, left aligned, one size, width axis solved per line.
  const HS = 232;
  const lines = ['TUS', 'CLIENTES', 'TE', 'BUSCAN.'];
  const yb = [380, 584, 788, 992];
  s.hook = lines.map((str, i) => {
    const f = fitWdth(str, HS, MW, { wmax: 100 });
    return new Text(cam, str, { size: f.size, wdth: f.wdth, y: yb[i] });
  });
  // highlighter swipe behind BUSCAN.
  s.hl = el('div', cam, null, { position: 'absolute', left: '0', top: '0', height: px(HS * 0.86), background: C.accent, transformOrigin: '0 50%' });
  cam.insertBefore(s.hl, s.hook[3].wrap);

  // Keyboard (ES layout, with Ñ). Keys light up as the query is typed.
  s.kb = el('div', cam, 'abs', { width: px(W), height: '520px' });
  const rows = ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'];
  const kw = (MW - 9 * 12) / 10, kh = 104;
  s.keys = {};
  const mkKey = (label, x, y, w, opts = {}) => {
    const k = el('div', s.kb, 'ui', { position: 'absolute', left: px(x), top: px(y), width: px(w), height: px(kh), borderRadius: '18px', background: opts.bg || C.white, color: opts.color || C.ink, fontSize: px(opts.fs || 40), fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `inset 0 -5px 0 ${C.hair}` });
    k.textContent = label;
    return k;
  };
  rows.forEach((row, ri) => {
    const n = row.length;
    const rowW = n * kw + (n - 1) * 12;
    const x0 = ri === 2 ? M + (MW - rowW) / 2 : M;
    [...row].forEach((ch, i) => { s.keys[ch] = mkKey(ch, x0 + i * (kw + 12), ri * (kh + 14), kw); });
  });
  const r3 = 2 * (kh + 14), r4 = 3 * (kh + 14);
  mkKey('⇧', M, r3, kw * 1.25, { bg: '#e3dfd5' });
  mkKey('⌫', W - M - kw * 1.25, r3, kw * 1.25, { bg: '#e3dfd5' });
  mkKey('123', M, r4, 180, { bg: '#e3dfd5', fs: 34 });
  s.keys[' '] = mkKey('espacio', M + 192, r4, MW - 192 * 2, { fs: 34 });
  s.keys['\n'] = mkKey('buscar', W - M - 180, r4, 180, { bg: C.ink, color: C.paper, fs: 34 });

  // The search bar (shared across hook -> results)
  s.pill = new Pill(cam);

  // Results cards
  const names = [['La Espiga', '4,8', '350 m'], ['Pan del Barrio', '4,6', '600 m'], ['Horno Real', '4,7', '1,2 km']];
  s.cards = names.map(([name, score, dist], i) => {
    const card = el('div', cam, null, { position: 'absolute', left: '0', top: '0', width: px(MW), height: '172px', borderRadius: '30px', background: C.white, boxShadow: `inset 0 0 0 2px ${C.hair}` });
    const thumb = el('div', card, null, { position: 'absolute', left: '24px', top: '24px', width: '124px', height: '124px', borderRadius: '20px', background: '#e8e3d7', overflow: 'hidden' });
    // tiny loaf glyph in the thumb (ink-on-paper, no extra colour)
    const g = svgBox(thumb, 124, 124);
    sv('path', g, { d: 'M26 84 Q26 40 62 40 Q98 40 98 84 Z', fill: 'none', stroke: '#b9b2a2', 'stroke-width': 8, 'stroke-linejoin': 'round' });
    sv('path', g, { d: 'M50 54 L56 70 M66 52 L72 68', stroke: '#b9b2a2', 'stroke-width': 7, 'stroke-linecap': 'round' });
    const tn = el('div', card, 'ui', { position: 'absolute', left: '176px', top: '34px', fontSize: '46px', fontWeight: 600, color: C.ink });
    tn.textContent = name;
    stars(card, 176, 100, 34);
    const meta = el('div', card, 'ui', { position: 'absolute', left: px(176 + 34 * 5 * 1.18 + 14), top: '100px', fontSize: '36px', fontWeight: 500, color: C.mute });
    meta.textContent = `${score}  ·  ${dist}`;
    const tag = el('div', card, 'ui', { position: 'absolute', right: '28px', top: '34px', fontSize: '32px', fontWeight: 600, color: C.ink, padding: '10px 18px', borderRadius: '30px', background: '#efebe2' });
    tag.textContent = `#${i + 1}`;
    return card;
  });
  // "You" slot: dashed outline, not found
  s.you = el('div', cam, null, { position: 'absolute', left: '0', top: '0', width: px(MW), height: '172px' });
  const yg = svgBox(s.you, MW, 172);
  s.youRect = sv('rect', yg, { x: 3, y: 3, width: MW - 6, height: 166, rx: 28, fill: 'none', stroke: C.ink, 'stroke-width': 5, 'stroke-dasharray': '18 14', pathLength: 1000 });
  s.youLbl = el('div', s.you, 'ui', { position: 'absolute', left: '40px', top: '38px', fontSize: '46px', fontWeight: 600, color: C.ink });
  s.youLbl.textContent = 'Tu negocio';
  s.youSub = el('div', s.you, 'ui', { position: 'absolute', left: '40px', top: '100px', fontSize: '36px', fontWeight: 500, color: C.mute });
  s.youSub.textContent = 'Sin resultados';
  s.youTag = el('div', s.you, 'ui', { position: 'absolute', right: '30px', top: '52px', fontSize: '34px', fontWeight: 700, color: C.white, background: C.accent, padding: '16px 24px', borderRadius: '40px', transformOrigin: '100% 50%' });
  s.youTag.textContent = 'No apareces';

  // Results headline
  const f1 = fitWdth('¿Y TÚ', 250, MW);
  const f2 = fitWdth('DÓNDE ESTÁS?', 250, MW, { wmin: 62 });
  s.q1 = new Text(cam, '¿Y TÚ', { size: f2.size, wdth: 100, y: 1330, color: C.accent });
  s.q2 = new Text(cam, 'DÓNDE ESTÁS?', { size: f2.size, wdth: f2.wdth, y: 1330 + f2.size * 0.9 });
  // the void opens from the "you" slot, above everything else in this scene
  s.hole = el('div', cam, null, { position: 'absolute', left: '0', top: '0', width: px(MW), height: '172px', borderRadius: '30px', background: C.ink, transformOrigin: '50% 50%' });
  S.search = s;
}

function drawSearch(t) {
  const s = S.search;
  const on = t < Q.zoomVoid[1];
  disp(s.root, on);
  if (!on) return;
  const enter = Q.enter;
  // ---- hook headline: word by word on 8ths, then pushed up on Enter
  const out = ease.inOutQuart(prog(t, enter - 0.06, 0.4));
  s.hook.forEach((ln, i) => {
    ln.rise(t, Q.hookWords[i] - (i === 0 ? 0.24 : 0), { stagger: 0.026, dur: 0.6 });
    ln.place(0, -out * 1300 - out * i * 60);
    ln.visible = out < 1;
  });
  // highlighter swipe behind BUSCAN.
  const L3 = s.hook[3];
  const hp = ease.outExpo(prog(t, b(2.5), 0.5));
  s.hl.style.width = px(L3.width + 36);
  tf(s.hl, L3.x - 14, L3.y - L3.size * 0.8 - out * 1300 - out * 3 * 60, 1, 0);
  s.hl.style.transform += ` scaleX(${hp.toFixed(4)})`;
  vis(s.hl, hp > 0 && out < 1);
  metal(s.hl, t, 0.3);
  const hlEdge = L3.x - 14 + hp * (L3.width + 36);
  L3.chars.forEach((c, i) => { c.style.color = L3.x + L3.pos[i].x + L3.pos[i].w * 0.5 < hlEdge ? C.paper : C.ink; });

  // ---- typing
  const nTyped = Q_TYPE.filter((k) => k <= t).length;
  const typed = COPY.query.slice(0, nTyped);
  const lastKey = nTyped ? Q_TYPE[nTyped - 1] : -1;
  const typing = t - lastKey < 0.3 && nTyped < COPY.query.length;
  const blink = typing || ((t - (lastKey > 0 ? lastKey : 0)) * 2.13) % 1 < 0.55;

  // ---- pill: grows from a circle (pre-rolled), then whips to the top on Enter
  const grow = ease.outExpo(prog(t, -0.32, 0.62));
  const up = ease.inOutQuart(prog(t, enter - 0.02, 0.36));
  const pw = lerp(128, MW, grow);
  const py = lerp(1170, 96, up);
  const pressed = t >= enter && t < enter + 0.09 ? 0.97 : 1;
  s.pill.set({ x: M + (MW - pw) / 2, y: py, w: pw, text: typed, caret: blink && t < enter + 0.2 && grow > 0.6, s: pressed });

  // ---- keyboard
  const kbIn = ease.outExpo(prog(t, -0.25, 0.55));
  const kbOut = ease.inExpo(prog(t, enter - 0.05, 0.3));
  tf(s.kb, 0, 1340 + (1 - kbIn) * 600 + kbOut * 700);
  vis(s.kb, kbOut < 1);
  for (const k in s.keys) { s.keys[k].style.background = k === '\n' ? C.ink : k === ' ' ? C.white : C.white; s.keys[k].style.color = k === '\n' ? C.paper : C.ink; s.keys[k].style.transform = ''; }
  for (let i = 0; i < nTyped; i++) {
    const dt = t - Q_TYPE[i];
    if (dt > 0.12) continue;
    const key = s.keys[keyFor(COPY.query[i])];
    if (!key) continue;
    key.style.background = C.accent;
    key.style.color = C.white;
    key.style.transform = `translateY(4px) scale(0.94)`;
  }
  if (t >= enter - 0.02 && t < enter + 0.14) {
    s.keys['\n'].style.background = C.accent;
    s.keys['\n'].style.transform = 'translateY(4px) scale(0.94)';
  }

  // ---- results cards: cascade up from below on 16ths
  const cy0 = 272;
  s.cards.forEach((c, i) => {
    const p = ease.outExpo(prog(t, Q.cards[i], 0.55));
    tf(c, M, cy0 + i * 192 + (1 - p) * 1500);
    vis(c, p > 0);
  });
  // "you" slot: dashed outline draws, shakes, tag pops
  const yp = prog(t, Q.youCard - 0.12, 0.3);
  const ypop = spring(t - (Q.youCard - 0.12), 3.4, 0.55);
  const sh = Math.sin((t - Q.youCard) * 2 * Math.PI * 9) * 22 * Math.exp(-Math.max(0, t - Q.youCard) * 7) * (t > Q.youCard ? 1 : 0);
  s.you.style.transformOrigin = '50% 50%';
  tf(s.you, M + sh, cy0 + 3 * 192, lerp(0.85, 1, Math.min(1, ypop)) );
  vis(s.you, yp > 0);
  const lp = ease.outExpo(prog(t, Q.youCard - 0.1, 0.4));
  tf(s.youLbl, (1 - lp) * -30, 0);
  vis(s.youLbl, lp > 0); vis(s.youSub, lp > 0);
  const tg = spring(t - Q.youCard, 3.2, 0.42);
  tf(s.youTag, 0, 0, Math.max(0, tg));
  vis(s.youTag, t >= Q.youCard);
  // the slot turns into a hole, then we fall into it
  const hole = ease.inOutCubic(prog(t, b(7), Q.zoomVoid[0] - b(7) + 0.12));
  const slit = ease.inQuart(prog(t, Q.zoomVoid[0], Q.zoomVoid[1] - Q.zoomVoid[0]));
  s.hole.style.borderRadius = px(30 * (1 - slit));
  tf(s.hole, M + sh, cy0 + 3 * 192, hole * (1 + slit * 0.25), 0, hole * (1 + slit * 13));
  vis(s.hole, hole > 0);
  // ---- results headline
  s.q1.rise(t, Q.resultsHead[0], { stagger: 0.03 });
  s.q2.rise(t, Q.resultsHead[1], { stagger: 0.022 });
  s.q1.visible = t >= Q.resultsHead[0];
  s.q2.visible = t >= Q.resultsHead[1];

  // ---- camera: drift, then zoom into the hole
  const z = ease.inExpo(prog(t, Q.zoomVoid[0], Q.zoomVoid[1] - Q.zoomVoid[0]));
  const fx = W / 2, fy = cy0 + 3 * 192 + 86;
  const zs = lerp(1, 7, z);
  const drift = 1 + 0.02 * prog(t, enter, Q.zoomVoid[0] - enter);
  const sc = zs * drift;
  const tx = lerp(0, W / 2 - fx, z), ty = lerp(0, H / 2 - fy, z);
  s.cam.style.transformOrigin = `${fx}px ${fy}px`;
  tf(s.cam, tx, ty, sc);
}
let Q_TYPE = [];
function keyFor(ch) {
  const m = { á: 'A', é: 'E', í: 'I', ó: 'O', ú: 'U', ñ: 'Ñ', ' ': ' ' };
  return m[ch] ?? ch.toUpperCase();
}

// ---------- 2: void — "SIN WEB, NO EXISTES." ----------------------------------------------
function buildVoid() {
  const root = sceneRoot(C.ink);
  const cam = el('div', root, 'abs', { width: px(W), height: px(H), transformOrigin: '50% 50%' });
  const s = { root, cam };
  s.big = el('div', cam, 'disp', { position: 'absolute', left: '0', top: '0', fontSize: '820px', fontVariationSettings: fvs(80, 900), color: 'transparent', WebkitTextStroke: `5px #2f2f33`, letterSpacing: '-0.04em', lineHeight: '1' });
  s.big.textContent = '404';
  const f1 = fitWdth('SIN WEB,', 250, MW);
  s.l1 = new Text(cam, 'SIN WEB,', { size: f1.size, wdth: f1.wdth, y: 860, color: C.paper });
  const f2 = fitWdth('NO EXISTES.', f1.size, MW);
  s.l2 = new Text(cam, 'NO EXISTES.', { size: f2.size, wdth: f2.wdth, y: 860 + f1.size * 0.92, color: C.paper });
  s.cursor = el('div', cam, null, { position: 'absolute', left: '0', top: '0', width: px(f2.size * 0.11), height: px(f2.size * MET.cap * 1.12), background: C.lite });
  s.err = el('div', cam, 'ui', { position: 'absolute', left: px(M), top: '1420px', fontSize: '50px', fontWeight: 500, color: '#b4b0a6' });
  s.err.textContent = 'Error 404 · negocio no encontrado';
  S.void = s;
}
function drawVoid(t) {
  const s = S.void;
  const on = t >= Q.voidLines[0] - 0.001 && t < Q.drop;
  disp(s.root, on);
  if (!on) return;
  const t0 = Q.voidLines[0];
  // 404 drifts slowly; scales in a touch with the riser
  const pr = prog(t, t0, Q.drop - t0);
  tf(s.big, -40 - pr * 50, 170 - pr * 120, 1, -6);
  // line 1 slams in (scale overshoot), line 2 rises
  const sp = spring(t - t0, 2.6, 0.5);
  s.l1.place(0, 0, lerp(1.25, 1, sp));
  s.l1.rise(t, t0, { stagger: 0.016, dur: 0.4 });
  s.l2.rise(t, Q.voidLines[1], { stagger: 0.02, dur: 0.5 });
  s.l2.visible = t >= Q.voidLines[1];
  // letters of EXISTES. get deleted from the end, glitching out
  const n = s.l2.chars.length;
  let lastVisible = n - 1;
  for (let k = 0; k < 8; k++) {
    const idx = n - 1 - k;
    const td = Q.deleteStart + k * Q.deleteStep;
    const c = s.l2.chars[idx];
    if (t >= td) { vis(c, false); lastVisible = idx - 1; continue; }
    vis(c, true);
    const g = t - (td - 0.07);
    if (g > 0) {
      const fr = Math.floor(t * 60);
      const jx = (hash01(fr, idx) - 0.5) * 36, sy = 1 - g / 0.07;
      c.style.transform = `translate3d(${jx.toFixed(1)}px,0,0) scale(1,${sy.toFixed(3)})`;
      c.style.color = hash01(fr, idx + 9) > 0.5 ? C.lite : C.paper;
    } else c.style.color = C.paper;
  }
  // caret follows the end of the text
  const cx = s.l2.charEnd(Math.max(0, lastVisible)) + s.l2.size * 0.05;
  const after = t - (Q.deleteStart + 7 * Q.deleteStep);
  const blink = after < 0 ? true : (after / (T.P / 2)) % 2 < 1;
  tf(s.cursor, cx, s.l2.y - s.l2.size * MET.cap * 1.06);
  vis(s.cursor, t >= Q.voidLines[1] + 0.2 && blink);
  // error line types out quietly
  const ep = prog(t, b(9.5), 0.5);
  s.err.textContent = 'Error 404 · negocio no encontrado'.slice(0, Math.floor(ep * 33));
  vis(s.err, ep > 0);
  // camera: push in + shake that grows with the riser
  const amp = Math.pow(pr, 3) * 9;
  const fr = t * 40;
  tf(s.cam, noise1(fr, 3) * amp, noise1(fr, 4) * amp, 1 + pr * 0.06);
}

// ---------- 3: open 24/7 -------------------------------------------------------------------
function buildOpen() {
  const root = sceneRoot(C.accent);
  const cam = el('div', root, 'abs', { width: px(W), height: px(H), transformOrigin: '50% 45%' });
  const s = { root, cam };
  const size = fitSize('24/7', MW, { wdth: 112 });
  s.big = new Run(cam, '24/7', { size, wdth: 112, y: 1010, color: C.paper, ls: -0.03 });
  s.bigSize = size;
  const fo = fitWdth('ABIERTO', 210, MW);
  s.open = new Text(cam, 'ABIERTO', { size: fo.size, wdth: fo.wdth, y: 360, color: C.paper });
  // chip with sun/moon + live clock
  s.chip = el('div', cam, null, { position: 'absolute', left: '0', top: '0', height: '104px', borderRadius: '52px', background: C.paper, width: '420px' });
  const ic = svgBox(s.chip, 64, 64, { left: 26, top: 20 });
  s.rays = sv('g', ic, {});
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    sv('line', s.rays, { x1: 32 + Math.cos(a) * 21, y1: 32 + Math.sin(a) * 21, x2: 32 + Math.cos(a) * 29, y2: 32 + Math.sin(a) * 29, stroke: C.ink, 'stroke-width': 5, 'stroke-linecap': 'round' });
  }
  sv('circle', ic, { cx: 32, cy: 32, r: 15, fill: C.ink });
  s.moonCut = sv('circle', ic, { cx: 60, cy: 18, r: 15, fill: C.paper });
  s.clock = el('div', s.chip, 'ui', { position: 'absolute', left: '108px', top: '25px', fontSize: '56px', fontWeight: 600, color: C.ink, fontVariantNumeric: 'tabular-nums' });
  // notifications
  const items = [['Nuevo pedido', '03:12', 'bag'], ['Nueva reserva', '03:47', 'cal'], ['Nuevo mensaje', '04:05', 'chat']];
  s.notifs = items.map(([title, time, icon]) => {
    const n = el('div', cam, null, { position: 'absolute', left: '0', top: '0', width: px(MW), height: '128px', borderRadius: '30px', background: C.white });
    const tile = el('div', n, null, { position: 'absolute', left: '22px', top: '22px', width: '84px', height: '84px', borderRadius: '22px', background: C.ink });
    const g = svgBox(tile, 84, 84);
    const st = { fill: 'none', stroke: C.paper, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (icon === 'bag') { sv('path', g, { d: 'M24 34 H60 L56 64 H28 Z', ...st }); sv('path', g, { d: 'M34 34 V28 a8 8 0 0 1 16 0 V34', ...st }); }
    if (icon === 'cal') { sv('rect', g, { x: 22, y: 26, width: 40, height: 36, rx: 6, ...st }); sv('path', g, { d: 'M22 38 H62 M32 20 V30 M52 20 V30', ...st }); }
    if (icon === 'chat') { sv('path', g, { d: 'M22 28 H62 V54 H40 L30 62 V54 H22 Z', ...st }); }
    const tt = el('div', n, 'ui', { position: 'absolute', left: '132px', top: '42px', fontSize: '46px', fontWeight: 600, color: C.ink });
    tt.textContent = title;
    const tm = el('div', n, 'ui', { position: 'absolute', right: '32px', top: '46px', fontSize: '38px', fontWeight: 500, color: C.mute });
    tm.textContent = time;
    return n;
  });
  S.open = s;
}
function drawOpen(t) {
  const s = S.open;
  const on = t >= Q.drop && t < Q.whip[1];
  disp(s.root, on);
  if (!on) return;
  const t0 = Q.drop;
  metal(s.root, t - t0);
  // 24/7 slams: width axis snaps from condensed to wide with the spring
  const sp = spring(t - t0, 2.4, 0.42);
  const wd = lerp(62, 112, clamp(sp, 0, 1.25));
  s.big.setW(clamp(wd, 62, 125));
  s.big.place(0, 0, lerp(1.6, 1, Math.min(sp, 1.06)), 0);
  // ABIERTO rises on the next beat
  s.open.rise(t, Q.openWord, { stagger: 0.03 });
  s.open.visible = t >= Q.openWord;
  // clock: 09:00 -> 03:12 next day
  const cp = ease.inOutCubic(prog(t, t0 + 0.12, b(15.2) - t0 - 0.12));
  const mins = (9 * 60 + cp * (18 * 60 + 12)) % (24 * 60);
  const hh = Math.floor(mins / 60), mm = Math.floor(mins % 60);
  s.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const night = clamp(Math.min((mins - 19 * 60) / 120, 1) * (mins >= 19 * 60 ? 1 : 0) + (mins < 7 * 60 ? 1 : 0));
  s.rays.setAttribute('transform', `translate(32 32) scale(${(1 - night).toFixed(3)}) translate(-32 -32)`);
  s.moonCut.setAttribute('cx', (60 - night * 20).toFixed(1));
  s.moonCut.setAttribute('cy', (18 + night * 4).toFixed(1));
  const chipIn = ease.outExpo(prog(t, t0 + 0.1, 0.5));
  tf(s.chip, M, 1080 + (1 - chipIn) * 260);
  s.chip.style.width = px(lerp(104, 280, chipIn));
  s.chip.style.overflow = 'hidden';
  // notifications slide in from the right, stacking
  s.notifs.forEach((n, i) => {
    const p = spring(t - Q.notifs[i], 2.8, 0.62);
    tf(n, M + (1 - p) * 1100, 1226 + i * 150, 1, (1 - p) * 8);
    vis(n, t >= Q.notifs[i]);
  });
  // camera: big shake on the drop (global), plus breathing scale
  const breathe = 1 + 0.012 * Math.sin((t - t0) * Math.PI * 2 / (T.P * 2));
  tf(s.cam, 0, 0, breathe);
  // whip: whole scene leaves upward
  const wp = whipOffset(t);
  s.root.style.transform = `translate3d(0,${(-wp).toFixed(2)}px,0)`;
}
function whipOffset(t) {
  return H * ease.inOutQuart(prog(t, Q.whip[0], Q.whip[1] - Q.whip[0]));
}

// ---------- 4: map — "AQUÍ ESTÁS." ---------------------------------------------------------
const MAP = 2600;
function buildMap() {
  const root = sceneRoot(C.land);
  root.style.transformOrigin = '0 0';
  const s = { root };
  s.view = el('div', root, 'abs', { width: px(W), height: px(H), perspective: '1500px', perspectiveOrigin: '50% 30%' });
  s.plane = el('div', s.view, 'abs', { width: px(MAP), height: px(MAP), transformStyle: 'preserve-3d', transformOrigin: '50% 50%' });
  const g = svgBox(s.plane, MAP, MAP);
  sv('rect', g, { x: 0, y: 0, width: MAP, height: MAP, fill: C.land });
  const rnd = mulberry32(404);
  // parks + water band
  sv('rect', g, { x: 1480, y: 1500, width: 420, height: 300, rx: 40, fill: '#dcd6c7' });
  sv('rect', g, { x: 560, y: 760, width: 300, height: 420, rx: 40, fill: '#dcd6c7' });
  sv('path', g, { d: `M0 ${MAP * 0.18} C ${MAP * 0.3} ${MAP * 0.12}, ${MAP * 0.55} ${MAP * 0.3}, ${MAP} ${MAP * 0.2} L ${MAP} ${MAP * 0.26} C ${MAP * 0.55} ${MAP * 0.36}, ${MAP * 0.3} ${MAP * 0.18}, 0 ${MAP * 0.24} Z`, fill: '#d6d0c1' });
  // minor streets
  const minor = { stroke: '#f6f3ec', 'stroke-width': 18, 'stroke-linecap': 'square' };
  for (let x = 60; x < MAP; x += 110 + Math.floor(rnd() * 40)) sv('line', g, { x1: x, y1: 0, x2: x + 30, y2: MAP, ...minor });
  for (let y = 40; y < MAP; y += 100 + Math.floor(rnd() * 50)) sv('line', g, { x1: 0, y1: y, x2: MAP, y2: y - 20, ...minor });
  // avenues
  const major = { stroke: C.road, 'stroke-width': 46, 'stroke-linecap': 'square' };
  s.av = { v: [420, 900, 1300, 1700, 2150], h: [520, 980, 1400, 1860, 2300] };
  for (const x of s.av.v) sv('line', g, { x1: x, y1: 0, x2: x, y2: MAP, ...major });
  for (const y of s.av.h) sv('line', g, { x1: 0, y1: y, x2: MAP, y2: y, ...major });
  sv('line', g, { x1: 0, y1: 2300, x2: MAP, y2: 500, stroke: C.road, 'stroke-width': 60 });
  // route (user -> business) along the avenues
  const user = [1300, 1860], dest = [1700, 980];
  s.dest = dest;
  s.route = sv('path', g, { d: `M${user[0]} ${user[1]} L1300 1400 L1700 1400 L${dest[0]} ${dest[1]}`, fill: 'none', stroke: C.accent, 'stroke-width': 22, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1000, 'stroke-dasharray': 1000 });
  s.userRing = sv('circle', g, { cx: user[0], cy: user[1], r: 30, fill: 'none', stroke: C.ink, 'stroke-width': 4 });
  sv('circle', g, { cx: user[0], cy: user[1], r: 30, fill: C.white });
  sv('circle', g, { cx: user[0], cy: user[1], r: 19, fill: C.ink });
  s.ripples = [0, 1].map(() => sv('circle', g, { cx: dest[0], cy: dest[1], r: 10, fill: 'none', stroke: C.accent, 'stroke-width': 8 }));
  s.shadow = sv('ellipse', g, { cx: dest[0], cy: dest[1], rx: 34, ry: 34, fill: 'rgba(11,11,12,0.18)' });
  // pin: billboard inside the 3D plane, counter-rotated to face camera
  s.pinWrap = el('div', s.plane, 'abs', { width: '150px', height: '200px', transformOrigin: '75px 200px', transformStyle: 'preserve-3d' });
  s.pinBody = el('div', s.pinWrap, 'abs', { width: '150px', height: '200px', transformOrigin: '75px 200px' });
  const pg = svgBox(s.pinBody, 150, 200);
  sv('path', pg, { d: 'M75 196 C 60 160, 6 120, 6 72 A 69 69 0 1 1 144 72 C 144 120, 90 160, 75 196 Z', fill: C.accent });
  sv('circle', pg, { cx: 75, cy: 72, r: 28, fill: C.white });
  // search bar on top (bookend)
  s.pill = new Pill(root);
  // bottom sheet
  s.sheet = el('div', root, null, { position: 'absolute', left: '0', top: '0', width: px(W), height: '900px', background: C.white, borderRadius: '56px 56px 0 0' });
  el('div', s.sheet, null, { position: 'absolute', left: px(W / 2 - 50), top: '22px', width: '100px', height: '10px', borderRadius: '5px', background: '#d5d0c4' });
  const fh = fitWdth('AQUÍ ESTÁS.', 230, MW);
  s.head = new Text(s.sheet, 'AQUÍ ESTÁS.', { size: fh.size, wdth: fh.wdth, y: 250, color: C.ink });
  s.row = el('div', s.sheet, 'abs', { width: px(W), height: '60px' });
  stars(s.row, M, 0, 44);
  const sc = el('div', s.row, 'ui', { position: 'absolute', left: px(M + 44 * 5 * 1.18 + 18), top: '2px', fontSize: '44px', fontWeight: 600, color: C.ink });
  sc.textContent = '4,9 · Abierto ahora';
  s.btns = [['Cómo llegar', C.accent, C.white, 0], ['Sitio web', C.white, C.ink, 1]].map(([label, bg, fg, i]) => {
    const w = 440;
    const n = el('div', s.sheet, 'ui', { position: 'absolute', left: '0', top: '0', width: px(w), height: '116px', borderRadius: '58px', background: bg, color: fg, fontSize: '44px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: i ? `inset 0 0 0 4px ${C.ink}` : 'none' });
    n.textContent = label;
    n._x = M + i * (w + 56);
    return n;
  });
  S.map = s;
  s.pinScreen = null;
}
function mapPose(t) {
  const tilt = ease.inOutCubic(prog(t, Q.tilt[0] - 0.1, Q.tilt[1] - Q.tilt[0] + 0.25)) * 54;
  const rot = lerp(-20, -6, ease.outCubic(prog(t, Q.whip[0], Q.pinZoom[1] - Q.whip[0])));
  const scale = lerp(1.25, 0.96, ease.outCubic(prog(t, Q.whip[0], Q.pinZoom[0] - Q.whip[0])));
  return { tilt, rot, scale };
}
function drawMap(t, { measuring = false } = {}) {
  const s = S.map;
  const on = t >= Q.whip[0] && t < Q.pinZoom[1];
  disp(s.root, on);
  if (!on) return;
  const { tilt, rot, scale } = mapPose(t);
  // centre the destination a bit above the middle of the screen
  const cx = MAP / 2, cy = MAP / 2;
  const ox = W / 2 - cx + (cx - s.dest[0]) * 0.25, oy = 780 - cy;
  s.plane.style.transform = `translate3d(${ox.toFixed(1)}px,${oy.toFixed(1)}px,0) rotateX(${tilt.toFixed(3)}deg) rotateZ(${rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
  // route draws, user dot pulses
  const rp = ease.inOutCubic(prog(t, Q.route[0], Q.route[1] - Q.route[0]));
  s.route.setAttribute('stroke-dashoffset', ((1 - rp) * 1000).toFixed(1));
  const pulse = ((t - Q.whip[0]) / (T.P * 2)) % 1;
  s.userRing.setAttribute('r', (30 + pulse * 60).toFixed(1));
  s.userRing.setAttribute('stroke-width', (6 * (1 - pulse)).toFixed(2));
  // pin drop with squash & stretch
  const dt = t - Q.pin;
  const fall = dt < 0 ? ease.inQuad(prog(t, Q.pin - 0.32, 0.32)) : 1;
  const drop = (1 - fall) * -900;
  let sx = 1, sy = 1;
  if (dt < 0) { sy = 1 + 0.25 * fall; sx = 1 - 0.12 * fall; }
  else { const sq = Math.exp(-dt * 7) * Math.cos(dt * 2 * Math.PI * 3.4); sy = 1 - 0.28 * sq; sx = 1 + 0.2 * sq; }
  const inv = `rotateZ(${(-rot).toFixed(3)}deg) rotateX(${(-tilt).toFixed(3)}deg)`;
  s.pinWrap.style.transform = `translate3d(${s.dest[0] - 75}px,${s.dest[1] - 200}px,0) ${inv}`;
  s.pinBody.style.transform = `translate3d(0,${drop.toFixed(1)}px,0) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
  vis(s.pinWrap, t >= Q.pin - 0.32);
  const sh = clamp(fall);
  s.shadow.setAttribute('rx', (12 + 26 * sh).toFixed(1));
  s.shadow.setAttribute('ry', (12 + 26 * sh).toFixed(1));
  s.ripples.forEach((c, i) => {
    const p = prog(t, Q.pin + i * 0.12, 0.8);
    c.setAttribute('r', (20 + ease.outCubic(p) * 220).toFixed(1));
    c.setAttribute('stroke-width', (10 * (1 - p)).toFixed(2));
    vis(c, p > 0 && p < 1);
  });
  // search bar rides along with the map
  s.pill.set({ x: M, y: 96, w: MW, text: COPY.query });
  // bottom sheet
  const sp = ease.outExpo(prog(t, Q.sheet, 0.55));
  tf(s.sheet, 0, 1240 + (1 - sp) * 900);
  s.head.rise(t, Q.sheetHead, { stagger: 0.022 });
  s.head.visible = t >= Q.sheetHead;
  const rp2 = ease.outExpo(prog(t, Q.sheetRow, 0.5));
  tf(s.row, (1 - rp2) * -60, 318);
  vis(s.row, rp2 > 0);
  s.btns.forEach((n, i) => {
    const p = spring(t - Q.sheetBtns - i * T.P * 0.25, 3, 0.5);
    tf(n, n._x, 430, Math.max(0, p));
    vis(n, p > 0);
  });
  // whip in from below
  const wp = whipOffset(t);
  let rootT = `translate3d(0,${(H - wp).toFixed(2)}px,0)`;
  // zoom into the pin body -> full accent frame
  if (!measuring && s.pinScreen) {
    const z = ease.inExpo(prog(t, Q.pinZoom[0], Q.pinZoom[1] - Q.pinZoom[0]));
    const k = lerp(1, 90, z);
    const [px0, py0] = s.pinScreen;
    rootT += ` translate3d(${px0}px,${py0}px,0) scale(${k.toFixed(4)}) translate3d(${-px0}px,${-py0}px,0)`;
  }
  s.root.style.transform = rootT;
}

// ---------- 5: roll — business types on 8ths ----------------------------------------------
const ICONS = {
  'PANADERÍA': ['M40 210 C40 120 90 92 150 92 C210 92 260 120 260 210 Z', 'M110 120 L126 160 M150 112 L166 152 M190 120 L206 160'],
  TALLER: ['M150 70 A80 80 0 1 1 149.9 70 Z', 'M150 115 A35 35 0 1 1 149.9 115 Z', 'M150 30 V60 M150 240 V270 M30 150 H60 M240 150 H270 M65 65 L86 86 M214 214 L235 235 M65 235 L86 214 M214 86 L235 65'],
  'CLÍNICA': ['M120 50 H180 V120 H250 V180 H180 V250 H120 V180 H50 V120 H120 Z'],
  'CAFÉ': ['M60 120 H220 V170 A80 80 0 0 1 60 170 Z', 'M220 135 H245 A30 30 0 0 1 245 195 H215', 'M100 90 C90 70 110 60 100 40 M140 90 C130 70 150 60 140 40 M180 90 C170 70 190 60 180 40', 'M50 270 H230'],
  TIENDA: ['M60 110 H240 L225 260 H75 Z', 'M110 110 V90 A40 40 0 0 1 190 90 V110'],
  GIMNASIO: ['M40 150 H260', 'M70 100 V200 M100 80 V220 M200 80 V220 M230 100 V200'],
  'PELUQUERÍA': ['M95 225 A35 35 0 1 1 94.9 225 Z', 'M205 225 A35 35 0 1 1 204.9 225 Z', 'M120 200 L215 50 M180 200 L85 50'],
  RESTAURANTE: ['M90 50 V130 A20 20 0 0 0 130 130 V50 M110 50 V270', 'M200 270 V50 C240 70 240 150 200 160'],
};
function buildRoll() {
  const root = sceneRoot(C.ink);
  const cam = el('div', root, 'abs', { width: px(W), height: px(H) });
  const s = { root, cam };
  s.icons = COPY.words.map((w) => {
    const g = svgBox(cam, 300, 300, { left: M - 20, top: 360 });
    const paths = ICONS[w].map((d) => sv('path', g, { d, fill: 'none', stroke: C.lite, 'stroke-width': 18, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': 1 }));
    return { g, paths };
  });
  s.words = COPY.words.map((w) => {
    const f = fitWdth(w, 300, MW, { wmax: 125, wmin: 62 });
    const size = Math.min(320, f.size);
    // all words share one clip band [y-400, y+110] so the roll reads as a single slot
    const base = MET.dispBase;
    return new Text(cam, w, { size, wdth: f.wdth, y: 1040, color: C.paper, padTop: 400 / size - base, padBot: 110 / size });
  });
  s.ticks = COPY.words.map((_, i) => el('div', cam, null, { position: 'absolute', left: px(M + i * 76), top: '1180px', width: '60px', height: '10px', borderRadius: '5px', background: C.ink2 }));
  s.edge = el('div', root, null, { position: 'absolute', left: '0', top: '0', width: px(W), height: px(H), background: C.accent });
  s.kicker = el('div', cam, 'ui', { position: 'absolute', left: px(M), top: '1250px', fontSize: '54px', fontWeight: 500, color: '#c9c5bb' });
  S.roll = s;
}
function drawRoll(t) {
  const s = S.roll;
  const on = t >= Q.wordTimes[0] && t < Q.wipe[1];
  disp(s.root, on);
  if (!on) return;
  const ws = Q.wordTimes;
  let cur = 0;
  for (let i = 0; i < ws.length; i++) if (t >= ws[i]) cur = i;
  // hard cut on every 8th; each word snaps up a short distance and gets a scale punch
  s.words.forEach((w, i) => {
    const show = i === cur;
    w.visible = show;
    if (!show) return;
    const dt = t - ws[i];
    w.chars.forEach((c, k) => {
      const p = ease.outExpo(prog(dt, k * 0.006, 0.13));
      tf(c, 0, (1 - p) * w.size * 0.42);
    });
    w.place(0, 0, 1 + 0.07 * Math.exp(-dt * 22));
  });
  s.icons.forEach((ic, i) => {
    const show = i === cur;
    vis(ic.g, show);
    if (!show) return;
    const p = ease.outCubic(prog(t, ws[i] - 0.02, 0.11));
    ic.paths.forEach((pa) => pa.setAttribute('stroke-dashoffset', (1 - p).toFixed(4)));
    const pop = spring(t - ws[i], 4, 0.45);
    ic.g.style.transformOrigin = '150px 150px';
    ic.g.style.transform = `scale(${lerp(0.7, 1, pop).toFixed(4)}) rotate(${((1 - pop) * -10).toFixed(2)}deg)`;
  });
  s.ticks.forEach((k, i) => { k.style.background = i <= cur ? C.lite : C.ink2; k.style.transform = i === cur ? `scaleY(${1 + 0.6 * Math.exp(-(t - ws[cur]) * 12)})` : ''; });
  const kp = prog(t, ws[0] + 0.1, 0.6);
  const ktxt = 'Da igual a qué te dediques.';
  s.kicker.textContent = ktxt.slice(0, Math.floor(ease.outQuad(kp) * ktxt.length));
  // accent band riding the slanted edge of the incoming wipe (see drawBuild)
  const wp = ease.inOutQuart(prog(t, Q.wipe[0], Q.wipe[1] - Q.wipe[0] + 0.04));
  const top = lerp(H + 260, -260, wp);
  vis(s.edge, wp > 0 && wp < 1);
  s.edge.style.clipPath = `polygon(0 ${top + 110}px, ${W}px ${top - 90}px, ${W}px ${top + 2}px, 0 ${top + 202}px)`;
  const drift = 1 + 0.03 * prog(t, ws[0], Q.wipe[1] - ws[0]);
  s.cam.style.transformOrigin = '50% 50%';
  tf(s.cam, 0, 0, drift);
}

// ---------- 6: build — "TODO NEGOCIO NECESITA UNA WEB." ------------------------------------
function buildBuild() {
  const root = sceneRoot(C.paper);
  const cam = el('div', root, 'abs', { width: px(W), height: px(H) });
  const s = { root, cam };
  const lines = ['TODO NEGOCIO', 'NECESITA', 'UNA WEB.'];
  const size = 196;
  s.lines = lines.map((str, i) => {
    const f = fitWdth(str, size, MW, { wmax: 100 });
    return new Text(cam, str, { size: f.size, wdth: f.wdth, y: 300 + i * size * 0.9 });
  });
  s.mark = el('div', cam, null, { position: 'absolute', left: '0', top: '0', height: px(size * 0.84), background: C.accent, transformOrigin: '0 50%' });
  cam.insertBefore(s.mark, s.lines[2].wrap);
  // browser
  const bx = M, by = 860, bw = MW, bh = 800;
  s.br = el('div', cam, null, { position: 'absolute', left: px(bx), top: px(by), width: px(bw), height: px(bh), borderRadius: '36px', background: C.white, boxShadow: `inset 0 0 0 4px ${C.ink}`, overflow: 'hidden', transformOrigin: '50% 0' });
  const part = (style) => el('div', s.br, null, { position: 'absolute', ...style });
  s.parts = [];
  // 0 top bar
  s.parts.push(part({ left: '0', top: '0', width: px(bw), height: '84px', borderBottom: `4px solid ${C.ink}`, transformOrigin: '0 0' }));
  [0, 1, 2].forEach((i) => el('div', s.parts[0], null, { position: 'absolute', left: px(32 + i * 40), top: '30px', width: '24px', height: '24px', borderRadius: '12px', boxShadow: `inset 0 0 0 4px ${C.ink}` }));
  el('div', s.parts[0], null, { position: 'absolute', left: '170px', top: '20px', width: px(bw - 210), height: '44px', borderRadius: '22px', background: '#efebe2' });
  // 1 nav
  const nav = part({ left: '40px', top: '120px', width: px(bw - 80), height: '48px' });
  el('div', nav, null, { position: 'absolute', left: '0', top: '0', width: '48px', height: '48px', borderRadius: '12px', background: C.ink });
  [0, 1, 2].forEach((i) => el('div', nav, null, { position: 'absolute', right: px(i * 110), top: '16px', width: '84px', height: '16px', borderRadius: '8px', background: '#d9d4c8' }));
  s.parts.push(nav);
  // 2 hero image
  const hero = part({ left: '40px', top: '200px', width: px(bw - 80), height: '250px', borderRadius: '24px', background: C.ink, overflow: 'hidden', transformOrigin: '50% 0' });
  const hg = svgBox(hero, bw - 80, 250);
  sv('circle', hg, { cx: bw - 220, cy: 95, r: 50, fill: C.lite });
  sv('path', hg, { d: `M0 250 L180 120 L330 220 L470 110 L${bw - 80} 250 Z`, fill: C.ink2 });
  s.parts.push(hero);
  // 3,4 title bars
  s.parts.push(part({ left: '40px', top: '486px', width: px((bw - 80) * 0.78), height: '40px', borderRadius: '10px', background: C.ink, transformOrigin: '0 0' }));
  s.parts.push(part({ left: '40px', top: '540px', width: px((bw - 80) * 0.5), height: '40px', borderRadius: '10px', background: C.ink, transformOrigin: '0 0' }));
  // 5 body lines
  const body = part({ left: '40px', top: '604px', width: px(bw - 80), height: '60px', transformOrigin: '0 0' });
  [0, 1].forEach((i) => el('div', body, null, { position: 'absolute', left: '0', top: px(i * 30), width: px((bw - 80) * (0.92 - i * 0.25)), height: '14px', borderRadius: '7px', background: '#d9d4c8' }));
  s.parts.push(body);
  // 6 button (this one becomes the next scene)
  s.btn = part({ left: '40px', top: '690px', width: '300px', height: '84px', borderRadius: '42px', background: C.accent, color: C.white, fontFamily: 'Geist', fontSize: '36px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: '1' });
  s.btn.textContent = 'Reservar';
  s.parts.push(s.btn);
  // 7 stars + 8 small cards
  const st = part({ left: '372px', top: '714px', width: '260px', height: '40px' });
  stars(st, 0, 0, 36);
  s.parts.push(st);
  const thumbs = part({ left: px(bw - 40 - 3 * 90 + 14), top: '700px', width: '270px', height: '64px' });
  [0, 1, 2].forEach((i) => el('div', thumbs, null, { position: 'absolute', left: px(i * 90), top: '0', width: '76px', height: '64px', borderRadius: '14px', background: i === 1 ? C.ink : '#d9d4c8' }));
  s.parts.push(thumbs);
  s.btnRect = { x: bx + 40, y: by + 690, w: 300, h: 84 };
  // cursor
  s.cursor = svgBox(cam, 80, 100);
  sv('path', s.cursor, { d: 'M8 6 L8 78 L26 62 L40 92 L54 86 L40 56 L66 56 Z', fill: C.ink, stroke: C.white, 'stroke-width': 5, 'stroke-linejoin': 'round' });
  S.build = s;
}
function drawBuild(t) {
  const s = S.build;
  const on = t >= Q.wipe[0] && t < Q.click + 0.5;
  disp(s.root, on);
  if (!on) return;
  // wipe in from the bottom with a slanted edge
  const wp = ease.inOutQuart(prog(t, Q.wipe[0], Q.wipe[1] - Q.wipe[0] + 0.04));
  const top = lerp(H + 260, -260, wp);
  s.root.style.clipPath = wp >= 1 ? 'none' : `polygon(0 ${top + 200}px, ${W}px ${top}px, ${W}px ${H}px, 0 ${H}px)`;

  const camY = (1 - wp) * 260;
  // headline
  s.lines.forEach((ln, i) => {
    ln.rise(t, Q.buildHead[i] - (i === 0 ? 0.06 : 0), { stagger: 0.022 });
    ln.visible = t >= Q.buildHead[i];
  });
  const L = s.lines[2];
  const mp = ease.outExpo(prog(t, Q.buildHead[2] + 0.05, 0.5));
  s.mark.style.width = px(L.width + 40);
  tf(s.mark, L.x - 18, L.y - L.size * 0.78);
  s.mark.style.transform += ` scaleX(${mp.toFixed(4)})`;
  vis(s.mark, mp > 0);
  metal(s.mark, t, 0.3);
  const mEdge = L.x - 18 + mp * (L.width + 40);
  L.chars.forEach((c, i) => { c.style.color = L.x + L.pos[i].x + L.pos[i].w * 0.5 < mEdge ? C.paper : C.ink; });
  // browser pops up, parts build on 16ths
  const bp = spring(t - Q.buildParts[0] + 0.12, 2.6, 0.62);
  s.br.style.transform = `translate3d(0,${((1 - Math.min(bp, 1.2)) * 700).toFixed(1)}px,0)`;
  vis(s.br, t >= Q.buildParts[0] - 0.12);
  s.parts.forEach((p, i) => {
    const t0 = Q.buildParts[i];
    const k = ease.outExpo(prog(t, t0, 0.4));
    vis(p, t >= t0);
    if (i === 0 || i === 3 || i === 4 || i === 5) p.style.transform = `scaleX(${k.toFixed(4)})`;
    else if (i === 2) p.style.transform = `scaleY(${k.toFixed(4)})`;
    else if (i === 6) {
      const sp = spring(t - t0, 3.2, 0.45);
      const hover = ease.outCubic(prog(t, Q.cursorMove[1] - 0.15, 0.2));
      const press = t >= Q.click - 0.06 ? 0.92 : 1;
      p.style.transform = `scale(${(Math.max(0, sp) * (1 + 0.05 * hover) * press).toFixed(4)})`;
    } else p.style.transform = `translate3d(0,${((1 - k) * 40).toFixed(1)}px,0) scale(${lerp(0.6, 1, spring(t - t0, 3.5, 0.5)).toFixed(4)})`;
  });
  // cursor glides to the button and clicks
  const cp = ease.inOutCubic(prog(t, Q.cursorMove[0], Q.cursorMove[1] - Q.cursorMove[0]));
  const bx = s.btnRect.x + s.btnRect.w * 0.62, by = s.btnRect.y + s.btnRect.h * 0.55;
  const cx = lerp(W + 40, bx, cp) + Math.sin(cp * Math.PI) * -60;
  const cy = lerp(1560, by, cp) + Math.sin(cp * Math.PI) * -90;
  const press = t >= Q.click - 0.06 && t < Q.click + 0.08 ? 0.82 : 1;
  tf(s.cursor, cx, cy, press);
  vis(s.cursor, t >= Q.cursorMove[0]);
  tf(s.cam, 0, camY, 1 + 0.015 * prog(t, Q.buildHead[0], Q.click - Q.buildHead[0]));
}

// ---------- 7: end — "¿Y EL TUYO?" ---------------------------------------------------------
function buildEnd() {
  const root = sceneRoot('transparent');
  const s = { root };
  s.fill = el('div', root, null, { position: 'absolute', left: '0', top: '0', background: C.accent });
  s.cam = el('div', root, 'abs', { width: px(W), height: px(H), transformOrigin: '50% 50%' });
  const f1 = fitWdth('¿Y EL', 330, MW, { wmax: 100 });
  const f2 = fitWdth('TUYO?', 330, MW, { wmax: 100 });
  const size = Math.min(f1.size, f2.size);
  s.l1 = new Text(s.cam, '¿Y EL', { size, wdth: f1.wdth, y: 640, color: C.paper });
  s.l2 = new Text(s.cam, 'TUYO?', { size, wdth: f2.wdth, y: 640 + size * 0.9, color: C.paper });
  s.url = new Pill(s.cam, { icon: 'lock' });
  s.check = svgBox(s.cam, 84, 84);
  sv('circle', s.check, { cx: 42, cy: 42, r: 40, fill: C.ink });
  s.checkPath = sv('path', s.check, { d: 'M24 43 L37 56 L61 30', fill: 'none', stroke: C.lite, 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': 1 });
  s.cta = el('div', s.cam, 'ui', { position: 'absolute', left: px(M), top: '0', fontSize: '50px', fontWeight: 600, color: C.paper });
  S.end = s;
}
function drawEnd(t) {
  const s = S.end;
  const on = t >= Q.click;
  disp(s.root, on);
  if (!on) return;
  // the "Reservar" button grows into the whole frame
  const r = S.build.btnRect;
  const p = ease.outExpo(prog(t, Q.click, 0.42));
  const x = lerp(r.x, 0, p), y = lerp(r.y, 0, p), w = lerp(r.w, W, p), h = lerp(r.h, H, p);
  metal(s.fill, t - Q.click, 0.14);
  Object.assign(s.fill.style, { left: px(x), top: px(y), width: px(w), height: px(h), borderRadius: px(lerp(42, 0, p)) });
  // headline
  s.l1.rise(t, Q.endHead[0], { stagger: 0.03 });
  s.l2.rise(t, Q.endHead[1], { stagger: 0.03 });
  s.l1.visible = t >= Q.endHead[0];
  s.l2.visible = t >= Q.endHead[1];
  // the ? hops on the last beat
  const q = s.l2.chars[s.l2.chars.length - 1];
  const hop = t >= Q.qBounce ? Math.sin(Math.min(1, (t - Q.qBounce) / 0.32) * Math.PI) * -60 * Math.exp(-(t - Q.qBounce) * 2) : null;
  if (hop !== null) q.style.transform = `translate3d(0,${hop.toFixed(1)}px,0) rotate(${(hop / -6).toFixed(2)}deg)`;
  // url bar: types, autocompletes, Enter, loads, check
  const ui = ease.outExpo(prog(t, Q.urlIn, 0.5));
  const n = T.typeUrl.filter((k) => k <= t).length;
  let text = COPY.urlTyped.slice(0, n), sel = '';
  if (t >= Q.autocomplete) sel = COPY.urlAuto;
  if (t >= Q.go) { text = COPY.urlTyped + COPY.urlAuto; sel = ''; }
  const caret = t < Q.go && ((t * 2.13) % 1 < 0.6 || (n && t - T.typeUrl[n - 1] < 0.25));
  const bar = t >= Q.go ? ease.inOutCubic(prog(t, Q.go, Q.loaded - Q.go)) : 0;
  const goPress = t >= Q.go && t < Q.go + 0.1 ? 0.97 : 1;
  s.url.set({ x: M, y: 1250 + (1 - ui) * 500, w: MW, text, sel, caret, bar: bar < 1 ? bar : 0, s: goPress });
  vis(s.url.root, t >= Q.urlIn);
  const cp = spring(t - Q.loaded, 3.4, 0.45);
  tf(s.check, W - M - 84 - 22, 1250 + 22, Math.max(0, cp));
  vis(s.check, t >= Q.loaded);
  s.checkPath.setAttribute('stroke-dashoffset', (1 - ease.outCubic(prog(t, Q.loaded + 0.05, 0.25))).toFixed(3));
  // CTA under the bar
  const ctaTxt = 'Haz que te encuentren.';
  const cpp = prog(t, Q.go + 0.05, 0.45);
  s.cta.textContent = ctaTxt.slice(0, Math.ceil(ease.outQuad(cpp) * ctaTxt.length));
  tf(s.cta, 0, 1440);
  vis(s.cta, cpp > 0);
  tf(s.cam, 0, 0, 1 + 0.025 * ease.outCubic(prog(t, Q.click, FILM.duration - Q.click)));
}

// ------------------------------------------------------------------------------------------
// Global camera shake on impacts (deterministic noise, decays fast).
let HITS = [];
function shake(t) {
  let x = 0, y = 0, r = 0;
  for (const [th, a, seed] of HITS) {
    const d = t - th;
    if (d < 0 || d > 0.7) continue;
    const e = a * Math.exp(-d * 8);
    x += e * noise1(d * 34, seed);
    y += e * noise1(d * 34, seed + 7);
    r += e * 0.05 * noise1(d * 26, seed + 13);
  }
  return { x, y, r };
}

let stageScale = 1;
function render(t) {
  drawSearch(t);
  drawVoid(t);
  drawOpen(t);
  drawMap(t);
  drawRoll(t);
  drawBuild(t);
  drawEnd(t);
  stage.style.background = t < Q.voidLines[0] ? C.paper : t < Q.drop ? C.ink : t < (Q.whip[0] + Q.whip[1]) / 2 ? C.accent : t < Q.pinZoom[1] ? C.land : t < Q.wipe[1] ? C.ink : t < Q.click + 0.42 ? C.paper : C.accent;
  const sk = shake(t);
  const world = `translate3d(${sk.x.toFixed(2)}px,${sk.y.toFixed(2)}px,0) rotate(${sk.r.toFixed(3)}deg)`;
  for (const k in S) {
    if (k === 'map' || k === 'open') continue; // these carry their own whip transforms
    S[k].root.style.transform = world;
  }
  S.open.root.style.transform += ` ${world}`;
}

async function init() {
  const grid = await (await fetch('beats.json')).json();
  T = makeTimeline(grid);
  b = T.b;
  Q = T.cue;
  Q_TYPE = T.typeQuery;
  HITS = [[Q.hookWords[0], 8, 1], [Q.voidLines[0], 12, 2], [Q.voidLines[1], 7, 3], [Q.drop, 26, 4], [Q.pin, 9, 5], [Q.wordTimes[0], 12, 6], [Q.buildHead[2], 7, 7], [Q.click, 16, 8], [Q.go, 5, 9]];
  await Promise.all([document.fonts.load('900 100px Archivo'), document.fonts.load('500 40px Geist'), document.fonts.load('600 40px Geist'), document.fonts.load('700 40px Geist')]);
  await document.fonts.ready;
  initMetrics();
  buildSearch();
  buildVoid();
  buildOpen();
  buildMap();
  buildRoll();
  buildBuild();
  buildEnd();
  // where on screen the pin body sits when the zoom begins (pure function of the timeline)
  drawMap(Q.pinZoom[0], { measuring: true });
  const sr = stage.getBoundingClientRect();
  const pr = S.map.pinBody.getBoundingClientRect();
  S.map.pinScreen = [(pr.left - sr.left + pr.width * 0.5) / stageScale, (pr.top - sr.top + pr.height * 0.6) / stageScale];
  render(0);
  return true;
}

window.FILM = FILM;
window.seek = (t) => { render(t); };
window.ready = init();

// ---- preview mode only: real-time playback with the score (never used when rendering) ----
if (new URLSearchParams(location.search).has('preview')) {
  document.body.classList.add('preview');
  window.ready.then(() => {
    const fit = () => {
      stageScale = 1;
      const s = Math.min(innerWidth / W, (innerHeight - 40) / H);
      stage.style.transform = `scale(${s})`;
      stage.style.margin = `0 ${(-W * (1 - s)) / 2}px ${-H * (1 - s)}px`;
    };
    fit();
    addEventListener('resize', fit);
    const audio = new Audio('score.wav');
    let playing = false, t = 0;
    const loop = () => {
      if (playing) { t = audio.currentTime; if (audio.ended) { playing = false; } }
      render(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') { playing = !playing; if (playing) { if (t >= FILM.duration - 0.05) t = 0; audio.currentTime = t; audio.play(); } else audio.pause(); }
      if (e.code === 'ArrowRight') { t = Math.min(FILM.duration, t + 1 / 60); audio.currentTime = t; }
      if (e.code === 'ArrowLeft') { t = Math.max(0, t - 1 / 60); audio.currentTime = t; }
    });
    stage.addEventListener('click', (e) => { const r = stage.getBoundingClientRect(); t = ((e.clientX - r.left) / r.width) * FILM.duration; audio.currentTime = t; });
  });
}
