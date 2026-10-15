# Five More Minutes (woodland): review record

The first animated living memory. Proposal below (as planned before review); decisions after review are recorded in **Decisions** at the end.

## Proposal


## Context

The installation's memories today are small painted windows multiplied into the plaster
(`src/world/MemoryWindow.ts`): code-painted crayon stand-ins, six static layers, a light pool that
reveals graphite then colour, ~20–30 s, never larger than ~1.3 m on the wall. The artist wants a new
class of memory: a fully animated painterly scene the visitor *sinks into* through the wall, with two
people who breathe and nearly touch hands, then disappear before the clearing does.

The artist supplied four images (in the session's upload dir; to be committed to
`references/woodland/`):
1. `01-dusk.webp`: the clearing at dusk, empty (1672×941).
2. `02-characters.webp`: character sheet, two figures lying in grass + turnarounds + close-ups
   (head turned, hands in grass), on an ivory ground (1448×1086).
3. `03-wall-concept.webp`: the target: the clearing bleeding out of white plaster, graphite fringe,
   vines spilling to the floor, the chair in the room.
4. `04-day.webp`: the clearing in afternoon light, empty (1672×941). The clean plate.

Decisions already made with the artist:
- **Use the images directly** as production layers (cut/keyed offline). This memory deliberately
  leaves the crayon/three-colour rule of the other memories: it is fuller and painterly.
- **Dusk**: during *Remaining* the light lowers toward dusk while the people stay; the **revisit
  variant is the empty clearing at dusk**.
- **Anchor**: a new handwritten line, silent (no voice, nothing generated or bought): *five more minutes*.

Measured: plates 1 and 4 are the same composition but not pixel-registered (gradient correlation
0.42–0.45, best at +2 px). So dusk is applied as a low-frequency colour transfer onto the day plate
(no ghosting), and the revisit can use the real dusk plate.

## Approach in one paragraph

Extend the existing memory pipeline, not a parallel engine. A memory def can now carry a `living`
scene: an offscreen 2D scene (orthographic camera, a handful of textured quads with shader-driven
motion) rendered into one render target each frame by the App's single loop, from the controller's
composed `final` values and local time `t`. That render target is fed to the existing
`MemoryWindow` as its pigment layer (so the wall stage keeps the graphite-then-colour emergence and
words reserve, image 3), and to a new screen-space `Immersion` pass that grows the same image
continuously out of the wall's projected quad until it fills the view, then reverses. All motion is
a pure function of memory time (seekable, scrub-safe, no tickers); authored gestures are Theatre
props; GSAP stays paused and seeked.

## Phase 0 — review before building (CLAUDE.md protocol)

1. Write the proposed approach (this plan, condensed) to `docs/reviews/2026-10-woodland.md`.
2. Run in parallel: `creative-director`, `cinematic-director`, `technical-artist`, `sound-designer`,
   `interaction-designer` on the approach + the four references. Then `skeptic` on their reports.
3. Reconcile in the main session; record decisions and why in the review doc. Expected open
   questions for them: where in the visit arc it sits; whether a push-in toward the hands is right;
   motes or no motes; residue; how leaving during immersion works.

## Phase 1 — art preparation (offline, Python + PIL/numpy, never shipped)

`scripts/cut-woodland.py` (run with `python3 -I`; reads `references/woodland/`, writes
`public/memories/woodland/`), plus `manifest.json` in the existing format extended with a `living`
block. Every output marked `source: "cut from artist reference"`; replaceable by name like other art.

(`npm install` first: `node_modules` is absent in this container.)

Environment (from `04-day`, 1672×941 → 1672 and @low 1280 wide, WebP q≈88):
- `plate.webp`: the full day plate (opaque base).
- `sky.webp`: sky/cloud gap (colour-keyed, feathered) for a slow cloud drift.
- `mid.webp`: midground trunks + canopy (hand-authored polygons refined by colour key), so it
  parallaxes slightly against the backdrop; holes behind it inpainted by iterative blur-fill.
- `fore.webp`: foreground grass, flowers, rocks band (bottom ~35%), same treatment.
- `motion.webp`: an RGBA *motion map* (R = sway amplitude, G = stiffness/root→tip gradient,
  B = phase seed, A = leaf vs grass class), authored from colour/luminance keys + polygons: trunks,
  rocks and log 0; leaves medium; grass tips high. This is what keeps grass and leaves moving
  without everything oscillating together.
- `light.webp`: where sun lands (luminance-derived) to gate the dappled light.
- `dusk-grade.webp`: low-frequency ratio blur(dusk)/blur(day) (~1/40 width blur), so dusk is
  `day × grade` with no structural ghosting.
- `sketch.webp`: graphite underdrawing derived from the plate (difference-of-Gaussians edges,
  thresholded, graphite tone), for the wall stage's "light finds the pencil first" (image 3's fringe).
- Revisit: `dusk/plate.webp` (from `01-dusk`, re-registered by the measured offset), sharing
  `motion`/`sketch` maps.

