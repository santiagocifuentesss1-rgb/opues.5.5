# Todo negocio necesita una web

15-second kinetic motion piece (Spanish, 1080×1920, 60 fps) on why every business needs a website.
Everything — picture, score, sound design — is generated in code.

**Watch:** `out/todo-negocio-necesita-una-web.mp4` · **Live preview with sound:** serve `film/` and open `index.html?preview` (space = play).

## Story (one bar per scene, 128 BPM, 8 bars = 15.0 s)

| Bar | On screen | Move |
|---|---|---|
| 0 | TUS CLIENTES TE BUSCAN. | search typed on an ES keyboard (with Ñ), keys light per keystroke |
| 1 | ¿Y TÚ DÓNDE ESTÁS? | results cascade in; your slot is empty and shakes |
| 2 | SIN WEB, NO EXISTES. | fall into the empty slot; "EXISTES." is glitch-deleted; riser |
| 3 | ABIERTO 24/7 | drop: width-axis slam, clock spins to 03:12, night orders land |
| 4 | AQUÍ ESTÁS. | whip pan to a 3D-tilted map, route draws, pin drops, bottom sheet |
| 5 | PANADERÍA · TALLER · CLÍNICA… | zoom through the pin; 8 trades on 8th notes, icons draw on |
| 6 | TODO NEGOCIO NECESITA UNA WEB. | slanted wipe; a website assembles itself on 16ths, cursor clicks |
| 7 | ¿Y EL TUYO? | the button becomes the frame; URL autocompletes, loads, ✓ |

## Pipeline

```
node render.mjs              # score -> beats.json -> motion-blurred frames -> H.264 CRF 16 yuv420p + AAC
node render.mjs --contact    # one frame per beat -> out/contact.png
node render.mjs --still 1.2  # full-res stills -> out/stills/
```

- `film/film.js` — the film. `window.seek(t)` paints frame `t`; no transitions, timers or frame-to-frame
  state. Randomness is seeded (`mulberry32` in `film/lib.js`).
- `film/timeline.js` — every cue time, built on the measured beat grid. Shared by the visuals and the sound design.
- `audio/score.mjs` — the music (kick, clap, hats, bass, supersaw stabs, plucks, pads), synthesized in `audio/dsp.mjs`.
- `audio/beats.mjs` — onset detection on the rendered drum stem + least-squares tempo/phase fit -> `film/beats.json`
  (127.98 BPM measured, ~3 ms residual).
- `audio/sfx.mjs` — keys, whooshes, impacts, glitches, chimes placed from `timeline.js`.
- `audio/build.mjs` — mix, look-ahead limiter, BS.1770 loudness loop to **-14 LUFS** integrated (true peak ≤ -1.4 dBTP).
- `render.mjs` — headless Chromium samples `seek()`; 180° shutter motion blur by averaging 4 sub-frames
  (12 on slams, 28 on whips/zooms); lossless segments in parallel, then one bt709 H.264 encode.

## Look

Display face: Archivo (variable width + weight, the width axis is animated). UI face: Geist.
One accent (`#FF4A1C`) on ink and paper. No gradients, fades, corner labels, frame borders, glow or particle bursts.

Fonts are OFL (licenses in `film/fonts/`).
