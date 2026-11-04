# The Drive Home

Painterly rotoscoping (returning): estrangement, restraint, unconditional care.
A 54-second standalone film, a study, not wired into the room.

Two grown siblings drive home at night after a difficult family gathering.
Something is wrong between them; we never learn what. The passenger looks out
of the window at their own reflection. The driver keeps both hands on the
wheel. The passenger rubs their hands for warmth. Without looking over, the
driver turns the heater vent toward them. Later the passenger turns it back to
the middle, so it reaches the driver's hands too. Neither acknowledges it. The
indicator ticks, the last streetlight passes over them, and the car turns off
the lit road into the dark.

Shots: the road through the windscreen (0-6.5 s); the two of them from the
back seat (6.5-12); the passenger at the window, hands rubbing (12-19.5); the
driver's hand at the vent (19.5-26); the passenger, hands in the warm air
(26-32.5); the passenger's hand at the vent (32.5-39); the driver, indicator on
(39-46.6); the car turning up the dark lane, from above (46.6-54).

- `render.py`: the picture, painted procedurally (numpy + OpenCV). Figures are
  signed distance fields with a pillowy relief lit by a passing sodium lamp,
  the night sky, the instruments and the indicator. Drawn at 1280x720 on twos
  (12 drawings a second), finished with a boiling Kuwahara paint filter and a
  brush-stroke relief, and laid on a canvas grain at 1920x1080. The moments
  are the keyframes and timings near the top and in each shot function.
- `mix.sh`: the sound, laid along those moments and muxed with the picture.
  Sound effects only, no music.
- Sound: ElevenLabs Sound Effects v2 takes, generated 2026-11-04 in the flow
  "The Drive Home", raw in `audition/the-drive-home/raw/` (engine hum, tyres
  on damp asphalt, heater airflow, indicator relay, vent louver clicks, hands
  rubbing, a passing car). All the takes are kept; `mix.sh` names the ones
  used. The indicator's blink rate in the picture is matched to the relay in
  `signal-4`.
- The film: `audition/the-drive-home/the-drive-home.mp4`.

```
python3 scripts/the-drive-home/render.py /tmp/picture.mp4          # ~15 min on 4 cores
scripts/the-drive-home/mix.sh /tmp/picture.mp4 audition/the-drive-home/the-drive-home.mp4
python3 scripts/the-drive-home/render.py /tmp/still.png --still 14.6,42.6   # stills
```
