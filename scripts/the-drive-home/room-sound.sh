#!/usr/bin/env bash
# The Drive Home in the room: its three sound cues (src/memory/defs.ts DRIVE), from the approved takes
# and the approved mix (audition/the-drive-home/), nothing generated anew. docs/drive-home.md.
#   scripts/the-drive-home/room-sound.sh
#   public/music/drive-wall.mp3   tyres on a damp road under the second and third streetlights (memory
#                                 4.4 s on; the first passes in silence), into the film's own mix
#   public/music/drive-film.mp3   the film's mix as the artist heard it (mix.sh), from the room's cut
#                                 (film 6.0 s) to its end, eased in over 0.8 s (it begins mid-pass)
#   public/music/drive-relay.mp3  the indicator's relay going on after the picture has gone: the same
#                                 take (signal-4), in step with the film's ticks, from memory 47.9 s,
#                                 rising as the film's mix fades (48.4-51.6), on its own to about
#                                 57.5 s, then stopped, as when a turn is made
set -euo pipefail
D="$(cd "$(dirname "$0")/../.." && pwd)"
R="$D/audition/the-drive-home/raw"
M="$D/public/music"
# (mix.sh: tyres at -1 dB through 60 Hz-4.2 kHz, the master +4 dB.)
ffmpeg -y -v error -ss 5.5 -t 3.4 -i "$R/tires-1.mp3" \
  -af "aresample=48000,lowpass=f=4200,highpass=f=60,volume=3dB,afade=t=in:d=0.6,afade=t=out:st=1.9:d=1.5,pan=stereo|c0=0.9*c0|c1=c0,alimiter=limit=0.8:attack=10:release=150" \
  -c:a libmp3lame -q:a 3 "$M/drive-wall.mp3"
ffmpeg -y -v error -ss 6.0 -i "$D/audition/the-drive-home/the-drive-home.mp4" -vn \
  -af "afade=t=in:d=0.8" -c:a libmp3lame -q:a 2 "$M/drive-film.mp3"
# The relay: the same take carried on where the film's mix has it at memory 47.9 s (mix.sh lays it
# from 38.77 s: 9.13 s in), to its end (14.0 s), then again from a point of the same phase (its
# last tick before its end is at 13.485 s, so it goes on from 0.515 s past one of its early ticks, 3.175 s),
# for 4.7 s more; at the film's level for it outside the car (mix.sh: +2 dB, x 0.3 out, the master
# +4 dB, its slight echo); in under the mix's fade, and stopped just after its last tick.
ffmpeg -y -v error -ss 9.13 -i "$R/signal-4.mp3" -ss 3.69 -t 4.75 -i "$R/signal-4.mp3" -filter_complex "
  [0]aresample=48000[a];[1]aresample=48000[b];[a][b]acrossfade=d=0.02:c1=tri:c2=tri,
  volume=-4.5dB,pan=stereo|c0=c0|c1=0.75*c0,aecho=0.8:0.6:11|17:0.12|0.08,afade=t=in:d=3.7,
  afade=t=out:st=9.45:d=0.15,alimiter=limit=0.8:attack=10:release=150" \
  -c:a libmp3lame -q:a 3 "$M/drive-relay.mp3"