Characters (from `02-characters` top panel, ivory ground keyed out with a feathered chroma/value key):
- Placed in the clearing where image 3 places them (heads toward the left trunk, feet right),
  scaled to image 3's proportion (~45% of frame width).
- Split into parts with hand-authored polygons: per figure `body`, `head`, `near-hand`
  (+ A's `hair` strands region tagged for breeze response in a per-figure motion map). Under each
  moving part, the body layer is filled (clone/blur-fill) so a small move never opens a hole.
- Alternate poses cut from the sheet's close-ups, scaled/registered to the wide pose:
  `b-head-turned` (the girl's close-up looking toward him) and `a-head-turned` (his close-up with
  arm behind head, looking aside). Crossfaded with a small authored rotation about the neck pivot,
  never by rotating a flat face more than ~4°.
- Blink frames: eyelids painted offline (skin tone sampled beside each eye, a lash line), one small
  patch per figure.
- `tufts.webp`: grass that overlaps the figures' lower contours (plate grass, blade-shaped alpha
  generated along the silhouette), so they lie *in* the grass as in image 3, and it sways.

Honest limits (recorded in docs and the final report): the alternate heads and the reach come from
a sheet drawn at other scales/angles; registration will be imperfect. The asset list for production
(see Deliverables) asks for frames drawn in place.

## Phase 2 — runtime architecture

New, small, reusable; everything is a pure function of `(t, final)`.

`src/world/living/` (in the main bundle, shaders only, compiled at boot like `MemoryWindow`, because
`tests/playtest/perf.mjs` forbids shader compiles after entry):
- `materials.ts`: two ShaderMaterials sharing one noise texture (reuse `noiseTexture()` from
  `MemoryWindow.ts`, exported):
  - `PaintedLayerMaterial`: plate sampling + motion-map displacement (two travelling gust
    fields at incommensurate frequencies + per-pixel phase from the map, amplitude by class),
    parallax shift, dusk grade mix, dappled-light modulation (scrolling thresholded noise × light map),
    opacity. Used for plate, sky, mid, fore, tufts.
  - `FigureMaterial`: a subdivided plane (e.g. 24×12) with vertex deformation for breathing
    (radial falloff about an authored chest point, displacement along the body's normal axis,
    ~1–1.5%), a pivot rotation for head/hand parts, two-texture pose crossfade, blink patch, the
    same dappled light and dusk grade so figures sit in the scene's light.
- `Immersion.ts`: a full-screen pass inserted in `Post` after `OutputPass`, before the grade (so
  grain/vignette unify room and memory). It samples the scene render target through a homography
  interpolated per frame between *the wall quad's projected corners* and *a cover-fit of the
  viewport* (computed on CPU), with a painterly growth mask: distance from the projected window,
  perturbed by the noise texture and a brush-stroke field, plus a graphite fringe at the advancing
  edge (image 3). At the edge it blends by multiply into the room (pigment into plaster), turning
  to plain over as it advances. When fully immersed, the room pass is skipped (phones).
  Reduced motion: no homography scaling; a slow soft crossfade instead.

`src/memory/living/` (in the lazy memory runtime chunk):
- `LivingScene.ts`: owns the orthographic scene, the render target (sized from the viewport and
  quality: low ≈ 0.6×, medium 0.85×, high 1×; RGBA8, sRGB values like the other layers), the
  meshes, and `update(t, final, weights)` + `render(renderer)` + `dispose()` (geometry, textures,
  target). No tickers, no callbacks.
- `performance.ts`: pure, seeded, unit-tested functions:
  `breath(t, profile)` (irregular: per-breath durations jittered by a deterministic hash of the
  breath index, inhale shorter than exhale, occasional pause, A ≈ 4.6 s, B ≈ 3.9 s, sigh on settle),
  `blinks(t, seed)` (gaps 2.5–7 s, 110–160 ms, occasional double), `gust(t)` (the shared gust
  envelope used by both shaders and the sound cues).
- `woodland.ts`: the scene description: layer list and depths, figure parts with pivots and chest
  points, breath profiles, gust schedule.

Integration points (existing files):
- `src/memory/defs.ts`: `MemoryDef` gains optional `living: { scene: 'woodland'; immerse: true }`;
  new `WOODLAND` def (sections, markers, seed, cues, describe). Variants `afternoon`, `empty`.
- `src/memory/sheets.ts`: `memorySchema` adds, for living defs, objects `scene`
  {`immerse`, `zoom`, `focusX`, `focusY`, `dusk`, `people`, `breeze`} and `figure:a` / `figure:b`
  {`head`, `hand`, `shoulder`, `settle`, `presence`}. Authorable in Studio like the rest.
- `src/memory/compose.ts`: rules for the new props: `immerse` and `people` × `exit` envelope
  (an interrupt reverses immersion and takes the people first); breeze and procedural motion ×
  `motion` weight; `zoom` toward 1 under reduced motion.
