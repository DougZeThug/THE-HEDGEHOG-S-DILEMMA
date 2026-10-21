# Things I Should Have Said (memory III): how it is made

A charcoal and pencil film of about 54 s on one sheet of paper, in the manner of Kentridge's
Drawings for Projection: a mark laid, partly erased, the residue left, a new mark over it.

**The story.** An apartment's front door, seen from inside. A young man is leaving; his mother
stays. She waves, small; he lifts the bag she packed and goes without looking back; the door swings
shut on its closer. Then the drawing tries the moment again, as the son remembers it. First his
almost: he comes back to rest a hand on the jamb. Then hers: half a step, her hand rising toward
his collar. Each is drawn in line only, never in tone, because only what happened has weight, and
each is erased. What is left is an empty doorway, worked over, darkened by the faint remains of
the ways they might have reached for each other. There is no dialogue, no score and no text.

The decisions and the reviews behind it are in `docs/reviews/2026-10-things.md`. The artist's
brief is "THE HEDGEHOG'S DILEMMA / MEMORY III — THINGS I SHOULD HAVE SAID" (2026-10-21).

## The parts

| Part | File | What it owns |
|---|---|---|
| The paper | `scripts/things/paper.py` | the sheet as state: loose and held charcoal and graphite, the paper's wear and tooth; the tools (pencil, hard pencil, charcoal, compressed, the stick's side); the eraser (lifts from the peaks, drags crumbs at a stroke's end, roughs the paper), the finger and the rag; each mark's footprint made once, so a mark made over twelve drawings is the mark made at once |
| The reference | `scripts/things/scene.py` | in headless Blender: the doorway, the corridor, the table, the door on its hinge; two MakeHuman people (CC0, built by the MPFB add-on), posed; per pose, Line Art contours per thing, a tonal render, an object-ID render, the long bones and a face's few points on the paper |
| The poses | `scripts/things/poses.py` | every key drawing: the goodbye, his walk out, the door closing, his almost, hers, the empty doorway; `blend` for in-betweens |
| The drawing | `scripts/things/draw.py` | what an artist does with a reference: the doorway's construction, the lines lost and found, the masses in passes toward the tone, rubbing, kneaded lifts, a face's three accents; erasure as scrubs; the casing restated |
| The moves | `scripts/things/film.py` | a drawing made in front of us; a step of what happened (the part that moved scrubbed out and drawn again, in tone); a revision (only what changes, in line, from the moving hand); an almost taken back from the hand; the casing worked |
| The clock | `scripts/things/timeline.py` | marks with a start and a length; drawings on twos streamed to the encoder; `state_at` for planning on the film's own sheet; float32 checkpoints |
| The film | `scripts/things/story.py` | the exposure sheet: every move's time; writes the film, its sound and `sheet.json` (every mark's time) |
| The sound | `scripts/things/foley.py` | made from the same marks: each tool one voice, as loud as the strongest mark it is making; the eraser, the latch, the room; three mixes for the artist (`eraser`, `eraser-only`, `full`) |

## Rebuilding it

```sh
B=/opt/blender/blender-5.2.2-linux-x64/blender
# MPFB (once): the add-on from its release, and MakeHuman's system assets in its data folder
$B -b --command extension install-file -r user_default -e mpfb-2.0.18.zip
# the references for every key drawing (about 4 minutes)
$B -b --factory-startup --python scripts/things/scene.py -- \
  --pose goodbye,going1,going2,going3,going4,door0,door1,door2,door3,door4,shut,jamb,collar,empty --out ref/
# the film: about 1 minute planning, 2 minutes drawing at half size
python3 scripts/things/story.py ref/ out/ --scale 0.5
```

One drawing (a still) of any pose: `python3 scripts/things/draw.py ref/ POSE out.png`.
