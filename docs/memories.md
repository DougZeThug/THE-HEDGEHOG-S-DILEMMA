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
| Clock | `src/memory/clock.ts` | a memory advances by the audio clock while sound runs, however long a frame took (a vignette's is capped at a second); nothing else ticks |
| Sound | `src/memory/MemoryAudio.ts`, `cueSheet.ts` | cue sheets on the memory bus; each event once, never on a seek; one anchor: every cue placed from the frame's one reading of the audio clock, sent ahead of the picture by the sound's reported way to the ear |
| Renderer | `src/world/MemoryWindow.ts` | the painting multiplied into the lit plaster, plus its light; ink on top |
| Runtime | `src/memory/runtime.ts` | a lazy chunk (GSAP, Theatre, the controller) that prepares and plays a memory |
| Art | `public/memories/<id>/<variant>/<layer>.webp` | code-painted stand-ins (`src/memory/paint/`), replaceable; the woodland's cut from the artist's references (`scripts/cut-woodland.py`) |
| Living scene | `src/memory/living/`, `src/world/living/` | a memory that is animated and entered (the woodland): its painting and people drawn into one render target; the way in and out |

The App steps the playing memory once a frame (`App.stepLivingMemory`), with one reading of the audio clock that its clock and every sound it schedules, resumes or brings back share (its position 0 is the instant it began, for its first sounds and its first frame alike). If its sound stops (or isn't running yet as it begins) it waits for it, and is let go uncounted after ten seconds visible without it. Its art and recordings are fetched when its line is armed, or as soon as it may be offered (`MemoryDirector.comingSoon`), and decoded only as it begins (`runtime.prefetch`). GSAP's timelines are paused and seeked; its ticker is put back to sleep after every seek (a test fails otherwise). Theatre's sequence position is set by the controller and read back at once; production never plays a sequence.

## Living memories (animated, and entered)

The woodland ("five more minutes", `docs/reviews/2026-10-woodland.md`) is the first. It runs on the same controller, clock, timeline and sound as the others; what is new:

- **Its scene** (`src/memory/living/LivingScene.ts`): four kinds of thing drawn through one program into one render target (which the wall's window shows as its first layer, and the immersion shows on the screen), on twos (12 a second), only when something it shows changed, and only the part of the painting on the screen:
  - the painting: one plate, its grass moved by a long wave of wind (strongest in the near grass, up to ~10 painting px at the tips), its leaves at their edges against the sky, the sky in the canopy's gap drifting behind the leaves (its own layer), the painted sun flecks shifting as the leaves above them move;
  - the near flowers: ~20 heads cut from the plate (grass cloned in behind them), each a strip bent about its root in the grass;
  - the people, as a puppet: one cut-out (an atlas: the body, and her forearm on its own row, with the grass beside it mirrored underneath) on a mesh finer at the faces and hands, moved by 24 soft deformers named in the art manifest (chests swelling and rising, heads rolling and lifting, faces sliding, irises, loose locks of hair, his hand, her resting hand, her crossed foot, her shoulder and settle; her forearm slides back along itself under her sleeve); lids drawn shut and half for blinks on twos;
  - what is in the air: motes seen only in the light (no seeds: drawn as a bright star gliding across the wood, they read as magic; no falling leaf: a 5×10 px sprite sliding down a trunk).
  - the two-shot (shot 4, `scene.shot` 1; `scripts/two-shot.py`): the two of them close, one locked frame, drawn by the same puppet from the character sheet's own top panel at twice the sheet's size (a 2× anime upscale, the artist's choice; the phone's set the sheet's own size), over the ground round them (the day painting's own grass, out of focus by depth, as is the outer part of their bed). Her turn toward him is her own painted head turned a little in 3D (`scripts/her-turn.py`), laid in by a soft region round everything it moves, in either shot: the timeline keys how far through her turn's drawings she is, on twos (`figure:b.turn`) and the scene shows the drawing nearest to it; their eyes look by moving the iris along each opening, the white filling in where it was (`figure:a.eyes`, `figure:b.eyes`); their bed's grass sways a little on the wide's own wind at the same place on the painting, but close up as clumps, each with its own phase and pace (half as much round their faces), and the light on them is the wide's own leaf light there, so a cut keeps it. Its frame is the screen's: a band of frames by aspect (`near.frames`), chosen as it comes on and held while it lasts; outside 1.3–2.45 there is no two-shot (a 4:3 or narrower screen cut his face, a 21:9 one hers and the hands; upright, a 16:9 two-shot holds one face): the wide, unpushed, with her look and his drawn in it. While it is on, the room's vignette is centred and further out (low, it darkened his face at the frame's edge). A turn of 14° gives it way to the wide; settled facing it again for 1.2 s, it comes back (never within half a second of a beat, his blink included, nor in its last 2 s).
- **Its involuntary life** (`performance.ts`, `woodland.ts`): one wind (`windForce`: a breeze of a few incommensurate sines plus one authored gust, in the first wide; none in the second, the stillest shot, and none over the empty grass, which it marked after the fact) that everything answers as a spring (`windResponse`, closed form: grass, flowers, the canopy (slower, as big trees sway), hair) or is carried by (`windDrift`: motes); breathing (irregular, per person, two rhythms that never meet; nothing in it answers either look: no long pause from just before her look to the cut out, `steady`); blinks by hand, never during a look. Pure functions of the memory's time: seekable.
- **What they do on purpose** is on the timeline, in Studio: `figure:a` / `figure:b` (`head`, `look`, `eyes`, `hand`, `fingers`, `foot`, `shoulder`, `settle`, `breath`) and `scene` (`life`, `approach`, `immerse`, `breeze`, `after`, `people`, `dusk`, `colour`, `shot`), how far through her turn's drawings she is (`figure:b.turn`), and the wall's `window` (`reveal`, `sketch`, `presence`, `wash`); see `src/memory/sheets.ts` for each one's meaning.
- **Going in and back** (`src/world/living/Inside.ts`, `Immersion.ts`): `scene.immerse` 0→1 spreads the painting over the plaster (from its part round the line to all of it, fixed on the wall), carries the visitor square to it, then a screen-space settle makes it all there is (one ease, over its own straight 1.6 s on the timeline, 8.2–9.8 s); and back, to exactly where they stood. On the wall the painting is pigment in the plaster: sunk (0.72), and lifted toward the plaster's own lightness (to it at the colour's front, so the colour comes as a pale wash, not a stain; rendered, its median is 0.45 of the bare plaster's, image 3's 0.42–0.53), its corners rounded, the colour inside a ragged edge and the pencil running on to the plate's edge; its light comes only with its colour. The colour is one front, out from between their faces (`scripts/stroke-order.py`). The room's writing under the painting, its own line too (drawn in order, the painting lies under its words, as in image 3), goes to a trace as soon as the colour reaches any of it, and stays a trace while the pencil is there: it comes back to a white wall after the empty clearing's pencil has been alone a while, or as the painting goes if it is let go early (`src/world/living/wash.ts`, `window.wash`). No other memory washes its words. Reduced motion: no carry, a crossfade, no settle. While inside, look and walk are the memory's: a new turn backs the move off in proportion, 30° (or a step held 0.35 s) lets it go (it reverses and hands control back half-way out, turned the way they turned). Taps do nothing; Escape pauses.
- **The cut** (`scene.after`, `scene.people`, held keys): on one frame the same composition later (its own painting) with nobody in it. Never in between; seeking either way is exact.
- **Its sound**: not loops but takes laid along its timeline (`music:` cues; `wide` ones keep their stereo). The day's insects are made in the engine (`src/memory/synthWoods.ts`); two far birds and the evening's cicadas are generated takes (`scripts/generate-woodland.mjs`, raw in `audition/woodland/`) laid along the timeline offline (`scripts/woodland-stems.ts` → `public/music/woodland-*.mp3`); the piano is the score, rendered from CC0 samples as an old upright heard at the bench, its strings ringing on under the pedal, with the recording's sparse crackle (Ushio's "fable", "our film" and "past" its brief: decisions 109–116; `scripts/woodland-score/` → `public/music/woodland-score.mp3`, its notes, mechanism and crackle in `notes.json`, kept off the picture's moments by `tests/woodland-score.test.ts`). Every sound of the afternoon is cut on one instant at 34.5 (`until`), where the evening's begins (its marker); nothing goes on across it. There is no wind: the breeze is seen, not heard (the artist, 2026-10-20). After the afternoon has been seen the room plays no music of its own that visit (`lastMusic`).
- **The line where the painting was** (`coda` in `defs.ts`; the artist's idea, decisions 119–124, 133–141): as the afternoon goes, as its far cicada ends and the room's writing is back (memory 52.5), the same hand writes "we had all afternoon" just under "five more minutes" and close, beginning within 25 cm of where it begins, inside the painting's former place, 20 cm from all other writing for the rest of the visit (`WallText.writeWithin`, `SurfaceLayout.findUnder`: lines not yet shown give way; a line whose own place is close by is kept off the walls from then on, `Director.keepBack`; with no room, nothing is written; `tests/playtest/woodland-coda-walls.ts` counts how often). Silently, once in a lifetime of visits: only for someone taken in to an afternoon that played on unbroken to there (never on a revisit). A screen reader is told it as it is written. Its aftermath is quiet: stillness and closeness aren't counted while a memory plays or after it (decision 117). `tests/playtest/woodland-coda.mjs` plays it.
- **The revisit** (`empty`) has no living scene: it plays on the wall like any memory, but sunk in the plaster as the afternoon is, and over its words, which go to a trace as its colour comes and come back with its pencil (without, the bare plaster kept round its words took the top half of it).

### Moving the cut, the hold, the touch

In Studio (`?memory&studio`, choose `woodland` / `afternoon`): select `scene` and drag the held keys of `after` and `people` together (they are one frame); move `scene.immerse`'s last two keys and the `exit` marker to change the hold; `figure:b.hand` is her reach (0 drawn back, 1 where the drawing has it), `figure:a.hand` his answer. The shots are `SHOTS` in `src/memory/defs.ts` (the second wide the longest); the synthesised sound reads its times from there (`TIMES` in `synthWoods.ts`: the cut, the shots, the air), and what is heard of a gust follows the canopy's sway.

### A film as a living memory: Almost

"Almost" (`docs/almost.md`, `docs/reviews/2026-10-almost.md`) is a felt stop-motion film photographed
offline in Blender (`scripts/almost/`). It is played in the woodland's place:
- **The scene** is `src/memory/living/FilmScene.ts`. A muted, inline video (VP9, or H.264 where VP9
  doesn't play) is drawn into the same render target, so the wall's window, the way in and the way
  out are the woodland's.
- **One clock.** The timeline key `scene.film` (its seconds) decides the frame. Playing, the video
  plays, kept with the timeline by its rate (a little drift) or a seek aimed ahead (a large one).
  Held, seeked or recorded, it is paused on the exact frame.
- **The way in.** The film's first frame is held while it comes through the plaster as wool fibres,
  then colour (`window.sketch` and `window.reveal` over its order map,
  `scripts/almost/emergence.py`). It starts half a second after the visitor is inside.
- **Its sound** is two cues: the kitchen through the wall, and the film's own material sounds. The
  video is silent.
- **The open-matte frame** (1280×1440) covers a wide screen with its 16:9 band, and an upright phone
  with its 9:16 crop between their faces (`src/memory/living/almost.ts`).
- **The fallback.** If no video plays, the memory is its first photograph, still, as any memory.

To change when the film starts or how long its first frame is held, move `scene.film`'s keys in
Studio (`almost` / `film`), together with the `music:film` marker. To change the film itself,
re-render (`docs/almost.md`).

## Voices in painted memories

A painted memory may be overheard: a few seconds of the people in it talking to each other, after the picture has formed and before its light goes. The decisions are in `docs/reviews/2026-10-overheard.md`.

- **Words and timing.** The words and their times are in `src/content/memory-voices.json` (typed by `src/content/memory-voices.ts`), per memory and variant:
  - speakers (voices from `vignettes.dialogue.json`), lines and beats (sequence seconds, places in the painting);
  - `quiet` windows the picture keeps to itself;
  - optionally, versions chosen by rules and the memory's own sounds re-levelled (`gains`) or left out (`mute`). These are unused so far: there is one version.
- **Playback.** The beats become `voice:` cues and markers on the memory's own sheet and timeline (`withVoices`, in `runtime.ts`). Its clock, interruption, pause and hush are the memory's.
- **Who hears them.** Heard only when every line of the version has a kept take (`vig:<memory>:<line>` in the manifest). Otherwise the memory is wordless, as before.
- **So far:** only cereal's first sitting speaks ("That's my bowl." / "It's the clean one.", then the laugh). The rest are wordless on purpose.
- **Recording.** Recorded and kept like a vignette's lines: `generate-dialogue.mjs --vignettes`, where a take's `vignette` names the memory. They are read through on the audition sheet.
- **Preview.** `?memory=<id>&variant=<v>&voices=<version>` plays it a few seconds after the room opens, with takes not kept yet.

## Authoring in Theatre Studio (development only)

```
npm run dev
open http://localhost:5173/?memory&studio
```

Go in, then use the bar at the top (sections and sound markers are read when a memory starts: after moving one, press **Start** again): choose the memory and variant, press **Start**. The visitor walks to where the memory is seen whole and it begins; it is then held wherever Studio's playhead is. Scrub, play and keyframe in Studio's sequence editor (bottom); select objects in the outline (left: `window`, `light`, `layer:*`) to edit their values. Nothing sounds while scrubbing. **Play on** lets the memory run from where it is, as a visitor would see it (with sound); **Release** and **Interrupt** show its two ways of leaving.

When it looks right, press **Save to repo**: the dev server writes `src/memory/theatre-state.json`. Commit that file; the production build plays exactly it, without Studio. (**Download** gives the same file if the dev server can't write.) Studio also keeps unsaved work in the browser; if it ever asks whether to use the browser's state or the project's, choose the browser's to keep unsaved edits, or the project's to start from what is committed. Never rely on the browser alone: only the committed file ships.

What each value means:

- `window.sketch`, `window.reveal`: how far the light has found the pencil drawing, and the colour (0–1). The colour follows the drawing. The woodland is drawn in order: its order map (`scripts/stroke-order.py`) says when each line comes and when the colour reaches each point, on these two keys' clocks (a test keeps the script's copy of them the same): the pencil out from the words with the two of them last, then, once the drawing is whole, the colour out from them.
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

### The woodland's two-shot and pencil

The woodland is six shots since the artist's brief of 2026-10-18 (`docs/reviews/2026-10-woodland.md`): the room remembers, crossing in, the wide afternoon, the two of them close (her look, then his; their hands as drawn), the wide again, the cut. The two-shot's beats are `TWO_SHOT` in `src/memory/defs.ts` (the spec and the room read them from there; tested).

- The two-shot's art: `python3 scripts/two-shot.py` (from `references/woodland/upscaled/*-top@2x.webp` when they are there: `scripts/upscale.py`, once, offline, CPU, free weights; its output is committed). It writes the atlas, the lids, her turn at both sizes (from `references/woodland/drawings/turn/`, a grid of cells), the ground, the bed's sway map, and `living.afternoon.near` and `figures.heads` in the manifest (`scripts/cut-woodland.py` keeps them).
- Her turn is drawn on twos (`TURN` and `turnDrawings` in `src/memory/defs.ts`): at 17.5 her eyes go to him in two drawings, her head not yet turned (so her eyes lead on every screen: in the wide the soft eye deformers barely move her irises); a moment; then twelve drawings of her head a twelfth of a second apart from 18.0, quickest at about a quarter of a second, settled at 19.0; and she stays there: she never turns back, and his look (24.0) holds too, both to the cut to dusk (the artist's direction; on an upright screen, the wide only, his look is too small to see). Each drawing's key lies exactly on its twelfth, so a film sampled on whole frames holds each for its two frames (tested at 12, 24 and 60 fps). The scene shows the drawing nearest to `figure:b.turn` (`headFor`; the manifest's `at` lists each drawing's value).
- The drawings are made by `python3 scripts/her-turn.py` (offline, free: no model, no network): her own painted head carried in depth, as `docs/animation.md` and `scripts/drawn-rig/README.md` describe. Each drawing is the 2x crop round her head from the upscaled panel (the two-shot's) and the 1x crop from the sheet's own painting turned the same way (the wide's, laid on the sheet as the change the turn makes, so wherever she doesn't move the wide is the sheet exactly), lossless, in `references/woodland/drawings/turn/` with `turn.json`; then run `scripts/two-shot.py`. Change `ANGLE`, `TILT`, `KEEP` or `FAR_HOLD` there, or `TURN` here, and run both again.
- A drawing of his look (his eyes turned to her, his head and mouth unchanged, made the way her takes were), if the artist makes one, replaces the rigged look.
- The timeline says which shot (`scene.shot`), how far through her turn's drawings she is (`figure:b.turn`) and where their eyes are (`figure:*.eyes`): held keys, each change a cut. Retime a look or a blink by dragging its key, then `TWO_SHOT` to match.
- A pencil drawing of the composition (`references/woodland/drawings/pencil.png`) replaces the stand-in graphite: run `python3 scripts/stroke-order.py` (when each line appears on the plaster and the colour after it), then `python3 scripts/cut-woodland.py` if the graphite layer itself should be the drawing.

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
  - The people are a cut-out of the artist's character sheet (`02`), placed at 0.64 of the sheet onto the day painting (`04`) (their texture is cut at 0.8), keyed off its ivory, light-matched, with generated grass over their edges and a contact shadow. In the two-shot they are the same panel at 2× (a Real-ESRGAN anime upscale, chosen by the artist over plain resampling; it re-inks lines a little), keyed the same way, lit by the same light match. Every movement is a warp of that one drawing, her own head turned in 3D under its paint (her turn: `scripts/her-turn.py`), or an iris moved inside its opening: breath rises ~6 sheet px at the chest in the wide, 0.45 of that close; his look moves his irises to the corners of his eyes (about 5 and 3 sheet px) and rolls his head about 2°: a stand-in for a drawing of his look, which doesn't exist. Whether this reads as people, on your screen, is yours to judge; it is not "convincing human motion" because the numbers move.
  - Blinks are painted-over lids (shut, half) on the same cut-out.
  - The near flowers, the drifting sky and the moving light are cut from or derived from the artist's paintings; the motes are drawn in the shader (procedural, not painted). Nothing passes the lens at the crossing: a sprig cut from the day painting was tried twice and taken out (it read as a dark flick); the kit asks for a drawing of it (`c2-leaves.png`, optional).
  - The pressed grass after the cut is a code-made smoothing of the dusk painting, not drawn.
  - The woodland's sound is a mix of stand-ins (`review: pending` until the artist has listened): the day's insects are synthesised; the wind, the birds and the evening's cicadas are generated (2,112 credits, 2026-10-19); the score is a sampled upright playing a written tune (decisions 62–76, 109–116; the piano alone, without its texture, is rendered beside it for the artist to compare). There is no breath and no grass under a hand: nothing synthesised has stood in for a person. A listening mix of the afternoon is rendered to `test-output/review/woodland/woodland-afternoon-mix.wav` (`scratchpad`-free: `npx vite-node` on `renderCicadas`/`renderWoods`); the near cicada and the clearing take about 0.1 s and 1.1 s to render on a desktop (in slices, while the memory prepares): measure on a phone.
  - The two-shot's ground is the day painting's grass where they lie, stretched a little taller than wide (the painting sees it at a slant) and blurred by depth: not painted for this view.
  - The pencil on the plaster in shot 1 is a stand-in: an edge filter of the painting, and it reads as one. It appears out from the words, light marks first, the two of them last.
  - Asked for in production (each replaces a stand-in by name): the drawings in the kit (`pencil.png`, his look; without `pencil-after.png` the way back uses `pencil.png` with the two of them taken out; optional, `c2-leaves.png` for the lens and `colour-extent.png` for where the colour goes on the wall, neither wired in until it exists); the pressed grass painted onto the dusk plate; recorded cicadas in a summer wood by day, and evening cicadas at dusk (1–2 min each), leaves in a light wind, and, optionally, a voice memo of two people breathing, lying down (the kit's specification; any paid generation only with the artist's approval).
