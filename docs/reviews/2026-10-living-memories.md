# Living memories: GSAP, Theatre.js and memory composition (October 2026)

The proposal as approved by the artist, for the specialists' approach review and the skeptic's challenge. The decisions taken from those reviews follow at the end.

**Spikes already run:**
- `@theatre/core` 0.7.2 imports in vitest's node environment.
- With committed state, setting `sheet.sequence.position` gives the keyframed value synchronously, in both directions: positions 0, 0.5, 1, 2, 1, 0 gave 0, 1.06, 5, 10, 5, 0.
- A paused GSAP 3.15 timeline seeked with `tl.time(t)` is identical forward and backward, labels included. `kill()` leaves the global timeline empty.
- Dry runs: sound effects about 552 credits estimated (about 506 at the measured 11 credits a second; the artist approved 600); music about 1,050 estimated (about 962 at the measured rate; approved 1,200). Nothing has been generated yet.

## Proposal
## Context
The artist wants written lines to become living memories: a sentence becomes a sketch, then a painterly, layered scene inside the plaster, then dissolves, sometimes leaving sunlight in the room. It should read as an intimate moving painting, not a video panel, portal or cutscene.

Three memories are tied to phrases that already exist:
- `cereal`: east wall; phrases.ts:193; in `FIRST_WRITTEN`.
- `stay`: north wall; the opening's line, left unfinished until `ruleFinish`.
- `happiest-unneeded`: south wall; phrases.ts:329.

The artist requires:
- **GSAP**, for reusable procedural transitions;
- **Theatre.js**, for authored, visually editable timelines, with Studio in dev only;
- **one authoritative clock**, with the existing Director remaining the authority for triggering;
- a **dev Memory Editor** whose saved state is committed and reproduced in production.

Decisions so far:
- **Artwork** is code-painted and replaceable: layers are baked to PNG slots in a documented format, and stand-ins are labelled honestly.
- **New ElevenLabs SFX** are approved up to 600 credits: dry run first, the real balance checked, nothing bought.
- **Music** for the two longer memories (kitchen and bedroom), up to 1,200 credits, via `scripts/generate-music.mjs`: one take each, plus room for one retake. The hallway keeps footsteps and silence. The existing `piano-warm` (paid, pending review) stays a fallback.
- **Two earlier decisions are reversed** at the artist's request (`docs/reviews/2026-10-dependencies.md`): "gsap rejected: a second clock" and "one line, one light". Their reasons are honoured. GSAP never ticks by itself: its timelines are paused, and the one controller seeks them.

**Branch.** PR #7 is merged, so restart `claude/dreamy-dijkstra-utgwnn` from `origin/main`. When the work is done, open a new PR.

## Architecture: one memory system, one clock
- **Content.** `src/content/memories.ts` holds the `MemoryDef` table:
  - `kitchen-light` becomes its `kind:'light'` entry. Its renderer stays `MemoryLight`, and its behaviour and tests are unchanged.
  - The three new memories are `kind:'scene'`.
  - Each def has `phraseId`, `surface`, `earliest`, `phases`, `after?:'finished'` (stay), `trigger {gaze, nearGaze, tap}`, `linger {min, max, lookAway}`, `variants {first, revisit[]}`, `bleed?`, `sketch {shape, size}`, `art`, `window [w,h]`.
- **`src/state/MemoryDirector.ts`** is pure and node-testable, owned by `Director`, and replaces `ruleMemory`. It decides:
  - **Eligibility:** phrase visible and read, or tapped; `earliest`, which is early for cereal (≈35 s after release) and gives a discoverable first memory; the phase; `scheduler.majorFree`; no recent voice; one active memory at a time; a cooldown; a per-visit cap; stay only once it is finished.
  - **Triggers:** gaze dwell (shorter when near); tap, which counts as intent on mobile; proximity, which only shortens the dwell.
  - **Linger vs. early release:** look-away or walk-away after the minimum hold; otherwise complete at the maximum.
  - **Revisit variant:** from per-memory counts persisted beside `visits`.
  - **Phrase without memory:** nothing happens and the line stays a line.
  - Its own seeded Rng, so existing seeded sequences and tests don't shift.
