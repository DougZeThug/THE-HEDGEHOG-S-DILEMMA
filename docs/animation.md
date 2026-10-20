# Animating the paintings

How a painted figure in a memory moves here, and how to check that it reads as the person and not
as a warped picture. It was built for her head turn in the woodland, the artist's production brief
of 2026-10-20 (`docs/reviews/2026-10-woodland.md`, decisions 142–160). The tools are offline:
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

`scripts/drawn-rig/` holds the two pieces meant to be reused (so far only her turn uses them):
- `raster.py`: meshes over a painting's pixels, z-buffered. Whichever surface is nearer is seen, so
  nothing folds or tears.
- `lines.py`: a painting's drawn lines lifted off its paint and drawn again at their weight.

`scripts/her-turn.py` (`Turned`) shows them put together for one figure:
- **A shape under the paint.** Fit a generic head to landmarks. Give each part its own mesh and its
  own rotation weight: a skull turns whole; a neck twists from its jaw to its collar.
- **Each part moves as that part does.** A neck is a cylinder twisting from all of the turn at its
  jaw to none at its collar: its top goes a little way with the head, it keeps its width, and a chin
  slides across it. Continue what a move can uncover (the skin under a jaw, from ear to chin) behind
  what covers it, all along where the two meet.
- **Soft edges over the next surface.** An edge's soft pixels are the painting's mix of the figure
  and what was behind it. Once a part moves over another (a chin over its neck), its edge lies over
  that part, not over the background; and where its matte ran past its drawn outline into the
  background, cut the matte at the line.
- **Shadows go with what casts them.** Split a cast shadow from the paint it lies on, and move it
  with its caster: the jaw's shadow with the jaw, not with the neck.
- **Lines on their own surface.** Draw each surface's lines through that surface's motion,
  one-to-one, then join them by depth. Resample them with Lanczos, clamped to the ink's own range.
- **Unmoved, it is the painting** (to 2/255), and moved a hair's breadth, still is, but for one
  pixel by her ear (37/255, skin to skin). The script
  asserts both every run.

## The faults this has already made (and how each looks)

| What was done | How it looked | Now |
|---|---|---|
| An outline held to a fitted head's silhouette while the features moved | "her left cheek becomes very fat" (the artist) | the outline turns with the face |
| A neck carried with the jaw | "her neck narrows to a strange degree" (the artist) | a cylinder; the jaw slides across it |
| A spring and a delay on the hair lying on the grass | nothing visible, and a ghost seam beside her neck | the hair goes with her head |
| One motion field for every line | a line passing over another, one point in ten from the wrong one | one field for each surface |
| Bilinear resampling of lines | a line moved part of a pixel loses up to a fifth of its darkness | clamped Lanczos |
| One review frame for each drawing at 24 fps | the films ran at double speed: a snap no one built | each drawing held two frames |
| Key times rounded to four places | four keys 33 µs after their twelfth: every film sampled on whole frames held the drawings 3-1-2 | keys exactly on their twelfths, tested at 12, 24 and 60 fps |
| A matte traced past the chin's drawn line, its soft edge laid over the background | the hair went over her neck with her chin, a dark wedge under it while she settled | her matte ends at her line; her head's soft edge lies over her neck |
| The hidden skin under her jaw left plain at its edge | a pale streak, and her neck's lines stopping short under her chin, frayed | the lines of her neck's edge as painted just below, carried on up it (not its light: that lit the shadow under her chin) |
| A wide's figure cut made afresh for every drawing | a gap in her hair taken for enclosed at her last step, a cream fleck as she lands | each pixel keeps its cut while her drawing there barely changes, and through a jump the drawing doesn't account for |
| Two meshes that only touch, at her ear | a pixel fell between them and the hair showed, a speck from the first drawing | her neck continued behind her jaw from ear to chin; a seam takes what is beside it |

## The performance

- **On twos.** Twelve drawings a second, each held until the next, the way the timeline's held keys
  play them. Put the schedule in `src/memory/defs.ts`, mirror it in the script, and test that both
  agree (`turnDrawings`, `schedule`, `tests/living-memory.test.ts`).
- **Every part on its own clock.** Her eyes go to him first, then a moment, then her head. As her
  head comes round, her eyes ease back in their sockets and stay on him. Code that moves every part
  at once, on the same curve, by the same amount, reads as mechanical.
- **An ease that sets off at once and settles long:** velocity t² e^(−t/b), cut off and renormalised at
  the last drawing, so there is no jump onto it.
- **Fit the score.** The woodland's score leaves her look clear from 17.0 to 19.5 s, and its notes
  either side are composed to the picture. A change to her timing has to fit inside that window, or
  goes to the sound designer first.
- **Nothing undone.** In the artist's words: "glance toward him, settle into that gaze, and simply
  remain there".

## Checking it

In order, each before the next:
1. **The script's own asserts**, at every drawing, on each rig that draws one. Unmoved, and a hair's
   breadth moved, it is the painting (but for a pixel by her ear). Each
   feature's lines carry their ink along their own centre lines (0.94–0.98 at her turn). Settled, no
   hair shows inside her neck under her chin.
2. **Motion.** Optical flow between drawings at landmarks: one smooth rise and fall, no drawing out
   of line, parts that belong together within a pixel of each other.
3. **Look at it.** A contact sheet of every drawing; the settled drawing beside the painting at
   screen size and enlarged; films at true speed (each drawing two frames at 24 fps: count them, in
   every film, the memory's own recordings too) and at a quarter speed. To judge one change, change
   one thing: the same timing on both sides of a before and after.
4. **In the memory.** `tests/playtest/record-woodland.mjs` records the real runtime, frame by frame
   at its exact position, with breath, grass and light. Record desktop and an upright phone. Judge
   it there, not in the test.
5. **The artist.** Only the artist can say whether it reads as her. Show the film in context first,
   and the enlargements after it.