- `src/memory/runtime.ts`: `prepare` loads the manifest's `living` layers (one texture upload a
  frame, as now) and builds a `LivingScene`; `Prepared.living`; `LivingMemory.dispose` disposes it.
  The scene's render target becomes the window's single pigment layer + `sketch` layer.
- `src/App.ts`:
  - `stepLivingMemory`: after `memory.step(dt)`, `living.update(frame.t, frame.final)` and render
    to target before `post.render()`; `immersion.update(window corners, final['scene.immerse'])`.
  - While `scene.immerse > 0`: store the rig pose, disable walking and free look (`rig.enabled`),
    route look deltas to a small parallax offset; a sustained look/drag beyond a threshold, a held
    walk key, or a tap outside a small central zone = `endLivingMemory('interrupt')` (Escape
    stays pause/settings),
    which plays the immersion backwards (interrupt exit ≈ 4 s for this memory). Restore pose
    exactly at the end. `judgeMemoryAttention` skips look-away/walk-away while immersed.
  - Visibility/settings pause already pause the controller; immersion values freeze with it.
- `src/content/memories.ts` + phrases: new `SceneMemory` `woodland`, phrase `five-more-minutes`
  (pencil hand, no voice), `variants: { first: 'afternoon', revisit: ['empty'] }`,
  `arc: 'afterAnother'`, after the door in order, offered in `['transform']`, `earliest ≥ 300`
  (placement in the arc to be confirmed by the interaction and creative review), keeping the
  Director's spacing rules. `tests/pacing.test.ts` targets must still hold.

### Integration rules (checked against the code)

Compose (`src/memory/compose.ts`, applied only when `'scene.immerse' in base`; s = smoothstep):
- New props get explicit cases; unnamed props pass through ungated (`compose.ts:66`). Avoid the
  names `presence/opacity/x/y/rot/skew/intensity/parallax` for scene/figure props (a figure
  "presence" would be ghosted ×0.6 under gentle). Use `figure:a.here`.
- `scene.people = base × s(0.70,1,exit)` (people leave first on an interrupt);
  `scene.immerse = base × s(0.25,0.75,exit)` (not × presence, so gentle still fully immerses);
  window opacity/presence/light use `s(0,0.35,exit)` so the wall painting is still there when the
  immersion lands back on it; `scene.zoom = 1 + (base−1)×motion`; breeze × `parallax` weight
  (0.25 reduced). `reduced` flag passed into `LivingScene` (breathing halved).
- Natural close: for living defs, ignore `dissolve` in reveal/sketch (it would strip the wall colour
  at ~39.7 s, before immersion returns); the colour-then-graphite sink is authored in Theatre
  (~42–46). Interrupts still work through the exit gating.
- `def.exit ≈ 7` (immersion reverse ≈ 4 s of it). Hard releases (switch/depart/hidden) keep 0.3 s.
- `runtime.ts`: `maxHold: Math.max(def.maxHold, timeline.sections.exit)` so moving the exit marker
  in Studio never turns the natural close into an interrupt. Fix `tests/playtest/measure.ts`
  (`min(maxHold, 22)`) to use the real span so pacing measures woodland's ~47 s honestly.
- Procedural motion driven from `frame.t` (position freezes on interrupt; scrub sets t = p).

Schema/manifest/tests:
- `memorySchema(layers, extra?)`; callers `runtime.ts:119,180`, `memory-defs.test.ts:15`. Never add
  props to the shared `WINDOW/LIGHT/LAYER` shapes (Theatre object cache).
