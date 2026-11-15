#!/usr/bin/env bash
# Memory VII in the room: its two sound cues (src/memory/memories/shadows.ts SHADOWS), from the approved takes
# and the approved mix, nothing generated anew.
#   scripts/memory-vii/room-sound.sh
#   public/music/shadows-wall.mp3  the shade gathering on the wall (memory 0.3-7.3 s): the room-tone
#                                  take as the film's mix has it (+16 dB), rising over 4 s, crossing
#                                  into the film's own room tone as it comes in (its last 2 s)
#   public/music/shadows-film.mp3  the film's sound as the artist heard it (mix.sh), 26 s
set -euo pipefail
D="$(cd "$(dirname "$0")/../.." && pwd)"
R="$D/audition/memory-vii/raw"
ffmpeg -y -v error -ss 13 -t 7 -i "$R/room-2.mp3" \
  -af "aresample=48000,volume=16dB,afade=t=in:d=4,afade=t=out:st=5:d=2,pan=stereo|c0=c0|c1=c0,alimiter=limit=0.7:attack=20:release=200" \
  -c:a libmp3lame -q:a 3 "$D/public/music/shadows-wall.mp3"
ffmpeg -y -v error -i "$D/audition/memory-vii/memory-vii.mp4" -vn -c:a libmp3lame -q:a 2 "$D/public/music/shadows-film.mp3"
