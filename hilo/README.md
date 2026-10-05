# Hilo — Agentes de IA para WhatsApp (15 s showreel piece)

Vertical motion piece in Spanish (1080×1920, 60 fps, H.264 CRF 16 yuv420p, -14 LUFS) for a fictional
service: AI agents that answer a business's WhatsApp. Hybrid of generated footage (Higgsfield) and
code-driven motion graphics, score and sound design.

**Watch:** `out/hilo-agentes-ia-whatsapp.mp4` · **Live preview with sound:** serve `film/` and open `index.html?preview` (space = play).

## Story (128 BPM, 8 bars, one idea per bar)

| Bar | On screen | Move |
|---|---|---|
| 0 | **03:12 A.M.** · TU CLIENTE TE ESCRIBE. | slot-machine clock over footage of a phone lighting up a nightstand; notifications drop on 8ths |
| 1 | ¿Y QUIÉN RESPONDE? | 20 unanswered messages pile up on an accelerating grid, unread badge counts, camera shakes; a green thread whips through and floods the frame |
| 2 | TU AGENTE DE IA. | width-axis slam on full green, band parks at the top, the chat answers in 0,8 s |
| 3 | VENDE. COBRA. AGENDA. ESCUCHA. | one verb per beat, each one a live UI action: reserve tap, payment fills + check, time slot pick, voice note playhead |
| 4 | 1 AGENTE. 1.284 CONVERSACIONES A LA VEZ. | the chat becomes one tile of hundreds (exponential zoom-out + roll), tiles answer in a radial wave; mosaic implodes into the thread |
| 5 | MIENTRAS TU NEGOCIO DUERME, | footage: the closed bakery in the rain; paid orders slide in at 03:14, 03:52, 04:37, 05:20 |
| 6 | Y TÚ ABRES CON 37 PEDIDOS. | footage: the owner at sunrise breaks into a smile at camera on the count's slam; the thread underlines |
| 7 | nebula · Agentes de IA para WhatsApp · Pruébalo gratis → | the thread draws a speech bubble, typing dots become the "nebula" wordmark (fitted on the width axis), CTA tapped on the beat |

## Higgsfield footage

Keyframes generated with **GPT Image 2.5** (high, 2K), animated with **Seedance 2.5** image-to-video (1080p, 5 s, no audio):
`night` (phone on a nightstand at 3 a.m.), `shop` (closed bakery, rain, passing car), `owner` (owner at sunrise),
plus a GPT Image 2.5 product still (`croissants.jpg`) used inside the chat's product card.
Trimmed sources live in `assets/footage/`; `tools/extract-plates.sh` turns them into the JPEG sequences in
`film/media/` that `seek(t)` draws (frame = floor(t × 24) after a per-scene time remap; pure function of t).

## Pipeline

```
tools/extract-plates.sh            # footage -> film/media/<plate>/f0001.jpg ...
node audio/build.mjs               # score + SFX; beat grid measured from the drum stem -> film/beats.json; -14 LUFS
node render.mjs --contact          # one frame per beat -> out/contact.png
node tools/strip.mjs 3.4 4.4       # dense filmstrip of one transition, for motion review
node render.mjs --skip-audio       # full render (motion blur: 4 / 8 / 20 sub-frames by section speed)
```

- `film/film.js` — the film. `window.seek(t)` paints frame t (async only to fetch the footage frame it needs).
  No CSS transitions, timers or frame-to-frame state; randomness is seeded (`mulberry32` / `hash01` in `film/lib.js`).
- `film/timeline.js` — every cue on the measured beat grid, shared by picture and sound.
- `audio/score.mjs` — A minor -> C: dark hook, snare-roll build, four-on-the-floor drop, half-time night breakdown with rain,
  rebuild into the "37" hit, resolving Cmaj9 with bells. `audio/sfx.mjs` — clock flips, buzzes, message pops, taps, payment
  ticks, whooshes, impacts, all placed from `timeline.js`.

## Look

Display face Archivo (variable width axis animated on slams), UI face Geist. One accent: WhatsApp-adjacent green `#25D366`
on ink `#0A0D0B` and paper `#EEEBE3`. No gradients as backgrounds (only footage scrims), no fades, corner labels, frame
borders, glow or particle bursts. Generic chat glyph, not the WhatsApp logo. End wordmark: "nebula"; "Panadería Luna" is fictional.
