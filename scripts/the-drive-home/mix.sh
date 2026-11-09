#!/usr/bin/env bash
# The Drive Home sound: lays the ElevenLabs sound-effect takes (audition/the-drive-home/raw,
# generated 2026-11-04 in the flow "The Drive Home") along the traced picture, and muxes them.
# Sound effects only, no music.
#   scripts/the-drive-home/mix.sh PICTURE.mp4 OUT.mp4
# Moments (film.py): the car comes up the road to us, closest about 5.8 s; cuts at 6 / 10.9 /
# 16.9 / 21.4 / 25.9 / 29.9 / 34.3 / 37.8 / 40.8 / 44; hands rub 16.9-21.4; the driver turns the
# vent 28.1-29.65 (clicks); the passenger turns it back 36.25-37.65 (clicks); indicator on at
# 38.9; outside from 44; the picture is dark by 51.
set -euo pipefail
R="$(dirname "$0")/../../audition/the-drive-home/raw"
END=51.6
# while we are close to the vent (the two vent shots) the heater is louder; outside (the last
# shot) the cabin is a muffled hum and the indicator a faint tick
CLOSE='(between(t,25.9,29.9)+between(t,34.3,37.8))'
OUT='gte(t,44.0)'
ffmpeg -y -v error -i "$1" \
  -stream_loop -1 -i "$R/engine-bed-2.mp3" \
  -i "$R/tires-1.mp3" \
  -stream_loop -1 -i "$R/vent-bed-2.mp3" \
  -i "$R/passing-2.mp3" -i "$R/hands-long-2.mp3" \
  -i "$R/louver-3.mp3" -i "$R/louver-1.mp3" -i "$R/signal-4.mp3" \
  -filter_complex "
  [1]aresample=48000,atrim=0:$END,asetpts=N/SR/TB,lowpass=f=900,volume=-7dB,
     volume=eval=frame:volume='1-0.55*$OUT',pan=stereo|c0=c0|c1=c0[engine];
  [2]aresample=48000,atrim=5.5:17.5,asetpts=N/SR/TB,afade=t=in:d=0.4,afade=t=out:st=11.6:d=0.4,asplit=5[t0][t1][t2][t3][t4];
  [t1]adelay=11600|11600[t1d];[t2]adelay=23200|23200[t2d];[t3]adelay=34800|34800[t3d];[t4]adelay=46400|46400[t4d];
  [t0][t1d][t2d][t3d][t4d]amix=inputs=5:normalize=0:duration=longest,atrim=0:$END,
     lowpass=f=4200,highpass=f=60,volume=-1dB,
     volume=eval=frame:volume='1-0.4*$OUT',pan=stereo|c0=0.9*c0|c1=c0[tires];
  [3]aresample=48000,atrim=0:$END,asetpts=N/SR/TB,highpass=f=150,volume=3dB,
     volume=eval=frame:volume='(1+0.5*gte(t,29.65))*(1+2.6*$CLOSE)*(1-0.85*$OUT)',pan=stereo|c0=c0|c1=0.85*c0[air];
  [4]aresample=48000,lowpass=f=2500,volume=1dB,adelay=4500|4500,pan=stereo|c0=1.0*c0|c1=0.55*c0[passing];
  [5]aresample=48000,highpass=f=300,volume=21dB,afade=t=in:d=0.3,afade=t=out:st=3.4:d=0.6,adelay=17000|17000,pan=stereo|c0=0.8*c0|c1=c0[hands];
  [6]aresample=48000,volume=1dB,afade=t=out:st=1.6:d=0.4,adelay=28100|28100,pan=stereo|c0=c0|c1=0.8*c0[click1];
  [7]aresample=48000,volume=1dB,afade=t=out:st=1.6:d=0.4,adelay=36250|36250,pan=stereo|c0=0.8*c0|c1=c0[click2];
  [8]aresample=48000,volume=2dB,adelay=38770|38770,
     volume=eval=frame:volume='1-0.7*$OUT',pan=stereo|c0=c0|c1=0.75*c0[signal];
  [engine][tires][air][passing][hands][click1][click2][signal]amix=inputs=8:normalize=0:duration=first,
  aecho=0.8:0.6:11|17:0.12|0.08,
  atrim=0:$END,afade=t=in:d=2.2,afade=t=out:st=48.4:d=3.2,volume=4dB,alimiter=limit=0.8:attack=10:release=150[a]" \
  -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 256k -shortest "$2"
