# Almost (memory II): how it is made

A felt stop-motion film of 28 s. Two figures made of felt sit side by side at a kitchen table at
night, under a hanging lamp. He looks at his cup, then notices that her sleeve is folded back at the
cuff, and reaches to put it right. His fingertip lifts the fold, and she starts. His hand stays in
the air, then goes back to his lap. After a silence she looks at him, and lays her arm down a little
nearer him, the fold toward him. He breathes, and for a moment his head turns toward her; his hand
stays in his lap. They sit. Nothing is said, and there is no music.

The white room opens it from the line "your hand, almost". Wool fibres come through the plaster,
the colour follows, the visitor is taken in, the film plays, and it goes back into the wall.

The decisions and the reviews behind it are in `docs/reviews/2026-10-almost.md`. The artist's brief
is "THE HEDGEHOG'S DILEMMA, MEMORY II — ALMOST" (2026-10-20).

## The parts

| Part | File | What it owns |
|---|---|---|
| The set | `scripts/almost/kitchen.py` | the table, the chairs (each on a pivot, so one can scrape back), the wall, the window, the fridge's edge, the lamp, the cup; their materials |
| The figures | `scripts/almost/puppets.py` | two felt puppets: stuffed felt and knit over a wire armature (IK arms, FK spine and head), felt eyelids, her folded cuff (shape keys `lift` and `after`), seeded wool fibres on every surface |
| Shared geometry and materials | `scripts/almost/lib.py` | felt, knit, wood, paint, thread; the fibre helper; rest-position coordinates, so no texture swims on a bending body |
| The scene | `scripts/almost/build.py` | the camera (42 mm at 28.5 cm, f/11, focus between the hands and the faces), the lights, render settings; `--pose`, `--still` and `--save` for single frames |
| The performance | `scripts/almost/performance.py` | the key poses and how a pose is put on the puppets: wrists placed and the elbow solved clear of the table, a hand laid on the wood until its felt just meets it, his fingertip brought to the fold's corner; every pose's arms then baked in full, so in-betweens are continuous |
| The exposure sheet | `scripts/almost/xsheet.py` | which drawing each of the 679 frames photographs (134 photographs): mostly twos, the startle on ones, breaths on fours, long holds. `python3 scripts/almost/xsheet.py` prints it |
| Photographing | `scripts/almost/render.py` | one render per unique pair of drawings; after the first, only the region that changed (the felt that moved, where it was and where it is, and its shadows wherever the lens sees them sharp), written noisy, with the denoiser's albedo and normal and a hash of its drawings and the scripts that made them; `--plan` estimates the whole, `--regrow` renders seamed sides again, wider |
| Developing | `scripts/almost/develop.py` | each region pasted into the noisy photograph before it, the whole photograph denoised once and seen through the film's view (AgX), the window sill's lit edge printed down through a fixed soft mask (darkroom practice; his crown is left for the artist's A/B); outside the region nothing differs by a bit; a region whose border disagrees with the photograph before it fails the run and is listed in `seams.json` |
| Assembly | `scripts/almost/assemble.py` | the developed photographs in exposure-sheet order, made 8-bit with one fixed dither; then the review crops (16:9, 9:16) and the room's copies (VP9 and H.264, full and half size) |
| Checks | `scripts/almost/check.py`, `scripts/almost/apart.py`, `scripts/almost/seen.py` | every photograph posed and measured on its rendered surfaces: nothing into the table (its own mesh, warp and worn edges) or into the other figure, no resting hand above the wood, no hand out through its own sleeve, no limp paw in the air; his hand clear of her arm in the picture from the moment he lets go; and in every held pose the fold's lining as the camera sees it, in both crops. One known exception: the wrist's tube 0.7-1.6 mm through his cuff at 72-75, hidden from the lens at every point (docs/reviews/2026-10-almost.md, decision 28) |
| QA sheets | `scripts/almost/posesheet.py`, `strips.py`, `tile.py` | the pose sheet (the story's ten key poses, captioned); motion strips (chosen frames of a film side by side) |
| Sound | `scripts/generate-almost.mjs`, `scripts/almost/sound.py` | ElevenLabs takes of the small material sounds; the fridge and the room made in code; all laid on the exposure sheet's frames, measured (A-weighted, loudness, the clock against the beats) |
| The way through the wall | `scripts/almost/masks.py`, `scripts/almost/emergence.py` | the first photograph in wool fibres, when each fibre grows and when the colour comes; the wall's poster; the art manifest |
| In the room | `src/memory/living/FilmScene.ts`, `src/memory/defs.ts` (`ALMOST`), `src/content/memories.ts` | the film drawn into the living memory's render target, slaved to the memory's clock; its timeline, cues and lines |

## Rebuilding it

Everything is a script. Blender is 5.2 LTS, headless (`blender -b --factory-startup --python …`).
Cycles runs on the CPU; EEVEE does not run here (no EGL).

```sh
B=/opt/blender/blender-5.2.2-linux-x64/blender
# 1. a still, to judge the look (any key pose, or two joined by +: A's, then B's)
$B -b --factory-startup --python scripts/almost/build.py -- --pose lift2+touched --still hero.png --res 1280x720 --samples 128
# 2. the pose sheet, the contact check and the fold's gate
$B -b --factory-startup --python scripts/almost/posesheet.py -- --out posesheet.jpg
$B -b --factory-startup --python scripts/almost/check.py -- --out check.json
$B -b --factory-startup --python scripts/almost/apart.py -- --out checks/
$B -b --factory-startup --python scripts/almost/seen.py -- --out seen/
# 3. the photographs: open matte 1280×1440, 80 samples, noisy (about 3.5 h: --plan says); then
#    developed (about 10 s each). --draft: 640×720 at 16 samples, without fibres, denoised as
#    rendered (about 25 minutes; no developing). Both resume where they stopped, as long as each
#    region on disk was made from the same drawings and scripts; change a pose and render into a
#    fresh directory. If developing finds a seam, render those sides again, wider, and develop from there.
$B -b --factory-startup --python scripts/almost/render.py -- --out film/ --plan
$B -b --factory-startup --python scripts/almost/render.py -- --out film/
$B -b --factory-startup --python scripts/almost/develop.py -- film/
#    (on a seam:)
$B -b --factory-startup --python scripts/almost/render.py -- --out film/ --regrow
$B -b --factory-startup --python scripts/almost/develop.py -- film/ --from N
# 4. the soundtrack, and the room's two sounds published with what they were made from
python3 scripts/almost/sound.py film/almost.wav --publish public/music
# 5. the films: review crops with sound, the room's silent copies, and the first photograph
python3 scripts/almost/assemble.py film --wide almost-wide.mp4 --tall almost-tall.mp4 --audio film/almost.wav \
  --web public/memories/almost/film --stills 0
# 6. the way through the wall (the mask is of the first pose)
$B -b --factory-startup --python scripts/almost/masks.py -- --out film/mask.png --res 1280x1440
python3 scripts/almost/emergence.py film/stills/0000.png film/mask.png
# 7. the timeline seeded
npm run memories:seed -- --force=almost-film
```

`cv2` comes from the system Python, so the image scripts run with `/usr/bin/python3`.

## How it moves

- **Stop motion, not smoothed.** Each frame is a photograph of a pose. A held frame is the same
  photograph. Movement is on twos, the startle on ones, and breaths on fours. Spacing comes from
  eases on the in-betweens: slow out of a hold, slow into the next.
- **What stands still stays still.**
  - The fibres are grown once, at the rest pose, before the first photograph, and then carried by
    the felt. (Grown again at each pose, they moved against it; the technical artist measured it.)
  - The render's seed is fixed and there is no dither, so a region pasted into the photograph
    before it changes nothing that did not move.
  - Each whole photograph is denoised once: denoised alone, each region re-made the room round it,
    and the room shimmered in rectangles.
  - On the test photographs, outside each region no pixel of the 8-bit frames changes. Inside it,
    the change is on the figures; the wall and table behind them change by a level or less.
- **Contact is solved, not hoped for.**
  - A resting hand is tipped until its lowest felt meets the wood.
  - A touch moves the wrist until the index fingertip is at the fold's corner, wherever her
    sleeve is.
  - The elbow is chosen on the circle the two bones allow, and it never goes into the table.
    `check.py` measures every photograph: felt may press into the wood by 0.7 mm, a tenth of a
    sleeve's radius, as stuffed felt does.
  - No hand goes out through its own sleeve (`check.py`'s `through`). A wrist bends at its joint
    inside the cuff, its hidden end going with the forearm.
- **Her cuff** is shaped pose by pose with shape keys, as a puppet maker pins cloth between
  exposures. Its corner rises under his fingertip over two drawings (`lift`). After the startle it
  settles a little differently (`after`), and the fold is still there at the end.
- **The table is an adult's table to these figures:** its top is 27 mm above the seat, against
  shoulders 59 mm above it and 29 mm upper arms. At 41 mm, a child's at a grown-up table, a forearm
  laid on the wood could only put its elbow out to the side or up over the shoulder (the artist,
  2026-10-21). No elbow is drawn in toward the body's middle: his left elbow rests a little outside
  his shoulder, as his right does.
- **His touch comes from his side,** low and level, with the index and middle fingers leading. His
  elbow hangs at his side, a little out and back, so his forearm crosses the table. Aimed straight
  at her wrist, the forearm pointed into the lens and read as a post. Aimed in toward his middle,
  the upper arm came forward at the lens and read as bent inwards.
- **He leans in to touch.** From the approach to the lifts his spine and chest bend toward her.
  His shoulder comes over the fold, so the elbow isn't folded tight by the table, and the hand goes
  on in the forearm's line, 10° down. His head gives the bend back, so his face stays on her
  sleeve. Sat upright, the wrist was too near the shoulder: the elbow folded inward and the hand
  hung 52° off the wrist (the artist, 2026-10-21). He sits back out of it as he lets go.
- **The fold is in the picture whenever it is held.** Her near forearm lies angled in toward her
  own middle, so the side of the cuff with the fold faces him and the lens; in her offer her elbow
  slides out toward him on the wood. `seen.py` counts the lining the camera sees in each held pose
  (972-1116 pixels at 1280 wide; at least 120).
- **His reach rises toward her.** The hand goes up and across together, so the forearm swings
  toward her and the hand points across the table; its elbow turns evenly round the line from
  shoulder to wrist. Lifted straight up first, the forearm pointed at the lens and the hand hung
  below its cuff, a paw, for a third of a second.
- **Her startle** sends her elbow back and down along her side: nothing of hers moves toward him.
  **He lets go after her,** from her first still frame, 125 ms after her first startled one: his
  fingertips slip off her sleeve over four drawings on twos as she lays her arm down, and his
  hand stays in the air. On her own startle frames, or most of the way in one drawing, it read as
  a second flinch.
  **His hand goes to his lap** by turning along the table's edge, rolling onto its little finger's
  side and slipping down past it: no lift, which read as a raised paw.
- **The ending answers the opening.** He begins and ends looking at his cup and his hand by it; only
  what the story changed differs: his reaching hand is in his lap, and her arm lies nearer him.

## How the room plays it

- **The film is a living memory.** `FilmScene` draws a muted, inline video into the render target
  that `MemoryWindow` shows as its first layer and the immersion shows on the screen.
- **Its frame comes from the timeline key `scene.film`,** in seconds into the film. The memory's
  one clock decides it:
  - **Playing:** the video plays, and is pulled back whenever it drifts more than a frame and a
    half from the timeline.
  - **Held, seeked or recorded:** the video is paused on the middle of the exact frame.
  - **Autoplay refused:** the video is stepped frame by frame, paused.
- **Its texture is updated** when the frame shown changes or a seek lands, never on a timer.
- **Its first frame is held** while the fibres and the colour come and the visitor is carried in.
  It starts at 10.3 s, half a second after they are inside, and the exit begins on its last second.
- **Its sound is two cues on the memory's audio, not the video's.**
  - The kitchen (the fridge, the clock, the room's air) from 0.6 s, heard through the wall first.
  - The film's material sounds from 10.3 s.
  - Both are laid by `sound.py` at the same levels as the film's own mix, and the clock's ticks
    fall on the same seconds in both.
- **Crops.** The film is one open-matte frame (1280×1440). Covering a wide screen shows a band
  across its middle; at 16:9 it is the hero frame, a little lower. Covering an upright phone shows
  the 9:16 crop between their faces, with the lamp above them. On any screen that is not upright,
  one rule (`almostCover` in `src/memory/living/almost.ts`) holds the frame's bottom just below
  the cup's shadow, so a wider screen loses the top first (the shade's light, then her hat), never
  their hands or the cup, and her eyes stay at least 12% below the frame's top. Beyond about
  2.45:1 nothing holds both.
- **The way through the wall** is `MemoryWindow`'s ordered reveal with new art.
  - **The wool.** The sketch layer is the first photograph in loose wool: fine pale strands, each in
    the colour under it lifted most of the way to white, lying every way with a little curl,
    thickest where the picture has mass and thinning unevenly toward its edges, so it is a cloud on
    the wall rather than a grey mat; each with a faint shadow on the plaster. It is not a
    drawing of the picture's edges: that read as a filter (the skeptic's review).
  - **The order map** says when each strand grows, root to tip: the lamp first by the words, then
    the room, the two of them a little later, their hands last.
  - **The colour** comes up through the wool over the whole picture together, a little unevenly, as
    a print in the developer (5.0-8.0 s on the timeline, most of it 5.7-7.0), and then the wool
    sinks into the picture. (Out from the lamp by the words, it read as a brown stain.)
  - **On the way out** nothing runs in order. The colour sinks back into the wool all at once, then
    the wool into the plaster, on the layers' opacities. (Run backwards, the two of them went first
    and left the lamp over an empty table: the woodland's ending again.)
- **Files.** VP9 WebM is played where it can be (Chromium, Firefox), and H.264 MP4 elsewhere;
  WebKit (Safari, and every browser on an iPhone) gets H.264 first. The phone set (`@low`) is half
  size. Both are fetched as blobs when the line is armed or offered, and decoded when it begins:
  played and paused once its metadata is in (Safari may decode nothing of a video that has not
  played). If neither plays, or nothing is decoded in 5 s, the memory stays a still on the wall:
  the first photograph, and also if no frame can be drawn or the bytes don't come in 8 s. A keyframe
  only where a photograph begins, at least 3 s apart (or 1 s, where a hold of 3 s begins), so the
  still room never pulses; a playing film keeps time by its rate and seldom seeks. A film that
  may not play is stepped: no seek while one is landing, aimed ahead by what the last one took.
  (Not yet tried on a real iPhone.)
- **Compiled at boot.** The film's program is compiled at boot with the living memory's
  (`warmLiving`), and one film material is kept for good, so the program outlives each film's own
  material. Nothing compiles later. (Warmed with a material that was then disposed, the program
  went with it and compiled again on the way in: the memory playtest, 2026-10-21.)

## Provenance

| What | Source | Licence / terms |
|---|---|---|
| Every image | rendered here from `scripts/almost/` (procedural geometry and materials; no photographs, scans or downloaded textures) | the project's |
| The fridge's hum, the room's air, the small room | made in code (`sound.py`: mains hum and motor noise, filtered noise, a synthetic impulse response) | the project's |
| The clock, the sleeves, the touch, the drag, the chair, the settle, the offer | ElevenLabs sound generation (`eleven_text_to_sound_v2`), 17 takes on 2026-10-20 for 748 credits; prompts, settings (influence, loop), the plan and costs in `scripts/sfx-ledger.json` (`almost:*`), raw takes in `audition/almost/` | generated under the account's ElevenLabs plan (Creator, as read from the account on 2026-10-20) and its terms, which grant a commercial licence on paid plans: check the current terms before any release; every take `review: pending` until the artist has listened on the audition sheet |
| The generated fridge take (`almost-fridge-1.mp3`) | ElevenLabs, as above | not used: it came back as near-silent hiss and a burst |

### Which takes the film uses, and how

Each is cleaned first: the generator's steady line at 200 Hz and its multiples notched out (Q 40),
and everything under 180 Hz taken away (250 Hz for the clock, 300 Hz for the creak). Then a slice
is cut from its onset, ended on its own decay and faded by a raised cosine (`sound.py`'s `ending`).

| Take | Used for | How |
|---|---|---|
| `almost-clock-1` | the clock, one tick a second | four of its ticks in turn (at 1.005, 2.047, 3.001 and 4.044 s), every other one 40 ms early (its own limp), on x.12 s of the film's seconds |
| `almost-reach-1` | his sleeve as he carries his hand across | once, faint (-37 dBFS RMS before the figures' layer) |
| `almost-touch-1` | his fingertip on the fold | half a second, two frames after the fingertip arrives |
| `almost-drag-3` | her sleeve snatched back | its first 14 frames, loudest on the first two, -6 dB by the fourth, -18 dB by the eighth, gone by the fourteenth; -18 LUFS momentary at its height |
| `almost-scrape-2` | her chair's creak, on the startle's second frame | 0.16 s from its sixth frame, high-passed at 300 Hz, raised four semitones |
| `almost-touch-2` | her forearm laid back on the wood | its transient where the arm lands |
| `almost-settle-1` | his arm back across the table and into his lap | the length of the move |
| `almost-offer-1`, `-2` | her sleeve lifted off the wood, and laid down nearer him | the length of each move |

Not used: `almost-fridge-1` (near-silent hiss and a burst), `almost-reach-2`, `-3`, `almost-drag-1`,
`-2`, `almost-scrape-1`, `-3`, `almost-settle-2` (the second hand, cut): 451 of the 748 credits.
