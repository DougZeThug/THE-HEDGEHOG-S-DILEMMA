#!/usr/bin/env bash
# Fetch the public-domain films The Drive Home is traced from (about 510 MB, Internet Archive),
# and the two MediaPipe models the tracer uses (about 20 MB, Google).
#   scripts/the-drive-home/fetch_sources.sh [DIR]      default DIR: scripts/the-drive-home/src
# Then: DRIVE_HOME_SRC=DIR python3 scripts/the-drive-home/film.py trace
set -euo pipefail
HERE="$(dirname "$0")"
DIR="${1:-$HERE/src}"
mkdir -p "$DIR" "$HERE/models"
get() {  # name url sha256 (name may carry a directory)
  if [ -f "$1" ] && echo "$3  $1" | sha256sum -c --status; then
    echo "have $1"; return
  fi
  echo "fetching $1"
  curl -fSL --retry 4 -o "$1.part" "$2"
  mv "$1.part" "$1"
  echo "$3  $1" | sha256sum -c
}
# The Hitch-Hiker (1953, dir. Ida Lupino; RKO, not renewed: public domain in the US)
get "$DIR/hitchhiker.mp4" "https://archive.org/download/TheHitchHiker1953_201901/The%20Hitch-Hiker%20%281953%29.mp4" \
  316f9e441d72b22c93bf6044c6d46e5f96764a14db0df2cdbdca5ad865a407e1
# Prelinger Archives: Television Commercials (Camera Only, Black and White), public domain
get "$DIR/tvc.mp4" "https://archive.org/download/0521_Television_Commercials_Camera_Only_Black_and_White_22_01_02_28/0521_Television_Commercials_Camera_Only_Black_and_White_22_01_02_28_3mb.mp4" \
  9e125a40d7865636fba30f69f0a81060ec6af03c39fbab2f976a76d0f2a622a6
# Prelinger Archives: Passenger Car Screen Ads (Chevrolet, 1952), public domain
get "$DIR/carads52.mp4" "https://archive.org/download/0707PassengerCarScreenAds/0707_Passenger_Car_Screen_Ads.mp4" \
  7efcdd9014f0fcdbc938953f3f4eca806f480eb7011d530c6183f43b91d09dfb
# MediaPipe models (Apache 2.0). Google serves "latest", so a newer model only warns: the drawings
# were made with the checksums below.
model() {  # name url sha256
  [ -f "$HERE/models/$1" ] || curl -fSL --retry 4 -o "$HERE/models/$1" "$2"
  echo "$3  $HERE/models/$1" | sha256sum -c --status || echo "note: $1 differs from the model the film was traced with"
}
model selfie_multiclass_256x256.tflite \
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite" \
  c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0
model face_landmarker.task \
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task" \
  64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff
