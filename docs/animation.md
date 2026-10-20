# Animating the paintings

How a painted figure in a memory moves here, and how to check that it reads as the person and not
as a warped picture. It was built for her head turn in the woodland, the artist's production brief
of 2026-10-20 (`docs/reviews/2026-10-woodland.md`, decisions 142–150). The tools are offline:
numpy, OpenCV, ffmpeg and the project's own browser recorder. No model, no network, no GPU.

## First: is it a drawing or a move?

- **A new angle of a face, a hand opening, a mouth: a new drawing.** Ask the artist for it, or for
  in-betweens over their own drawings. Nothing here invents a view the painting doesn't show. Bends
  between two drawings that disagree read as morphing (decisions 30–39).
- **A small 3D move of something painted once** (a head turning up to about 15°, a shoulder
  settling): carry the painting in depth (`scripts/drawn-rig/README.md`). Past about 20° her ear and
  neck break up, and the painted light contradicts the sun.
- **Breath, blinks, hair and grass in the air:** the living painting's deformers and shaders at run
  time (`src/memory/living/`), not drawings.

## Carrying a painting in depth

`scripts/drawn-rig/` holds the two reusable pieces:
- `raster.py`: meshes over a painting's pixels, z-buffered. Whichever surface is nearer is seen, so
  nothing folds or tears.
- `lines.py`: a painting's drawn lines lifted off its paint and drawn again at their weight.

`scripts/her-turn.py` (`Turned`) shows them put together for one figure:
- **A shape under the paint.** Fit a generic head to landmarks. Give each part its own mesh and its
  own rotation weight: a skull turns whole; a neck twists from its jaw to its collar.
- **Each part moves as that part does.** A neck is a cylinder: its sides stay put while it twists,
  and a chin slides across it. Continue what a move can uncover (the skin under a jaw) behind what
  covers it.
- **Shadows go with what casts them.** Split a cast shadow from the paint it lies on, and move it
  with its caster: the jaw's shadow with the jaw, not with the neck.
- **Lines on their own surface.** Draw each surface's lines through that surface's motion,
  one-to-one, then join them by depth. Resample them with Lanczos, clamped to the ink's own range.
- **Unmoved, it is the painting** (to 2/255). The script asserts this every run.

## The faults this has already made (and how each looks)

| What was done | How it looked | Now |
|---|---|---|
| An outline held to a fitted head's silhouette while the features moved | "her left cheek becomes very fat" (the artist) | the outline turns with the face |
| A neck carried with the jaw | "her neck narrows to a strange degree" (the artist) | a cylinder; the jaw slides across it |
| A spring and a delay on the hair lying on the grass | nothing visible, and a ghost seam beside her neck | the hair goes with her head |
| One motion field for every line | a line passing over another, one point in ten from the wrong one | one field for each surface |
| Bilinear resampling of lines | a line moved part of a pixel loses up to a fifth of its darkness | clamped Lanczos |
| One review frame for each drawing at 24 fps | the films ran at double speed: a snap no one built | each drawing held two frames |

## The performance

- **On twos.** Twelve drawings a second, each held until the next, the way the timeline's held keys
  play them. Put the schedule in `src/memory/defs.ts`, mirror it in the script, and test that both
  agree (`turnDrawings`, `schedule`, `tests/living-memory.test.ts`).
- **Every part on its own clock.** Her eyes go to him first, then a moment, then her head. As her
  head comes round, her eyes ease back in their sockets and stay on him. Code that moves every part
  at once, on the same curve, by the same amount, reads as mechanical.
- **An ease with a gentle start and a settle:** velocity t² e^(−t/b), cut off and renormalised at
  the last drawing, so there is no jump onto it.
- **Fit the score.** The woodland's score leaves her look clear from 17.0 to 19.5 s, and its notes
  either side are composed to the picture. A change to her timing has to fit inside that window, or
  goes to the sound designer first.
- **Nothing undone.** In the artist's words: "glance toward him, settle into that gaze, and simply
  remain there".

## Checking it

In order, each before the next:
1. **The script's own asserts.** Unmoved, it is the painting. Each feature's lines carry their ink
   along their own centre lines (0.94–0.98 at her turn).
2. **Motion.** Optical flow between drawings at landmarks: one smooth rise and fall, no drawing out
   of line, parts that belong together within a pixel of each other.
3. **Look at it.** A contact sheet of every drawing; the settled drawing beside the painting at
   screen size and enlarged; films at true speed (each drawing two frames at 24 fps) and at a
   quarter speed.
4. **In the memory.** `tests/playtest/record-woodland.mjs` records the real runtime, frame by frame
   at its exact position, with breath, grass and light. Record desktop and an upright phone. Judge
   it there, not in the test.
5. **The artist.** Only the artist can say whether it reads as her. Show the film in context first,
   and the enlargements after it.
