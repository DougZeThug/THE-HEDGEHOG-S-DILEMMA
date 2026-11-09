#!/usr/bin/env bash
# Memory VII in the room: the film's four web copies (src/memory/living/FilmScene.ts plays whichever
# the browser can), silent (its sound is a cue), a keyframe every two seconds (it is kept to the memory's
# clock by seeking), then its wall art (order.py).
#   python3 scripts/memory-vii/render.py MASTER.mp4 --room
#   scripts/memory-vii/web.sh MASTER.mp4
set -euo pipefail
D="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$D/public/memories/shadows/film"
mkdir -p "$OUT"
TAGS=(-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv)
for spec in ":1920:1080:30:21" "@low:1280:720:33:23"; do
  IFS=: read -r sfx w h vcrf hcrf <<<"$spec"
  VF="scale=$w:$h:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p"
  ffmpeg -y -v error -i "$1" -an -vf "$VF" -g 48 -keyint_min 48 "${TAGS[@]}" -c:v libvpx-vp9 -b:v 0 -crf "$vcrf" \
    -row-mt 1 -tile-columns 2 -deadline good -cpu-used 2 "$OUT/film$sfx.webm"
  ffmpeg -y -v error -i "$1" -an -vf "$VF" -g 48 -keyint_min 48 -sc_threshold 0 "${TAGS[@]}" -c:v libx264 -crf "$hcrf" \
    -preset slow -profile:v high -level 4.0 -movflags +faststart "$OUT/film$sfx.mp4"
done
# (Its poster from the encoded film, so the still and the film are one picture.)
python3 "$D/scripts/memory-vii/order.py" "$OUT/film.mp4" "$OUT"
