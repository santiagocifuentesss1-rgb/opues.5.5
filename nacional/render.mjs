// Renderer for the Atlético Nacional ad. The film is a pure function of time (window.seek(t)); this file only samples it.
//
//   node render.mjs                 full pipeline: score -> frames (motion-blurred) -> H.264 CRF 16 yuv420p
//   node render.mjs --contact       one frame per beat as a contact sheet (out/contact.png)
//   node render.mjs --still 1.2,3   individual full-res stills (out/stills/)
//
// Options: --workers N  --samples N (base motion-blur samples)  --shutter DEG  --skip-audio  --out FILE
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { FILM, FORMATS, makeTimeline } from './film/timeline.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const filmDir = path.join(root, 'film');
const outDir = path.join(root, 'out');
fs.mkdirSync(outDir, { recursive: true });

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const MODE = opt('contact', false) ? 'contact' : opt('still', false) ? 'still' : 'full';
const WORKERS = +opt('workers', Math.max(2, Math.min(4, os.cpus().length)));
const BASE_SAMPLES = +opt('samples', 4);
const SHUTTER = +opt('shutter', 180);
const FMT = String(opt('fmt', 'v'));
const { width: Wd, height: Ht } = FORMATS[FMT];
const { fps: FPS, duration: DUR } = FILM;

function serve(dir) {
  const types = { '.jpg': 'image/jpeg', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' };
  const server = http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: Wd, height: Ht }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(url);
  await page.evaluate(() => window.ready);
  const cdp = await page.context().newCDPSession(page);
  const shot = async (t) => {
    await page.evaluate((tt) => window.seek(tt), t);
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    return Buffer.from(r.data, 'base64');
  };
  return { page, shot };
}

function ffmpeg(args, opts = {}) {
  return new Promise((ok, bad) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: [opts.stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('exit', (c) => (c === 0 ? ok() : bad(new Error('ffmpeg exited ' + c))));
    if (opts.stdin) opts.stdin(p.stdin);
  });
}

// Motion blur: more sub-frames where the film moves fast (whips, zooms, slams, the turn).
function samplesFor(t, T) {
  const q = T.cue;
  const fastest = [[q.hookOut - 0.1, q.hookOut + 0.35], [q.turn[0] + 0.25, q.turn[1] + 0.1], [q.james - 0.35, q.james + 0.2], [q.nameOut - 0.1, q.es + 0.1], [q.gather[1] - 0.35, q.drop + 0.15]];
  if (fastest.some(([a, b]) => t >= a && t <= b)) return BASE_SAMPLES * 5;
  const hits = [q.nueva, q.piel, ...q.macro, ...q.words, q.drop, q.reveal, q.rodriguez, q.verdolaga, ...q.crest, q.lock];
  const fast = [[-0.3, 0.5], [q.gather[0], q.gather[1]], ...hits.map((h) => [h - 0.08, h + 0.3]), [q.push[0], q.push[1]]];
  return fast.some(([a, b]) => t >= a && t <= b) ? BASE_SAMPLES * 2 : BASE_SAMPLES;
}