- **Cues** (`cues.ts`, devKind in `Pacing.ts`): `memory-prepare` (prefetch art), `memory-scene {id, variant, minHold, maxHold}` (major), `memory-release {id, reason}`. App reports back through `director.memoryEnded / memoryFailed`. While a memory is active it holds pacing and `attending()`, so voices and situations don't talk over it.
- **`src/memory/MemoryPlaybackController.ts`** owns lifecycle and local time:
  - states `dormant → emerging → active → withdrawing → residue → complete`;
  - `interrupt` from any state, and a hard dispose for departure, a rapid switch or a long hide;
  - `pause/resume/seek`, and `follow(position)` for Studio;
  - `step(dt)` is called once from `App.frame` after `lighting.update`, with `dt = 0` while hidden or in settings. There are no other loops.
- **`src/memory/theatre.ts`** is the timeline adapter:
  - one project `getProject('Hedgehog Memories', {state})`, with state from the committed `src/memory/theatre-state.json`;
  - one sheet per memory/variant, created lazily;
  - objects defined in `src/memory/sheets.ts`:
    - `window` (depth, offset, size, parallax, reveal, sketch, colour, maskSoft, grain, residue, presence, emphasis);
    - `light` (intensity, warmth, shaft, roomSpill);
    - `layer/<name>` (opacity, x, y, scale, rot, depth);
    - `actor/shadow`.
  - Production sets `sheet.sequence.position` from the controller and reads `obj.value` synchronously; it never calls `sequence.play()`.
  - One `createRafDriver`, ticked by the App frame only when Studio or a subscription needs it.
  - The sections `emerge / active / exit / residue` and audio markers `sfx:<id>` are read from sequence markers in the state, with fallbacks in the defs.
- **`src/memory/gsapClock.ts` + `behaviours.ts`** (GSAP):
  - On import, `gsap.ticker.remove(gsap.updateRoot)`, plus a sleep after timelines are built.
  - Reusable, labelled, `paused:true` factories: `emerge`, `sketchToColour`, `dissolve`, `breathe/sway`, `drift`, `interruptExit`, `bleed`, each with reduced-motion variants.
  - They write only to a plain `env` object. One master timeline per instance, positioned with `master.time(t)` each step and killed on dispose.
- **`src/memory/compose.ts`** is pure and has one writer per field:
  - `final.opacity = theatre.base × env.emerge × (1−env.dissolve) × env.exit × presenceWeight`
  - offsets are added, scaled by the motion weight (0 under reduced motion);
  - parallax × 0.25 under reduced motion;
  - presence × 0.6 under gentle intensity.
- **`src/memory/runtime.ts`** is a lazy chunk (gsap, @theatre/core, controller and audio), loaded at idle after the opening and again on `memory-prepare`.

## Renderer: `src/world/MemoryWindow.ts` (eager; compiled at boot)
- **Placement.** One reused quad in `room.frames[surface].writing`, just under the ink (renderOrder 1, so the handwriting stays on top). It is anchored with `text.anchorOf` and clamped to the wall like `MemoryLight`.
- **Shader.** One `ShaderMaterial`, premultiplied, `toneMapped:false`, written into the linear HalfFloat target. It provides:
  - up to 6 layer samplers (fixed slots), with exact window-projection parallax from the camera position (depth capped at 0.4 m, 12% bake margin);
  - the sketch stage from the existing `bakeDrawing()` time-channel texture: new shapes `bowl`, `two-bowls`, `doorway` and `window` in `sketch.ts`;
  - an organic fbm mask that grows from the handwriting's position and recedes with another seed, plus a faint stain for residue;
  - the wall's own plaster map, so the paint takes the plaster's tooth;
  - `uRoomLit` from `Lighting` (roomLight, warmthNow), so dims darken the memory with the room;
  - `uStylize`, which gives the stylized/unstylized comparison.
