# Nébula — Agentes de IA para WhatsApp (20 s)

Motion piece in Spanish for nebulatechnologiesco.com. One timeline, three formats:
`out/nebula-agentes-ia-9x16.mp4`, `-1x1.mp4`, `-16x9.mp4` (60 fps, H.264 CRF 16, -14 LUFS).

## Assets (`assets/`)
All product UI is cropped from a real screenshot of the site (`assets/site-hero.webp`, supplied by the client
because the site is blocked from this environment's network). Crops: logo, nav, top CTA, badge, headline,
subcopy, main + secondary CTA, tagline, Nova chat widget, chat orb. `tools/prep-assets.mjs` upscales them 3x and
unifies dark background pixels to the blob colour on crops that sit on the blob (text pixels untouched).

Colours sampled from the screenshot: bg `#0d0b15`, blob `#61439d`–`#7953c4`, CTA `#7435dc`→`#a277e5`,
text `#f1eff9`, muted `#8773a5`. Fonts matched by eye (site CSS not reachable): Inter (display), Geist Mono (labels).
The end wordmark is typeset (Inter 700, tracked) because the only logo source is 118×30 px — swap in an SVG if available.

## Story (120 BPM, 40 beats)
| Beats | Scene |
|---|---|
| 0–8 | Hook: TUS CLIENTES ESCRIBEN. NADIE RESPONDE. + a typing bubble that gives up |
| 8–16 | Drop: blob grows, the real hero assembles piece by piece |
| 16–20 | 01 Agentes: cursor clicks “Pregúntame” on the real Nova widget |
| 20–24 | 02 Webs: camera pushes into the real hero, cursor presses “Agenda tu demo” |
| 24–28 | 03 SEO/GEO: cursor clicks “Resultados” in the real nav, “RESULTADOS MEDIBLES” boxed |
| 28–32 | Metric: 24/7 (the site's own claim) |
| 32–40 | Lockup NÉBULA + real CTA “Agenda tu demo”, clicked on the beat |

## Run
```
node tools/prep-assets.mjs
node audio/build.mjs                      # score + SFX, beat grid measured -> film/beats.json
node render.mjs --contact --fmt v|s|h     # one frame per beat
node render.mjs --skip-audio --fmt v|s|h  # full render
```
