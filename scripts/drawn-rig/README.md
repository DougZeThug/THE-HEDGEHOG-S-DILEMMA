# A drawing carried in depth

This is how a painted figure here can move a little in 3D (a head turning, a shoulder settling) and
stay the artist's painting. It runs offline, with numpy and OpenCV only: no model, no network, no
GPU. It was built for her head turn in the woodland (`scripts/her-turn.py`, the artist's production
brief of 2026-10-20). The decisions behind it are in `docs/reviews/2026-10-woodland.md`; the wider
toolkit is in `docs/animation.md`.

## When to use it

Use it for small turns, roughly 15° or less, of a part the artist painted once. Past that, an angle
shows what the painting never showed: an ear changes side, hair parts. That needs a new drawing
from the artist; no warp or rig stands in for one. A bigger move needs key drawings, and these tools
can help time them.

## The idea

A painted face is two things laid together: **paint** (skin, light, hair masses), which lies on a
surface and turns with it; and **drawn lines**, which an artist draws the same weight at any angle.
Warping the whole picture treats both as paint. Then lines thicken or thin wherever the surface
foreshortens, and the picture reads as a warped illustration. So:

1. **A shape under the paint.** Fit a simple 3D shape to the painting: a generic head posed to
   landmarks, a cylinder for a neck. Paint on each part is a mesh with a vertex at every pixel, at
   that shape's depth (`raster.pixel_mesh`).
2. **Parts in depth.** Each rigid or twisting part is its own mesh, and each vertex has its own
   rotation weight: a skull turns whole, a neck twists from the jaw to the collar. All parts are
   drawn together through a z-buffer (`raster.rasterize`), so the nearer surface is seen and
   nothing folds or tears. A part the turn uncovers (a neck under a chin) is continued, hidden,
   behind what covers it.
3. **Lines lifted and drawn again** (`lines.split`, `lines.Lines`). The lines come off the paint
   (inpainted underneath), so `fills * ink == picture` exactly. Each line is carried by its centre
   line, with its cross-section rigid: the paint under it may stretch, and the line keeps its
   weight. Parts that must stay as drawn (eyes) are left out of the lift and carried whole.
4. **Exactly the painting when still.** Unmoved, the rig must give back the painting to within
   2/255. Check this every time it runs.
5. **What lies behind** is filled from what lies beside it (hair continued under a head), and moves
   on its own terms: it follows with a delay, and it is dragged by edges that draw back from it.

## What it can't do

- It invents no new view. At 14° her far cheek comes round, and its paint stretches about 1.8 in
  area at its steepest. Past about 20° her ear and neck break up, and the painted light starts to
  contradict the sun.
- The shape is generic. A wrong depth produces no error, only a slightly wrong motion. Judge it by
  eye: contact sheets, enlarged crops, and films side by side with the previous version.
- Its light doesn't change. The paint's shading turns with the surface. That is fine for a small
  turn, but not for a figure turning into or out of the sun.

## Checking a result

- Unmoved, it is the painting (an assert in the script).
- Each feature's lines carry the ink they were drawn with: `line_weight` in `scripts/her-turn.py`.
- Motion from drawing to drawing is one smooth rise and fall, with no frame out of line (optical
  flow at landmarks). Parts that must move together, like a chin with a mouth, move within a pixel
  of each other.
- Look at it: a contact sheet of every drawing, before and after enlarged, the film at its size on
  screen and at a quarter speed.
