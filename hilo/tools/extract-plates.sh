#!/usr/bin/env bash
# Footage (assets/footage/*.mp4, Higgsfield Seedance 2.5) -> JPEG image sequences the film seeks into.
set -euo pipefail
cd "$(dirname "$0")/.."
for n in night shop owner; do
  mkdir -p film/media/$n && rm -f film/media/$n/*.jpg
  ffmpeg -v error -i assets/footage/$n.mp4 -q:v 2 film/media/$n/f%04d.jpg
  echo "{\"count\": $(ls film/media/$n/*.jpg | wc -l)}" > film/media/$n/index.json
done
cp assets/croissants.jpg film/media/croissants.jpg
