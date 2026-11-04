#!/usr/bin/env bash
# Memory VII sound: lays the ElevenLabs takes (audition/memory-vii/raw, generated
# 2026-11-04, flow "Memory VII — The Shape of Someone") along the picture's
# moments, and muxes them with the rendered picture.
#   scripts/memory-vii/mix.sh PICTURE.mp4 OUT.mp4
# Moments (render.py): light rises 0-2.6 s; shadows approach 5-8; she turns
# away 8.2-9.3; they meet 12.6-14.1; held 14.1-17; let go 17-19.6; dark 23.6-25.3.
set -euo pipefail
R="$(dirname "$0")/../../audition/memory-vii/raw"
ffmpeg -y -v error -i "$1" \
  -i "$R/room-2.mp3" -i "$R/glass-4.mp3" -i "$R/cello-1.mp3" \
  -i "$R/piano-4.mp3" -i "$R/cello-4.mp3" -i "$R/breath-4.mp3" -i "$R/glass-1.mp3" \
  -filter_complex "
  [1]aresample=48000,volume=4dB,afade=t=in:d=2.5,afade=t=out:st=23:d=3,pan=stereo|c0=c0|c1=c0[room];
  [2]aresample=48000,volume=-21dB,afade=t=in:d=4,afade=t=out:st=8:d=4,adelay=2000|2000,pan=stereo|c0=0.8*c0|c1=1.0*c0[glass];
  [3]aresample=48000,volume=-17dB,afade=t=in:d=1.5,afade=t=out:st=4:d=5,adelay=5600|5600,pan=stereo|c0=c0|c1=0.85*c0[c1];
  [4]aresample=48000,volume=10dB,afade=t=out:st=5:d=3,adelay=13400|13400,pan=stereo|c0=c0|c1=c0[piano];
  [5]aresample=48000,volume=-9dB,afade=t=in:d=0.8,afade=t=out:st=7:d=5,adelay=12900|12900,pan=stereo|c0=0.95*c0|c1=c0[c4];
  [6]aresample=48000,volume=-1dB,afade=t=out:st=2.2:d=0.8,adelay=18700|18700,pan=stereo|c0=c0|c1=c0[breath];
  [7]aresample=48000,volume=-24dB,afade=t=in:d=3,afade=t=out:st=2.5:d=3.5,adelay=19800|19800,pan=stereo|c0=c0|c1=0.7*c0[glass2];
  [room][glass][c1][piano][c4][breath][glass2]amix=inputs=7:normalize=0:duration=longest,
  aecho=0.8:0.5:60|113|171:0.22|0.14|0.08,
  atrim=0:26,afade=t=out:st=24.4:d=1.6,volume=12dB,alimiter=limit=0.7:attack=20:release=200[a]" \
  -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 256k -shortest "$2"