- `def.layers = ['scene','sketch']` for both variants; `scene`'s file is the plate (poster and
  fallback); the render target replaces it at runtime. The manifest's `living` block is top-level,
  keyed by variant, and `prepare` loads it separately (it must not fill the window's 6 slots).
- No breath cue until a recording exists (the defs test requires every asset to exist); the
  interface is documented instead. Add a synth-kind existence check to `memory-defs.test.ts`
  (copy `vignettes.test.ts:85`). `line:*` markers are inert (`cueSheet.ts:85`).
- The phrase count is 119 out of a cap of 120 (`content.test.ts:9`), so *five more minutes* takes
  the last slot. Its theme is close to `your-hand` ("your hand, almost"); reviewers to note.

Rendering:
- The render target is fixed at 16:9 (the window's aspect comes from the manifest), RGBA8,
  `NoColorSpace`, mipmapped (`LinearMipmapLinearFilter`; walls are seen obliquely), with
  materials `toneMapped:false` and `premultipliedAlpha:true`. Resolution caps: low 1280×720,
  medium 1600×900, high 1920×1080. No uv flip is needed. @low plates are 1280 px for this memory
  (immersion crops on portrait phones).
- Render it in `stepLivingMemory` after `memoryWindow.update`, and also in the held branch and
  `heldAt` (playtest screenshots use them); then `setRenderTarget(null)`.
- Immersion pass after `OutputPass`, before the grade. Inside the window quad it starts from the
  room buffer and blends to the render target as `immerse` rises (no tonal jump between the
  multiplied wall version and raw sRGB). Keep handles to `RenderPass`/`OutputPass`; disable them
  only at `immerse ≥ 0.999` with the mask saturated.
- Boot compile: a material factory in the main bundle builds a warm-up living scene, compiled
  against a small target with identical options; those materials are **kept alive** (disposing them
  frees the program, so the next play would recompile and fail `perf.mjs`). The Immersion pass is
  enabled for the boot `post.render()`, then disabled. Reuse MemoryWindow's noise texture instance.
- Disposal: `LivingScene` (target, geometries, textures, bitmaps) goes into `Prepared.dispose`,
  made idempotent (it is called from several paths). Unbind the target from the Immersion pass
  before disposing it (otherwise texture count +1 in `memories.mjs`).

Input (`src/App.ts`):
- `rig.enabled` is reassigned every frame (`App.ts:1267`), so that line becomes
  `mode==='room' && !immersed`.
- The three `rig.look` call sites go through `lookInput()`: while immersed, deltas become a small
  parallax offset plus a decaying leave-intent counter; past a threshold the memory is let go with
  `interrupt`.
- A walk key or `touchMove` held for more than 0.35 s also interrupts.
- **Escape stays pause/settings** (it already freezes the memory), because pointer lock takes Esc.
- `interact()`, F/C/K/Tab are gated while immersed; `rig.cancelAttend()` when immersion starts.
- `tapAt`: a tap in the central zone keeps the memory, any other tap interrupts and returns before
  the room's hit tests.
- `judgeMemoryAttention` returns early while immersed. The pose is restored at `immerse < 0.02` and
  again in `memoryState('complete')`, which hard releases reach.

Director:
- Woodland goes after the door in `SCENE_MEMORIES`, offered only in `['transform']`, with
  `earliest ≥ 300`, so `memory-director.test.ts` still gets the bedroom and the door where it
  expects them.
- The door's line-reservation is hard-coded (`Director.ts:665,671`); generalise it to every scene
  memory with an `offer`.
- Generalise `App.ts:468`'s door-only `opensFrom`.
- `tests/playtest/memories.mjs:24-31` gets woodland variants, phrase and stages.
- Re-run `scripts/memory-reach.ts`, `emotional-depth.test`, `pacing.test`. The Director holds
  pacing for the whole immersed span, not 0.5 s a tick.

Audio:
- Add `crickets`, `leaves` to `SynthKind`/`SYNTH_KINDS`, rendered with `OfflineAudioContext` like
  `synthAir.ts`, not on the main thread. Reuse the existing `rustle` for the grass.
- Beds pan by `u` only, so the "beyond" placement relies on lowpass and level.
- Crickets get `fadeOut ≈ end − exit` and `tail ≥ 0.5` so they carry the last seconds alone.

## Phase 3 — the authored sequence (Theatre seed in `defs.ts`, saved to `theatre-state.json`)

Approximate, retimable in Studio (sections: active ≈ 11, exit ≈ 34, residue ≈ 43, end ≈ 47):
- 0–2: crickets begin (bed, from beyond the wall) before anything is seen.
- 1–6 *Arrival* (wall): graphite of the clearing found in the plaster round the line, colour
  follows; the people are already there; grass begins moving inside the painting.
- 6–11: `scene.immerse` 0→1: the painting spreads past its edges, plaster loses prominence, the
  view sinks in (homography from wall quad to full view, 1–2% layer parallax).
- 11–19 *Familiarity*: breathing (A slower, B quicker), blinks, A's head adjusts (13.5), a gust
  crosses the clearing (15), B's shoulder shifts (17).
- 19–25 *Connection*: slow push `scene.zoom` 1→1.18 toward their hands; B's head turns toward A
  (19.5–21); B's hand moves through the grass (21–23.5), fingertips meet A's briefly (23.6–24.6),
  a faint rustle; A's hand answers by a few millimetres.
- 25–34 *Remaining*: B settles back (26, a longer exhale); zoom eases back; `scene.dusk` 0→0.7
  over 27–40; nothing urgent.
- 34–39 *Dissolution*: `scene.people` 1→0 (painted away by the noise mask, grass reclaims the
  shape), the empty clearing holds 37–39.
- 39–43: `scene.immerse` 1→0: the room reasserts through the forest back to the wall quad; then
  colour, then graphite sink (existing dissolve).
- 43–47: crickets alone in the room, fading (sound residue; the controller's `tail`).
- Dialogue: timing markers only, inert, documented: `line:go` 27.0, `line:yeah` 29.2,
  `line:five` 31.5, `line:okay` 33.0. No speech generated, no captions shown for words.

Revisit `empty`: dusk plate, no figures, no zoom; same arrival and immersion; crickets fuller,
one distant bird; shorter (exit ≈ 24). Nothing explains the absence.

## Phase 4 — sound (`src/memory/synthSounds.ts` style offline renders, existing `MemoryAudio`)

New procedural assets via the existing `synth:` loader in `App.memoryAudioHost`:
- `synth:crickets`: several individuals (each its own carrier 3.8–5.2 kHz, pulse-train rate and
  chirp rhythm), rendered as 3 beds of different lengths (11, 13.7, 17.3 s) placed left, right and
  beyond (`place {u,v,d}`) so the mix never repeats as one loop. Normalised as the existing beds.
- `synth:leaves`: wind in foliage (synthAir's leaf band, new seed, gusts matched to `gust(t)` by
  placing `sfx:gust` markers at the same times as the visual gusts).
- `synth:grass`: small close rustles for the hand move and the settle.
- Approved `mem:bird` (lowpassed, far) once in each variant.
- Breathing: no cue until an approved recording exists. At runtime a missing asset is already
  skipped (`Voices.raw` → null), but the defs test requires every asset to exist. The two breath
  timings are documented in `defs.ts` for when recordings come. The unledgered `vf-breath` files
  are not used.
Captions: `[crickets]`, `[wind in the leaves]`, `[grass moving]`. Mute/intensity/pause/caption
behaviour is the existing `MemoryAudio` path, unchanged. All new sounds documented as stand-ins,
`review: pending` until the artist listens on the audition sheet.

## Phase 5 — accessibility, performance

- Reduced motion: no zoom or homography scaling (crossfade immersion), grass/leaf amplitude ×0.25,
  breathing kept but halved, gestures kept (they are the story), no dappled scrolling.
- Gentle intensity: existing presence ×0.6 path.
- Screen reader: `describe()` text for both variants via `#memory-sr`.
- Keyboard: held move keys or a sustained turn leave; Escape pauses (settings), as everywhere
  else. Touch: a deliberate swipe leaves; a tap in the centre keeps it; no new gestures.
- Draw calls: ≤ 12 quads in the scene; one extra full-screen pass; skip the room pass at full
  immersion. Render target recreated only on resize.
- Missing assets: `prepare` already rejects and the Director treats it as not spent; additionally,
  a missing figure layer degrades to the empty-clearing variant rather than failing.

## Files (critical)

New: `references/woodland/*`, `scripts/cut-woodland.py`, `public/memories/woodland/**`,
`src/world/living/{materials,Immersion}.ts`, `src/memory/living/{LivingScene,performance,woodland}.ts`,
`tests/living-memory.test.ts`, `tests/playtest/woodland.mjs` (or `MEMORY=woodland` in
`tests/playtest/memories.mjs`), `docs/reviews/2026-10-woodland.md`.
Changed: `src/memory/{defs,sheets,compose,runtime,synthSounds}.ts`, `src/memory/theatre-state.json`,
`src/world/{MemoryWindow,Post}.ts`, `src/App.ts`, `src/content/memories.ts` (+ phrase file),
`scripts/seed-memories.ts` (if needed), `tests/memory-defs.test.ts`, `docs/memories.md`.

## Verification

- `npx tsc --noEmit`, `npx vitest run` (new: performance functions deterministic and asymmetric
  between A and B; breath never periodic over 60 s; compose rules for `immerse`/`people`;
  interrupt reverses immersion; seek forward/back gives identical scene values; dispose leaves no
  textures/targets; defs test covers woodland art + sounds; missing asset skipped).
- `npm run memories:seed`, `npx vite-node scripts/playtest.ts` (pacing targets hold).
- `npm run build && npx vite preview --port 4173 &`; `MEMORY=woodland node tests/playtest/memories.mjs`
  for both variants on desktop 16:9, 21:9, 4:3, and phone portrait/landscape: held-stage
  screenshots at each beat; programs unchanged after entry; textures/targets back to baseline after a
  second play; interrupt mid-immersion; hidden-tab pause/resume; reduced motion; frame time.
- `npm run smoke`, `node tests/playtest/browser.mjs` for regressions.
- `qa-accessibility` on the result; creative, cinematic, technical-artist and sound reviewers on
  captured frames (and a short frame sequence) — their findings fixed or recorded.
- Commit and push to `claude/awesome-gates-gvtutk`.

## Deliverables report (end)

Working vs placeholder, stated plainly; no claim that motion reads as convincingly human. Asset
requests for production: in-place drawn frames for B's head turn (3–4 drawings), B's reach
(4–6 drawings of forearm/hand), A's head adjustment (2), blinks (closed/half per figure), clothing
breath shapes; recorded woodland crickets/insects (several takes, 1–2 min), leaves in light wind,
close breathing of two people lying down, grass/fabric rustles.

---

## Specialist reviews (on the proposal)

Six specialists reviewed the proposal and the references: creative director, cinematic director, technical artist, sound designer and interaction designer. Their reports are summarised here; the main session's decisions follow.

- **Creative director.** The heart of it is the hand: a touch made, held and then undone by millimetres, with neither of them looking. The report recommended:
  - cutting the push-in, the head turns, most of the small events, cloud drift and scrolling dapples;
  - two authored blinks, not a schedule;
  - the people going to graphite before the place goes;
  - full immersion keeping a plaster margin;
  - on the revisit, the wall staying a wall;
  - offering it last, with nothing after it;
  - letting the dusk fall further than five minutes could.
- **Cinematic director.** The homography entry reads as a window zooming at you. Instead:
  - keep the painting fixed in the wall's plane and let it spread across the plaster;
  - dolly the visitor toward it, using a homography only for the last 15%.

  It also asked for framing authored per aspect (portrait focus about 0.31–0.37; 21:9 anchored high) and a push of 1.6 (1.3 on portrait), finished before the hand moves, with the camera still through the touch. Further recommendations:
  - longer stillnesses, including a held empty clearing of 4–6 s;
  - a uniform dissolve for the people, not a noise mask;
  - dusk reaching 1.0;
  - a return at evening;
  - the gust heard before it is seen.
- **Technical artist.** The cut-outs give themselves away: ivory halos, double faces in the crossfade, B's sheet head misregistered, and a picket fence of spikes over the legs. Fixes:
  - unmix the ivory; hand-placed occluder blades; a contact shadow; softening; matching the light;
  - motion maps blurred (σ ≥ 8), no per-pixel phase, plate warp ≤ 1.5 px, total parallax ≤ 0.5%;
  - sway at 0.2–0.4 Hz on incommensurate sines;
  - render on twos (12 fps), with mips only at the wall stage;
  - bones evaluated analytically (no bone textures), figure art at its drawn size, maps at ¼ size, the texture budget ≤ 12 MB on low;
  - dusk ratio computed per matte, with the real dusk sky crossfaded in the sky gap;
  - dapples that modulate the painted flecks;
  - the grade's saturation and contrast relaxed while immersed;
  - one merged material.
- **Sound designer.**
  - Timeline-locked renders, not loops. The loop trim cuts across a seamless synth loop.
  - Field-cricket parameters: carriers 4.2–5.0 kHz, 4-syllable chirps with roughness and jitter. Individuals: one near, two mid, and a chorus that thickens with the dusk.
  - Levels set per cue (pulsed tones read hotter than their RMS).
  - The approved bird trimmed to two chirps (`stopAfter` 1.1), far away, and kept out of the revisit.
  - Grass grains instead of the packet-crinkle `rustle`. The touch itself is silent, because the near cricket stops while the hand moves.
  - Leaves kept out of the cricket band.
  - One cricket alone, sounding in the room, as the tail.
  - A way for the artist to audition the synth sounds.
- **Interaction designer.**
  - A consent gate: the view goes in only if the visitor is watching.
  - Leaving as a visible loosening: a virtual turn of 8° gives parallax only, 30° leaves. Taps never leave. Only new inputs count.
  - Control handed back within about 1.2 s, turned the way they turned.
  - Immersed time counts as watched.
  - Measured with the real Director: as proposed it opened in 0 of 40 first visits. It needs a decision about which memory takes a visit's late slot.

## Decisions (main session, before the skeptic)

Where the artist's brief is explicit, it wins over a reviewer's cut. Where it isn't, the restrained option wins.

1. **The hands.** B's hand starts drawn a little back from where the sheet draws it, turned at the elbow by ≤10 sheet px of travel (≤8% of the forearm, so it never stretches).
   - It reaches halfway, stops (deniable), then goes the rest of the way, to the sheet's own pose: a finger's width short.
   - A's hand answers toward hers until the sides of their little fingers touch. They hold.
   - Later, B's hand draws back a few millimetres, and the gap stays.

   Neither looks. The brief allows "almost touch, or touch briefly".
2. **Head turns** (the brief asks for both). No face swaps from the sheet; both are on the production list.
   - A: one ≤2° adjustment at the neck, motivated by the gust.
   - B: one ≤3° incline toward A, eyes still on the sky.
3. **B's shoulder shift** (the brief asks for it) is folded into her settle after the touch, not a separate event at 17 s.
4. **Fewer events.**
   - Two blinks for A and one for B, authored.
   - Hair moves only when the gust passes.
   - No cloud drift, no motes, no scrolling dapples. The dapple modulates the painted flecks.
5. **Push-in** (cinematic over creative): 1.0→1.45 on landscape, 1.25 on portrait, finished before the hand moves. Still through the touch; pulled back as the dusk falls. The hands are about 30 px on a 1920 screen without it. The skeptic should challenge this.
6. **Timeline.** The cinematic director's ≈53 s table, with the sound designer's lead:
   - the near cricket at 1.2 s, graphite from 3.0 s;
   - dusk 0→1 by 40 s;
   - colour→graphite→gone for the people as a uniform dissolve (35–38.5);
   - the empty clearing held 4.5 s.
7. **Entry and return** (cinematic). The wall shows a crop of the painting round the line, which spreads across the plaster in place. The visitor's view dollies square to it, and the screen-space homography only finishes the last stretch. The return is the same in reverse.
   - Full view while inside, because the brief is explicit ("occupy the entire visual composition"), so the creative director's margin cap is declined. The plaster, the chair and the graphite fringe carry the entry and the return.
   - The room returns at evening (the door's dim, scheduled late, lifting with the tail).
   - The warm leaf light reaches the plaster before the graphite: a `light` layer of the painted flecks.
8. **Consent and leaving** (interaction).
   - It goes in only if the window has been watched ≥3 s in the arrival, from ≤4 m, and is within about 15° of the view's centre at the dolly. Otherwise it stays a wall memory.
   - The virtual turn: ≤8° gives ≤0.5% parallax; 8–30° loosens (the dolly backs off); ≥30° leaves.
   - Held move keys ≥0.35 s leave. Taps never leave; a tap stirs the grass where it lands. Only inputs begun after the lock count.
   - Escape stays pause/settings.
   - An interrupt reverses in ≤2.5 s, hands control back at half-immersion, and keeps their turn.
   - Immersed time counts as watched.
9. **Revisit** (creative): the dusk clearing, empty, stays in the wall. Kept out the second time, about 22 s, with no bird. The pressed-grass trace goes on the production list.
10. **Arc** (interaction option a, plus creative).
    - Listed after the bedroom. First visits keep the bedroom; a visit where the bedroom is already heard gets the woodland in the late slot.
    - Earliest 200, `['contradiction','transform']`, `afterAnother`.
    - Once it has played, no other painted memory is offered that visit.
    - It is never offered within 120 s of the chair's "just for a minute" vignette.
    - The phrase id is `more-minutes`; the hidden script drops `line:okay`.
11. **Sound** (sound designer, in full):
    - timeline renders: `crickets` (near), `woods` (mid crickets, chorus, leaves), and `cricket-last` placed in the room;
    - `grass` grains;
    - the bird trimmed;
    - the touch silent;
    - the loop trim skipped for synth beds;
    - a `wide` music cue kept as a stereo bed.
12. **Technical** (technical artist, in full):
    - decontaminated, softened, light-matched figures with irregular occluder blades and a contact shadow;
    - analytic bones;
    - blurred motion maps, plate warp ≤1.5 px, parallax ≤0.5%;
    - 12 fps scene time;
    - mips only on the wall;
    - texture budget ≤12 MB on low;
    - one merged material;
    - per-matte dusk with the real sky;
    - grade relaxed while immersed.

## The skeptic

The skeptic protected the core: one touch, made, held and undone with neither of them looking; silence where it happens; the people going to graphite before the place does; motion as a pure function of time; drawing on twos. It challenged the rest:

- **Reach.** As decided, the artist's "first memory" is almost unreachable.
- **The plaster margin** was declined on the strength of a single phrase, although image 3 shows one.
- **Dolly plus homography** is two mechanisms for one move. The room's wall is exactly 16:9 and could carry the move in world space.
- **The push-in** buys about 3.5 px of gesture and costs the plate's resolution at the climax; the camera is announcing the moment.
- **The consent gate** repeats the commit; the parallax band and tap-to-stir are cleverness.
- **Length.** About 53 s is not earned before the touch.
- **Code drift.** The code had drifted from the decisions: scrolling dapples, warp amplitude, bone textures, texture budget. Most of this was fixed in the rewrite under way while it reviewed.
- **Honesty.** The artist must be told the limits in numbers.
- **The revisit** belongs on the static window path.
- **The hidden script markers** are work for an inspector.

## Final decisions (after the skeptic)

1. **The touch** (decision 1) stands as decided: a deniable stop, the rest of the way, the sides of their little fingers touching, a missed breath, held, B drawing back a few millimetres. **Stillness carries it, not the camera.** The breeze dies about 1.5 s before the hand moves and returns after the hold.
2. **No push-in.** `scene.zoom` is not in the schema. A drawn close-up of the hands goes on the production list, to *cut* to if the artist wants one.
3. **Entry and return are a move in the room.**
   - The painting is fixed in the wall's plane and spreads across the plaster from a crop round the line to 3.2 × 1.8 m: half the wall, 16:9 like it.
   - The visitor's view is carried square to it, to the distance where it just fills the view (about 1.5 m on 16:9). Image 3's framing, plaster and chair are passed through on the way in.
   - A screen-space settle completes the cover over the last stretch only. It also lifts the painting off the room's lighting and the other writing on that wall, and keeps the frame sharp on any screen shape.
   - Full view while inside, as the brief says; the margin is the way in and the way out.
   - This is recorded as a judgement on the brief's explicit line against image 3, and the artist may prefer the margin. It is one constant: the settle can be capped.
   - Reduced motion: no carry, a slow crossfade.
4. **Consent and leaving, simplified.**
   - Committing is consent. The only guard: it doesn't go in if the visitor is looking away when the move would begin; it then stays a wall memory.
   - While inside: any new turn backs the move off in proportion, and 30° leaves.
   - Held move keys (≥0.35 s, begun after the lock) leave. Taps do nothing. Escape pauses.
   - An interrupt hands control back at half-way, keeping their turn.
   - Immersed time counts as watched.
5. **Length.**
   - Arrival 0–6 s, in 6.5–11, the touch's reach at 15.5–18.7, contact 20–24.5.
   - Dusk 21→33; the people go 30.5–34; the empty clearing is held 34–38.5.
   - The return runs 38.5–42.5, then colour and graphite leave the wall (to 46) and the crickets stay in the room (to 50).
   - Inside for about 27 s.
6. **Revisit** (empty): on the static wall path, with no living scene: the dusk painting, its graphite and its light, about 22 s.
7. **Placement**, measured with the real Director (5 personas × 8 seeds, 600 s):
   - **After the bedroom:** the woodland opened in 1/40 first visits, the bedroom in 6/40.
   - **Before the bedroom:** the woodland opened in 4/40, the bedroom in 3/40.
   - **Return visits:** 7/40 either way.

   Chosen: before the bedroom, because the artist calls it "our first memory"; the bedroom then comes on a later visit. `last` closes the visit's painted arc after it. The 120 s rule about the chair vignette is dropped.
8. **Hidden script.** No `line:*` markers. The imagined exchange ("We should probably go." / "Yeah." / … / "Five more minutes?") is kept as a comment, unanswered.
9. **Blinks.** Two for him (12.2, 27.6) and one for her after she settles (26.8), drawn as two held frames each on twos.
10. **The leaf light on the plaster** before the graphite is kept: it is the memory's own `light` layer, the existing mechanism, and the cinematic director's strongest image-3 note.
11. **What the artist is told, in numbers**: see the deliverables report and `docs/memories.md`, "What is a stand-in".

## The artist's change: the ending is a cut

*(After the build. Brief: "a living memory → quiet human connection → instantaneous absence → uninterrupted natural ambience → lingering emptiness → gradual return to the white room".)*

- **No gradual disappearance and no gradual sunset.**
  - Removed: the people going to graphite, the 21–33 s dusk, and the far bird.
- **At 28.0 s, on one frame**, the same composition becomes their dusk painting (`01-dusk`, registered to the day plate by its measured 2 px), and both people are gone, with everything that is theirs:
  - their grass, their contact shadow and their lids, which are all in the figure layer;
  - their graphite on the wall: a second sketch layer, `sketch-after`, swaps in on the same frame.
- **What the brief left open:**
  - The artist's correction named "the fourth reference image" for the dusk. The attached fourth image is the day plate; the dusk described (teal shadows, faint amber) is image 1, so image 1 is used.
  - The cut falls 1.2 s after her blink and about 1.5 s after she has settled: the end of their last gesture, nothing in mid-movement.
- **Mechanism.**
  - Held keys on `scene.after` and `scene.people`, read by the controller like every other value, with no second scene.
  - The living scene redraws on the frame the state changes, not on its next drawing on twos.
  - Unit tests check that no position between 26 and 30 s is half there, that seeking back restores them, and that the controller steps over the cut once.
  - The played browser run probes every drawn frame: 0 frames had the people without the afternoon, or the reverse.
- **The pressed grass.** It is a smoothing and a 7% shade, with no outline, in the code-made `after` plate.
- **The hold.** 28→35 s, 7 s, then the existing return, which now dissolves the empty clearing's graphite.
- **Sound.**
  - The insects carry straight across the cut.
  - From 28.5 s the evening comes in gradually.
  - Nothing marks the cut.
  - One insect is left, heard from the room, at 42 s.
  - (These became cicadas: see below.)
- **The revisit** (`empty`) plays on the static wall path (no living scene), as the skeptic recommended.

## The artist's change: cicadas, not crickets

A summer clearing in the afternoon is cicadas. The sound designer's structure is kept (timeline-locked takes, levels, the touch made by subtraction, the tail); only the insect changes (`src/memory/synthWoods.ts`).

- **By day: summer cicadas.** Tymbal clicks (noise in bursts of 170–280 a second) ring at the body's resonance (4.4–6 kHz) with a little tone, in phrases that swell in, pulse slowly and fall away.
  - One cicada is near them, in the tree over them. Its phrases are authored: first heard beyond the wall at 1.2 s; a lull from 14.3 s while the hand moves; a phrase from 25.4 to 31.6 that sings straight across the cut.
  - Two more sit either side, quiet while the hand moves.
  - The chorus in the trees is four bands of shimmer.
- **After the cut: evening cicadas.** The day's chorus thins over 28.5–34 s and the evening cicadas' falling calls come in (29.5, 33.2, 36.4). Nothing marks the cut itself; a test checks that the clearing's level is the same either side of it, within a factor of 2.
- **The tail.** One evening cicada, far off, heard from the white room (`sfx:cicada-last`, 42 s).
- **The revisit.** Evening cicadas through it, and a thin day chorus.
- **Captions.** `[cicadas, beyond the wall]`, `[an evening cicada, far off]`.
- **Status.** All synthesised stand-ins, `review: pending`: the artist should listen (a mix is written to `test-output/review/woodland/`). Recorded cicadas are on the production list.