- **No recompiles.** It is added unseen at boot with 1×1 dummy textures and no varying defines. Quality is set only through layer count and texture size. A test asserts the program count is unchanged.
- **Art loading.** Lazy `ImageBitmapLoader`, with `renderer.initTexture` during the sketch stage. On complete, the textures are disposed, the bitmaps closed and the dummies rebound. Sizes: high 2048 px, medium 1536 px, low/phone a `@low` set at 1024 px with at most 4 merged layers.
- **Memory bleed** (one effect). `MemoryLight` gains an externally driven mode (`place` + `drive`). During `residue`, the controller drives it from Theatre `light.roomSpill × env.bleed` for about 6–9 s. Once per visit, from the cereal or bedroom memory, and coordinated with kitchen-light so the two never compete.

## Artwork (code-painted stand-ins, replaceable)
- **Bake pipeline.** `npm run bake:memories` runs `scripts/bake-memories.mjs`, which opens a Vite page in Playwright Chromium. The painters in `src/memory/paint/{brush,cereal,stay,happiest}.ts` use canvas2D with washes, granulation, dry-brush, light shafts and the pencil underdrawing from `shapeStrokes`.
- **Output.** `public/memories/<id>/<variant>/<layer>[@low].png`, plus a `manifest.json` per memory giving layers, depth, blend, size and `source: code-painted stand-in`. The painters are never shipped (a dist guard checks this).
- **Layers, back to front:**
  - cereal: wall-wash, window-light, table, bowl-a, bowl-b, spoon, curtain, light-shaft. Variant `later`: empty bowls, lower sun.
  - stay: hallway-room, hallway-depth, floor-light, doorframe, shadow-figure. Variants `approach` and `empty`.
  - happiest: wall, sky-outside, window-frame, curtain, bed, sun-patch. Variant `dusk`.
- **Replacing a layer:** drop in a PNG of the same size (RGBA, sRGB, straight alpha). No code change.

## Audio: `src/memory/MemoryAudio.ts` + `cueSheets.ts`
- **Cue sheets.** Events `{id, at | marker, kind: oneshot | bed, asset, gain, place: window | beyond | behind, fadeIn, fadeOut, tail}`.
- **Dispatch is idempotent.** A fired set per instance and event, with 0.3 s lookahead scheduled against `ctx.currentTime`. A seek or jump marks earlier one-shots as fired without playing them and re-syncs beds at an offset with a fade. Pause stops pending sources. A suspended context counts its events as missed, with no late burst. Beds have tails after the visuals end. Every node is tracked and disconnected on dispose.
- **Engine changes.** A new `memory` bus in `AudioEngine` that is not ducked, a `Voices.buffer(key)` accessor, and a panner at the window's centre.
- **Reused assets:** `vf-laugh-next-room` (distant laughter), `sfx-cup`, `sfx-door`, `sfx-chair-creak`, `style-distant-2`.
- **New SFX** through `scripts/generate-voices.mjs`, dry run first, about 484 credits of the 600 approved: kitchen-evening, spoon-bowl ×2, footsteps away/near, floorboard ×2, birds-distant, curtain-breeze, bedroom-air. They are added to the ledger and audition sheet for the artist; nothing is claimed to sound convincing until they have listened.
- **Music for the kitchen and bedroom** through `scripts/generate-music.mjs`, dry run first, at most 1,200 credits in total:
  - **`memory-kitchen`** (about 35 s): warm, domestic, unhurried. Solo instrument heard in the room, such as an upright piano or a soft guitar, with no drums, no swell and no sentimentality. It must stay genuinely happy.
  - **`memory-bedroom`** (about 35 s): tranquil and airy, sparse, morning light, a few sustained notes, plenty of space.
  - The prompts are drafted with the sound designer before the dry run. Both are instrumental.
- **How music sits in the scene.**
  - A `kind:'music'` cue on the memory bus, panned near the window and slightly muffled.
  - It enters after the scene has formed (not with the sketch). It fades with the dissolve, and its tail may outlive the image.
  - It is seek- and pause-safe like beds: it resyncs at an offset and is never restarted twice.
  - The hallway memory has no music. Revisits may omit the music or use a shorter excerpt, with silence remaining a choice.