async function main() {
  const t0 = Date.now();
  if (!opt('skip-audio', false) && MODE === 'full') {
    const { buildScore } = await import('./audio/build.mjs');
    await buildScore();
  }
  const grid = JSON.parse(fs.readFileSync(path.join(filmDir, 'beats.json'), 'utf8'));
  const T = makeTimeline(grid);
  const server = await serve(filmDir);
  const url = `http://127.0.0.1:${server.address().port}/index.html?fmt=${FMT}`;
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });

  try {
    if (MODE === 'still') {
      const times = String(opt('still')).split(',').map(Number);
      const { shot } = await openPage(browser, url);
      fs.mkdirSync(path.join(outDir, 'stills'), { recursive: true });
      for (const t of times) {
        const f = path.join(outDir, 'stills', `${FMT}-t${t.toFixed(3)}.png`);
        fs.writeFileSync(f, await shot(t));
        console.log(f);
      }
      return;
    }

    if (MODE === 'contact') {
      // one frame per beat, sampled just past the downbeat hit so entrances have read
      const beats = grid.beats.filter((x) => x < DUR - 1e-3);
      const times = beats.map((x) => Math.max(0, x) + T.P * +opt('phase', 0.55));
      const { shot } = await openPage(browser, url);
      const th = FMT === 'v' ? 480 : 225, tw = Math.round((th * Wd) / Ht), cols = FMT === 'h' ? 5 : 8, pad = 10, lab = 34;
      const rows = Math.ceil(times.length / cols);
      const tiles = [];
      for (let i = 0; i < times.length; i++) {
        const png = await shot(times[i]);
        const img = await sharp(png).resize(tw, th).png().toBuffer();
        const x = pad + (i % cols) * (tw + pad), y = pad + Math.floor(i / cols) * (th + lab + pad);
        tiles.push({ input: img, left: x, top: y + lab });
        const label = Buffer.from(`<svg width="${tw}" height="${lab}"><text x="2" y="24" font-family="DejaVu Sans" font-size="20" fill="#ddd">beat ${i}  ·  ${times[i].toFixed(2)}s</text></svg>`);
        tiles.push({ input: label, left: x, top: y });
      }
      const sheetW = pad + cols * (tw + pad), sheetH = pad + rows * (th + lab + pad);
      const out = path.join(outDir, opt('name', `contact-${FMT}`) + '.png');
      await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#161616' } }).composite(tiles).png().toFile(out);
      console.log(out, `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      return;
    }

    // ---------------- full render ----------------
    const nFrames = Math.round(DUR * FPS);
    const segDir = path.join(outDir, 'segments-' + FMT);
    fs.rmSync(segDir, { recursive: true, force: true });
    fs.mkdirSync(segDir, { recursive: true });
    const per = Math.ceil(nFrames / WORKERS);
    let done = 0;
    const px = Wd * Ht * 3;
    const worker = async (w) => {
      const f0 = w * per, f1 = Math.min(nFrames, f0 + per);
      if (f0 >= f1) return null;
      const { shot } = await openPage(browser, url);
      const seg = path.join(segDir, `seg${String(w).padStart(2, '0')}.mkv`);
      const acc = new Float32Array(px);
      const frame = Buffer.alloc(px);
      await ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${Wd}x${Ht}`, '-r', String(FPS), '-i', '-', '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'ultrafast', seg], {
        stdin: async (stdin) => {
          for (let f = f0; f < f1; f++) {
            const tc = f / FPS;
            const n = samplesFor(tc, T);
            acc.fill(0);
            for (let k = 0; k < n; k++) {
              const ts = tc + ((k + 0.5) / n - 0.5) * (SHUTTER / 360) / FPS;
              const raw = await sharp(await shot(Math.min(ts, DUR - 1e-4))).removeAlpha().raw().toBuffer();
              for (let i = 0; i < px; i++) acc[i] += raw[i];
            }
            for (let i = 0; i < px; i++) frame[i] = Math.round(acc[i] / n);
            if (!stdin.write(frame)) await new Promise((r) => stdin.once('drain', r));
            done++;
            if (done % 30 === 0) process.stdout.write(`\r  frames ${done}/${nFrames}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
          }
          stdin.end();
        },
      });
      return seg;
    };
    const segs = (await Promise.all(Array.from({ length: WORKERS }, (_, w) => worker(w)))).filter(Boolean);
    process.stdout.write('\n');
    const list = path.join(segDir, 'list.txt');
    fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
    const out = path.resolve(root, opt('out', `out/nacional-james-23-${FMT === 'v' ? '9x16' : '16x9'}.mp4`));
    await ffmpeg([
      '-f', 'concat', '-safe', '0', '-i', list,
      '-i', path.join(filmDir, 'score.wav'),
      '-map', '0:v', '-map', '1:a',
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-r', String(FPS), '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
      '-t', String(DUR), '-movflags', '+faststart', out,
    ]);
    console.log(out, `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
