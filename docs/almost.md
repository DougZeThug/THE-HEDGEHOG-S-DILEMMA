# Almost (memory II): how it is made

A felt stop-motion film of about 31 s. Two figures made of felt sit side by side at a kitchen
table at night, under a hanging lamp. He notices that her sleeve is folded back at the cuff and
reaches to put it right. His fingertip lifts the fold, and she starts. His hand stays in the air,
then goes back to his lap. After a silence she lays her arm a little nearer him, but his hands
stay in his lap. They sit. Nothing is said, and there is no music.

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
| The exposure sheet | `scripts/almost/xsheet.py` | which drawing each of the 744 frames photographs: mostly twos, the startle on ones, breaths on fours, long holds. `python3 scripts/almost/xsheet.py` prints it |
| Photographing | `scripts/almost/render.py` | one render per unique pair of drawings (158); after the first, only the region that changed (the felt that moved, where it was and where it is, and its shadows on the table and the wall), written noisy, with the denoiser's albedo and normal |
| Developing | `scripts/almost/develop.py` | each region pasted into the noisy photograph before it, the whole photograph denoised once and seen through the film's view (AgX); outside the region nothing differs by a bit |
| Assembly | `scripts/almost/assemble.py` | the developed photographs in exposure-sheet order, made 8-bit with one fixed dither; then the review crops (16:9, 9:16) and the room's copies (VP9 and H.264, full and half size) |
| Checks | `scripts/almost/check.py` | every photograph posed and measured: nothing into the table or into the other figure, no resting hand above the wood |
| QA sheets | `scripts/almost/posesheet.py`, `strips.py`, `tile.py` | the pose sheet (the story's ten key poses, captioned); motion strips (chosen frames of a film side by side) |
| Sound | `scripts/generate-almost.mjs`, `scripts/almost/sound.py` | ElevenLabs takes of the small material sounds; the fridge and the room made in code; all laid on the exposure sheet's frames |
| The way through the wall | `scripts/almost/masks.py`, `scripts/almost/emergence.py` | the first photograph in wool fibres, when each fibre grows and when the colour comes; the wall's poster; the art manifest |
| In the room | `src/memory/living/FilmScene.ts`, `src/memory/defs.ts` (`ALMOST`), `src/content/memories.ts` | the film drawn into the living memory's render target, slaved to the memory's clock; its timeline, cues and lines |

## Rebuilding it

Everything is a script. Blender is 5.2 LTS, headless (`blender -b --factory-startup --python …`).
Cycles runs on the CPU; EEVEE does not run here (no EGL).

```sh
B=/opt/blender/blender-5.2.2-linux-x64/blender
# 1. a still, to judge the look (any key pose, or two joined by +: A's, then B's)
$B -b --factory-startup --python scripts/almost/build.py -- --pose lift2+touched --still hero.png --res 1280x720 --samples 128
# 2. the pose sheet and the contact check
$B -b --factory-startup --python scripts/almost/posesheet.py -- --out posesheet.jpg
$B -b --factory-startup --python scripts/almost/check.py -- --out check.json
# 3. the photographs: open matte 1280×1440, 80 samples, noisy; then developed (about 10 s each).
#    --draft: 640×720 at 16 samples, without fibres, denoised as rendered (about 30 minutes; no
#    developing). Both resume where they stopped; after re-rendering from photograph N on,
#    develop with --from N.
$B -b --factory-startup --python scripts/almost/render.py -- --out film/
$B -b --factory-startup --python scripts/almost/develop.py -- film/
# 4. the soundtrack and the room's two sounds
python3 scripts/almost/sound.py film/almost.wav --stems film/stems
# 5. the films: review crops with sound, the room's silent copies, and the first photograph
python3 scripts/almost/assemble.py film --wide almost-wide.mp4 --tall almost-tall.mp4 --audio film/almost.wav \
  --web public/memories/almost/film --stills 0
# 6. the way through the wall (the mask is of the first pose)
$B -b --factory-startup --python scripts/almost/masks.py -- --out film/mask.png --res 1280x1440
python3 scripts/almost/emergence.py film/stills/0000.png film/mask.png
# 7. the room's sounds, and the timeline seeded
ffmpeg -i film/stems/almost-kitchen.wav -c:a libmp3lame -b:a 192k public/music/almost-kitchen.mp3
ffmpeg -i film/stems/almost-film.wav -c:a libmp3lame -b:a 192k public/music/almost-film.mp3
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
- **Her cuff** is shaped pose by pose with shape keys, as a puppet maker pins cloth between
  exposures. Its corner rises under his fingertip over two drawings (`lift`). After the startle it
  settles a little differently (`after`), and the fold is still there at the end.
- **His touch comes from his side,** low and level, with the index and middle fingers leading. His
  elbow is out to his side and back, so his forearm crosses the table. Aimed straight at her
  wrist, the forearm pointed into the lens and read as a post.

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
- **Crops.** The film is one open-matte frame (1280×1440). Covering a wide screen shows the
  16:9 band across its middle, which is the hero frame. Covering an upright phone shows the 9:16
  crop between their faces, with the lamp above them. On screens wider than 2:1 it is anchored
  low, so it loses the lamp's shade rather than their fingers (`src/memory/living/almost.ts`).
- **The way through the wall** is `MemoryWindow`'s ordered reveal with new art. The sketch layer is
  wool fibres, darkened to read on white plaster, each with a faint shadow. The order map says:
  - when each fibre grows, root to tip: the lamp first by the words, then the room, the two of
    them late, their hands last;
  - when the colour comes: one wash out from under the lamp.

  On the way out the order runs backwards. The colour goes back toward the lamp, then the fibres
  go, the two of them first, so the lamp is left a moment over the empty table.
- **Files.** VP9 WebM is played where it can be (Chromium, Firefox), and H.264 MP4 elsewhere
  (Safari). The phone set (`@low`) is half size. Both are fetched as blobs when the line is armed
  or offered, and decoded when it begins. If neither plays, the memory stays a still on the wall:
  the first photograph.
- **Compiled at boot.** The film's program is compiled at boot with the living memory's
  (`warmLiving`). Nothing compiles later.

## Provenance

| What | Source | Licence / terms |
|---|---|---|
| Every image | rendered here from `scripts/almost/` (procedural geometry and materials; no photographs, scans or downloaded textures) | the project's |
| The fridge's hum, the room's air, the small room | made in code (`sound.py`: mains hum and motor noise, filtered noise, a synthetic impulse response) | the project's |
| The clock, the sleeves, the touch, the drag, the chair, the settle, the offer | ElevenLabs sound generation (`eleven_text_to_sound_v2`), 17 takes on 2026-10-20 for 748 credits; prompts and costs in `scripts/sfx-ledger.json` (`almost:*`), raw takes in `audition/almost/` | generated under the account's ElevenLabs plan and its terms; every take `review: pending` until the artist has listened |
| The generated fridge take (`almost-fridge-1.mp3`) | ElevenLabs, as above | not used: it came back as near-silent hiss and a burst |
