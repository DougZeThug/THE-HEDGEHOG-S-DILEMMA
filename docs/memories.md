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
| Art | `public/memories/<id>/<variant>/<layer>.webp` | code-painted stand-ins (`src/memory/paint/`), replaceable |

The App steps the playing memory once a frame (`App.stepLivingMemory`). GSAP's timelines are paused and seeked; its ticker is put back to sleep after every seek (a test fails otherwise). Theatre's sequence position is set by the controller and read back at once; production never plays a sequence.

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
- The kitchen radio (`public/music/memory-radio.mp3`) was generated, then turned down by the artist on the audition sheet: cereal plays without music. The file stays for the sheet only.
- The kitchen's air is made in the engine (`src/memory/synthAir.ts`), not recorded.
- Every new sound is `review: pending` until the artist has listened on the audition sheet.