- **Review.** Music joins the ledger and the audition sheet; the artist decides. Nothing ships as approved until they have listened.

## Dev Memory Editor (dev builds only)
- **Entry.** `?memory`, behind `import.meta.env.DEV`. It loads `src/memory/editor/MemoryEditor.ts` dynamically.
- **Controls:**
  - memory and variant selectors; Start (from the real framing pose), Release, Interrupt, Restart, Play/Pause;
  - a scrub slider and speeds 0.25 / 0.5 / 1;
  - a layer list with solo, hide and live values; a base/env/final inspector;
  - toggles for stylized/unstylized, reduced motion, quality tier and bleed; audio mute and cue solo.
- **Studio.** `?memory&studio` loads `@theatre/studio` dynamically, initialised with the shared raf driver. The controller then follows the scrubbed position: lifecycle comes from the sections, and audio treats any jump as a seek.
- **Saving.**
  - "Save to repo" POSTs `studio.createContentOfSaveFile(...)` to `/__memory/save`. That endpoint is a dev-only Vite plugin (`scripts/vite-memory-save.mjs`, `apply:'serve'`, localhost only) which validates the JSON and writes `src/memory/theatre-state.json` with stable formatting and no reload.
  - "Download" is the fallback.
  - The committed JSON is the source of truth, never localStorage alone.
- **Production.** Nothing of the editor ships: no editor, Studio or save endpoint in `dist/` (a grep guard checks this). The existing `?tune` "the memory, now" action gains a memory selector, without Studio.
- **`docs/memories.md`** covers the authoring workflow: change a curtain's timing, move the shadow, adjust a light, hold a moment longer, replace a layer, re-bake, save and commit, and Studio's localStorage conflict dialog.

## Stages
- **A. Dependencies and spikes.**
  - Install `gsap@3.15.0`, `@theatre/core@0.7.2`, and `@theatre/studio@0.7.2` (devDependency).
  - Spike: does @theatre/core import in vitest's node environment; is `obj.value` synchronous after setting the position; do the GSAP ticker or Theatre's default driver open a requestAnimationFrame loop (counted in Playwright); does production load the committed state without Studio.
  - SFX dry run.
  - Approach review by the technical artist, cinematic director, sound designer, interaction designer and creative director. The skeptic challenges, specifically whether GSAP plus Theatre is unnecessary complexity; the technical artist must show Theatre genuinely improves authoring.
  - Record decisions in `docs/reviews/2026-10-living-memories.md`.
- **B. Core runtime.** types, compose, gsapClock, behaviours, the Theatre adapter, controller and MemoryAudio, with fakes and unit tests.
- **C. Cereal end to end.** MemoryWindow with boot compile, sketch shapes, the bake pipeline and cereal art, App wiring (with a `?debug` force start), first captures. Polish until convincing before moving on.
- **D. Director.** memories.ts, MemoryDirector, kitchen-light migration, cues, App apply/ended/failed, persisted counts; time to first memory per persona in the playtest.
- **E. Audio.** Engine and Voices changes, cue sheets, the SFX purchase after the dry run (within the approved 600), and the kitchen and bedroom music after its dry run (within the approved 1,200). Both go to the audition sheet.
- **F. Editor.** Editor, Studio, the save plugin, docs, the dist guard.
- **G. The rest.** Stay and happiest, revisit variants, the bleed, quality tiers and reduced motion, then perf, captures, QA, artistic evaluation (technical artist, cinematic director, sound designer, creative director) and fixes.

