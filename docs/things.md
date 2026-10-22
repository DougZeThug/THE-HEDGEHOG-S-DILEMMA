# Things I Should Have Said (memory III): how it is made

A charcoal and pencil film of 48.75 s on one sheet of paper (42.75 s of it in the room), in the
manner of Kentridge's Drawings for Projection: a mark laid, partly erased, the residue left, a new
mark over it.

**The story.** An apartment's front door, seen from inside. A young man is leaving; his mother
stays. They face each other; she waves, small; he lifts the bag she packed, nods, turns his back
on her and goes; the door swings shut on its closer. Then the drawing tries the moment again. First
him: the eraser lifts the shut door and, in pencil, he is found in the doorway as he left; he turns
back toward her, and his free hand begins to rise; held; taken back along its own lines. Then her:
from where she stands, a lean after him, her hand rising toward the doorway; taken back. Only what
happened has tone; what is imagined is line. Then both of them are taken, and what is left is the
doorway with the faint impressions of the two hands that nearly met across it. There is no
dialogue, no score and no text.

The decisions and the reviews behind it are in `docs/reviews/2026-10-things.md`. The artist's
brief is "THE HEDGEHOG'S DILEMMA / MEMORY III — THINGS I SHOULD HAVE SAID" (2026-10-21).

## The parts

| Part | File | What it owns |
|---|---|---|
| The paper | `scripts/things/paper.py` | the sheet as state: loose and held charcoal and graphite, the paper's wear and tooth; the tools (pencil, hard pencil, charcoal, compressed, the stick's side); the eraser (lifts from the peaks, drags crumbs at a stroke's end, roughs the paper), the finger and the rag; each mark's footprint made once, so a mark made over twelve drawings is the mark made at once |
| The reference | `scripts/things/scene.py` | in headless Blender: the doorway, the corridor, the door on its hinge; two MakeHuman people (CC0, built by the MPFB add-on), posed; per pose, Line Art contours per thing, a tonal render, an object-ID render, the long bones and a face's few points on the paper |
| The poses | `scripts/things/poses.py` | every key drawing: the goodbye, his turn and walk out, the door closing, his almost in stages (back, head, hand), hers (lean, reach); `blend` for in-betweens |
| The drawing | `scripts/things/draw.py` | what an artist does with a reference: the doorway's construction, a body's gesture lines, the lines lost and found, the masses in passes toward the tone, rubbing, kneaded lifts, a face's three accents; erasure as scrubs, or along the drawn lines (`trace_erase`) |
| The moves | `scripts/things/film.py` | a drawing made in front of us; a step of what happened (the part that moved taken out, its head and lines, and drawn again, in tone); what is imagined: found by its construction (`imagine`), revised stage by stage over the ghosts of its own lines (`revise`), taken back along those lines, the hand least (`withdraw`) |
| The clock | `scripts/things/timeline.py` | marks with a start and a length; drawings on twos streamed to the encoder; `state_at` for planning on the film's own sheet; float32 checkpoints |
| The film | `scripts/things/story.py` | the exposure sheet: every move's time; writes the film, its sound and `sheet.json` (every mark's time) |
| The Foley | `scripts/things/foley.py` | the voices the sound is made of, from the same marks: one hand, the drawing tools, the eraser scrubbing, the latch, the room (and the film's own first mixes, for comparison) |
| The sound | `scripts/things/soundscape.py` | the room's sound, procedural but for a CC0 piano: the wall's goodbye drawing itself (its own cue); carried in, the flat (its air, traffic far off, the stairwell's hum, her sleeve, his coat and bag, his steps, the door on its closer, the latch), withdrawing, darkened, as the eraser lifts the door; the pencil, once a touch per gesture; the redraw's rubs; each taking back levelled on its own, hers heavier; the people taken, each erasure quieter; then nothing but the room's hushed air. Mix B (the room's, the artist's choice) adds two piano notes in his hold and one in hers, and the last silence is the second not played again; Mix A, without them, is kept for comparison |
| The room | `scripts/things/emergence.py` | how it comes onto the wall: the goodbye's lines alone and an order map (when each line is drawn, when each place is first worked), so the wall draws it as the film did, earlier marks beneath; the poster; the film from 6 s at two sizes; the beats read off the sheet |
| On a screen | `src/memory/living/things.ts` | where the film sits when it covers the view, by the screen's aspect |

## Rebuilding it

```sh
B=/opt/blender/blender-5.2.2-linux-x64/blender
# MPFB (once): the add-on from its release, and MakeHuman's system assets in its data folder
$B -b --command extension install-file -r user_default -e mpfb-2.0.18.zip
# the references for every key drawing (about 4 minutes)
$B -b --factory-startup --python scripts/things/scene.py -- \
  --pose goodbye,wave1,wave2,turn,going0,going2,going4,door0,door1,door3,shut,after,his-back,his-head,his-hand,her-lean,her-reach --out ref/
# the film: about 45 s planning, 5 minutes drawing at full size (--scale 0.5 for an animatic)
python3 scripts/things/story.py ref/ out/ --scale 1.0
# the room's files (public/memories/things/, the beats in public/music/things-sound.json)
python3 scripts/things/emergence.py out/
# its sound (public/music/things-film.mp3, things-wall.mp3, their provenance), Mix B, in a venv
# with numpy, scipy and soundfile; DIR is the Upright Piano KW folder (FreePats, CC0); Mix A is
# written beside it, for comparison, in out/sound/
.venv-audio/bin/python scripts/things/soundscape.py out/sheet.json out/sound/ --room b --piano DIR
npm run memories:seed -- --force=things-film
```

`tests/film-scene.test.ts` fails until the room's files are made again after `story.py`,
`foley.py` or `soundscape.py` change (their hashes, and `THINGS_BEATS` against the sheet's beats).

One drawing (a still) of any pose: `python3 scripts/things/draw.py ref/ POSE out.png`.
