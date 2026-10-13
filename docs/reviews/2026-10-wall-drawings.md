# Review: wall drawings, the air writing's shadow, the rub-out sound (October 2026)

The brief is `docs/brief-wall-drawings.md`. The protocol is `docs/review-protocol.md`. Evidence is in `test-output/review/drawings/` (gitignored, regenerable): frames, bake sheets and QA's scripts.

## Approach review (before building)

**Proposed:** eleven drawings, three of them static. Most sat beside the line they echo and were triggered by it: two cups by the "we" line, a sun by "happy then", an unfinished face by "remember me", a plate by crumbs, a smiling face by the laugh line, a small chair after "stay" is finished. An eye drawn behind the visitor in the last phase. A canvas-based bake.

| Question | Positions | Decision | Why |
|---|---|---|---|
| Captions or traces | Creative Director: 6 of 11 were captions in pencil. Tie drawings to the plaster's history and the visitor's body. Skeptic: agreed, but the CD's own replacement set was just as authored. | **Mostly static history; one drawing made while watched.** Only the cups sit beside their line, and they are drawn only when that line is held in view. | A drawing that appears unseen looks exactly like one that was always there. The only dynamic drawing a visitor can perceive is one drawn while they look. |
| The sun | CD: by the height marks, echoing "happy then" above it. Skeptic: that line is not above the marks (`at` is a fraction of the wall, ≈ 2 m away). Keep the sun by the marks anyway, already rubbed. | **By the "J" ticks, at a child's reach, with one eraser swipe toward the lowest tick** (CD evaluation). | It is specific to this room without the echo. The erosion is baked in, not timed: a late rub-out would happen unseen. |
| The eye | Brief: a named motif. CD: cut it (horror grammar). Skeptic: the trigger was the problem, not the motif. | **Kept: small, static, half-erased, the iris rubbed away.** | The artist named it. Static and rubbed, it is a margin mark, not a jump. |
| The dog/cat, crumbs, small chair, unfinished face, laughing face, house, plate, mug ring | CD and Skeptic, variously. | **Cut.** The cat was built, then replaced after the evaluation (it read as an emoji cat waiting by the door) by a biro being tested. | Captions, cute, theatrical, or unperceivable (a dog that appears only on kneeling). |
| Noughts and crosses in two hands | CD: two hands. Skeptic: at 15 cm two inks won't read as two people. | **One hand, unfinished.** | The game already implies two players. |
| Baking | Technical Artist: stamp discs along centrelines (time = min, alpha = max), at 700 px/m. Static ghosts painted into the plaster. Skeptic: reuse the canvas plus `bakeStrokes`. | **Stamping, 700 px/m; ghosts as soft meshes at 300 px/m** rather than plaster paint. | Stamping needs no canvas, so it is tested in node, and its crossings and edges are right. Plaster maps are 100 px/m on phones, too coarse for a 9 cm eye. |
| Floor shadow | TA: project the words' quad from the key light every frame, at a fixed mip level (not a bias), on a 1×6 strip. A real shadow map can't follow the dissolve. | **As the TA proposed.** | |

## Built, then evaluated

`qa-accessibility`, `creative-director` and `technical-artist` evaluated the built commit (5e077e5). Fixed:

**Creative Director**
- The traced chair read as a ladder. It is now outline only, side on, stronger: the one drawing just made out from the real chair.
- The second cup read as a flag. It now has a rim, one side, and the other side stopping two-thirds down.
- The cat was replaced by a biro test.
- The eye's iris is rubbed away.
- The sheet doodles are cut dead along two edges of the removed sheet, whose plaster is now slightly cleaner. The bolt is cut.
- The sun's rubbing is one swipe.
- The shadow was legible mirror text. It now shows the words' bands, not letters.

**Technical Artist**
- The shadow at mip 5 / 0.14 was invisible. It is now mip 4 rising with height, at 0.22 × the key light.
- The smudge stamp read as a drop shadow and was 68% of the bake. It is now every fourth step, where pressed, along the stroke; none on ghosts.
- The sheet doodle is cut in pixels.
- The chair and the sheet doodle are square to the wall.
- The cups are baked when idle, after their line appears.
- Fine lines are held as they get small (`uThin`).

**QA**
- A drawing with no room failed silently. It now reports, and is tried once more a minute later.
- The static bake cost about 0.6 s of phone boot. It now runs after the tap, in the black: about 0.3 s over the pre-drawings boot, the rest being the eraser files and noise.
- Taps on drawings stole taps from writing.
- The shadow stayed visible from behind its words.
- "[rubbed out]" could replace a caption of words.
- A 3 cm margin is now kept round each drawing.
- The opening test now checks the old drawings are faint and off the opening wall.

**Also**
- The eraser: three takes generated (51 credits, budget-capped, balance checked), on the audition sheet as pending.
- Until the artist approves one, the room plays them, as it does the other new room sounds. A synthesised rub is the fallback.

## Still open
- **The brief's "2–4 visible at the beginning".** Seven drawings exist from the start. Four are plainly visible close up; three are ghosts about as faint as the plaster's erased marks. The artist may want fewer.
- **Whether the drawings read as a hand**, and whether the eraser and breath sound right, needs the artist, on a phone, with sound.
- **Real-phone bake and frame cost** (measured here under 4× CPU throttling and software GL only).
- **The phrase layout seed is fixed** (4242), so every visit has the same walls. That is deliberate.