## Critical files
- **New:** `src/content/memories.ts`, `src/state/MemoryDirector.ts`, `src/memory/*`, `src/world/MemoryWindow.ts`, `scripts/bake-memories.mjs`, `scripts/vite-memory-save.mjs`, `public/memories/**`, `docs/memories.md`.
- **Modified:** `src/state/Director.ts` (ruleMemory → MemoryDirector; reserved, withheld, attending and writeFailed delegate), `src/state/cues.ts`, `src/state/Pacing.ts`, `src/App.ts` (frame step, apply cases, boot compile, visibility, lazy runtime, dev editor import), `src/world/MemoryLight.ts`, `src/world/sketch.ts`, `src/content/drawings.ts`, `src/audio/AudioEngine.ts`, `src/audio/Voices.ts`, `scripts/generate-voices.mjs`, `scripts/generate-music.mjs` (two memory pieces), `public/music/` (shipped memory music), `package.json`, `vite.config.ts`.
- **Reused:** `MemoryLight`'s multiply blend; `bakeDrawing/shapeStrokes` (sketch.ts); `text.anchorOf/attention/wash`; `Lighting.roomLight / warmthNow / dimToChair`; `audio.silence/lift`; `VisitorModel` (gazeId, gazeFor, read, near, encounters, touch); the scheduler and pacing holds; the style.mjs virtual clock.

## Verification
- **Run before every commit:** `npx tsc --noEmit` and `npx vitest run`. The existing memory, director and pacing tests stay green, and seeded sequences are unchanged.
- **New unit tests:**
  - memory-director: eligibility, triggers, tap, stay only once finished, one active at a time, cooldown and cap, look-away and walk-away, linger, revisits, nothing talks over a memory, cereal reachable early for active personas across seeds;
  - compose;
  - behaviours: labels; seek forward and back give identical values; kill leaves no children;
  - controller with a fake timeline: lifecycle, interrupt from every state, pause/resume, follow, 100 rapid start/stop cycles leaving no timelines, listeners or nodes;
  - Theatre state loading;
  - audio with a fake context: schedule times, seeks never replay, pause re-sync, dispose disconnects all;
  - art manifests.
- **Browser:** `tests/playtest/memories.mjs` (virtual clock), desktop 1280×800 and phone 390×844 with touch:
  - captures per memory: untouched wall, first drawing, developing, active, dissolving, residue;
  - program count unchanged; textures back to baseline after completion;
  - requestAnimationFrame registrations equal the App's frames only;
  - a tap on the phone triggers;
  - production reproduces the committed Theatre state.
- **Also:** `npm run build` with the dist grep (no studio, save endpoint or painters); `npm run smoke`, `npm run opening`, `npm run perf`, and `scripts/playtest.ts` diffed against `main`.
- **Reviews:** QA/accessibility tests the build; the artistic specialists evaluate the captures. Report honestly what remains a stand-in.

## Approach review (before stage C)

Reviewed by the creative director, cinematic director, technical artist, sound designer and interaction designer; challenged by the skeptic. Full reports are summarised here. Where a reviewer contradicted the artist's explicit brief, the artist decided (14 October 2026).

### The artist's decisions

| Question | Options put | Artist chose |
|---|---|---|
| Cereal's light | sunlight shifting, kitchen-light as its bleed / evening bulb, dark window | **Sunlight.** When cereal closes naturally the existing kitchen-light patch is its residue on the wall; cereal and kitchen-light are never both offered in one visit. |
| The hallway scene | on "I wanted you to stay." with no figure / move to "the door, slightly open" | **Moved to `door-open`.** A door ajar with a strip of landing light; the "faint shadow passing" only dims the strip; the footsteps stop outside. `stay` keeps its authored arc untouched. |
| First memory | early (~20 s) with an arm latch / not before a second meeting (~75–90 s) | **Early, armed.** A read or tap at any time arms cereal; it commits on the next ≥ 1 s look from 20 s. No visible charge-up strokes. |
| Laughter in cereal | keep, separate take / drop / reuse the next-room recording | **Keep, on a take the next-room situation doesn't use** (or claimed from it while the memory plays). |
| The art | graphite + light / painted colour now / the artist paints | **Painted colour layers now**, code-painted in the replaceable layer format. |
| Kitchen music | guitar at home / half-heard kitchen radio / piano | **A half-heard kitchen radio** on the windowsill, band-limited by the engine. |
| Bedroom music | new, after hearing cereal / piano-warm downstairs / none | **New music, generated only after the kitchen's has been heard**, to the bedroom's measured length; piano-warm may be tried in place first at no cost. |
| "No music in the first two minutes" | lift it inside memories / keep it | **Lifted inside a memory** the visitor opened. Room music keeps the rule. |

