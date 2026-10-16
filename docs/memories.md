# Living memories: how they work and how to author them

A line on the wall can open into a memory: the light finds a pencil drawing under the words, colour follows the light, the scene lives for a while, then the light recedes, taking the colour, and the graphite sinks last. Sometimes something stays in the room (cereal leaves the kitchen's late sun on the wall). The decisions behind it are in `docs/reviews/2026-10-living-memories.md`.

## The parts

| Part | File | What it owns |
|---|---|---|
| Definitions | `src/memory/defs.ts` | each memory's layers, seed timeline, cue sheet, exit and residue |
| Authored timelines | `src/memory/theatre-state.json` (Theatre.js) | everything specific to one image: light curves, layer strengths, holds, section and sound markers |
| Procedural behaviours | `src/memory/behaviours.ts` (GSAP, paused) | the grammar every memory shares: emerge, dissolve, interrupted exit, residue |
| Composition | `src/memory/compose.ts` | one writer per value: authored base × envelopes |
| Playback | `src/memory/MemoryPlaybackController.ts` | the lifecycle `dormant → emerging → active → withdrawing → residue → complete`, interruption from any state, pause, scrub |
| Clock | `src/memory/clock.ts` | a memory advances by the audio clock while sound runs; nothing else ticks |
| Sound | `src/memory/MemoryAudio.ts`, `cueSheet.ts` | cue sheets on the memory bus; each event once, never on a seek |
| Renderer | `src/world/MemoryWindow.ts` | the painting multiplied into the lit plaster, plus its light; ink on top |
| Runtime | `src/memory/runtime.ts` | a lazy chunk (GSAP, Theatre, the controller) that prepares and plays a memory |
| Art | `public/memories/<id>/<variant>/<layer>.webp` | code-painted stand-ins (`src/memory/paint/`), replaceable; the woodland's cut from the artist's references (`scripts/cut-woodland.py`) |
| Living scene | `src/memory/living/`, `src/world/living/` | a memory that is animated and entered (the woodland): its painting and people drawn into one render target; the way in and out |

The App steps the playing memory once a frame (`App.stepLivingMemory`). GSAP's timelines are paused and seeked; its ticker is put back to sleep after every seek (a test fails otherwise). Theatre's sequence position is set by the controller and read back at once; production never plays a sequence.

## Living memories (animated, and entered)

The woodland ("five more minutes", `docs/reviews/2026-10-woodland.md`) is the first. It runs on the same controller, clock, timeline and sound as the others; what is new:

- **Its scene** (`src/memory/living/LivingScene.ts`): four kinds of thing drawn through one program into one render target (which the wall's window shows as its first layer, and the immersion shows on the screen), on twos (12 a second), only when something it shows changed, and only the part of the painting on the screen:
  - the painting: one plate, its grass moved by a long wave of wind (strongest in the near grass, up to ~10 painting px at the tips), its leaves at their edges against the sky, the sky in the canopy's gap drifting behind the leaves (its own layer), the painted sun flecks shifting as the leaves above them move;
  - the near flowers: ~20 heads cut from the plate (grass cloned in behind them), each a strip bent about its root in the grass;
  - the people, as a puppet: one cut-out (an atlas: the body, and her forearm on its own row, with the grass beside it mirrored underneath) on a mesh finer at the faces and hands, moved by 24 soft deformers named in the art manifest (chests swelling and rising, heads rolling and lifting, faces sliding, irises, loose locks of hair, his hand, her resting hand, her crossed foot, her shoulder and settle; her forearm slides back along itself under her sleeve); lids drawn shut and half for blinks on twos;
  - what is in the air: motes seen only in the light, two seeds, a leaf in each afternoon gust.
- **Its involuntary life** (`performance.ts`, `woodland.ts`): one wind (`windForce`: a breeze of a few incommensurate sines plus three authored gusts) that everything answers as a spring (`windResponse`, closed form: grass, flowers, leaves, hair) or is carried by (`windDrift`: motes, seeds); breathing (irregular, per person, a breath held off at the touch); blinks by hand. Pure functions of the memory's time: seekable.
- **What they do on purpose** is on the timeline, in Studio: `figure:a` / `figure:b` (`head`, `look`, `eyes`, `hand`, `fingers`, `foot`, `shoulder`, `settle`, `breath`) and `scene` (`life`, `immerse`, `breeze`, `after`, `people`, `dusk`, `colour`); see `src/memory/sheets.ts` for each one's meaning.
- **Going in and back** (`src/world/living/Inside.ts`, `Immersion.ts`): `scene.immerse` 0→1 spreads the painting over the plaster (from its part round the line to all of it, fixed on the wall), carries the visitor square to it, then a screen-space settle makes it all there is; and back, to exactly where they stood. Reduced motion: no carry, a crossfade. While inside, look and walk are the memory's: a new turn backs the move off in proportion, 30° (or a step held 0.35 s) lets it go (it reverses and hands control back half-way out, turned the way they turned). Taps do nothing; Escape pauses.
- **The cut** (`scene.after`, `scene.people`, held keys): on one frame the same composition later (its own painting) with nobody in it. Never in between; seeking either way is exact.
- **Its sound** (`src/memory/synthWoods.ts`): not loops but takes laid along its timeline (`music:` cues; `wide` ones keep their stereo).
- **The revisit** (`empty`) has no living scene: it plays on the wall like any memory.

### Moving the cut, the hold, the touch

In Studio (`?memory&studio`, choose `woodland` / `afternoon`): select `scene` and drag the held keys of `after` and `people` together (they are one frame); move `scene.immerse`'s last two keys and the `exit` marker to change the hold; `figure:b.hand` is her reach (0 drawn back, 1 where the drawing has it), `figure:a.hand` his answer. The synthesised sound is timed in `TIMES` in `synthWoods.ts` (move it with the picture).

## Authoring in Theatre Studio (development only)

```
npm run dev
open http://localhost:5173/?memory&studio
```

Go in, then use the bar at the top (sections and sound markers are read when a memory starts: after moving one, press **Start** again): choose the memory and variant, press **Start**. The visitor walks to where the memory is seen whole and it begins; it is then held wherever Studio's playhead is. Scrub, play and keyframe in Studio's sequence editor (bottom); select objects in the outline (left: `window`, `light`, `layer:*`) to edit their values. Nothing sounds while scrubbing. **Play on** lets the memory run from where it is, as a visitor would see it (with sound); **Release** and **Interrupt** show its two ways of leaving.

When it looks right, press **Save to repo**: the dev server writes `src/memory/theatre-state.json`. Commit that file; the production build plays exactly it, without Studio. (**Download** gives the same file if the dev server can't write.) Studio also keeps unsaved work in the browser; if it ever asks whether to use the browser's state or the project's, choose the browser's to keep unsaved edits, or the project's to start from what is committed. Never rely on the browser alone: only the committed file ships.

What each value means:

- `window.sketch`, `window.reveal`: how far the light has found the pencil drawing, and the colour (0–1). The colour follows the drawing.
- `window.scale`, `offsetX`, `offsetY`: the painting's size relative to its line (1 ≈ as wide as the words) and a nudge from where it sits, its top just above the words.
- `window.presence`: the whole memory's strength. `window.parallax`: depth (0 in this version; it can't be seen standing still).
- The words are written across a band at the painting's top kept bare (`band` in the art manifest); the window is placed so they sit in it.
- `light.x`, `light.y`, `light.radius`, `light.soft`: where the memory's light pool falls in the painting (metres from its centre), how big and how soft. The pool is what is revealed.
- `light.warmth` (kelvin) and `light.intensity`: its colour and strength (light layers are painted white: their colour is this). `light.roomSpill`: how strongly its light stays in the room after a natural close (the bleed, which starts at the painted sun's pane, `bleedAt` seconds after `exit`).
- `layer:<name>.opacity`, `.x`, `.y`, `.depth`: each painted layer's strength and a small offset (metres).

Sections and sounds are **markers** on the sequence: `active` (the scene is formed), `exit` (the authored withdrawal begins; the scene holds just before it while the visitor stays), `residue`, `end`; and `sfx:<name>`, `bed:<name>`, `music:<name>`, whose sounds are in the memory's cue sheet (`defs.ts`).

### Common changes

- **Change when the curtain, the sun or a layer moves**: select its object, find its keyframes in the sequence editor, drag them along the time axis. Drag a keyframe's curve handles (or right-click → easing) to change how it moves.
- **Move a light or a shadow**: select `light` (or the layer), scrub to the moment, change `x`/`y` in the panel; a keyframe is made if the prop is sequenced (right-click the prop → *Sequence* if it isn't).
- **Adjust a light**: `light.intensity` and `light.warmth`, at the moment you want, keyframed.
- **Hold a moment longer**: select all keyframes after the moment (drag a box in the sequence editor) and drag them later, then move the `exit`, `residue` and `end` markers by the same amount. Sound markers after it move with them.
- **Move a sound**: drag its `sfx:`/`bed:`/`music:` marker.

## Replacing the art

Each layer is a WebP (or PNG) in `public/memories/<id>/<variant>/`: `<layer>.webp` (1200 px wide) and `<layer>@low.webp` (768 px, phones), same aspect as the painting (`size` in the memory's `manifest.json`), RGBA, sRGB, transparent where nothing is painted. Pigment layers are multiplied into the plaster (white is no paint); `light` layers are added light (black is none); the `sketch` layer is the graphite, found by the light first. Drop a replacement in under the same name and set its entry's `source` to `"artist"` in the manifest so a re-bake never overwrites it. No code change is needed.

The code-painted stand-ins are re-baked with `npm run bake:memories` (Chromium, offline; the painters never ship). A new memory's first timeline is written with `npm run memories:seed`, which never touches a sheet already in the state unless forced.

## Checks

- `npx vitest run`: the controller, behaviours (and GSAP's ticker staying asleep), cue dispatch, memory audio, the Theatre adapter, and that every authored prop, layer and sound exists.
- `npm run build` fails if Studio, the editor, the save endpoint or the painters reach `dist/`.
- `node tests/playtest/memories.mjs` (with `vite preview` running): every stage on desktop and phone, no shader compiles after entry, textures back to the same count after a second play.

## What is a stand-in

- All memory art is code-painted (wax crayon, graphite, light) in the replaceable format.
- The kitchen radio is `public/music/memory-radio-folk-c.mp3`, a folk waltz the artist chose from four options. The first radio and the other options were turned down; their files are in `audition/music/` for the sheet only.
- The kitchen's air is made in the engine (`src/memory/synthAir.ts`), not recorded.
- Every new sound is `review: pending` until the artist has listened on the audition sheet.
- **The woodland** (in numbers, so nothing is overclaimed):
  - The people are a cut-out of the artist's character sheet (`02`), placed at 0.64 of the sheet onto the day painting (`04`) (their texture is cut at 0.8), keyed off its ivory, light-matched, with generated grass over their edges and a contact shadow. Every movement is a warp of that one drawing, or (her forearm) a rigid slide of a part cut from it: her forearm travels 18 sheet px (about 9 screen px at 1280) along itself; breath rises ~6 sheet px at the chest (~3 screen px); a look is a roll of ≤ 7° at the neck with the features sliding 3 px and the irises 3 px: not a turn of the head (the sheet's turned heads don't register with the lying pose). Whether this reads as people, on your screen, is yours to judge; it is not "convincing human motion" because the numbers move.
  - Blinks are painted-over lids (shut, half) on the same cut-out.
  - The near flowers, the drifting sky and the moving light are cut from or derived from the artist's paintings; the motes, seeds and falling leaves are drawn in the shader (procedural, not painted).
  - The pressed grass after the cut is a code-made smoothing of the dusk painting, not drawn.
  - Every woodland sound is synthesised (the cicadas by day, the evening cicadas after the cut, the leaves, grass, the last evening cicada): stand-ins. A listening mix of the afternoon is rendered to `test-output/review/woodland/woodland-afternoon-mix.wav` (`scratchpad`-free: `npx vite-node` on `renderCicadas`/`renderWoods`); the near cicada and the clearing take about 0.1 s and 1.1 s to render on a desktop (in slices, while the memory prepares): measure on a phone.
  - Asked for in production (each replaces a stand-in by name), drawn in place at the top panel's scale and pose: her reach (4–6 drawings of the forearm and hand, the fingers at contact) and his answer (1–2), her head turning toward him (3), his look aside (2), blinks (shut, half, per person), her foot rocking (2), breath shapes for both shirts; a drawn close-up of the hands if a cut to it is ever wanted; the pressed grass painted onto the dusk plate; recorded cicadas in a summer wood by day, and evening cicadas at dusk (1–2 min each), leaves in a light wind, grass and cloth under a hand, and two people breathing close, lying down (only with the artist's approval of any paid generation).
