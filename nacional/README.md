# Atlético Nacional — La 23 ya tiene dueño (20 s ad)

Kit + signing announcement in Spanish for Atlético Nacional's black/neon shirt and James Rodríguez (23).
9:16, 1080×1920, 60 fps, H.264 CRF 16 yuv420p, AAC, −14 LUFS. **Watch:** `out/nacional-james-23-9x16.mp4`.

The only branding is the club, plus what is printed on the supplied shirt. James's face is never generated:
the player is revealed through the shirt (name, number) and type.

## Story (96 BPM, 8 bars = 20.0 s)
| Bar | On screen |
|---|---|
| 0 | **NUEVA PIEL.** The collar's neon V draws on frame 0; close-ups of the real shirt cut on eighth notes |
| 1 | **NEGRO. NEÓN. NACIONAL.** One word per beat, the frame inverts to neon on NEÓN. Then shards of the kit's pattern fly together into the shirt |
| 2 | Drop: the shirt lands, a neon trace runs its silhouette, callouts 01 ESCUDO · 02 CUELLO EN V · 03 PUÑOS NEÓN |
| 3 | **LA 23 YA TIENE DUEÑO.** The shirt turns front → back |
| 4 | Back reveal: a giant outline 23 draws in, a scan lights JAMES, push-in, whip-zoom through the gap between 2 and 3 |
| 5 | **JAMES / RODRÍGUEZ / 23**: knockout bar, width-axis slam, the kit's own numerals |
| 6 | **ES VERDOLAGA.** The crest builds from its pieces |
| 7 | Lockup: crest, **ATLÉTICO NACIONAL**, BIENVENIDO, JAMES 23. Stinger on beat 31 |

## Brand accuracy
- Shirt pixels are the supplied photos (`assets/src-*.png`), cut out by `tools/cutout.mjs`.
- The crest, shirt silhouette, the **23** numerals and **JAMES** are traced from those same images
  (`tools/trace.mjs`: marching squares + Douglas-Peucker) → `film/*.json`. They are exact, and each piece can be animated.
- Colours sampled from the photos: neon `#2BFA25`, shirt black `#0D1213`, shard grey `#373D41`, crest green `#00953B`.
- Type: Archivo variable (width axis animated) for display, Geist Mono for labels. Both OFL.

## Higgsfield
Generated with Higgsfield's top models (all in the account's library):
- **Kling 3.0, 4K**: start/end-frame turn from front to back. Keyframes are the real cutouts registered
  torso-to-torso (`tools/keyframes.mjs`) and upscaled 4K first.
- **Cinema Studio 3.0**: the same turn (alternate), and a match-night stadium plate (green flares, floodlights) for bars 6–7.
- **Bytedance 4K upscale**: the three supplied photos.

`tools/fetch-plates.mjs` downloads them, extracts frames to `film/plates/` and writes `plates/manifest.json`.
The film picks the plates up when the manifest exists. Without it, the turn is a code-built cylinder
rotation, the end card sits on the kit pattern in green, and the shirts are the local cutouts.
The fetch needs network access to `d8j0ntlcm91z4.cloudfront.net` (blocked in the environment this was built in).

## Run
```
node tools/fetch-plates.mjs     # optional: Higgsfield plates + HD shirts
node audio/build.mjs            # score + SFX -> film/beats.json (measured grid) -> film/score.wav
node render.mjs --contact       # one frame per beat -> out/contact-v.png
node tools/motion-check.mjs 60  # frame-difference plot vs the beat grid -> out/motion.png
node render.mjs                 # full render (motion blur, 4–20 sub-frames) -> out/nacional-james-23-9x16.mp4
```
The film is a pure function of time (`window.seek(t)`). There are no transitions, timers or carried state, and
the only randomness is `mulberry32`. Sound: kick/rim dembow, 808 with glides, marimba hook, supersaw stabs, timbal fill,
glass-shard pings for the gather, a synthesized stadium crowd on the reveal and lockup. Every hit is placed from
`film/timeline.js` on the grid measured from the rendered drums (96.01 BPM, ~2 ms residual).
