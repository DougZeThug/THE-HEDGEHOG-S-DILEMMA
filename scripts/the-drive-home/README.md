# The Drive Home

Painterly rotoscoping (returning): estrangement, restraint, unconditional care.
A 51.6-second film; in the room it is the living memory `drive` (docs/drive-home.md).

Two grown siblings drive home at night after a difficult family gathering.
Something is wrong between them; we never learn what. The passenger stares out
of the window. The driver keeps his eyes on the road. The passenger rubs his
hands for warmth. Without looking over, the driver turns the heater vent toward
him. A minute later the passenger turns it partway back, so it reaches the
driver's hands too. Neither acknowledges it. The indicator ticks, the town
lights pass, and the car goes on into the dark.

Every drawing is traced from public-domain live action, so the people move the
way people move: The Hitch-Hiker (1953) for the two men in the front seat, a
Prelinger commercials reel for the hands, a 1952 Chevrolet screen ad for the
hand on the vent. Each source frame is cut into a few flat shapes of light per
material (skin, hair, cloth, car), the figures are inked, and the drawings run
on twos (12 a second) with a slight boil, the Rotoshop look. Only stretches
where neither man's lips move are used.

- `film.py`: the shot list (source, source time, crop, look, passing lights)
  and the commands that trace the drawings and assemble the picture.
- `roto.py`: the tracer. MediaPipe's multiclass segmenter and face landmarker
  say what each pixel is; L0 smoothing flattens the light; per-material value
  cuts make the shapes; a flow-warped hold and jittered cuts give the boil; ink
  for contours, creases and a painter's few face strokes.
- `looks.py`: palettes and value cuts per kind of light (moonlight, sodium
  lamps, the road at dusk, the hands, the dash).
- `fetch_sources.sh`: downloads the three films (about 510 MB, checksummed) and
  the two MediaPipe models into `src/` and `models/` (both ignored by git).
- `mix.sh`: the sound, laid along the cut and muxed with the picture. Sound
  effects only, no music: ElevenLabs Sound Effects v2 takes generated
  2026-11-04 in the flow "The Drive Home", raw in `audition/the-drive-home/raw/`
  (engine hum, tyres on damp asphalt, heater airflow, indicator relay, vent
  louver clicks, hands rubbing, a passing car). The indicator's blink in the
  picture is matched to the relay in `signal-4`.
- The film: `audition/the-drive-home/the-drive-home.mp4`.
- In the room (docs/drive-home.md): `film.py room` (the cut from its second shot, no fades of its
  own), `web.sh` (its web copies and wall art, by `order.py`: the dusk's order and the faces
  found first), `room-sound.sh` (its three cues, from the approved takes and mix).

The first cut (2026-11-04) drew the figures from signed distance fields; its
`render.py` is in the history at commit cfa21f0.

```
pip install mediapipe opencv-contrib-python numpy      # ximgproc comes with contrib
apt-get install libegl1 libgles2 libgl1                 # MediaPipe needs EGL on Linux
scripts/the-drive-home/fetch_sources.sh
export DRIVE_HOME_CACHE=/tmp/drive-home-cache
python3 scripts/the-drive-home/film.py still window 13.6     # one drawing beside its source
JOBS=4 python3 scripts/the-drive-home/film.py trace          # 619 drawings, ~25 min on 4 cores
python3 scripts/the-drive-home/film.py picture /tmp/picture.mp4
scripts/the-drive-home/mix.sh /tmp/picture.mp4 audition/the-drive-home/the-drive-home.mp4
```