### Decided by the main session, and why

- **GSAP's ticker re-sleeps after every seek** (skeptic, verified: 61 callbacks a second after one seek). Every seek goes through `gsapClock.seek`; a unit test fails without it. A Playwright rAF count stays in stage C.
- **Roles.** Theatre owns everything specific to one image (light curves, layer strengths, holds, where the withdrawal starts, the `sfx:`/`bed:`/`music:` markers). GSAP owns only the grammar shared by every memory: emerge, dissolve, interrupt exit, residue decay, one named-layer breath; its durations come from Theatre's section markers (cinematic director, endorsed by the skeptic).
- **Gates for both dependencies** (the artist asked for both, so neither is removed now):
  - GSAP: no ticker loop (test), and one envelope edit visibly changes every memory.
  - Theatre: the artist makes at least one saved change in Studio that a production capture reproduces. A minimal `?memory&studio` path (Studio plus its own export) moves forward into stage C so this can be met; if the artist hasn't used Studio by the end of stage D, the timelines fall back to the `Key[]` arrays in `seed.ts` and `@theatre/*` is dropped.
- **Render model: pigment multiplied into the lit plaster plus a light term** (technical artist; the model `MemoryLight` already proved). The room's dims, the chair's shadow and the plaster's relief act on the painting; no `uRoomLit`, no plaster sampler, no `grain`.
- **Painted colour within limits** (cinematic director, creative director, applied to the artist's choice): the room's own hand (graphite underdrawing that stays visible, wax-crayon fill that skips on the tooth, at most three colours per scene), painted values about 105–205 display, local saturation about ≤ 0.35, warmth carried mostly by the memory's light. Bare plaster is reserved round the words; the ink is drawn on top.
- **Parallax 0 in v1** (skeptic, computed: 0.08 mm while standing at 6 cm depth). The renderer supports up to 2 cm, soft-clamped, from a smoothed eye; the seeds use depth 0.
- **Two perceptible movements, not six stages:** the light finds the drawing (graphite first), then the scene settles. The mask is the shape of the memory's light, not an ink bloom from the words.
- **Window size** about 0.9 × 0.6 m, anchored on the actual written item on whatever wall it is (cereal is usually moved north beside "I wanted you to"); kept clear of the stay line.
- **Triggers** (interaction designer, skeptic): arm on read or tap; commit on a later ≥ 1 s look; a tap on the memory's line or window means "I'm staying"; a tap elsewhere releases it. Release judged by the window, not `gazeId`; minimum hold before a look-away can end it; walking toward the wall never releases. One active memory at a time; cooldown 45–60 s; each scene once per visit.
- **Clock.** The memory advances by the audio clock while it runs, real time otherwise (`MemoryClock`); fades are issued on state transitions, never precomputed.
- **Sound** (sound designer): files generated close and dry at an even level, distance made in the engine (distance prompts measured −54 to −64 dB); per-event panners; the memory's own small room, never the white room's reverb; no `behind` placement; beds are state (never restarted by a seek), music is timeline; authored levels, no normalising; memory files loaded on prepare, not on arrival; captions for every memory sound. `style-distant-2`, `sfx-cup` and `sfx-chair-creak` are not reused.
- **Music timing.** Built after the cereal's visuals and SFX; its length is set from the authored sequence (music enters when the scene has formed), then a music dry run at that length.
- **Order and the gate before the other two scenes** (skeptic): cereal end to end first, no revisit art. Before `door-open` and the bedroom: the artist has seen and heard cereal; the fixed playtest harness (moved lines credited to their real wall, a "notices new writing" behaviour whose probabilities are committed before measuring) shows the bedroom's line is reachable; no new rAF loops or compiles. Revisits erode the same sheet (fewer layers, no music) rather than new art.
- **Kept small:** at most three legible objects per memory (cereal: the box left on the table, two bowls that don't match, a spoon); no door closing in the hallway; curtain motion only in the bedroom; no floor bleed in v1; kitchen-light keeps its tuned rule until the new director has earned the migration; the editor is a small bar on top of Studio, not a custom inspector.

## Cereal, built and evaluated (stage C–E)

Evaluated after implementation by the cinematic director, creative director, technical artist and sound designer (captures in `test-output/review/memories/`, offline audio renders of the real chain), with QA/accessibility testing the build.

What they found, and what was done:

| Finding | Who | Done |
|---|---|---|
| One unbroken 2.5 s look both armed and began it: the "stare and get a picture" lesson | creative | Begins only on a look *back* (eyes elsewhere ≥ 2 s, then ≥ 1 s on the line); a touch is intent. Test fails on the old path. |
| The box sat behind "perfect."; the reserve round the words removed only 45 % | creative, cinematic, technical | A band at the painting's top is kept for the words (the window is placed by it); reserve 0.85; the box lower, red softer (saturation within the agreed limit). |
| An 8 s frozen hold for a visitor who stays; spoon-down after the light had started to go | cinematic | maxHold = exit = 22 s; spoon-down leads the withdrawal by 0.8 s. |
| The living phase was a still image (3.5 cm drift in 16 s) | cinematic, creative | One arc of light: the pane slides off the words to the table, lifts after the laugh, the evening goes down. |
| The dissolve was back-loaded; the drawing never stood alone | cinematic, technical | Natural dissolve `sine.inOut`; colour goes by 70 %, then the graphite alone, then plaster. |
| The painted sun was double-warmed (salmon) and the bleed arrived later, larger and elsewhere | technical, cinematic, creative | Sun painted white, coloured by `light.warmth` (≈ kitchen-light's colour); the bleed starts at exit + 2 s at the painted pane's size, position and slant (MemoryLight.startPane). |
| Ruled lines and a hard rectangular crop read as a panel | creative, cinematic | Graphite drawn in wobbling runs; the table stops short, raggedly. |
| `later` was fuller, not eroded | creative | Both bowls empty, the box on its side, a spoon on the table. |
| The laugh was masked by the radio and came after early leavers had gone | sound | Laugh +4 dB, radio −3 dB, spoons +2 dB; laugh at 10.5 s (inside the minimum hold). |
| The recorded kitchen air was 75 % sub-bass, its leaves repeating every 8 s | sound | The air is made in the engine (`synthAir.ts`); no more credits on recorded room tone. |
| A frame stall > 0.5 s silently dropped the radio | sound | A stall passes one-shots but owes beds and music, started part-way in (tested). |
| Room music and room silences could override the memory's hush | sound | The memory has its own duck stage (multiplying) and stops the room's music while it plays. |
| Studio: "Play on" re-froze; edits only showed after the playhead moved | technical | The editor ignores the controller's own writes; a held memory re-reads Theatre every frame. |
| Serial loading after the commit; leaks on failure or overlap | technical | Parallel, cached, prefetched when the line is written; cleaned up on failure; a generation token guards overlap. |
| Save endpoint accepted cross-origin simple POSTs | technical | Same-origin JSON only. |
| Hints shown over a forming memory | cinematic | No hints while a memory plays. |

Not done, and why:
- **The curtain** (creative: remove it; outside three objects). The artist asked for a curtain in this memory; it is kept, paler and still. Its motion stays the bedroom's.
- **The radio's prompt** (creative: "advert music"). It is the artist's choice to keep, retake or drop, by ear; the rebalance has lowered it under the people. No retake without the artist.
- **"The box ran out"** (creative): the last flakes are painted into the second bowl (free); a box-shake sound would be a new paid generation and waits for the artist.
- **A cooler return of the kitchen's light later in the visit** (creative): a new event; for the skeptic and the artist first.

Measured reachability (fixed harness, 8 seeds × 300 s): cereal opens for the reader 7/8 (median 22 s), the explorer 4/8 (64 s), phone and still rarely, the chair visitor not at all; the bedroom's and the door's lines are read ≥ 2 s in at most 1/8 visits for any persona. **The gate before the other two scenes is not met**: their lines must first be offered the way kitchen-light's is (written alone where the visitor faces, a short hold), then measured again. The remaining SFX for them are prompted and dry-run (7 sounds, ~252 credits of the 341 left) but not generated.

Spend so far: SFX 259 of 600 (four sounds, one retake); memory music 385 of 1,200 (the radio). Nothing has been judged by ear yet: every new take is pending on the audition sheet.

## The bedroom and the door (stage G)

The artist approved cereal and its four sounds, then asked for both remaining memories, with spending as approved. Reachability first: the bedroom's and the door's lines are **offered** the way kitchen-light's is (written alone on the wall the visitor faces, a short hold, never into a busy room). In the fixed harness that met the gate (each line read ≥ 2 s in ≥ 30 % of visits for every persona).

Built: the bedroom (single unmade bed, net-curtained window, a curtain, morning sun, a bird, someone downstairs playing the piano; dusk revisit) and the door (a child's view of the bedroom door ajar and the landing light). Generated after dry runs: 7 SFX (233 credits; SFX total 492 of 600) and the bedroom's piano (358 credits by balance difference; memory music 743 of 1,200).

Evaluated by the creative director, cinematic director and sound designer (QA in progress at the time of writing). The artist decided three points they raised:

| Question | Artist chose |
|---|---|
| The door formed above the unfinished "I wanted you to", reading as its ending | **It opens from the room's own drawn door** (`ghost-door`, south wall, since the visit began): the painted door registers onto the drawing's lines; its line is written beside it, and looking at the drawing counts as reading it. |
| Which door first | **The steps stop outside first** (the artist's original wording); passing is the revisit. |
| An arc across the visit (company → solitude → absence) | **Kept**: cereal only early and never after another memory; the bedroom answers the room's long dark silence; the door only after another memory. |

Also done from the evaluation:
- **The door:** the shadow is a shade layer that takes light away (no figure, no paint). The white room goes to evening while it plays (its own dim), so the landing light is the brightest thing there. The painting has a floor wedge of light toward the bed, and the bedroom's blanket in the corner (the same room).
- **The bedroom:**
  - one arc: the morning gets on, and the sun reaches the pillow's dent;
  - one curtain lift on its sound, a hanging sway with the top on the rod, none under reduced motion;
  - sound leads;
  - the second bird is cut;
  - the piano starts as an event and rings out at a natural close;
  - the duvet is thrown back and there is a mug on the floor;
  - at dusk the sun is on the wall above the bed and goes down.
- **Placement:** a line too low for a painting below gets it above; paintings step off drawings already on the wall.
- **The room waits for a memory:** phase turns wait until it ends (+6 s), silences and new writing are held, and a memory begun from the panel holds the room too.
- **Sound** (offline renders):
  - the approach steps use the clearer take (88 % of take 2's energy was below 300 Hz), coming from further and stopping close;
  - the passing walker is loudest at the door;
  - one-shots are mono before their panner (a stereo creak had landed 9 dB to the left);
  - the curtain is +6 dB;
  - the piano is quieter and darker ("downstairs");
  - the bird fades in;
  - the air's leaves are now audible.

Measured after (fixed harness, 8 seeds; 7- and 10-minute visits):
- The bedroom opens in 1–3 of 8 visits per persona.
- **The door is rare: 0/40 in 7 minutes, 2/40 in 10 minutes** (the arc, the offer and the south wall together).
- Cereal: the reader 7/8 (median 22 s), the explorer 2/8. Others rarely, since cereal is now early-only.

A way to make the door reachable without breaking the arc (a quiet sound from beyond the south wall, inviting a turn) is a new design element for the artist to decide.

Not done:
- The creative director's suggestion to fold the side curtain into the net curtain: the artist asked for a curtain.
- A curtain retake (cloth rather than air) and a footsteps gain curve: both wait for the artist's ear.
