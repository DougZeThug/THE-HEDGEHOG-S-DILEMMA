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
