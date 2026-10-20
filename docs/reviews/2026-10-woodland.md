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

## Reviews of the built ending, and what was done

- **Cinematic director and skeptic.** Both find the cut effective rather than theatrical: it is the only hard cut in a work made of dissolves, the frame matches, the sound carries across it, and dusk with absence on one frame is one idea ("later"). What made it feel cued was his blink 0.2 s before it, and the sound playing a gradual sunset just after. Done:
  - the cut moved to 31.5 s, in a stillness (both of them between breaths), with his late blink gone and her settle ended by 25.9 s; the final gesture keeps its timing, and the hold stays 7 s;
  - the cicada over them carries on unchanged to 34.8 s, then the day thins and an evening cicada calls twice;
  - no room dim to evening (it undid itself as the visitor returned);
  - the pressed grass made findable on a second look, still with no outline;
  - the words keep a noise-edged bloom of plaster, not a card;
  - the revisit's light opens to the sky and the tree.
- **QA and accessibility.** Passed: taps, Escape and pause, keyboard leaving, the hidden tab, reduced motion, the single-frame cut and seeking across it, full cover at 21:9 and 4:3, no console errors, programs and textures at baseline. Done:
  - a tab hidden for more than 10 s ends the memory uncounted;
  - 21:9 framing keeps the hands clear of the captions (focus 0.5);
  - turning: a glance under 8° changes nothing, the full view goes over about 12–22°, and 30° leaves;
  - reduced motion is fixed per memory, and the visitor is put back;
  - the scene's render target always makes its mipmaps (black or stale frames otherwise);
  - the screen-reader description is told in stages, as things happen (the cut is not given away), and `#memory-sr` now exists in the page from the start;
  - tests for going in and leaving (`tests/inside.test.ts`), and one tautological test fixed.
- **Left for the artist.**
  - Whether the evening cicada (a falling call) is the evening insect they remember.
  - Captions for the cicada falling quiet and for the evening's arrival. A caption at the cut would mark it.
  - The room's other writing on that wall shows over the painting on the way in and out (the line it opens from is the memory's own; others belong to the room).
  - Phone swipe-to-leave, hand-back distance and rotation need a real device; so do the frame rate and every sound.

## The artist's note on the film: "still images with occasional animations"

The artist watched the review film and said it "doesn't really look like an animation, more like still images with occasional animations like blinking layered on top". Measured, they were right: `tests/playtest/motion.py` (block matching, the share of the frame that travels ≥ 2 px in half a second) read 0.0% in every second from 6 to 31 s. The plate moved 1–2 painting px, the breath 1 px, the hand 7–11 px, three blinks in 30 s.

The artist chose: a 2D puppet built from the images already supplied (with a shot list of in-place drawings for later), and a locked camera with a living scene (wind through the grass, flowers and leaves, clouds, moving light, pollen and seeds).

Reviewed before building: the cinematic director (motion budget and rhythm), the technical artist (what can move without tearing, at these images' resolution), then the skeptic on both.

- **Cinematic director:** motion should follow attention. Dense passages at 11–14.3 s and 25.9–29.3 s, calm around the reach, idle movement used as acting. Her look toward him belongs *after* the touch (26.4–28.6 s), so the touch stays deniable. The figures go still from 29.3 s, but the air keeps moving across the cut, with the same phase on both sides. Three gusts as punctuation, not many. A beat sheet with seconds.
- **Technical artist:** anything that moves more than about 3 px must be its own geometry:
  - flowers as bent strips;
  - the sky as a translating layer behind fixed leaves;
  - her forearm as a cut part with grass filled in under it.
  The second-row heads on the sheet don't register with the lying pose (eye spacing 39 vs 29 px, eye line −16° vs −35°, mirrored ear), so there is no swap or morph. Drop the sun shafts, the cloth flutter and the finger sub-parts. Particles go through the same program. A drifting noise dapple reads as a screensaver; displace the painted flecks instead.
- **Skeptic:** the calm at under 2% of the frame recreates the complaint during the scene's most important 9 s. Stillness should be lower amplitude, never no coverage, and coupling (one wind moving everything) matters more than particles. Use a roll and the irises for her look; play his finger beat as a whole-hand twitch.

**Decided:**
- **Motion floor and coupling:**
  - The breeze never goes below 0.35. It is 0.5 into the cut and across it, and 0.3 in the evening calm.
  - One `windForce`, answered in closed form by every spring-like thing and integrated for everything carried. Nothing has its own clock.
- **Gusts:** three, at 13.0, 26.8 and 33.4 s (the last over the empty grass). There are none from 15.6 to 24 s or from 29.4 s to the cut (tested).
- **What was dropped:**
  - sun shafts;
  - cloth flutter;
  - finger sub-parts (his 17.1 s beat is a twitch of the whole hand at the wrist);
  - head swaps;
  - a leaf after the cut.
- **Puppet amplitudes:**
  - breath: a swell of 0.07/0.09 and a rise of 6 sheet px;
  - hair ends: 2–3 sheet px per unit of wind;
  - her look: a roll of 0.12 rad with the face sliding 3 px and the irises 3 px;
  - her forearm: an 18 px slide plus a 0.05 rad turn;
  - her foot: ±0.07 rad at 0.8 Hz.
- **The air:** 40 motes, at most a third under reduced motion; 2 seeds; 2 leaves. About 15 motes carry on into the dusk, dimmed.
- **The beat sheet:** in the seed tracks (`src/memory/defs.ts`). Blinks are by hand in `woodland.ts`: none across the reach, none from 29.3 s.

Before vs. now on the same stills (share travelling ≥ 2 px in half a second):

| Passage | Before | Now |
|---|---|---|
| 12 s | 0.0% | 7.6% |
| The gust (13.5 s) | 0.0% | 13.7% |
| The calm (18 s) | 0.0% | 6.1% |

**QA on the built change** (code and unit tests; the browser checks were run before it: programs 22→22, textures back to baseline, the cut on one frame, leaving works). Fixed:
- **Reduced motion:** seeds now hide under it, as the falling leaves already did, and the motes' wander and rise scale with it.
- **Before the painting comes alive:** the sky's drift and the motes' wander start with `scene.life`.
- **Gust travel:** the grass's displacement eases off at ~12 painting px and the flowers' at ~14. In a gust it had reached ~23 px.
- **The puppet mesh:** 4 sheet px at the faces and hands, 12 elsewhere. It is 6 and 18 on the low tier (tested: under half the vertices).
- **Motes after the cut:** they take the evening's even light, not the afternoon's sun flecks.
- **Every device agrees:**
  - the start positions of motes, seeds and leaves are hashed on the CPU;
  - the shader's hash only sees small arguments;
  - no reversed `smoothstep`;
  - no `atan(0, 0)`.
- **The tap ripple** scales with reduced motion again (latent: nothing passes a tap yet).
- **Tests:** the tautology is removed. Added a uniform-budget test, and scene tests (fewer vertices on low, fewer motes under reduced, everything disposed, safe twice).

Not fixed: her look toward him is not in the screen reader's announcements, on purpose; the touch stays the only thing named.

## The artist's shot list: eight shots

The artist replaced the single wide with eight shots: 1 the room remembers (pencil on the plaster, the camera nearing the wall), 2 crossing in (colour, depth, leaves passing the lens), 3 the wide afternoon, 4 he looks toward her, 5 she notices, 6 their hands almost touching, 7 the wide again, 8 the cut to the same place, empty, at dusk. Timings were suggestions; AI video models were offered and then withdrawn ("you don't need to use the image models"). The wides and the way in stay the engine's; the close-ups are the artist's drawings, made in their image tool from a kit (`references/woodland/kit/README.md`).

Reviewed before building: the interaction designer (the way in, what a turn does), the technical artist (how close-ups are made and shown), the cinematic director (cutting, framing, timing), then the skeptic on the reconciled plan.

- **Interaction designer:** the approach as a lean (the body drifts toward the wall while the drawing forms, the look stays theirs), then taken in; a close-up only for someone inside, giving way to the wide when they turn from it (14°); turning inside only by a drag begun inside; close-ups announced to a screen reader only if they went in; per-shot framing on an upright phone.
- **Technical artist:** the stroke-order map had untimed pixels and fragments (fixed); the push and the crossing leaves smaller and quicker; drawings, not video, for the close-ups (frame-exact, seekable, one colour pipeline), registered by SIFT then ECC; in-betweens by one-way warps.
- **Cinematic director:** one continuous approach curve, with a slower return and no leaves on it; the cicada (1.2 s) before the light (1.4) before the first stroke (2.0); matched close-ups (his head left looking right, hers right looking left, heads about 40% of the frame, eyes on one line); nothing in the first second after a cut; the eyes lead and the head follows half a second later; her blink half a second after her head lands; sound changes at least 0.7 s from a cut; both chests at rest at the cut; in-between timings in twelfths.
- **Skeptic** (with evidence: it warped her head between the sheet and the artist's own takes at close-up scale):
  - [P1] Warping a face between drawings tears it (split mouth, doubled jaw; flow error above 3 px over half the head); smooth flow barely moves and still pops. A cut through a drawn halfway drawing reads as a turn. Cut between drawings, never warp; hold them on timeline keys.
  - [P1] The kit asked for the wrong drawings: no halfway drawings; her blink was an edit of the head-up drawing although it comes after her head has turned; a "half" lid made by mixing ghosts.
  - [P1] One glance cancelled the way in for good: the lean's stop latched on a single frame of looking away, at any moment of five seconds.
  - [P1] Shot 1's pencil, the stand-in, reads as an edge filter; ordered stroke by stroke it is crumbs at the frame's foot at a third of the way.
  - [P2] Delete the video path (no colour tags, a clock that tolerates more than a drawing's drift, feathered masks that double the hair).
  - [P2] The crossing's leaves and push show off the engine; cut both, or one spray if the shot list asks for leaves.
  - Minimum for a great first viewing: about fifteen matching drawings, cuts on held keys with breath on the chests, one forgiving approach, the real pencil drawing, then an animatic for the artist.

**Decided** (the skeptic's findings are taken; where it and the others disagree, as follows):
- **Close-ups are drawings cut on keys** (`scene.shot` which close-up, `scene.cel` which of its drawings; `scene.clip` deleted). No warps, no flow, no mixing (`scripts/closeups.py`). The technical artist's one-way warps and the director's in-between percentages go; the director's acting beats stay, in the timeline with the sound: his eyes at 17.5, his head through its halfway drawing at 18.0 (held three drawings), landing 18.25; her eyes at 21.75, her head at 23.0, a slow blink at 23.75 (half, shut, shut, half); her hand at 26.0 through its halfway drawing. Nothing changes in a shot's first 0.9 s (tested).
- **How a close-up is shown:** the shot's first drawing as its base, and, over the part of the frame that changes, the drawing of now from an atlas (each cut whole: a hull round each change, tightly feathered; the base kept elsewhere, so nothing that didn't move boils). Registration by ECC alone, coarse to fine; a take under 0.9 correlation is refused and the timeline holds the drawing before it. The breath (a swell at the chest, ~2–3 px, from the figure's own breathing) and the grass in the air are the engine's, applied to base and drawing alike; the wind is kept off the grass near anything that changes. A drawing not made yet holds the one before; a shot without its start is the sheet's panel, held. The camera is locked on every close-up: the director's 2% push on hers is dropped (the drawings carry it).
- **The kit** (sent to the artist): the halfway drawings `c4-mid`, `c5-mid`, `c6-mid`; `c5-end-shut` and optional `c5-end-half` made from `c5-end`; `c4-blink` dropped; heads no more than 40% of the frame, eyelines matched by a crop here; each edit made from the drawing named; a 12-a-second flipbook of each set to accept or reject takes; `pencil.png` first.
- **The way in:** decided once, when it would take them: looking at it then (a look away of under half a second doesn't count) and not walked off. Before that, a look away only holds the drift where it is; looking back, it goes on, catching up gently (at most 0.35 of the way a second, about twice the curve's own pace; never a lurch). A step held for 0.35 s lets it go for good. The old carry (without `scene.approach`) is deleted. The drift moves only the body (`CameraRig.drift`): it no longer cancels a tap's turn toward the line or the keyboard's turning each frame (the QA note on tap-started memories). Held at a position (the editor, a capture), it is exactly on the curve.
- **The pencil:** not stroke by stroke. Out from the words along a broken front, light marks before dark ones, the two of them found last (`scripts/stroke-order.py`). The artist's `pencil.png` is the real fix and is first in the kit.
- **Kept against the skeptic:** the crossing's leaves and its push. The artist's shot list asks for both ("foreground leaves pass close to the lens"; "the forest becomes spatially present"), and the skeptic's own fallback was one spray: it is one pass of five leaves. The push stays at −0.015: the note in `defs.ts` it cites is the limit the push already keeps (under ~10 px at the trunks).
- **Left open:** the 14° give-way. Turning inside is a drag, or the mouse once it is captured; with the mouse captured, a drift of ~110 px in under a second gives the wide for the rest of that shot. To measure in the persona playtests before changing.

Found in the browser while building, and fixed:
- **Every close-up was drawn black.** The vertex shader took the close-up's quad (kind 4) for a mote (`kind > 2.5`) and collapsed it to a point; the video close-ups had never been drawn either. The memories playtest now fails on a living frame drawn blank.
- **A jump straight into a close-up** (the editor, a capture) showed the wide for the whole shot: a stale "not inside" from the frame before latched the give-way. Now not being inside shows the wide without latching; only a turn latches.

**QA on the built eight shots** (`qa-accessibility`, with the real loader, scene and shader in headless Chromium, and unit probes in the App's own frame order). The close-up drawing itself held: a synthetic 2×2 atlas matched an independent composite within 1.5/255 on both tiers; breath and wind land on base and drawing alike; disposal, reduced motion and "never a close-up at the wall" all held. What was around it was not. Fixed:
- [P1] **Walking up to it, or turning with a phone's left thumb, turned the way in down for good**, and a short step snapped back onto the line. Now only a step *back*, held 0.35 s (under reduced motion too), lets it go; walking up to it or aside, or the walk to a tapped line, pauses the drift, which goes on from where they stop (re-anchored, never a snap; the way back ends there). The thumb's sideways push is a turn. At the lock: taken in if looking at it then.
- [P1] **The give-way flickered at ~11°** (judged by the yielded view, which recedes from 8°) instead of latching at 14°. Now judged by being taken in (`Inside.taken`, before any yielding), so a small look round keeps the close-up and 14° gives the wide for the rest of its shot.
- [P1] **A frame in which no time passed** (paused, a tab coming back, an audio clock that hadn't ticked) snapped the visitor onto the curve, up to 0.6 m. Now only an explicit `held` (the editor, a capture) puts them exactly on it; a frame of no time moves nothing.
- [P1] **A redrawn take** (every line re-rendered a pixel or so off, as image tools do) was accepted with 62% of the frame as its "change": every cut would boil, the wind would go still, and the atlas would be ~48 MB. Now the comparison forgives a line up to 2 px off, each shot has an `allow` box from the kit's framing, a drawing changing more than 22% of the frame is refused, and isolated specks are dropped. `closeups.py --selftest` (a made-up set redrawn that way) keeps all three drawings in a cut of 9% of the frame.
- [P1, speculative: Safari] **The close-ups' colour sat under a data alpha** (the wind mask): any decoder that premultiplies would have turned the faces near black. The drawing is now opaque, the wind mask its own small map (`<shot>-wind`), read through the frame's maps slot (no new sampler).
- [P2] **On an upright phone every cut moved the carried body 0.5 m** (one focus did two jobs), so what they heard swung across the cut. The body keeps the wide's focus; only the view frames the close-up's subject (across only).
- [P2] **The screen reader announced actions nobody saw** (the stand-ins don't move; lines were told when a close-up gave way). The close-up lines now say what is seen in stand-ins and drawings alike ("Close on him; he looks toward her."), and are told only while that close-up is shown; the 10.5 s line has a version for someone it stayed on the wall for.
- [P2] **Seen from the wall, the latest pencil and colour stopped half-way** (timed at the very end of a reveal that is half-way at a mark's own time). The order map keeps the pencil within 0.88 and the colour within 0.94 of the reveal; it is mipmapped (seen from across the room).
- Also: her hand moves in the wide when it does in the close-up (it had jumped at 28.5 s whenever that close-up gave way); a close-up that fails to load is let go at once; the close-ups, leaves and order load alongside the rest; tests now cover a two-row atlas, the App's frame order (steps, thumbs, frames of no time, the give-way), and the playtests assert the close-ups are shown and that a turn during one gives way without leaving.

Not done: the decode on iOS Safari and Firefox, audio-clock stalls on real phones, and real screen-reader timing need devices.

## The artist's note on the stand-in close-ups

"The close-ups aren't widescreen and there's lots of white in the background; they should be fully surrounded in the grass." The stand-ins are now widescreen 1920×1080, each panel's paper keyed out and the sheet's own grass grown round it (quilted from the panel and the sheet's top panel), faces where the kit frames them (his at 0.38 across, hers at 0.62).

Then: "the lower halves of their bodies don't exist and it just becomes grass". The sheet's panels fade out to paper below the chest (as a character sheet's drawings do), and that paper, keyed out, had become grass. The frame's foot now cuts each body above that (at 0.77 of his panel, 0.8 of hers), so their shirts, her arm and her trousers run off the bottom of the frame; the grass is only round their heads and beside them. (Not lower: their hair runs off the panels' tops, so the frame's top stays there. The panels are enlarged a little more, about 5.7× instead of 4.4×: softer, until the drawings come.)

## The directors on the film, and the skeptic on what to do

The cinematic and creative directors watched the review film (desktop, the afternoon, 0–53 s, stand-in close-ups).

- **Both:** the dusk cut works (one frame, the tree and log registered within a pixel, the sound running straight across it), and so does the held empty clearing.
- **Cinematic director:**
  - [P1] The crossing is a two-frame exposure pop (centre luma 52 → 107, 77% of pixels in one frame), under five leaves that read as olive smudges.
  - [P1] The return snaps back in two frames and leaves a near-black stain on the wall (the painting multiplied into the plaster).
  - [P1] The gusts are seen 1–3 s after they are heard, and the second fills the stillness the dusk cut depends on.
  - [P1] The leaf light that should open the memory never shows (in ordered mode the light was gated by the colour).
  - [P1] The room's other writing is printed over the painting.
  - [P2] The pencil starts below the words, not at them.
  - [P2] The film dims the room (a capture artifact), and the visitor's lean counts as walking.
- **Creative director:**
  - [P1] The way in turns into a portal effect: straight crop edges, a dark fringe, the words removed in one frame, a brightness pop.
  - [P1] "I wanted you to" reads as a caption on the two of them.
  - [P1] The face close-ups, cross-cut, make a mutual look: eyes only, she looks away.
  - [P1] The return is the busiest stretch after the climax.
  - [P2] The screen-reader lines over-explain.
  - [P2] The kit has no drawing for the end, and its faces will inherit the panels' smiles.

**Fixed first** (the verified defects):
- The crossing as light: the painting's light comes up at its place over the wall's (show 0.3–0.7 of the way in), then it opens out (settle 0.68–1). No double multiply, no pop.
- An ordered painting shows its whole footprint from the start, its edge its own order (never a straight one), with its pigment sunk into the plaster (a faded fresco, never a stain).
- The return takes 2 s, linear. The light is gated by its pool, so the warm leaf light shows before the first stroke. The pencil starts at the words.
- The gust's sound follows what is seen. The carry no longer counts as walking, and the Director holds while a memory is held, so the film no longer dims the room.
- The screen-reader lines say only what is seen. The kit gained `pencil-after.png` and resting mouths.

**The skeptic, on the contested half.** Take more away:
- (A) Don't fade the writing from the first stroke: the rebuilt crossing may already do it; check first, and if needed wash each line as the colour reaches it.
- (B) One sharp leaf, not five blurred ones.
- (C) Delete the push.
- (D) Cut the second gust and its leaf, and the seed.
- (E) Don't make a comparison film for the eyes-only faces; offer it to the artist in a sentence.
- (F) Make shot 7 the longest shot, paid for before the cut.
- (G) Drop her blink: the shot list has none, and slower is louder.
- (H) Fall back to the artist's pencil with the figures filled; no eraser halo; drop "not smiling".
- Restore the canopy's slower spring (big trees sway slowly) and drive the gust's sound from it.

**Decided:**
- **F, taken, at 7.5 s, not 8.** The shots are now 15.0 / 19.0 / 23.6 / 27.0 (`SHOTS` in `defs.ts`), the dusk cut still 34.5. The first wide's gust (11.5 s, exactly a second in) has to finish before the cut to him, and with the canopy's slower spring restored, 2 s more would have cut it off or pushed it into the opening-out. The sound reads the cut, the shots and the air from `defs.ts` (one edit moves both; tested).
- **D, taken.** Gust 2 and its leaf are gone (the second wide has no gust: its stillness is the cut's), and so is the seed. A test now covers gusts and falling leaves under "nothing in a shot's first second" (from a second in) and checks that the leaf is gone before the cut to him.
- **G, taken.** Her blink is dropped. `c5-end-shut` and `c5-end-half` leave the kit (11 close-up drawings), and her close-up is start, eyes, halfway, end.
- **H, taken.** Without `pencil-after.png`, the way back uses the artist's `pencil.png` with the two of them taken out: the grass beside them is mirrored across (`reflect_fill`), with no outline and no smudge. The prompt now asks for "nobody lying in the grass; the grass drawn through where they were". The faces say "mouth at rest", not "not smiling".
- **B, taken.** One sprig of the near tree's own oak leaves, cut from the day painting where they are dark against the sky, sharp (mip bias 0.5). Its pass is authored on the timeline (`scene.leaf`, 9.3–9.85 s, the last half second of the opening-out): in from the near tree's side, growing and quickening, out past the frame's edge by its end. It is drawn only for someone taken in, fades with a turn, never plays on the way back, and is absent under reduced motion. It is the artist's own ask ("foreground leaves pass close to the lens"), so it stays, as one.
- **C, taken.** `scene.push` is deleted, along with its uniform and schema entry. This reverses "kept against the skeptic" above: −0.015 was unreadable while the frame moves by hundreds of pixels.
- **E, taken.** The eyes-only faces are not adopted (the artist's shot list has the head turns), and there is no comparison film. The artist is offered the option, to compare in the kit's flipbook once the eye drawings exist.
- **The canopy, taken.** It sways at 0.45 Hz, damping 0.6, again. What is heard of a gust is the canopy's own sway over the middle of the clearing, 0.4 s before it is seen (`gustSway`; tested: peak 0.4 s early, full strength for a full gust, nothing in the second wide).
- **A, taken in the skeptic's form, after checking.** The crossing's frames, probed after the first fixes, still showed "I wanted you to" across the two of them at 6.5–7.5 s.
  - Each piece of the room's writing under the painting now goes to a trace (15%) as the colour reaches it: the order map is read once, and the wall's own colour edge is used. It comes back as the colour leaves.
  - The memory's own line was left out, believed kept in a bloom of plaster; QA found it isn't (below). While the pencil draws, graphite stays with graphite.
- **Found in the same frames:** at 6.5 s his body was a white, figure-shaped gap in the painting.
  - The cause: the colour started at the words, the words lie over the two of them, and the colour was held for their lines, which are drawn last. A floor in the order map's own units held it to 7.2 s.
  - Now, once the drawing is whole (its last line ~5.0 s), the colour comes at 5.4 s, out from the two of them. The drawing finds them last; the colour begins with them.
  - The floor is in real seconds (at least 0.4 s after a line) on the timeline's two clocks. A test keeps the script's copy of them the same.
  - Also, the order map's earliest values were 0, which the wall shows half drawn and half coloured before anything has happened. They now start at 0.02 (pencil) and 0.12 (colour).

**QA on the built changes** (`qa-accessibility`, commit 5ad9eed). These held:
- The suites pass, and no shader program is compiled after entry.
- The sprig respects reduced motion, wall-only visitors and the way back.
- `colourAt` reads the order map the right way up (checked against an independent decode in Chromium).
- The order map keeps to the timeline's clocks: the last line is drawn by 4.96 s, the first colour shows at 5.44 s, and the colour reaches about 5.5% of the painting each 0.1 s.
- The sound leads the canopy by 0.4 s, and nothing in the sound is within 0.7 s of a cut.

Fixed:
- [P1] **Let go early, the room's writing stayed hidden on bare plaster for about 2 s after the painting had gone, then snapped back.** The wash followed only the colour, which an early let-go leaves where it was. It now also follows the painting's presence (`washOf` in `src/world/living/wash.ts`); tested through a real controller let go at 7 s and at 20 s.
- [P2] **A line half over the painting stayed at full strength, and a long line went all at once.** The writing is now judged at five points across its box, those off the painting uncoloured.
- **The memory's own line** sat over the painting at full strength: a painting drawn in order lies under its words with no bloom of plaster round them (`uOpen` 1). It now washes like the rest, so the painting has no writing on it, as in image 3, and the words come back to the white wall after it.
- [P2] **Let go mid-pass, the sprig was cut in one frame.** It now stops where it is and goes in 0.2 s. It also follows reduced motion as it is now, not as it was when the memory began, and so does the falling leaf.
- [P2] **The leaves' sound jumped from right to centre as each gust died.** The pan is now weighted by the gust's strength; the largest step is 0.019 a block (tested).
- [P2] **Tests that passed for the wrong reason.**
  - The sound's lead is now tested through the sound's own `heard`.
  - The calm before the cut to him had been relaxed to 0.5 s to fit; the first gust now crosses in 0.8 s (the director's "1.0 s or less"), so the cut has a real 0.8 s of calm, under 4% by the cut itself.
  - The order map's clocks are written to the manifest by the script and tested against the committed timeline, the one that plays.
  - The sprig is now tested in the way-in harness.
  - The memories playtest now fails on a program compiled after entry or on growth.
- [P2] **The order map's reading failed silently.** It now falls back to a page canvas and warns.
- **Simplified:** `gustAt` deleted (no callers). Her blink in the first wide is gone: in 4.5 s it already holds a gust, a leaf and her foot.
- **Found in the re-recorded film: the sky tore in the gust** (the cinematic director's earlier note, not yet fixed).
  - The cause: the clouds and the mountain ridge are in the painted sun-flecks map too, and the flecks' brightness pattern, shifted with the leaves (up to ~16 px in the gust), printed offset copies of their edges.
  - The flecks now stay out of the sky, their shift is capped at 5 px, and the leaves' sway at 7 px: the painting's own rule, "nothing that moves more than a few pixels is moved inside the painting".


## The directors' evaluation of the re-recorded film, and the skeptic's third review

The cinematic and creative directors watched the re-recorded film (desktop, the afternoon, 0–53 s, HEAD 7a9a44c).

- **Both:** the crossing no longer pops (its largest step in centre brightness is 3.9/255 a drawing, from 55), each gust is heard as it is seen, the return carries over 2 s with no lasting stain, and the second wide and the one-frame cut to the empty dusk are the work at its best: add nothing to them.
- **Cinematic director:**
  - [P1] "I wanted you to" captions the two of them for about 1.2 s as their colour arrives: a line's wash was the mean of its five points, most of them over bare plaster, so it lagged the colour by ~1.3 s.
  - [P1] The crossing's last second is a 0.9 s zoom (the settle eased twice) with a dark sprig flicking through it: as dark as the painting's darkest 5%, sharp, three drawings long.
  - [P1] The stand-in close-ups are 12 s at the centre where nothing is told, and their eyelines contradict the wide (both already look at each other, smiling, before the beat).
  - [P2] The first wide spends its emphasis on the trees: its gust is the loudest half second of the memory (+6 dB over the whole mix), louder than the silent cut is weighty; the falling leaf reads as a sprite.
  - [P2] Both gusts are heard on the right while the left oak sways first and most.
  - [P2] Make the light lead: a trembling dapple. [P2, speculative] The hands are the shortest shot.
- **Creative director:**
  - [P1] For about 5 s of every visit the painting is a picture with corners, not a clearing coming out of the plaster.
  - [P1] The room's unfinished sentence captions the memory at its two most legible moments, the first colour and the last.
  - [P1] The return's quiet comes late, and its own "pencil alone" beat isn't on screen.
  - [P1, speculative] Shot 5 is written as a returned look; "she notices" could be the dilemma instead.
  - [P2] The sprig is the least painterly thing in the film. The colour's arrival opens separate dark blots that read as stains. [Speculative] The last of the dusk colour reads as a scorch.

**Fixed first** (commit 2a5d16f, the verified defects):
- The leaves are heard where they sway: a gust starts on the left with the near oak and travels right with its front, panned only as far as it is heard.
- The opening-out is eased once, over ~1.6 s.
- The overlay's graphite edge is light (it printed as a sooty speckle).
- No motes in the shade (one there glowed cyan-white on a dark ground).
- The evening sky drifts behind the dusk painting's own leaves, through a matte cut from that painting (through the afternoon's it showed leaf-shaped halos).

**The skeptic, on the reconciled plan for the rest.** The plan fixed real defects but added more than it took away, in the 5 s of the crossing that already carry about a dozen overlapping systems. Most important: don't restage the sprig; delete it and ask the artist to draw it. The biggest thing missed: the wall painting is a dark multiply where image 3 is luminous (its median 0.34–0.35 of the plaster on the way in, 0.26 on the way out), and that one cause makes the islands read as stains, the leaving as a scorch and the corners loud.
1. [P1] Delete the sprig; put it in the kit.
2. [P1] Take the creative director's way with the writing (it comes back to a white wall, after the empty clearing's pencil has been alone a while), and wash it on the revisit too, which captions the absence for its whole 16 s.
3. [P1] Lift the wall painting toward the plaster, all the way at the colour's front, before building any silhouette.
4. [P1] The extent: only the minimal version (a rounded rectangle, the band wider as the painting grows, the graphite running to the plate's edge), and one optional kit line for the artist's own mask. No loader for a file that doesn't exist.
5. [P2] The single ease re-timed the return the cinematic director asked to protect (its close fastest just before it lands; the light leaving before the frame has closed). Restore 0.68 and give the way in its own key.
6. [P2] A weaker gust barely lowers it (−2.7 dB: the leaves were balanced on the whole render, which hands the cut back to everything else) and shrinks the first wide's one visible event. Keep it whole in the picture; in the sound, halve only the gust's term and balance the leaves on the breeze alone. The artist must listen.
7. [P2] Cut the dusk gust: the loudest moment in the empty clearing, 3 s after the cut, marking it after the fact.
8. [P2] The max rule must keep QA's "a line half over the painting goes half way" (`on / 5`, presence, and the hold through both).
9. [P2] The warm light before the pencil isn't perceived as light (two pale smears after the first stroke): gate it by the colour, let the cicada lead, no dapple.
10. [P2] The colour order: the ranked distance from between their heads, one soft noise, the existing floor, and a script that fails on a second coloured part over 0.2% of the painting (there were 2–3, the largest 2.8%).

Remove: the sprig system, the falling leaf (and the shader's seed and leaf branches), the smears before the pencil, the dusk gust.

**Decided** (all taken; commit 8dfcfff):
- **1.** The sprig is gone: `scene.leaf`, its texture, its uniforms, its test. The kit asks for `c2-leaves.png` (optional): the near oak's leaves very close to the lens, out of focus, lit from behind.
- **2.** A piece of writing under the painting goes to a trace as soon as the colour (0.05 ahead of it) reaches any of its five points on the painting, only as far as its share of those points is on the painting and as the painting is there. It stays a trace while the pencil is there (`window.wash`, held no further than `window.sketch`), so after the colour has gone (47.8 s) the empty clearing's pencil is alone, and the words come back as it goes (49.8–51.3 s), to a white wall. The revisit washes its writing too.
- **3.** The painting drawn in order is lifted toward the plaster's lightness (`LIFT` 0.35), all the way at its colour's front. See the measurements below for why it stays at 0.35.
- **4.** Its edge is a rounded rectangle, never oval; the colour keeps inside it, the pencil runs on to the plate's edge. The overlay's edge is rounded too, its band from 0.18 of the frame down to 0.012 as it opens out. The kit asks for `colour-extent.png` (optional); there is no loader until it exists.
- **5.** The settle is back to 0.68–1, and the way in has its own key (`scene.immerse` [8.2, 0.68, linear]): the opening is one ease over 8.2–9.8 s and the return is as reviewed. Under reduced motion there is no settle at all.
- **6.** In the picture the gust stays whole. In the sound its own term is halved, and the leaves sit 6 dB under the cicadas measured on the breeze alone.
- **7.** The dusk gust is cut. One gust is left, in the first wide (tested: none in the second wide, none after the cut).
- **8.** As specified, with tests: the line goes at its first coloured point, half over the edge it goes half way, and played through the controller it stays a trace while the pencil stays and comes back with the plaster.
- **9.** The light comes only with the colour; the comment in `defs.ts` is corrected. No dapple.
- **10.** As specified (below).
- Also removed: the falling leaf, the seed and leaf branches in `materials.ts`.
- **Not taken now:** gating the stand-in face close-ups (nothing is hosted, so no one sees them yet; when it ships without the drawings, gate the faces and keep the hands); the hands' length (judge it on the animatic); the return's retiming (2 now gives its pencil-alone beat). The creative director's "she notices" reading of shot 5, and the eyes-only faces, go to the artist as an offer, not a change.

**Built, and measured:**
- **The colour front** (`scripts/stroke-order.py`): the ranked distance from between their faces (the rig's face deformers placed on the painting: 602, 489 px), broken by one soft noise (0.15 of the furthest reach, σ 36 px). Every step of the reveal colours one part; the largest other part at any step is 0.09% of the painting. At 0.24 the noise made a 0.54% island, and the script refused it, writing nothing. On the current clocks the floor is never reached: the last line is drawn by ~4.95 s, the first colour shows at ~5.66 s.
- **The sound** (offline, at the cues' gains, 0.4 s windows, the same render with and without the two changes): the gust's peak (12.2 s) went from −38.4 to −41.8 dB, from 6.1 dB over the first wide's breeze to 2.3 dB; the rest moved by about +0.4 dB (the second wide −44.3, the empty clearing −43.5, the close-ups −48.0). The leaves are still a synthesised stand-in, and only listening decides.
- **The wall painting's lightness**, rendered for a visitor it stays on the wall for: the painting's median is 0.45 of the bare plaster behind it (linear luminance, the same pixels with and without it, at 12 s and 20 s), from about 0.34. The skeptic's target was image 3's 0.57; measured the same way, image 3 gives 0.42–0.53 by which patch of its plaster it is set against. So `LIFT` stays at 0.35: lifting further would pale the colour away from image 3, which is more saturated than ours.
- **A full run of the cutter** (in a scratch copy) reproduces every committed image within 2 levels, and the manifest but for one key's place.
- **Found in the revisit's frames, and fixed** (the commit after 8dfcfff):
  - [P1, introduced by 8dfcfff] The writing under *every* memory's painting was washed, not only the woodland's: the branch for a memory without a living scene serves the cereal, bedroom and door memories too. Now only a living memory washes. Checked: the cereal memory's writing is never washed (0 over 0–20 s), and the light's own wash of a memory's line is unchanged.
  - [P1, older: it showed once the room's layout put the painting square under its words] The revisit's painting was a dark strip under its words. The bare plaster kept round them took its top half (the window's top is just above the words, and their placement box is 0.21 m tall), and at full strength the dusk was a black stain. Its words are washed now, so it keeps no plaster round them, and it is sunk (0.72) as the afternoon's scene is. It reads as the clearing again.

**QA on the built round** (`qa-accessibility`; no browser while the film recorded). These held:
- The removals are complete, and all eight sheets in the timeline state match their seeds.
- The wash rule, the hold and the gate run smoothly through the real controller (the largest step a frame is 0.06), and the writing is back at completion in every run.
- `order.webp` decodes as built: one part at every step, values in range, the clocks matching.
- The return closes and then the light goes, mirroring the way in.

Fixed:
- [P1] **The App's wash wiring was untested:** the regression of 8dfcfff passed the full suite, and so did its fix. The frame's inputs (the gate, the revisit's colour time, the hold, the presence) are now one pure function, `washInputs` (`src/world/living/wash.ts`), which the App calls. It is tested by playing every memory and variant to its end through the controller: the cereal, bedroom and door memories never wash, and the revisit washes by 6 s and gives the words back by its end. The window's revisit uniforms are tested too. Each test was checked against the defect it guards: the gate removed, the presence unweighted, the revisit unlifted each fail one test.
- [P2] **The ordered painting's light ran past the colour's rounded edge to the plate's straight edge** (up to 32% brighter along 14% of the top edge at 6 s). It is now masked by the edge with the colour.
- [P2] **Under gentle intensity the words were only half washed:** the presence is weighted by the intensity, and the wash took that weight too. The wash now judges against the painting as made: it is fainter, but no less there.
- [P2] **The revisit was sunk but not lifted.** It is now the same pigment in the same plaster as the afternoon, lifted as well. Rendered, its median went from 0.20 of the bare plaster to 0.34 (QA's offline estimate had been 0.31 to 0.43); the afternoon's is 0.45. The dusk stays darker than the day, and no longer reads as a blot.
- [P2] **Switching memories could throw** (older; the editor's and the debug paths only): disposing the memory completes it, and its completion had already let it go. The switch now cleans up only if it hasn't.
- [P2, older] **The trees' chorus swelled about 2.6 dB just after the cut,** a little mark. Its slow swells are now held still from 1.5 s before the cut to 3.5 s after it, and the woods stay within ±0.4 dB across it, until the cicada's phrase ends and the day thins as designed. The test now checks half seconds over 33.5–37 s. The chorus's draw-back for her hand now starts 0.7 s after the cut to the hands, not 0.6.
- Two stale comments.

**Checked in the browser afterwards** (the rebuilt app, `npm run build` passing its dist check):
- The afternoon and the revisit both played to their ends: 22 shader programs at boot and after each, so nothing compiled after entry.
- There were no page or console errors, no failed or missing requests, and no request for the removed leaves texture.
- For a visitor it stays on the wall for, the light keeps inside the painting. Beyond the plate's edge the wall is unchanged (×1.00 at 7 s, ×1.01 at 10.5 s), and so is the band between the plate's straight edge and the colour's ragged one (×0.985).

## The artist's brief: "make the woodland memory unforgettable" (2026-10-18)

The artist gave the memory over: the ~53 s sequence is a rough cut, not sacred. Deliver "a beautifully directed, emotionally intimate, cinematic 2D animated memory that feels like a fleeting fragment of someone's actual life": warmth, familiarity, unspoken affection, "the desire to be close to another person — and the almost imperceptible uncertainty or distance that can persist even in our happiest moments"; nothing that tries "conspicuously to be sad"; a genuine hard cut to the same clearing at dusk, empty; the return to the white room. "Restraint is an artistic choice. Lifelessness is not." Name any missing asset rather than disguise it; no paid generation without asking.

**Diagnosis.** The heart (15–27 s) was three held, enlarged thumbnails: the character sheet's ~260 px close-up panels at ~5×, soft, the grass round them smeared, both of them already turned and smiling before the beat meant to bring them there. Nothing was performed, and cross-cut singles made her look and his a returned one. The way in, the one-frame dusk cut, the held empty clearing and the return worked.

**What existed and wasn't used.** The sheet's own top panel (both of them lying side by side looking up, their hands resting almost touching in the grass), which is already the wide's puppet, cut at 0.8; and the artist's own three redrawings of that panel with only her head changed (`references/woodland/drawings/b-look-full-{a,b,c}.webp`): turned to him, mouth at rest (b), and the same with a faint smile (a, c).

**The proposal** (reviewed before building): one continuous two-shot from that panel in place of the close-ups, the same rig and deformers as the wide, her turn in the artist's own drawing, his look rigged inside his eye openings; a slow push; leaf light; their breathing; the second wide; the cut.

### The specialists (all six, the experience changing substantially)

- **Creative director.** The structure is right: one two-shot is the only staging that shows what neither of them sees. But the heart over-tells: seven signs of one feeling in 20 s (his look, hers, her smile, his held breath, her reach, his fingers answering, breathing falling into step), mostly stock romance cues; the dusk then mourns a harmony they had, not a chance. Keep only the looks: her drawn turn first, his small look last, cut while he is still looking. Leave the hands as the artist drew them, almost touching, never moved, silent. No smile takes. No breathing in step, no held breath. Second wide at least 7.5 s. Lock the camera or finish any push before her turn. No foreground blades; the upscale only if the artist sees it first.
- **Cinematic director.** Keep the structure; cut to dusk from the second wide (a frame nobody has seen for 18 s reads as a new establishing shot). P0: on an upright phone the two-shot holds her face and his shirt; below aspect 0.9, keep the wide. A push that lands as her head lands; his glance a full sidelong one to the corner of the eye; take b only (c and a redraw her whole head: a second head move); grade the panel's grass to the painting's and blur by depth, never as a ring; no cloud, no new dapple: move the painted flecks. Proposed an 18 s two-shot and a 59.5 s memory, with a reach that stops short and breathing falling into step.
- **Sound designer.** Synthesised breath can pass only at threshold, shaped by the rig's own airflow, carried through the second wide to a pause on the dusk cut. The grass is too loud for a finger's width. The white room's hum and drone play under the clearing at −10.5 dB, and its passing swells and chord glides can land in the heart. The dusk is nearly as full as the afternoon.
- **Technical artist.** One rig, one program: right. P0 upright (as above). His gaze as a masked UV shift drags the lash line into the eye; build eyes that move the iris along the opening. Her head: one region shared by all takes turns a smile into a whole-head jump; b only, a tight region. The rig was tuned for ~0.5×: breath ×0.4, roll ≤ 2° close. The out-of-focus ground read as a backdrop: one depth model across ground and bed, correct proportions, no specks. Remove the shader grain; one moving light; bake the wide's light match into the panel (the faces dropped ~10% at the cut). Against the anime upscale (it re-inks). The shader is at 15 of 16 texture units: no new sampler.
- **Interaction designer.** P0 upright: no two-shot under 0.9; the heart plays in the wide, so every performed state must be drawn there too. The give-way latched the whole 20 s on one glance: make it release-and-return, every state in both shots. "Seen" counted a 9 s visit forever: give the memory a `seenAt` at her look. Wider proposals: nobody beyond the walls afterwards, the line receding, a light pool for wall-only visitors, a one-frame vanish on an early leave, pacing rules.
- **Skeptic** (on all five and on the main session's leanings). The structure is right and the working tree already builds most of it well. Two things wrong: accumulation (the reach, the stir, synthesised breath, the held breath, two camera pushes each tell what the shot should leave open), and length: a 16–18 s two-shot quietly breaks the reviewed ending (about 25 coupled times after 27 s). Put three beats in the close-ups' existing 12 s slot, keep 53 s. Her look first is right mainly because it survives every screen (in the wide his look is under 2 px). Hands as drawn and silent (the seed held her hand drawn back until 24.6, which up close doubles her sleeve). No breath sound until a recording exists. Lock the camera everywhere. The heart must not go back to "still images": make the bed's grass sway on the shared wind and measure it. Keep the one light the tree already has (the wide's own leaf light at the same place). Hold the room's ambience from the memory's start. Keep the give-way as built and `seenAt`; cut the aftermath rules, the receding line, the wall light pool and the one-frame vanish as scope creep. Stop loading the close-ups. Test the two-shot path.

The artist decided one thing before the reviews could: shown Lanczos and Real-ESRGAN (anime, 6 blocks, CPU, free) side by side on her face and his shirt, they chose the upscale ("I thought the upscaler looked really good"). The technical artist's objection (it re-inks) is recorded; the two-shot's art is the 2× upscale, the phone's set the sheet's own size.

### Decisions (main session, after the skeptic)

1. **Length and order.** The memory stays 53 s and nothing after 27.0 s moves. The two-shot replaces the close-ups in their slot, 15.0–27.0, and holds three beats: her eyes go to him (17.5) and her head follows, a straight cut to take b, held (18.0); her eyes, then her head, back up to the sky (21.0, 21.5); his eyes go to her (24.0), his head rolls a little after (24.5); the cut to the second wide while he is still looking (27.0). His look is the shot's last and most private act; he can look at her only when she can't see. *Why:* the creative director's restraint and order, the skeptic's arithmetic (the extra 4.5–6.5 s of the longer cuts bought slack, not meaning, and would have re-timed the reviewed ending). *This reverses the artist's shot list* ("4 he looks toward her, 5 she notices"): recorded here and put to them with the film.
2. **Her face.** Take b only (her mouth at rest; b already keeps her faint smile). No a or c. Her eyes lead her head by half a second; no morph, no blink inside the turn (warping tore her face before; a blink in a turn reads as a decision).
3. **His look.** Eyes to the corners of his openings (the iris moves along each; the white fills in where it was; the lash line stays drawn), then a roll of about 2°. Mouth unchanged: his drawn faint smile, turned toward her, is the shot's only smile. It is a stand-in for a drawing that doesn't exist: the artist is asked for one (his eyes turned to her, head and mouth unchanged, made the way her takes were). If it reads synthetic at speed, the fallback is his eyes closing.
4. **The hands.** As the artist drew them, almost touching, never moved, silent: `figure:b.hand` held at 1 (its default, 0, is drawn back), no reach, no answer, no grass sound, no limb deformer.
5. **Breath.** No breath sound in this build, no falling into step, no held breath. The rig's breathing stays (two rhythms that never meet); his stale held breath at 20 s goes; the pauses that put both between breaths at the cut stay. The sound designer's voice-memo specification goes to the artist as an ask.
6. **The camera.** Locked. The two-shot is one framing ([50, −10, 790] stage px: both faces, both hands well above the frame's foot, his face inside a 4:3 screen), the first framing ([21, −50, 889]) on a very wide screen. No push anywhere. *Why:* the push was removed twice before; the cut in is already a ×2.8 move; a push that lands on her look announces it.
7. **Upright screens.** No two-shot under aspect 0.9; the wide, unpushed, with her turn and his look drawn in it; the dusk cut is the only cut.
8. **The give-way.** Release-and-return (as built): past 14° the wide; settled under 6° for 1.2 s, the two-shot again, on a new drawing, never within half a second of a beat, never in its last 2 s. Her head and his eyes are drawn in both shots.
9. **The light.** One light: the wide's own leaf light, evaluated at the same place on the painting, so the cut keeps it. No grain, no procedural dapple, no moving flecks on top, no cloud, no foreground blades. The wide's light match is baked into the panel.
10. **Life in the heart.** The grass of their bed sways on the same wind as the wide's grass (none within 25 sheet px of their bodies), measured on the recorded film against the second wide's share of moving pixels (≈5%): below it, the artist's "still images" note is back.
11. **The room.** Its ambience is held from the memory's start (no passing swell, no chord change under her look), and while the visitor is inside the painting the room's hum goes further down (the white room is not in the clearing); it comes back on the return. How deep is for the artist's ears.
12. **Seen.** The woodland counts as seen only once the visitor has been taken in and reached her look (`seenAt` 18 s), not after 8 s on the wall.
13. **Not taken:** the 18 s two-shot and 59.5 s memory; the reach and his fingers; breath in step and the held breath; any push; the upright two-shot with painted ground; the aftermath rules (nobody beyond the walls, the receding line), the wall light pool, the one-frame vanish on an early leave (scope creep, and it would spend the ending's image on someone who left); pacing rules as tests (guidance only); a second evening call fewer at dusk (for the artist's ears, separately).
14. **Assets.** The stand-in close-ups are no longer loaded or used (they cost 12.6 MB on a phone, 26.4 on a desktop). The kit's eleven close-up drawings are no longer needed; it now asks for his look, optionally a halfway drawing of her turn, and optionally a voice memo of their breathing.

### Built (commits 4bc04e2, a413b4b), and measured

- **The art** (`scripts/two-shot.py`, from the 2× upscale): the atlas reaches as far across the panel as the camera ever looks (sheet x 1000: 2000×2024 px on a desktop, 1000×1012 on a phone); the lids' rows are cut to the box round their eyes and her sleeve (920×1388 against 2896×3046 for the whole panel). About 24 MB of the two-shot's textures on a desktop, 7 MB on a phone, and none on an upright screen, which never shows it (only her head turned to him at the wide's size, 320×144 px, loads there). The stand-in close-ups are gone (they cost 26.4 MB on a desktop and 12.6 on a phone, loaded and never drawn).
- **Her head**: the region it is laid in is where take b differs from the sheet (blurred difference over 0.07), closed, filled, grown 6 px and feathered 2 px: 200×180 sheet px, its edge band where the two drawings agree (99th percentile of the difference there 0.068). Take b moves −0.22, +0.04 px onto the sheet. The same region at the wide's size, from the cutter's own people made from the take.
- **Their eyes** were re-measured on the 2× panel: his right eye's opening had been placed 8 px below the eye (on the skin under it), which was the dark streak in the first look, and his left eye's was tilted 20° off. Her openings reach her lower lids (her irises are large: cut above their lower rims, the old iris left a dark arc when her eyes moved). A look moves the iris along the opening, sampled from where it was drawn; the white fills in where it was, shaded under the upper lid; the lash line, outside the opening, never moves. His look reaches the corners (half of each opening's long radius: about 5 and 3.3 sheet px).
- **The light match** (the wide's, `cut-woodland.py light_match`, now one function) is baked into the panel: the faces no longer drop ~10% at the cut in.
- **The ground and the bed**: one depth model (`defocus`): nothing on them, the bed sharp beside them, softer away, softest beyond their heads (σ up to 11 sheet px), across the ground and the outer bed alike; the bed graded toward the painting's grass where they lie (Lab mean and spread, 0.7, away from their bodies); specks under 40 sheet px removed. The ground is the day painting's meadow where they lie, a little taller than wide (the painting sees it at a slant).
- **Motion in the heart** (`tests/playtest/motion.py`'s block matching on 1280×720 captures, half a second apart): at first 1.4–2.2% of the frame moved 2 px or more, under half the second wide's 5.2% (the artist's "still images" again, as the skeptic warned): the bed's sway was keyed to the coarse body outline, which also covers the grass between them. Keyed to the figures' own pixels (colour-segmented), the grass between their heads, beside them, round their hands and at the frame's foot moves, and the two-shot moves 5.4–7.0% (16, 19, 23 s). Their outlines don't move; her breathing is up to ~4 screen px at the chest.
- **Tests** (385): the two-shot's timeline (when it is on, the beats, her eyes leading and following, his look last and cut while it lasts, the hands never moved, no grass cue), the spec, timeline and room agreeing on its times and `seenAt`, the screen-reader lines, the release-and-return choice (beats and the last 2 s honoured), her head in either shot and his look only close, no two-shot without her look in the wide, every file in the manifest, and the program's samplers (14, at most 16).

### The film evaluated (the creative, cinematic and sound directors), the skeptic, and decisions

The three watched and measured the recorded heart (15.0–27.0 s), its two cuts and the dusk cut.
All three: it works as cinema (one locked two-shot of the artist's panel, a hush that frames it, the
cut out while he is still looking, the dusk cut now taking away two people we were close to).

- **Creative director.** The one thing to change is her turn: a one-frame swap of her whole head,
  the loudest event in the shot; and a keying defect made the eye she looks at him with olive and
  lightless (her catchlight keyed out as paper, the meadow showing through). Also: the trees'
  chorus swells inside both looks; her far eye barely moves when her near eye goes to him; his face
  13% darker in the two-shot than in the wide; his look could read as sly. Remove his blink at 16.2
  (his face would then first move on his look). Add nothing.
- **Cinematic director.** Her turn the same; make the halfway drawing a requirement, two drawings
  each way. Outside aspect ~1.3–2.45 the locked frame cuts his face (4:3 touches his ear, 1.0 half
  his eyes) or hers and the hands (21:9): bands of frames, the wide outside them. The bed's grass
  sways as one sheet on one clock (0.50 Hz, correlation 0.80–0.96 across 760 px) and changes most
  between their faces. The chorus swells crest under both looks. His face 15% darker. His breath
  stops for 2.5 s exactly while she looks at him: the held breath that was removed, back by chance.
  Keep the locked frame, the 12 s, the order, the hush, the cuts.
- **Sound designer.** With the cicadas over and beside them quiet, the chorus's unauthored slow swell
  is the only moving sound in the heart and peaks under both looks (+4.8 dB, +7.6 dB): flatten it
  there to ~0.3, and let the leaves follow the visible wind. The room's music stops under a memory
  but its reverb doesn't (a phrase already playing goes on as a reverb-only piano over the memory's
  opening). A mid cicada comes back faded in mid-phrase 0.8 s after the cut out. The deep hush's
  release is front-loaded (+9.4 dB of its ~14.6 in under a second: the hum back like a switch).
- **Skeptic** (on the main session's proposed reconciliation). It removed motion on three channels at
  once (his only blink, the grass between their faces, the chorus's swell) and its compensation (the
  leaves) is too small to perceive and reaches the dusk cut. Keep the blink (without it nobody
  blinks from 13.4 s to 31.6, two faces at 3.3× for the whole 12 s close, his face moving only on
  cue) and add it to the beats a return avoids. Flatten the chorus (its swells are phase-locked to
  both looks, measured); drop the leaves (no canopy in the two-shot; ±0.3 dB in the mix). For the
  grass, one constant (clumps at the two-shot's own scale), no ellipse (it reverses decision 10), no
  per-clump clocks. The halfway drawing second, ahead of his look, the same timing both ways (its
  return drawing before the panel's head, so the half-second linger survives), her hair named in
  the prompt, wired in only once it exists. Gate only the music's reverb now (gating through the
  room's silences changes every silence in the room, unheard). Drop the relaxed lids from his prompt
  (heavy upper lids with a sidelong glance are the stock sly look). The vignette fix brightens every
  shot inside the memory, not only his face. Hold the band for the shot (a browser's bars must not
  reframe it).

### Decisions (main session, after the skeptic)

15. **His face** was not the light match: the atlases and the render target agree (his cheek 0.50 in
    both). It was the room's screen-space vignette (the `reference` look: 0.2, centred low at 0.42 of
    the height): at his cheek, upper left in the two-shot, it multiplied by 0.927, at his cheek's place
    in the wide by 0.988; 0.938 in sRGB is 0.87 in linear light, the measured 13%. While the two of
    them are close (and only then: the wides and the dusk keep the vignette they were reviewed with,
    the cut hides the change), the vignette is centred and falls off further out (1.1 → 0.45 instead of
    0.95 → 0.25): his cheek 0.997.
16. **His blink stays** (the skeptic, the cinematic director, against the creative director: involuntary
    life follows from time; a face that moves only on cue is the artist's "still images"), and a
    release-and-return keeps half a second from it.
17. **Her turn.** The halfway drawing goes to the artist second, ahead of his look (the snap is seen
    twice by everyone in the two-shot; his stand-in reads as a look), with her fringe in its prompt and
    the test that the three heads flipped read as one girl turning. Laid two drawings each way: toward
    him 18.0–18.17, back 21.33–21.5 before the panel's head, so the 0.5 s eye lead and the 0.5 s linger
    both stay (the creative director's slow-toward, quick-away was one drawing against two, 1/12 s,
    imperceptible; the cinematic director's layout cost the linger). The cutter takes it when it is
    there (`b-look-full-mid`, one region round both takes, cells [b, mid]; the same output to the byte
    without it, a stand-in run gave the three cells), the engine already takes any number of cells; the
    two keys go on the timeline when the drawing does. Until then the turn stays the cut, never a warp.
18. **His prompt** stays to his eyes (the skeptic: a second instruction to an eyes-only edit invites a
    redrawn head; heavy lids read sly). How it reads is judged in the flipbook.
19. **Her far eye** moved as far as its opening allows (its catchlight 5.0 screen px against the near
    eye's 5.6); what hid it was the colour filled in where the iris was: the drawing shows no white in
    that eye, so the white sampled was skin, and the look read as the eye narrowing. An eye whose white
    samples as skin takes its partner's (hers; his far eye's sampled white reads as white and stays).
    The opening and iris were re-checked on the 2× panel: they fit.
20. **Their breath.** Neither takes a long pause from half a second before her eyes go to him to the cut
    out (`steady`; his had fallen at 18.8–21.3); both still at rest across the dusk cut (the breath each
    would take just before it waits: his 0.9 s, hers 2.4 s). Tested: no still chest over 1 s during
    either look.
21. **Screens.** The two-shot only for 1.3 ≤ aspect ≤ 2.45, framed by band (1.3–1.5 [0, −60, 940],
    1.5–1.9 [50, −10, 790], 1.9–2.45 [0, −80, 1000]), the wide outside; the band chosen as it comes on
    and held while it lasts, through a browser's bars coming and going (0.1 either side). Tested at
    every 0.05 against both faces and all three hands (8 px margin at least). Phones in landscape wider
    than 2.45 (some Androids, 2.69–2.74) get the wide: no frame inside the atlas's reach holds both
    faces and the hands there. The widest frame's screen edges never sample past the atlas (the screen
    sees sheet x 28–972 of it).
22. **The bed's grass.** The skeptic's one constant, measured before building (the shader's sway
    reproduced offline, wind table, noise and map included; it gives the cinematic director's numbers:
    patch correlations 0.69–0.87, points 40 px apart 1.00): clumps at the two-shot's scale alone leave it
    one sheet (distant pairs 0.73 on average, 93% over 0.5), because the wind's shared bend dominates. So
    the skeptic's own fallback, the balance toward the clumps (bend 5 → 1.5, clumps 1.8 → 3.2), with
    clumps 80 sheet px across, their phases spread 1.5 turns, their pace wandering ±20% (bounded: a
    phase modulation of the flutter's existing clock, not a clock of its own) and their sway following
    the air: distant pairs 0.15 on average, 14% over 0.5; the cinematic director's four patches 0.18–0.40.
    Halved round both faces and the grass between them (the busiest grey-level change in the frame,
    which both looks cross); the bed still moves more than before (52% of it ≥2 px per half second,
    against 47.5%), so decision 10's floor holds. Shear: 99th percentile 0.28 px per px (0.24 before).
    Checked on the film.
23. **The chorus** in the trees is shallow while they are close (its swells to 0.3, eased in under the
    gust 11.0–13.5 s, out under the cicadas' return 27.8–30.0): tested, the woods change by under 1 dB
    across either cut and range under 3 dB through the heart. The leaves don't follow the wind (dropped:
    the skeptic). If the artist hears the heart as dead, the knob is the depth.
24. **Sound, otherwise.** The room's music into the reverb is gated with the music itself under a memory
    (one gain, closed by `memoryHush`; a tail already ringing decays); the room's own silences and the
    drone's send are untouched (their own round, with a listen). The two cicadas either side come back
    out of their quiet only at a phrase's start (the one faded in mid-phrase goes). The hush comes back
    evenly in loudness (an exponential ramp, the deep release 4.5 s); it still falls at once.
25. **For the artist's ears and eyes** (perceptual, every evaluator's speculation): the snap of her turn,
    the grass, his blink at speed (the re-joined film, 12–36 s, full screen); the chorus at 0.3 against
    1.0; whether the hush framing the two-shot reads as the world holding still or as a dropout; the near
    cicada's return at 28.0 (the second wide's first event now the bed is steady) or about 29 s.
### Measured on the new film (desktop, 1280×720, 12 drawings a second; `test-output/review/woodland/heart/`)

- **Faces across the cuts** (linear luminance, two-shot over wide, the cinematic director's points):
  his cheek 1.03 at the cut in and 1.04 at the cut out (0.88 and 0.88 before), his forehead 1.07 and
  0.97 (0.86, 0.76); her cheek 1.00 and 1.00 (0.94, 0.94), her forehead 1.05 (0.92).
- **The bed's grass** (15–27 s; frame-to-frame phase correlation of four patches, her head's
  changes left out): correlation between patches +0.54 to +0.77 before, −0.60 to +0.41 now (the one
  strong pair swings in opposition). Change per frame (median grey levels): between their faces 4.2
  (5.2 before), the rest of the bed 2.2–3.3, the faces 0.8; the eight busiest 40-px cells are now
  the lower-left foreground and the right but one. Moving share (motion.py, ≥2 px per half second):
  7.3–14.2% of the frame each second, median 9.2% (5.4–16.4%, 9.7% before: the old swing was the
  whole bed on one clock); round the people 3.1% median (2.4%). No tear or smear at 2×.
- **Her eyes**: at the lead both irises go to him and a white opens in the far eye (it showed skin);
  on the return her head goes back with her eyes still on him for half a second, then they follow.
- **His blink** at 16.2: half, shut, half, on twos.
- **The woods** (the film's sound): 1.6 dB range through 15–27 s (5.2 before); −0.13 dB at the cut in,
  −0.30 at the cut out; no mid cicada faded in at 27.8.

### QA (a1aaab0, d668068), and what was fixed

QA found this round's changes holding in the browser (the vignette only in the two-shot, matching
the shader; his face level across both cuts; the bands, the files fetched and the screen-reader
lines as decided; the assets reproduced byte for byte; the music's reverb gated within ~2 s; the deep
release even), and these, all fixed:

1. **[P1, since 2f208aa] A resize or rotation while fully inside the painting turned the screen
   near-white until it went back to the wall**: the immersion pass passed on the room buffer's alpha,
   which a resize reallocates at zero while the room isn't drawn, and the page's paper showed
   through. The immersion pass and the grade now write an opaque alpha; `tests/playtest/woodland.mjs`
   resizes mid-shot and reads the canvas back.
2. **The held band kept frames that cut faces** (her hair at 2.05, both heads at 2.5, his face at
   1.22). Each frame now carries where it still holds both faces and the hands with 8 stage px to
   spare (`holds`: 1.26–2.37, 1.38–1.91, 1.30–2.50); held past that, the screen is framed again, or
   given the wide. Tested by holding each band through every aspect, both ways.
3. **A texture leaked per play that reached the two-shot** (its one-texel ground map, never
   disposed): disposed, tested; the memories playtest's second pass now reaches the two-shot.
4. **Two playtest checks failed on correct behaviour**: the upright phone's shot (now expected from
   the screen's aspect) and the give-way's return (a held memory never springs the turn back: the
   playtest turns back by hand, at a moment a return may land).
5. **The re-key left a cream fleck in her hair** through her turn (a gap between strands that the
   outline closed over, taken for interior paper): islands of paper within 5 px of their outline stay
   keyed (the ground shows through, as before); her catchlights keep full alpha.
6. **The room given back twice** (at the residue and at the end) restarted the even rise (26 s, not
   20): the same depth asked again while on its way there changes nothing (tested). The music's two
   gates are back on the plain curve (QA saw the even rise stall twice under instrumentation; only the
   hum needs it).
7. **His far eye kept its white by 0.002**: an eye's white is now told from skin by the skin round it
   (a white 1.10–1.15 times as light; her far eye's sample 1.01; the threshold 1.05): the same result,
   with a margin.
8. (Speculative, taken.) **Turned back into a screen it can frame mid-shot, the two-shot came back on
   the next frame**: it now comes back as after giving way (a new drawing, never within half a second
   of a beat, never in its last 2 s). Tested.

Not changed: the clock's 1 s cap per frame (the sound designer's note: after a stall longer than a
second the picture falls behind the sound for the rest of the memory). The two-shot's textures upload
while the memory is prepared, not at the cut, so a device shouldn't stall there; to check on a real
phone, with the far evening cicada's level and the reverb's 3–4 s tail after the gate.

### The new film evaluated (the creative and cinematic directors), and decisions

Both: the heart now does what the brief asks, as far as the stand-ins allow; this round fixed every
defect the last film showed and made nothing worse. Protect: the asymmetry (she turns her head, he
moves only his eyes), her eyes staying on him half a second after her head goes back, the hands
never moving, both cuts (faces within ~7%, the sound within 0.4 dB), the dusk cut, the hush and the
near cicada's return at 28.0 s (back when its tree is back in frame; later, it would start with the
side cicada's phrase at 28.98). The creative director withdrew the call to remove his blink: on the
film it reads as involuntary and lands on neither the cut nor her eyes. Still wrong, and only the
artist's drawing fixes it: her turn, the loudest event in the shot (2.4–2.6 times the median change
per drawing), a layer swapped on a held picture. No workaround (no warp, dissolve or rolled head
region). The grass reads as grass, not a sliding picture, but carries no direction of wind any more:
for the artist's eye; if it doesn't read as air, a small shared swell travelling left to right under
the clumps (25–35% of their sway, never on the beats), not the sheet again.

26. **The note to the artist** said 4:3 and 21:9 screens get no close shot (both get a looser frame of
    it), put her halfway drawing first on the kit's list (second, after the pencil), and overstated
    ("one held frame", "three directors watched", "within 4%", "exactly the close shot"). Corrected,
    with what it left out: the film's sound is the clearing alone, raised, with no room under it; his
    look fond or sly is theirs to judge; the hush settles about a second before the close shot and
    lifts 1–3 s after it.
27. **A fourth frame** for 1.9–2.15 ([30, −50, 880], holding them from 1.34 to 2.16): a maximised
    browser window on most desktop screens is about 2:1, and the loosest frame showed their faces 11%
    smaller than the film does, with a 20% jump in face size at each band's edge. Now their faces fill
    22.9–25.9% of the screen's height there (the film 23.9%), and the jumps are 10–12%. Re-framing
    mid-shot takes any frame that still holds them (so 2.05 → 2.5 stays the close shot). Tested, fresh
    and held from every band.
28. **The right-hand cicada** went into the quiet as a fade mid-phrase (the gated fade fixed on the way
    back in): it now ends its phrase on its own fall-away as the quiet begins (14.1 s); tested both ways.
29. Not taken now: framing continuously by the subject (the cinematic director's later option); a
    start range wider than 2.45 for iPhones held sideways (their viewport sits either side of it with
    Safari's bar: a device decides); the kit's order (the pencil stays first: everyone sees it,
    phones included).

### Her turn: stand-in in-betweens (the artist's choice, 2026-10-18)

The artist, on the film: "Her turn does not feel like a natural turn, it reads like jumping
frames." Asked how to get the in-betweens, they chose to try free stand-ins made here, two of
them, judged by them in a flipbook before anything is filmed.
That overrides decision 17's "never a warp" for these two drawings, and only as held drawings
(never a dissolve or a morph played in time).

30. **How they are made** (`scripts/stand-in-turn.py`; no model, no network, no cost).
    - The panel's head, with her eyes already on him (the shader's own look, so nothing jumps at
      18.0), is bent part of the way toward take b. Take b is bent part of the way back (33).
    - The bend is a thin-plate spline through 14 points of the face matched by hand (the eyes'
      corners, brows, nose, mouth, chin, hairline, both cheeks).
    - It is pinned on a 24 px grid everywhere outside take b's region grown by 28 px, so the hair
      lying on the grass stays where both drawings have it.
    - Each head is laid into the panel through that margin.
    - Tried and dropped:
      - an img2img clean-up with an open anime model: off-model faces;
      - confining the bend to b's own region: it cut her jaw and hair where the in-between chins
        fall outside both drawings;
      - fading the bend out inside the region: it folded her cheek and chin.
    - Measured at the sheet's size, as first made (a third and two thirds of the way):
      - their shared region was 220×190 sheet px (b alone 200×180; unpinned, the stand-ins dragged
        her neck's strands along and made it 240×255);
      - each drawing's seam p99 under the shared region was 0.065 (b), 0.069 and 0.082 (the
        unpinned bend had 0.090 and 0.093).
31. **On the timeline** each is held two drawings (`TURN_STEP`, 1/6 s), on twos:
    - toward him: 2 at 18.0, 3 at 18.17, her drawing at 18.33;
    - back up: 3 at 21.17, 2 at 21.33, the panel's head at 21.5.

    So her eyes still lead by half a second and stay on him half a second after her head is back.
    Without the in-betweens, 2 and 3 show her drawing (the scene clamps to the last drawing there
    is), so the committed build is the straight cut until a decision. If only one is drawn, it
    stands for both. Tested both ways.
32. **Opt-in.** The cutter lays them in only with `--stand-ins`, and names them `standIns` in the
    manifest. The committed art stays without them until the artist approves the flipbook. The kit
    now asks for two in-betweens instead of the halfway drawing (`b-look-full-mid1.png` from the
    sheet, `b-look-full-mid2.png` from take b), with the stand-ins as a guide to the angle only.

#### The flipbook evaluated (the cinematic director), and decisions

The cinematic director, on the recorded frames: the outer steps read as one head rolling, both ways.
- **[P1] Still a cut in the middle step.** The middle step (18.17, 21.33) is a cut inside the move.
  In one drawing her ear jumps across her face, the fringe drops, the crown changes and take b's
  softer line arrives. The eyes slow down there too: the irises travel 25/18/22 px (near eye) and
  27/22/28 (far eye) across the three steps.
- **[P1] Spacing and holds.** A quarter and three quarters of the way: slow, fast, slow, with the
  change at the fastest step, and each bent less. Held 1/12 then 1/6 toward him and the reverse
  back: a quick turn to him, a reluctant one back.
- **[P1, verified] The first in-between's near eye.** It looked down for a drawing: the iris sank
  under the lower lid and the upper lid doubled. The point on her iris moved 19.6 crop px down, her
  eye's corners 12.5–13.3.
- **[P2] Otherwise clean.** No seam at the region's edge; the hair on the grass is identical in all
  four drawings; the far eye is clean. Minor: the grass under her jaw moves with her head, and the
  stand-ins are softer than the drawings.
- **On the measure.** The change-per-drawing measure saturates (a third of the turn 13–15, the whole
  cut 15.6), so it can't rank smoothness: track the eyes instead.

33. **Taken:**
    - The eyes are matched by their corners only (the iris looks a different way in each drawing).
      On the remade heads, both eyes keep their look through all four.
    - A quarter and three quarters of the way. Held evenly, these are close to sampling a head's
      natural, symmetric turn. A minimum-jerk turn over half a second (17.92–18.42 s), sampled at
      the middle of each hold (18.08 and 18.25 s), is 0.21 and 0.79 of the way.
    - Kept: two drawings each (the keys unchanged). The asymmetric holds would be acting, not
      smoothing. The creative director once asked for the opposite (slow toward, quick away), and
      at 1/12 s it is the artist's call: offered with the flipbook, not built.
    - Remeasured: the shared region is 225×185, and the seams are 0.067 (b), 0.068 and 0.089.
    - The kit now asks for a quarter and three quarters. The flipbook's loop now keeps the film's
      rhythm: her drawing is held as long as the film holds it.

#### The second flipbook: "It still doesn't look like a natural animation" (the artist)

Two in-betweens, each held a sixth of a second, give four poses over a third of a second: three
steps, and the middle one pops (her ear changing side and her fringe arriving at once). An animator
would draw five to seven drawings for this turn, on twos, with the change passing partway.

34. **The turn is a minimum-jerk move over seven drawings on twos** (`TURN_DRAWINGS`, `TURN_STEPS`):
    - steps 0.07, 0.25, 0.5, 0.75 and 0.93, one drawing apart: toward him from 18.0 (her drawing at
      18.42), and back up arriving at the panel's head at 21.5, so the eye lead and the linger stay
      half a second;
    - the timeline keys how far she has turned (`figure:b.turn`, replacing `figure:b.cel`), and the
      scene shows the nearest drawing (the manifest's `at`; a tie goes to the one further on). One
      timeline serves the stand-ins, the artist's two drawings (at the steps nearest them) or none;
    - with no drawings on the way (the committed build until the artist decides), the straight cut
      falls at the middle step: 18.17 toward him and 21.33 back, a lead and linger of 0.67 s.
35. **Five stand-ins at the turn's own steps** (`scripts/stand-in-turn.py`, free, local):
    - both drawings are bent to each step's shape; from 0.3 to 0.7 of the way they are lined up by a
      dense flow (DIS, at most 16 px) and blended, so her ear and fringe pass over instead of popping;
    - the blend keys the sheet's paper first: where one drawing's hair meets the other's paper, the
      hair as drawn; and the exposure averages the purest colours most. On the first recording a
      plain blend left half-paper hair, which the cutter's key reads as solid and pale: a halo round
      her head in the middle drawing; the hair's own edges, averaged evenly, still paled her crown;
      and the middle drawing's pockets of paper near her hair's outline are filled from the hair
      round them (the cutter took one that deep in her hair for a light in it: a white fleck);
    - each drawing is exposed for a quarter of its twelfth of a second, nearly crisp; the middle one
      for all of it, a smear, as an animator smears the fastest moment of a move. A uniform exposure
      softened the quarter and three-quarter drawings like a focus pull;
    - the right side of her neck is now matched as well (two points). The left can't be: her chin
      passes in front of it, and matching it folded the bend (the map's Jacobian went negative). That
      overlap falls in the smeared middle drawing, as a soft see-through wedge for a twelfth of a
      second;
    - measured at the sheet's size: their shared region is 220×190, and the worst seam p99 is 0.085.
36. **Not taken:**
    - a blink to hide the change (ruled out before, and the change is in her hair, not her eyes);
    - a learned interpolator (weights to fetch, and on what is left once the bend has lined the two
      up, the flow-aligned blend does the same job);
    - hair follow-through: the hair lying on the grass stays as both drawings have it.

#### The third flipbook: "That [fourth] picture is bizarre, doesn't even look like a human" (the artist)

"Use whatever tools and creative freedom you need to get this clean." The smeared middle drawing read
as two faces, not a person. The cinematic director, on the same frames (written before the switch
below, and agreeing with it):
- **[P1] The middle drawing is a ghost.** Two faces over each other, its neck see-through from jaw
  to collar, a red-brown crown where both outlines were kept, the panel's ear ghosting at her jaw.
- **[P1] Her eyes go dead in every in-between.** The exposure, weighted toward the darkest colours,
  dropped her catchlights; her near upper lid doubled; the drawings softened and sharpened again
  like a focus pull.
- **[P1] The change of drawing still steps.** It fell on the turn's widest step: put it on a
  narrower one.
- **[P2, speculative] Straight paths.** Every point moves in a straight line, like a flat card. Bow
  the paths.

37. **No blend, no smear, no exposure.** Each in-between is one of her two drawings bent to its
    step's shape: the panel's head up to 0.42, take b from 0.58. Each drawing was first rendered
    bent at every step: the panel's head bent to 0.5 drags its hair across her jaw, and take b bent
    back past about 0.6 squashes her face; at 0.42 and 0.58 both are clean, with no folds (the
    smallest Jacobian 0.27 and 0.32). Each drawing is one crisp moment, so her catchlights stay. The
    flow, the paper-weighted exposure and the pocket filling are gone with the blend.
38. **Six steps on twos, the director's spacing:** 0.07, 0.25, 0.42, 0.58, 0.75 and 0.93. They ease
    out and in over a drawing at each end and are even between, so the change of drawing falls on a
    step of 0.16, no wider than the rest (it was 0.25, the widest). Her drawing arrives at 18.5; the
    way back starts at 21.0 and arrives at 21.5, so the eye lead and linger stay half a second.
    Without drawings on the way, the straight cut falls at 18.25 and 21.25.
39. **Not taken:** bowing the paths (speculative, and a bend that is wrong reads worse than a
    straight one); a learned in-betweener or video model (none runs here without a GPU, and none
    keeps her face as drawn); any paid tool (not authorised: the artist's "whatever tools" is read
    as free ones; anything that costs goes to the artist first).

#### "Remove the return head turn altogether" (the artist)

"She should glance toward him, settle into that gaze, and simply remain there. No need for another
gesture. For the intended emotional tone, that small moment of attention is more effective than a
conspicuous animated action. And when the scene eventually hard-cuts to the empty clearing at dusk,
the absence of that intimate moment will hit harder."

40. **She turns to him once and stays.** Her head arrives at 18.5 and stays turned to him, and her
    eyes stay on him, through the cut back to the wide, to the cut to dusk. `herBack` and
    `herEyesBack` are gone from `TWO_SHOT`, from the beats a return of the two-shot waits on, and
    from the timeline; so is "She looks back up." from what a screen reader is told.
41. **He stays too** (in the same spirit, the main session's call): his eyes go to her at 24.0, his
    head rolls a little at 24.5, and he no longer looks back up at 29.0 in the wide. From 24.0 they
    look at each other until the clearing is empty.
42. **Her blink is gone** (it was at 31.6 in the second wide): from her look to the cut her head is
    the artist's drawing of her turned to him, and her lids are drawn for the panel's eyes (the
    shader never lays them over a redrawn head, so it was silent anyway). A blink there would need
    lids drawn for that drawing.


### Her turn rebuilt: her own head, turned (the artist's brief, 2026-10-19)

"Rebuild the woodland animation using advanced Claude Code animation techniques." Her eyes drift to
him first; a moment later she "turns her head slightly in his direction, without lifting it
unnaturally from the grass", gentle, understated, almost unconscious; her features, skull, cheeks,
jaw, neck and hair stay coherent, her hair grounded beneath her head; she settles into looking at
him, with no mechanical return. "I want the viewer to experience the emotion, not notice the
animation technique." Earlier versions "manipulated flat artwork, which distorts anatomy and reads
as morphing"; more easing or warping between drawings was not to be assumed the answer, and the
architecture could be replaced. Exact faces, the painted look, the composition, the light, the
pacing, the sound and the hard cut to dusk stay.

**Investigated.**
- *ClaudeAnimationBase* (MIT) and *opus-video-skills* (MIT; its painted-animation skill is that kit
  packaged as a Claude skill) draw a simple block character procedurally with p5.js and p5.brush.
  Every frame is a pure function of time, drawn on twos, its linework boiling 12 times a second. A
  character turns through drawn key views with a smear ("Never project 3D"). Puppeteer renders the
  frames, and contact sheets, strips and crops make an inspection loop. Useful here: the pure
  function of time, the twos, and above all the loop of rendering and looking. Not useful: none of it
  can draw the artist's painted face. Their characters are code. Boiling her head alone would make
  it the one thing in the painting that wobbles.
- p5.brush (textured strokes): nothing to paint, since every pixel here is the artist's. GSAP: no DOM
  tweening to do. Theatre.js already holds the memory's timeline; the turn stays a key track on it.
- A video model (Wan 2.1 VACE, first and last frame, CPU) was stopped: the brief said to avoid one
  without compelling evidence, and nothing it makes is her face as painted.

**Why a rotation.** The bends failed because they went between two drawings that don't agree: a
70–90° turn, her ear changing side. A slight turn needs no second drawing. Her own head, from the
panel, can be turned as a head turns, provided the paint is laid on a 3D shape that fits it. Little
new is seen at 14° (a sliver of her far cheek), so nothing has to be invented, and the face stays
the artist's pixels. The "never project 3D" rule is right for a character drawn by code. Here it is
the painting that is projected, onto a shape fitted to it, over a turn small enough that its drawing
holds.

**How it is built** (`scripts/her-turn.py`, offline, no model, no network).
- *A head under the paint.* Her pose is fitted from thirteen points of her face to a generic head
  (least squares, 8.4 px rms in the 2× crop): skull, face profile, width and nose; no surface steeper
  than a set slope toward its outline, so paint near her outline isn't squeezed. Her jaw line holds
  rigid in a band either side of it; her ear is a flap hinged at her cheek, rigid past its rim; her
  neck twists, all of it at the jaw and none at the collar.
- *The turn.* 14° about her neck's axis (the fitted axis leans 24.5° into the picture and read as a
  roll of her head; 10° is used). Her far cheek's outline moves as the model's silhouette does, about
  a third as far as her paint (6 px against 22 in the 2× crop), so her far cheek comes round; the
  push that does it reaches 20 px in from the outline, short of her mouth. Her far eye, coming round
  toward us, widens by about a quarter, as a far eye does.
- *Two layers.* Her head and neck in front; her hair and the rest behind, filled under her with the
  hair beside her. The hair near her head follows it a little and none does beyond 60 px; where her
  edge draws back from the hair behind it, that hair goes with it (over 48 px), and where her face
  passes over it, it simply covers it. Her soft edge is split into her colour and what lies behind
  it, so the rig at 0° is the panel.
- *Resampled once per layer:* Lanczos, clamped to the local range (no pale halos beside strands),
  supersampled 4× where the warp stretches.
- *Her eyes* are on him first: the first drawing is her eyes on him, her head not yet turned (the
  film's own iris move), at 17.5, in either shot; as her head comes round they ease back 35% in
  their sockets, still on him.
- *On twos:* her eyes at 17.5, then thirteen drawings at the minimum-jerk curve's fractions,
  18.0–19.0, then held to the cut. `scripts/two-shot.py` lays them into the panel and cuts the two-shot's and the wide's heads
  (one 4×4 atlas each, with gutters), inside a region that takes every pixel any drawing changes.

**Checked on every build** (the build fails otherwise).
- At 0° the rig is the panel: 99.9% of pixels within 2/255.
- Turned, feature by feature, her inked pixels keep their weight. Her eyes, brows and mouth go no
  further than the turn itself takes them (none of their inked pixels changes area by more than
  0.75–1.35; her mouth stretches 1.29 at most, as a mouth turning toward us lengthens); her jaw line
  and ear stay rigid (0% out of band; before they were made rigid the jaw line went to dots and the
  ear's rim stair-stepped); her far outline is a silhouette, re-drawn as it comes round (37% of its
  stroke out of band, 0.48–1.66); the rest 3%. In all, 5% (21% before).
- The warps are exact where they can be seen (within 0.15 px).
- No drawing changes anything under the region's soft edge by more than 3/255.

Measured once (optical flow over her head, drawing to drawing): every step moves as far as the ease
says, to 0.04 px (median), and the same way (deviation from one motion field: 0.1 px median, 1.4 px
at the 99th percentile, in the 2× crop). The drawings have no snaps; the film had one on upright
screens, at 18.0 (decision 45).

#### The reviews (the creative, cinematic and technical directors; then the skeptic)

The three specialists reviewed the prototype and the first build (e2f80bf); the skeptic reviewed
their reviews, the plan made from them, and the build after the first fixes (6a16632), recording
its own phone film.

- **All three:** it is her own face turning, the first version of her turn that is. Creative: adopt
  it at 14° and add nothing to her face; carry the same pose into the wide and the phones; his look
  at 24.0 now meets hers (consider 25.5); offer the artist a blink in the hold. Cinematic: the last
  drawing's edges break up (the stroke under her ear dotted, the ear's rim stair-stepped), on screen
  for 8 s close; the flipbook isn't the film; hair smeared beside her far jaw; try a longer settle
  (B: the curve's time to the 0.8th power, over 1.5 s). Technical: drawn contours squashed like
  surface paint (the jaw line to 0.155 of its area), the drag squeezing hair where her face passes
  over it, fill smudges on her collar from the first drawing, and no check catching any of it.
- **The skeptic:** protect the rotation from further "improvements". None of the three looked at an
  upright screen, where her eyes did not lead: they went to him with her head at 18.0, the biggest
  single change in the gesture. B cannot be seen. The far cheek's push stretched her mouth's far
  corner 1.7 times, and the far-eye mask did nothing; a whole-head strain number cannot see a mouth
  (45 of 3,465 inked pixels). His look is answered on desktops and unanswered on phones: put that
  to the artist, not "24.0 or 25.5".

#### Decisions (main session, after the skeptic)

43. **Her own head, turned 14°**, in both shots and on every screen, in place of take b. Nothing is
    added to her face: no mouth, lid or brow change (the creative director). 14° sits in the
    cinematic director's 12–15° band; at 20° her ear and neck break up and her painted light starts
    to contradict the sun.
44. **Her lines keep their weight** (the technical artist's fixes, all built): her jaw line rigid in
    a band either side of it; her ear a flap hinged at her cheek, rigid past its rim; no surface of
    the head steeper than a set slope near its outline; the hair behind her drawn after her edge
    only where that edge draws back from it, over 48 px (the technical artist's one-way drag, not
    the cinematic director's 4–6 px: with no drag a dark dotted smear opens behind her far jaw, as
    the skeptic found taking each part out); the soft edge split into her colour and what lies
    behind it (the collar smudges gone; at 0° the rig is the panel); Lanczos, clamped, supersampled
    where the warp stretches.
45. **Her eyes lead on every screen**: her eyes on him, her head not yet turned, are the turn's first
    drawing, from 17.5, in both shots (the skeptic). On desktops nothing changes: the drawing's eyes
    are the shader's look, drawn the same way.
46. **Her far cheek comes round; her mouth doesn't lengthen.** The push reaches 20 px in from the
    outline, short of her mouth's far corner (stretched 1.29 now, as the turn alone does; 1.73 at
    40 px), and only either side of the outline (it had leaked round her head to her ear's rim and
    her jaw line). Without a push, her far outline would slide with her paint (17 px against 6)
    and her far cheek stay as narrow as drawn, which reads as a picture sliding (the cinematic
    director). The far-eye mask is gone: at this reach it does nothing. The record said her far eye
    is "never widened": it widens by about a quarter, as a far eye coming round toward us does.
47. **Checked feature by feature** on every build (the skeptic), as above.
48. **Timing as built (A), not B.** B's fastest drawing moves half a pixel less (at 1280 wide) and
    its last drawings tenths of a pixel; A's own first two drawings already move under a pixel, so
    the visible lead of her eyes is already 0.67 s. "She settles" means she stays: the 15.5 s hold
    gives it. If the artist finds the turn quick, the last three drawings can each be held two
    twelfths of a second, landing at 19.25 (no new drawings; in twelfths, the painting's own clock:
    the cinematic director).
49. **His look: put to the artist, not changed.** On desktops her look is answered: his eyes go to
    her at 24.0, three seconds close, then the wide. On upright screens, where there is only the
    wide, his eye move is too small to see, so it isn't. (a) As now; (b) unanswered everywhere: his
    look removed (it is a stand-in: moved irises, a 2° roll); (c) answered everywhere: his eyes drawn
    for the wide. Moving it to 25.5 changes the wait, not the reading.
50. **No blink for her in the hold**, offered only if the artist finds it lifeless: from 19.0 to 24.0
    nothing else moves on either face, so a blink there becomes a beat ("no need for another
    gesture").
51. **The flipbook is the film**: the recorded frames, 12 drawings a second (the loop at 80 and 90 ms
    alternately, with black before it repeats), every drawing as filmed, her head enlarged frame by
    frame.
52. A beat at the middle of her turn: the two-shot can no longer come back at the one instant (18.5)
    half a second from both its ends. Kept from the technical artist's smaller findings: the head
    drawing follows the grass's sway under its soft edge (already built, one line), and the atlas
    cell's guard (exact for any number of columns).

#### Measured on the film (`test-output/review/woodland/turn4/`: desktop 1280×720, 16.5–21.0; an upright phone, 17.25–19.75; 12 drawings a second)

Pixels in her head changing by more than 24/255 from one frame to the next (breathing and the grass
alone: 270–630 on desktop, 0–4 on the phone):
- **Desktop.** Her eyes at 17.5: 908 (the earlier build, the shader moving her irises: 898; her eyes
  drawn and her eyes moved by the shader differ by at most 37/255, in 38 pixels). At 18.0, 478:
  nothing jumps. Her head: 1,384 at 18.08, rising to 4,900 at 18.58 and back to 760 at 19.0; from
  19.08 the breathing alone again. One rise and fall, no frame out of line with its neighbours.
- **Upright phone.** Her eyes at 17.5: 307. At 18.0: 0 (the skeptic had measured 339 there, her eyes
  going to him with her head). Her head: from 18.17 (22) to 18.58 (251) and gone by 18.92. Her eyes
  lead on every screen now.
- **The cut back to the wide at 27.0** (recorded on the build before the last fixes, which kept the
  pose): the same pose either side, the wide's own drawing of her turned, at its size.

#### QA (d753b00), and what was fixed

No P0 or P1 defects. In the browser, on desktop, an upright phone, a landscape phone, after a
give-way and under reduced motion: each drawing shows once, in its slot (read from the live scene at
the held times); her eyes lead at 17.5; nothing jumps at 18.0; the turn's change rises and falls
once; nothing outside her head changes (outside its box, 2/255 at most: the film grain); her pose is
the same either side of the cut at 27.0; no return of the two-shot inside the turn, 18.5 included;
14 samplers; every atlas within 2048; the turn's atlases take 9.4 MiB of GPU memory on desktop
screens that show the two-shot, 2.8 on a landscape phone, 0.8 upright; no program or texture left
behind; the screen-reader line at 18.5. Under reduced motion her turn plays as authored: QA judged
that right (it is the content; small, eased, no camera move; fewer, larger steps would read as a
jump). Three smaller findings, and what was done:

- **The wide's drawings changed her hair where she doesn't move** (the upscale's drawing, brought
  down and laid into the sheet): on an upright phone a pale strand beside her far cheek went at
  17.5 with her eyes. *Fixed:* `her-turn.py` turns the sheet's own painting too (the same rig, from
  the sheet at 2×, brought down), and the wide lays in only the change the turn makes, so wherever
  she doesn't move it is the sheet exactly; `two-shot.py` refuses a wide whose eyes drawing changes
  anything but her eyes (3/255).
- **Her drawn eyes were softer than the panel's** (the eye look moved her irises by bilinear
  resampling, as the shader samples). *Fixed:* moved with the rig's Lanczos: at the art's size her
  near eye keeps 90% of the panel's edge energy (70% before; the rest is the white filling where the
  iris was).
- **Test gaps.** *Fixed:* the playtest's leak check now runs through her turn, and its screenshots
  wait as long as the recorder's. *Not built:* a browser probe of which drawing the GPU is given at
  each key (QA's own probe found them right, and the unit tests hold the keys and the cels to each
  other). Removed: compose.ts's `cel` case (no track has used it since 473ddd6). Kept: her live look
  in the shader (`uGazeB`), unreachable as keyed (the drawing carries her eyes from 17.5), because it
  is what the editor shows if her eyes are re-keyed ahead of the drawing; her-turn.py draws from the
  same `gazeB`.

#### The finished turn evaluated (the creative director)

"It works. In every drawing this is her own painted face turning toward him, a person's small
movement, not a warp, a slide or a card turning": her nose and mouth move about 20 px while her ear
moves 9, her far outline 4.5 and the hair on the grass under 1; her features keep the artist's
shapes at the panel's sharpness; she lands softly and stays. Nothing in her head needs to change.
- Show the artist the memory as a visitor meets it first (the two-shot through the wide to the empty
  clearing, with its sound, on a desktop and a phone), then the closer looks, without captions that
  name the technique. His look at 24.0 had not been filmed beside the rebuilt turn.
- His look (decision 49): put it to the artist by what each version means. Answered, it is the
  dilemma in one image (both looking, their hands an inch apart, neither closing the gap); unanswered,
  a smaller story of longing; as built, which one a visitor gets depends on their screen. The creative
  director recommends answered everywhere (his eyes drawn for the wide), and whatever is chosen, his
  answer smaller than her turn: eyes, at most the 2° tilt.
- Her eyes go to him in one drawing; the brief says they "drift". A dart is a real eye movement and
  the usual way, and both directors advised it for the prototype; a drift over two in-betweens reads
  more as attention wandering to him. The artist's call, from a side-by-side.
- Her far cheek coming round and her far eye widening are the turn, not something added to her face:
  protect them; if the artist finds the far cheek too full, shorten the push, don't remove it.
- The screen reader: her line leaves out her eyes going first; his is told on upright screens, where
  his look can't be seen.

#### Decisions (main session)

53. **The wide turns the sheet's own painting** (QA), laid in as a change only; the build refuses one
    that changes her anywhere but her eyes when her eyes move.
54. **Her eyes moved with Lanczos** (QA).
55. **The screen reader** (the creative director; QA): "Her eyes go to him, then her head, a little."
    at 18.5, to anyone inside; "He turns his eyes to her." only in the close shot, the one place it
    can be seen.
56. **Shown in context first** (the creative director): the film from the cut to them (15.0) to the
    empty clearing (35.5) with its sound, on a desktop and an upright phone; the closer looks after.
57. **Her eyes: dart or drift is put to the artist**, with her head side by side both ways; as built,
    a dart (one drawing). A drift needs one or two more drawings and, for two, a 5×4 atlas.
58. **His look**: the creative director's recommendation (answered everywhere) goes to the artist with
    decision 49's question; whatever they choose, his answer stays smaller than her turn.

#### The finished turn evaluated (the cinematic director)

"The turn works, and nothing in it needs to change before the artist sees it." Her eyes move at
17.5 as she breathes in; her head comes round visibly from 18.17 to 18.92 over the top of that
breath, lands at 19.0 as she breathes out, and holds against his still face in the cicadas' lull.
The features move by different amounts front to back (nose 25.6, eyes 19, crown 10.7, ear 9, far
outline 6.8 atlas px; the head's width from ear to far outline the same, 172 to 170, while her
features slide across it), so it reads as a head turning. The held drawing's edges are clean at
1440p (the stroke under her ear and the ear's rim, faulted in the prototype, are continuous); the
hair beside her far jaw keeps its strands. No pop at 17.5, 18.0 or 19.0.
- **The review clip played an old mix**, in which the woods swell 3.6 dB into her landing: a swell
  decision 23 removed, which the room doesn't play (the clip's sound came from a mix made before it;
  the current one rises 1.2 dB). *Fixed:* the films are joined with a mix made from this build.
- **4.5 seconds can't show the rhythm**: the turn's weight comes from the stillness before it, the
  hold against his stillness after it, and the cut that takes it away. *Done:* the film from 12.0 to
  36.0, shown first, full screen, at speed, with sound; the closer looks after.
- Protect the rotation as built: no easing, smoothing or hair follow-through added.
- The landing on her out-breath is an accident of her breath's seed: *pinned by a test.*
- On an upright phone a light patch in her hair beside her far cheek went at 17.5 (as QA found):
  *fixed* by decision 53.
- Her eyes: offer one in-between (halfway at 17.5, on him at 17.58: it fits the atlas), not built.
- If the turn is found quick, hold in twelfths, not eighths (decision 48 corrected).

#### Decisions (main session)

59. **The artist sees the film first**: 12.0–36.0 with this build's own mix, on a desktop (and an
    upright phone, the two-shot to the empty clearing); then the turn's closer looks. The flipbook's
    in-context clip is joined with the same mix. (`test-output/review/woodland/context5/`: the two
    films, and `closer/` with the drawings as filmed, the eyes three ways, the slowed and looped
    turn, and the frames for what remains.)
60. **Her landing on the out-breath is tested** (her inhale peaks within a quarter second of the
    turn's middle, and is falling as she lands).
61. **Her eyes, three ways for the artist**: as built (one drawing), one in-between, two in-betweens,
    her head side by side; the directors differ (the cinematic director would offer one, the creative
    director two), so the artist chooses. One fits the atlas as it is; two need a 5×4 grid.

Measured on the new film (`test-output/review/woodland/context5/`): on an upright phone at 17.5 her
eyes change (157 pixels over 24/255) and nothing else of her does (146 before, along her hair; the
strand beside her far cheek stays: its largest change 11/255, 68 before). His look, filmed beside
her rebuilt turn for the first time: his eyes go to her at 24.0, his head rolls a little from 24.67
to 24.92, and they look at each other from then to the cut.

## The artist's sound brief: a score, and the cut to dusk (2026-10-19)

The artist asked for the woodland's sound to tell its story: an ordinary afternoon the visitor falls
in love with without noticing, then its sudden, irreversible absence. A very subtle musical
presence nobody notices beginning, a simple motif slightly incomplete; at the hard cut to the empty
dusk clearing the music stops instantly, ideally just before its anticipated resolution, and the
afternoon gives way on the same instant to an evening where cicadas are the defining presence;
perhaps the wind in the same trees across the cut; no music in the dusk or back in the white room.
References: Kensuke Ushio (Chainsaw Man: Reze Arc, "our film", "past", "fable"; DAN DA DAN episode
7), as a compass. "The afternoon should not feel sad while we are experiencing it. It should become
sad because we can no longer return to it." ElevenLabs allowed "as much as you need".

### The proposal and its reviews (the sound designer, the creative and cinematic directors; the skeptic)

The proposal: a solo upright from CC0 samples, 3/4 at 60 a minute, nine bars from 7.5 s, a motif
stated twice and left open, two voices converging, a crescendo into a cut on bar 9's downbeat;
generated beds under the synthesised ones; a few produced versions.
- **The sound designer**: the core is right (one solo upright, music only inside, the wind the one
  sound across the cut, nothing after); but the cut drifts (a file's end on a clock that can part
  from the picture after a stall, and no output latency), the 60 a minute grid lands the motif's
  peak on his look, and the clearing measures as a cicada band, so the cut would only change
  species. One source per function (generated wind, demoted day insects, far birds, a higurashi
  chorus); one level for the score; the room's drone gated (its reverb send is never hushed, and
  four of its five chords are a semitone from D♭).
- **The creative director**: the form leans into the cut and cues it (crescendo, held dominant, a
  cadence withheld); the converging voices put back the reach the picture removed; "never the tonic"
  is the room's own habit, wistful now rather than later. A plain, idle tune at one level, coming
  home, already playing when we arrive; no room music, no drone, no humming after; the evening
  already under way.
- **The cinematic director**: the architecture is right (the image's lightness falls to 0.32 on the
  cut, so a sound cut is motivated on any screen); but the grid scores both looks by arithmetic.
  Spot to the picture (no note in its moments), one constant level, the cut one event on the audio
  clock; a film from the room before to the room after.
- **The skeptic**: all three judged the proposal's prose, not the sketch, which measures worse: its
  left hand struck every beat of a half-second grid (that, not the tempo, put notes on the gust, her
  eyes, her head and his roll), it built 5 dB over 12 s, and the cut took a ring 15 dB under its
  last attack. A plain tune, one bass note a bar, twice in its own steady time, home once between
  her look and his, cut a note before home; caption the stop; withdraw the drone; demote the day
  insects; generate the wind (and the chorus only once the artist names the insect); no produced
  music until the artist has heard the sketch in the film; the wind across the cut a switch.

### Decisions (main session, after the skeptic)

62. **The cut is one instant on the sound's clock** (all four). The memory's clock follows the sound
    however long a frame took while it ran (capped at a second, a stall left the picture behind its
    sound for the rest of the memory); every afternoon cue is cut at 34.5 on the memory's timeline
    (`until`, 40 ms ending there), the evening's marker is on it; all that sounds at the cut is dry.
    The skeptic thought per-cue cuts over-built given files truncated at the cut: kept, as ten lines
    that make the cut independent of a file's padding and of a pause just before it (tested with
    1.5 s stalls at 20 and 33 s: within 3 ms; with the old clock, half a second out). Commit 1d0e7d6.
63. **Output latency** (Bluetooth earbuds, 150–300 ms): not built. Worth it only if iOS Safari
    reports AirPods' latency (the skeptic); QA to check on a device.
64. **The room afterwards** (the creative and cinematic directors and the skeptic, over the sound
    designer's held chord): the drone silent from the woodland's start and, once it has been seen,
    for the rest of the visit; no room music, still-music, humming or owed tune (`lastMusic`). The
    woodland only: the kitchen and bedroom were approved with the drone under them. Commit 1d0e7d6.
65. **The tune** (the creative director's tune, the sound designer's exact repetition, the skeptic's
    skeleton): one plain tune in D♭, the same twice, 4/4 at 70.8 a minute, strict; a lift to sol and
    a slow fall to home (F A♭ | G♭ F | E♭ | F E♭ C D♭), one bass note a bar with a tenth above it
    (I, vi, ii, V–I), no inner line, no unison, no crescendo; on a natural upright, not felt (the
    room's piano is felt, and phones lose a felt piano's warmth first). Not 3/4. The proposal's
    rising sixth was the stock shape, and never home the room's own habit (the skeptic).
66. **Where it begins** (the skeptic, over all three): already going round, its turnaround the first
    thing heard (8.5), as the painting opens out: the crossing is the memory's biggest change, and a
    sound under it goes unnoticed. Not through the wall (heard from the white room it would be the
    room's piano, and its stop the room's habit), not a resonance rising with the light (the
    portal's sound), not a left hand alone under the gust.
67. **Its notes are kept off the picture's moments** (the cinematic director's windows, the creative
    director's wider ones round the looks): the wide's first frame, the gust, his blinks, both cuts
    of the two-shot, both looks, the cicada's return. Both looks fall inside long notes; home comes at
    21.2, 2.2 s after she has turned and 2.8 s before his eyes. Tested against the picture's own
    constants (`tests/woodland-score.test.ts`).
68. **The end** (the sound designer's, sharpened by the skeptic): the second time, cut after its
    leading tone (C over A♭, struck 0.58 s before the cut), home due at 34.77; strict time, no
    ritardando, no held dominant (the creative director), no window over the stillness (the skeptic:
    keeping the music still while the picture is still would score it). The file ends on the cut;
    nothing after it, and no resolution, is in any file.
69. **One level** (all four): the score about 5 LU under the afternoon (the skeptic, between the sound
    designer's 8 and the cinematic director's 3); in its last 2 s within 1 LU of the clearing,
    because the breeze dies down there, not because it rises. The dusk's first 3 s about 5 LU under
    the afternoon's last 3, never louder; 100–800 Hz falls 17 dB on the cut. The artist sets the level.
70. **Captions** (the sound designer and the skeptic, over the creative director): "[a piano]" once,
    4 s after it is first heard (12.2); "[the piano has stopped; evening cicadas]" 0.8 s after the
    cut, never on it. Captions have no state: without it a deaf visitor never learns the music ended.
    The screen reader's afternoon line no longer gives cicadas as its sound ("the wind in the trees").
71. **The afternoon** (the sound designer): the wind in the leaves and the long grass, generated and
    laid along the timeline as one file across the cut, carrying the painting's breeze and its gust
    from the left, warmed in the low middle (the clearing had nothing between 150 and 500 Hz; now
    37–47% of the afternoon's energy is 100–2000 Hz, 8% in the dusk), within 0.8 dB across the cut;
    the day insects demoted (the wind leads) and cut by the cut (the near cicada at its height,
    still with its lull through the two-shot and its return at 28.0); two far birds in the wides; the
    code that hid the cut deleted (the near cicada's phrase over it, the chorus held still across
    it, the dusk thinning, the placed evening calls).
72. **The evening**: a higurashi chorus already singing at the cut, far off (a forest's tail, its
    top softened), receding into the wall with the painting; no placed calls (a falling call in the
    first seconds is a sigh: the creative and cinematic directors, the skeptic); no crickets; the far
    call heard in the room kept. Generated without waiting for the artist to name the insect (the
    skeptic would have waited): they asked for cicadas at dusk, and the evening cicada has been in
    the films since 2026-10-17; another insect is 528 credits.
73. **The wind across the cut is a switch** (the skeptic: the brief asks to explore it): the artist
    hears it both ways.
74. **Paid generation**: the wind (2 × 30 s), far birds (3 × 4 s), the evening chorus (2 × 24 s):
    1,320 credits of 118,746. No produced music versions until the artist has heard the sketch in the
    film (the skeptic, the sound designer); no hum (both of them are holding their breath into the
    cut, and the room already has a hummer beyond the wall).
75. **Removed**: the breath layer (granular resonance 12 dB under the piano), the cello and pad
    variants, the converging line, the crescendo, levels by shot, the three last-bar versions.
76. **For the artist**: one film, from 5 s of the room before to 8 s of the room after, at speed,
    captions on as a visitor has them, with the room's tone approximated (its hum, ventilation,
    outside; its drone going as the woodland begins); the same through a phone's speaker; and the
    choices: home once or never home, the level, the wind across the cut or not; and one question,
    which evening insect they remember.

### The sketch as built, evaluated (the sound designer, the creative and cinematic directors; 169e0ef)

- **The sound designer**: the cut is clean (no gap, no click, the MP3 priming cleared), the score
  about 5 LU under the place, the wind unchanged across the cut. But every take carries a generator
  hum (200 Hz and its multiples, 14–32 dB over its neighbours) that the wind's warming raised to a
  fifth of its energy, most exposed at dusk; the levelling took out the wind's movement (2 dB over
  13.5 s, filtered noise); the evening is one steady, nearly mono band at 6.2 kHz with no calls and
  no fall; the day insects lead the last seconds, so the evening's cicadas arrive quieter; bird 2 is
  masked and cut mid-phrase; the version without the wind across the cut has a 9.5 dB hole.
- **The creative director**: protect the architecture (home once, cut after the leading tone, the
  evening already singing, only the wind across, nothing pitched after). What is wrong is where the
  piano stands against the place: it begins out of silence as a pickup, louder than the clearing,
  and lifts to its high note on the frame the painting settles; it steps forward in the two-shot,
  and its last chord comes out 2.3 dB louder than the same chord earlier (a neighbouring sample).
  The tune leans tender (9 of 16 beats on minor chords, a strict copy the second time) and form B
  more wistful still (home with a ninth over it). "The piano has stopped" narrates the loss.
- **The cinematic director**: the cut is one event (the first dusk frame at film 39.500 s, the
  afternoon's ramp in the 40 ms before it). But captions, on by default, announce the music's
  beginning and its end to every visitor, and the dusk caption's pill is the brightest thing in the
  frame; the tune's top note lands on the camera's arrival at every tempo (move the picture's
  settle to 10.3, they said); the G♭5 re-enters on the gust's crest (the artist's call); B differs
  from A at the cut (its sample alternation).

### Decisions (main session)

77. **The generator's hum taken out** (the sound designer): every take is notched at 200·k Hz
    (k = 1–6, Q 40) as it is read, before levelling or EQ; the stems are checked as they are written
    (no line more than 6 dB over its neighbours; they measure 13–21 dB under now). The same line is in
    18 of the 28 mem-/sfx- recordings in `public/voices`, which the artist approved: reported to them,
    not touched.
78. **The wind moves again** (the sound designer): each take brought half way to its middle level,
    not all the way, its top shelved 9 dB above 5 kHz; the painting's breeze and gust still shape it,
    and no swell crests on either look.
79. **The day insects demoted** (the sound designer): the near cicada −20 dB and the woods −14 dB
    on their files (were −14 and −9). In the last 3 s they lead the wind by 1.8 LU (were 6.9); the
    evening's first 3 s are 0.9 LU under them and 1.4 LU over the wind (were 4.8 under).
80. **The evening as calls** (the sound designer): three more takes asked for separate calls that
    fall and stop, near and far trees answering (3 × 24 s, influence 0.7: 792 credits, within the
    artist's "as much as you need"). The evening is built from slices of three takes (two in each
    ear, each swelling ±3 dB on its own period, out of step), a forest's tail 8 dB under (was 14),
    its top softened at 7 kHz, dry (it had the room's reverb on its own tail, which the film did not
    model). The cicada heard from the room is now the evening's own (it was a synthesised, different
    insect). Whether the calls are heard as calls is for the artist's ears.
81. **The piano comes into hearing with the clearing** (the creative director, the sound designer):
    the file begins inside the previous go-round, its last chord (home, struck at 7.65) still
    ringing at 8.2, and comes up on the clearing's own curve, so nothing begins from silence: the entry
    (8.2–10.5) is 8.4 LU under the clearing (was 0.9).
82. **The painting comes to rest inside the high note** (the cinematic director's finding, another
    remedy): the first time round comes in 0.31 s early (its turnaround and first two notes), so the
    A♭5 sounds at 9.47 while the picture is still easing and the image settles inside its ring with
    nothing struck; the settle (9.6–10.0) is now one of the test's moments. The picture's settle was
    not moved: its straight 1.6 s opening-out was decided in an earlier round, and 0.31 s of a
    player's anticipation is not heard as a shift.
83. **One distance from the place** (the creative director): the piano dips 2.5 dB on the
    clearing's own hush (in under the gust's fall, 12.8–14.3, out with the cicada's return,
    27.8–30.0: the place's, not levels by shot), and each alternate sample is level-matched to the
    first. Under the clearing: 8.7 LU through the gust, 5.1 in the two-shot, 4.8 in the second wide,
    6.2 overall; in the last 2 s it is 1.7 LU over (the breeze dies there and the tune turns in quick
    notes; the demoted insects took 0.9 LU from the clearing). The artist sets the level.
84. **Played, not sequenced** (the creative director): each note a little early or late (about
    12 ms, at most 25, a chord together) and a little harder or softer (±3), never drifting and never
    into one of the picture's moments; the second time is no longer a copy of the first.
85. **Brighter, not wistful** (the creative director): bar 2 is home with its third in the bass
    (I6, F under the long F) instead of vi, so minor chords take 4 of 16 beats (were 9). Form B, never
    home, is now an open half close (the turn back up to re over V), not home with a ninth over it,
    and its samples follow A's, so the two differ only where their notes do (the cinematic director).
86. **Captions** (the cinematic and creative directors): the score has no caption of its own; the
    piano is named once as part of the place, "[wind in the leaves; a piano]", at 9.85, as the
    painting comes to rest, gone before the cut to the two of them and never with a note. After the
    cut: "[evening cicadas, far off; no piano]" at 1.5 s (nothing in the first second after a cut),
    what is there first and the absence a plain fact; "has stopped" is gone. Over the dark dusk,
    captions are light text without their pill, as in the dark room. Whether sound captions should
    be on by default for hearing visitors is a question for the work, not this memory: open, for
    the artist and the interaction designer. The master film is captions-off; the captions-on film
    is labelled as visitors see it by default.
87. **Both versions of the cut without a hole** (the sound designer): the evening comes up over the
    afternoon's last 40 ms (`EVENING_AT`), full on the cut. Measured in 20 ms windows against the
    evening: −1.1 dB at the cut as built, −1.8 dB without the wind across it, within the evening's
    own quietest moments (−1.9 and −2.2 dB); the hole was 9.5 dB.
88. **Small fixes**: bird 2's whole phrase (0.1–3.45 s), low-passed at 7.5 kHz (was 5); the
    revisit's air levelled as the memory's (−36); the film's drone released at the App's rate.
89. **Not changed**: the gust's crest under the G♭5 (the cinematic director: moving the gust changes
    the picture; the artist's call); the resemblance to Clair de lune (speculative; asked of the
    artist); the room after the woodland held 3–6 dB under its former level (the sound designer's
    option, offered to the artist, not built); the 2 s dip before the room rises (it reads as a held
    breath).
90. **Measured across the cut** (as built): the whole falls 4.2 LU, 100–800 Hz 15.7 dB; 100–2000 Hz
    holds 41% of the first wide's energy and 12% of the dusk's.
91. **Paid generation**: 2,112 credits in all (the wind, the birds, five evening takes), of the
    118,746 at the start.

### QA (169e0ef with 1d0e7d6), and what was fixed

QA played the woodland in Chromium (desktop, and an emulated phone on slow connections): every cue
loads and plays; captions, captions off, the screen reader's lines, the drone, the room's withdrawn
music and the revisit behave as decided. But the cut did not land on one instant of the audio clock
in any path measured, and the change broke the vignettes:
- [P1] In a normal play-through the beds dispatched at the start were cut one frame early (17–100
  ms: position 0 was pinned at the clock's first tick, the first sounds at `start()`).
- [P1] Vignettes lost lines after a long frame (the uncapped clock; the vignette playtest failed).
- [P1] The recordings were fetched only when the memory began (15 s on slow 4G).
- [P2] A resume within a second of the cut gave silence, then a burst on the cut (the fade-in's ramp
  outlasted the cut's, and the context orders them by time).
- [P2] A let-go in the last 3 s stopped the afternoon on its files' ends, part-way down its fade.
- [P2] After a seek the restarted afternoon lagged a frame; a pause saved the sound a frame ahead of
  the frozen picture (0.3 s out on uneven frames); cues at one marker started a render quantum apart;
  a cue falling due while the context resumed was lost.
- [P2] The picture led the sound by its way to the ear (0.093 s in headless Chromium).

### Decisions (main session)

92. **One anchor** (QA): each frame reads the audio clock once; the memory's clock and every sound
    scheduled, resumed or brought back use that reading and the position it stands for. The first
    sounds and the first frame both start from the instant the memory begins (its clock primed
    there); a pause remembers the place the frozen picture shows; the frame a resume moves on from
    stands still and the sound comes back from there; a seek's restart begins where its step begins;
    cues at one marker start together. Tested in the App's order (a slow first frame, stalls, pauses
    on even and uneven frames, seeks; with and without latency): the afternoon is silent where the
    evening is full, within 2 ms of the picture's cut (was 17 ms to 0.28 s out).
93. **What is seen is what is heard** (QA; decision 63 reversed): the sound is sent ahead of the
    picture by its way to the ear where the browser reports it (the context's buffering and the
    output's latency, less 25 ms for the picture's own way to the screen, at most 0.3 s), read once per
    memory so its cut never parts from its evening. A wired desktop gains almost nothing; earbuds that
    report their latency gain 0.15–0.3 s. Whether iOS Safari reports earbuds' latency is still to be
    checked on a device.
94. **A resume just before the cut** rises only until the cut begins, to the level it has reached;
    tested with the context's own ordering of events: no step anywhere in the gain.
95. **A let-go just before the cut**: a file that ends sooner has faded out by its end.
96. **Vignettes keep their cap of a second** (QA, the skeptic's question answered by the vignettes'
    nature): a stall makes a vignette late and never passes a line by; a memory's clock stays
    uncapped, so its picture keeps its sound. A one-shot a stall passed in the last 3 s (was 1) is
    still played, late (the door's footsteps). The vignette playtest passes again (desktop and phone,
    a hidden tab and leaving mid-line).
97. **The sound stopped while visible** (a phone's call; the context still resuming after a hidden
    tab): the memory waits for it, so the two come back together; after 3 s it plays on without it.
98. **Prefetched**: a memory's recordings are fetched with its art when its line is armed (one cache
    for both), and decoded when it is prepared.
99. **Not done**: trimming the air file's last 2 s of digital silence (50 KB, not worth a re-bake).
    For a device: iOS Safari's reported latency with earbuds, whether WebKit trims MP3 priming, how long
    its context takes to resume after a hidden tab, and memory pressure from about 120 MB of decoded
    audio on a 3 GB phone.
100. **Captions off by default** (the artist, answering decision 86's open question: "Captions by
     default should not show, its fine if its an accessibility choice"): every caption is off until
     the visitor chooses it in settings ("show what is heard"), which the threshold's help now names;
     once chosen it is remembered, and captions saved as the old default along with another
     preference are not a choice. For a visitor who chooses them, the woodland's are as decided (86).
     The screen reader's lines are unchanged. The playtests that check captions choose them first.
101. **The wind down** (the artist, on hearing the film: "The wind or whatever that noise is, is too
     loud"). Measured, it was the loudest thing in the clearing: 8 LU over the piano at the gust, 5
     in the two-shot. Over half its energy was above 4 kHz, a hiss.
     - Its takes are now treated as distant trees: a 3.5 kHz lowpass and a −4 dB shelf over 2.5 kHz,
       its 300 Hz warmth +6 dB (was +12.5). Under a tenth of its energy is above 4 kHz.
     - Its gust swells 8 dB over the breeze (was 13), and its level sits 6 dB under where it was set:
       7 LU quieter through the afternoon, 9.5 LU at the gust.
     - The piano came down 2.5 dB and dips 4.5 dB through the two-shot (was 2.5), so it stays about
       4.5 LU under the place (3.5 in the two-shot, 1.5 over in the last 2 s, where the breeze dies
       and the tune turns).
     - The cut still falls 4.6 LU. The wind across it is now 10.6 LU under the evening.
102. **No wind** (the artist: "You can just get rid of the wind sound, the breeze is supposed to be
     super light anyways"). The wind is gone from the afternoon, from across the cut and from the
     revisit; the breeze is seen, not heard. Its takes stay in `audition/woodland/` (paid for, not
     shipped). The piano is named once with the cicadas, "[cicadas in the trees; a piano]", where the
     wind's caption was, and the screen reader's afternoon has "a light breeze in the trees". The
     piano came down 2 dB more, so it stays about 4.5 LU under the place (in the two-shot, where only
     the far chorus sounds, level with it); the cut falls 4.2 LU. Decision 73's switch, and the
     version without the wind across the cut, are gone with it.

### QA (bdcd6e1), and what was fixed

On every normal path QA measured, the one anchor held. At the start, through pauses (uneven frames
included), seeks, resumes just before the cut and a quick hidden-tab return, the afternoon went
silent at the moment the evening reached full level, 0.00 ms apart. Both sounded 70 ms ahead of the
picture's cut, the headless browser's lead. Vignettes, captions and the let-go fades were fixed.
What it found:
- [P1] After the three-second "play on without its sound", or a memory begun before its sound
  ran, the sound never found the picture again. The piano ran 1.5–3.3 s into the dusk, or the
  evening never came; cues due meanwhile were lost.
- [P1] The woodland's recordings were prefetched only when its reserved line was written, seconds
  before it began: 41 s to start on slow 4G.
- [P2] The evening was handed out only 0.3 s ahead, so a slow frame, or a lead near its 0.3 s cap,
  brought it in after the afternoon had gone.
- [P2] A let-go in the instant before the cut let the evening (already sent ahead) fade for 4 s
  without its picture.
- [P2] Back from a hidden tab, the pause's fade-out played on over the restart.
- [P2] The touch help never named the settings button.
- [P2] Overdue cues could start a render quantum late.

### Decisions (main session)

103. **A memory waits for its sound** (QA): while its context isn't running (a call, a tab coming
     back, or not yet running as it begins) the memory is held, and it is let go uncounted after
     ten seconds visible without it, as a vignette is. It never plays on silent. Sounds that fell
     due while the sound couldn't run are handed back and handed out again.
104. **Prefetched as it may be offered** (QA): a memory's art and recordings are fetched as soon as
     it may be offered within a minute (its arc open, near its earliest), not only when its line is
     on a wall: the woodland's line is written only as it is offered.
105. **Handed out 0.75 s ahead** (QA): room for the lead (up to 0.3 s) and a slow frame just before
     the cut; a sound joined late comes up over its own fade (the evening's 40 ms), not 0.3 s.
     Tested with frames of 0.35 and 0.6 s at 34.1 and a lead at its cap.
106. **Interrupted, what the picture hasn't reached goes at once** (QA): a bed or music the picture
     hasn't reached yet (the evening, sent ahead by the lead) fades in 30 ms, unseen.
107. **A pause remembers where the picture is** (QA, and found in its tests): a sound begun ahead of
     the frozen picture (by the lead) begins that far ahead again on resume (it had restarted 0.26
     s early); what faded for the pause and never finished stops as the restart begins. Back within
     the lead of the cut, nothing of the afternoon comes back and the evening joins as far in as
     the picture's clock says.
108. **Small fixes**: overdue sounds start a render quantum ahead, their offset advanced to match;
     the touch help names "···" for sound and captions.

## The artist's direction: Ushio's "fable", "our film" and "past" (2026-10-20)

After the films without wind, the artist wrote twice: "remember I said fable, our film, and past by
kensuke ushio are the main inspiration". Asked which of those tracks' qualities the woodland's
piano should take, they chose the piano's sound (an old upright heard close: soft, worn, its hammers
and pedal audible, a small room), a faint texture under it, and loose, breathing time. They did not
choose "fragments, not a tune": the tune and its form stay. Asked what the faint texture under the
piano is in those tracks, they chose all four offered: the piano itself (its own resonance under
the pedal, its keys and hammers, the room), strings (bowed, very quiet), a worn recording (tape or
vinyl noise: soft hiss, crackle, slight wobble) and electronic air (soft synth pads, or a gentle
electronic hum or hiss).

### The proposal and its reviews (the sound designer, the creative director; the skeptic)

The proposal: the same CC0 samples made softer and older (part-way to felt, a worn voicing, the top
rolled off), the mechanism heard 24–30 dB under the notes, a practice room; rubato by the phrase
(long notes 100–250 ms late, the approach to home slowing, the second time breathing differently); a
bowed texture 15–20 dB under the piano.
- **The sound designer**: buildable, but three of its numbers work against it. Late long notes land
  on the looks and fail the test. 15–20 dB under the piano is level with it under both looks, since
  nothing else in the clearing sounds between 250 Hz and 2.5 kHz. Felt and the roll-off act on a top
  these samples don't have. First fix what most separates it from an upright heard close:
  - the melody jumps across the stereo field (−9.4 to +5.6 dB, 10 dB between neighbours; mono
    loses up to 3.7 dB on a note);
  - the treble dies in 1–1.5 s (a halo, the undamped strings ringing on under the pedal);
  - the mechanism is 35–43 dB down and masked (place it where it can be heard).
  The texture under a level rule (at least 8 dB under the piano in every 400 ms block) and spectral
  limits (at most 10% of its energy above 2.5 kHz and 2% above 4 kHz), as two synthesised variants
  (bowed, air). Linger after the long notes; home 120 ms late.
- **The creative director**: nothing slows anywhere. This afternoon leans in and never lets go; the
  cut does the letting go. Hesitate on pickups, long notes on time or a touch early, home on the grid,
  the turn a habit. The texture should be the piano's own strings or nothing: a held layer surfaces at
  the end of both looks and scores them, and a layer belonging to nothing is the white room's drone.
  One named fault (F5's sour unison), not general wear. Keep the top, no felt thump. Decision 85
  holds.
- **The skeptic**: both argue over what can't be heard (a long note moved 60–130 ms), and each now
  refuses part of what the artist chose. The creative director's "bloom only" refuses "all four",
  and the sound designer's separate layers can't be told apart at the level they must sit at. One
  build, two films, one question. Time: the creative director's rule at the sound designer's size
  (linger at the top, lilt the turn). Texture: the halo always; a bowed grain inside it and a sparse
  crackle as traces; electronic air folded into the halo; no hiss floor (it would surface in the
  two-shot) and no tape wow; the F5 unison as the wobble; every substitution told to the artist.

### Decisions (main session, after the skeptic)

109. **The three tracks are the brief for the music** (the artist).
     - Decision 65 gives way on softness, wear, closeness and strict time. It holds on the white
       room's own felt thump and closing sweep, which stay the room's.
     - Decision 75 gives way to a texture that is the piano's (113); decision 84 gives way to 112.
     - Decisions 67 and 68 hold (the windows; the cut).
     - Decision 85 holds: as the playing moves toward tender, the major harmony is what keeps it from
       sad (the creative director, from the research on performance cues).
110. **An old upright, heard at the bench** (the sound designer's findings 4, 6 and 7; the
     skeptic's 5).
     - **Placement.** Each note is its sample's two sides summed without their phase differences
       (their power kept, the louder side's phase), placed by pitch (−0.2 at F2 to +0.15 at A♭5),
       with the sample's own side 24 dB down.
       - The sound designer's mid plus side at −12 dB left C5 and D♭5 5 dB off their place. The
         samples' own sides differ by up to 15 dB at a fundamental (C5), and C5's plain sum loses
         3.9 dB there.
     - **One sample a key**: the alternates, and their matching, are gone.
     - **The room is the samples' own kind**: a coincident pair at the player's head.
       - Each reflection reaches both sides at once, weighted by where it comes from: the floor, the
         wall behind the piano, the ceiling, the side walls, the wall behind the bench and four later
         ones, at 2.8–18 ms and 15–25 dB under, each wall taking some of the top.
       - A tail 15 dB under: 0.35 s below 1 kHz, 0.25 s above.
       - The sound designer's per-side delays put F5 8 dB off its place, and the mono sum rippled from
         −21 to +5.5 dB over 250 Hz–2 kHz.
     - **The mechanism, heard by where it falls**:
       - the key in its bed 10–15 ms before each string (−30 dB re its attack, one at −28 for a
         left-hand chord);
       - the pedal's thump 40–80 ms after each chord (−36);
       - the dampers' brush at each change (−32; −38 at the cadence's quick change);
       - the last change silent, and nothing in the picture's moments.
     - **No felt, no thump, no top roll-off**: the soft layer has nothing above 2.5 kHz to roll off.
     - **One fault of its own**: F5's second string 2.5 cents sharp, a beat of about 1 Hz on its two
       long notes, both in the wides. The treble keeps its own measured tuning.
111. **The strings ring on under the pedal** ("the piano itself"; the sound designer's finding 5, the
     skeptic's 4).
     - Each note's first three partials, measured in its sample, ring as a unison's three strings
       a fraction of a hertz apart.
     - They rise as the note's own sound falls, ring at the strings' rate while the pedal holds (T60
       8 s at C5, 5 s an octave up, 11 s an octave down), and stop in 0.1 s at the change.
     - Each long note's own band two seconds in sits about 28 dB under its peak. The second A♭5 was
       52 dB under: its sample is faded out by 0.8 s.
     - In both films, always on.
112. **Breathing time: one habit both times, nothing slower** (the creative director's rule at the
     skeptic's size). Before the hands' ±12 ms:
     - the step down after the high A♭5 comes late: G♭5 100 ms after its time, a touch lighter;
     - the long F5 and E♭5 come on time, with their chord's bass and tenth 30 ms ahead;
     - the turn lilts: F5 +15 ms, E♭5 +45 ms;
     - home, the leading tones, the go-round and both A♭5s stay where they were.
     No slowing into home (it would answer her look) or into the cut. Not taken: the sound
     designer's +120 ms into home, his late turn after ii and the second A♭5's +110 ms; nor the
     creative director's early long notes, which are inaudible as time and only rush the pickup.
113. **The texture: all four, each the piano's** (the artist's four; the skeptic's findings 2–3; the
     creative director's guardrails as its rules).
     - **The piano itself**: 110–111, in both films.
     - **Strings**: a trace of bow in the piano's own strings: a faint stick-slip rasp at each ringing
       string's period, through its partials, 11 dB under its ring and cut with it.
     - **Electronic air**: a breath round the ringing partials (a narrow band of air on each, wide), 9
       dB under the ring and cut with it.
     - **A worn recording**: a sparse crackle, 1–3 ticks a second at random, 300 Hz–3 kHz, peaks about
       33 dB under the melody's median attack. None above its median in the picture's moments, and none
       in the last second before the cut.
     - **Rules for everything added**:
       - it rises only with a chord, never while the piano decays;
       - it sounds no pitch the piano isn't sounding;
       - nothing of it below 250 Hz;
       - at most 10% of its energy above 2.5 kHz, and 2% above 4 kHz;
       - at least 8 dB under the piano in every 400 ms block;
       - no pitch moving.
     - **Not built, and said to the artist**:
       - a hiss floor: it rides the piano's 4.5 dB dip while the place hushes 8–11 dB, so it would
         surface in the two-shot (the noise removed twice: 101–102);
       - tape wow: pitch moving; the wobble is the piano's own F instead;
       - a separate pad: detuned pairs held under a chord are the white room's drone, which 64 keeps
         out of the woodland;
       - a separate synthesised bow: it swelled like the wind and had no bow's rasp;
       - ElevenLabs takes: held. If the artist wants strings that sound like strings, a real bow at
         the edge of sound, or a small batch after a dry run.
114. **One build, two films, one question** (the skeptic's finding 6).
     - Film A has everything. Film B is the piano alone: its ring, mechanism and room, without the
       bow, the air and the crackle.
     - The room plays A until the artist says otherwise.
     - The artist plays A on their own phone; no phone-model film this time.
115. **Tests** (the creative director's finding 8, the skeptic's 7).
     - The windows extend to the mechanism and to the crackle's louder ticks; notes.json lists them.
     - Each long note's level at each look's start is recorded.
     - σ 12 ms is kept, and the shipped seed is checked.
116. **Levels** (the sound designer's finding 9, the skeptic's 4). SCORE_DB −28.5 and the 4.5 dB dip
     stay for the first build. spans.py is re-run after the halo; if the two-shot steps forward,
     level comes off the whole piano, not off the halo.

### Built, and measured (before mastering unless said)

- **Placement**: each melody note within 1.45 dB of its place (its own band, first 0.3 s, in the mix);
  mono loses at most 0.21 dB a note; L/R correlation 0.96. Centroid 622 Hz; 0.01% of the energy
  above 2.5 kHz.
- **The ring**: each long note's own band two seconds in, re its peak: A♭5 −24.4 and −34.3 (the
  unison's beat in a trough), F5 −29.8 and −30.3, E♭5 −22.2 and −21.7 (their samples ring on by
  themselves; their halo is at its floor). At each look's start: the E♭5 is 11 dB under its peak as
  her eyes move (17.5), and the A♭5 25.6 dB under as his do (24.0; its sample alone is about 35 dB
  under by then).
- **Time**: the test passes at the shipped take (humanising seed 12; with the habit, seed 11's
  hands played the second time 0.95 louder than the first, against the test's one level). Home is
  due 0.24 s after the cut, and the last note comes 0.61 s before it. 115 of 200 seeds pass every
  rule: the velocity rules (±6 of the mean, the second time no louder) are what fail the others.
- **The texture** (bow −14 dB and air −14 dB under each note's falling sound, above 400 Hz only;
  crackle −34 dB under the melody's median attack):
  - per 400 ms block, at least 8.8 dB under the piano (median 13.6);
  - inside the looks it never rises by more than 0.4 dB from block to block;
  - 0.1% of its energy is above 2.5 kHz, 0.05% above 4 kHz, none below 250 Hz;
  - the crackle: 1.7 ticks a second, none above its median on a moment, the last 1.1 s before the cut;
    on the phone model in the two-shot, its median tick is 35 dB and its loudest 30 dB under the
    melody's median attack.
- **The mechanism**: 47 sounds, none on a moment; the last change is silent.
- **The low mids**: the ring, texture, mechanism and room add 1.1 dB to the piano's 125–500 Hz and 2.1
  dB to its whole band, so the low mids' share falls 1 dB. The room adds most of it (1.1 dB, 1.4
  overall).
- **Against the place** (spans.py, the film's stems; before → now):

  | | Before | Now |
  |---|---|---|
  | Entry | −8.3 | −8.7 |
  | First wide | −4.7 | −5.2 |
  | After the gust | −10.5 | −11.1 |
  | Two-shot | −0.8 | −1.4 |
  | Second wide | −5.9 | −6.5 |
  | Last 2 s | +0.6 | +0.5 |
  | Overall | −4.6 | −5.2 |

  The cut still falls 4.2 LU. Nothing stepped forward, so SCORE_DB and the dip stay (116). The piano
  alone measures within 0.3 LU of A.
- **Films**: `test-output/review/woodland/sound/woodland-film-A.mp4` (as the room plays it),
  `woodland-film-A-with-captions-chosen.mp4` and `woodland-film-B-piano-alone.mp4`.

## The artist's idea: a line where the painting was (2026-10-20)

The artist: "I also think it would be more powerful if text got written on the wall where the
animation was after it ends such as 'I thought it would last forever.' Or something in that vein,
that fits the moment and the overall installation, your choice." They asked for the music first.

### The proposal and its reviews (the creative director, the technical artist, the interaction designer; the skeptic)

The proposal: one line, always the same ("I thought we had more time."), in the same pencil a size
smaller, under "five more minutes" inside the painting's former place, written about 2 s after the
room's writing comes back, only after a memory run to its end; kept for the visit.
- **The creative director**: right in principle (the memory given back to the writer's hand, the
  diorama's own medium), but the proposed words and the artist's example speak in the dusk's voice:
  they tell the visitor why to be sad, which the brief forbids. "we had all afternoon" (lowercase, no
  full stop), in the afternoon's voice, written after a silence, xs, never on a later visit. The work
  has removed words over the empty clearing three times.
- **The technical artist**: cheap and safe to render, but the placement fails. The woodland's line is
  written on whichever wall the visitor faced, and no existing write places a line under it inside
  the painting's rect (free in 6–27% of endings). xs is a smudge from where the visitor is put back;
  use s. The memory completes at 55.0 s or later, not 53.
- **The interaction designer**: the aftermath leaks. Stillness and closeness built up while the
  visitor was carried are answered as soon as the 6 s hold lifts: a whisper at +6.9 s in about one
  still ending in four, which would land on the line. Fix that first. Then the line as the last
  stroke of the withdrawal (50.3 s), at s, gated on the memory's own position and on being taken in.
- **The skeptic**: build it; fix the leak first, in its own commit. Write at memory position 52.5,
  where the far cicada ends: the wall is white, the words have been back a second, the painting's
  place is still live, and the line is done as the aftermath begins (50.3 is inside the wash; 55.5
  and "after a silence" land late, on the room's habits). "we had all afternoon" is right, but not
  because the artist's line is a cliché ("forever" is their own word for this memory): it only says
  what they had, and under "five more minutes" it becomes the contradiction. Show the artist both.
  Pencil s, one line. One placement rule, not a specification: inside the painting's former place,
  nearest under the line, slots of lines not yet shown giving way. Two more of the room's habits
  would caption it (finishing an unfinished sentence, warm resurfacing).

### Decisions (main session, after the skeptic)

117. **The aftermath holds** (the interaction designer's finding 1, the skeptic's 1). While a memory
     plays and through its aftermath, stillness and closeness are not counted: the still clock and
     any voice it owes are cleared, and closeness to the chair (after the first approach) is held.
     Both count again from when the aftermath ends. What the visitor does is still answered, a first
     approach to the chair among it. Tested: a still visitor carried through a memory to its end,
     standing or by the chair, gets nothing of the room's own for 25 s (16 runs; before, 18 voices
     leaked). The journey's quiet after a memory is 25 s for every persona.
118. **Two habits wait** (the skeptic's finding 6). An unfinished sentence is never finished in the
     afternoon's aftermath ("I wanted you to stay." under "five more minutes" would caption it); after
     the other memories, a long look is answered as ever (held in every aftermath, the reader heard no
     recorded voice in the first 90 s). No warm memory resurfaces once the afternoon has been seen
     ("That was a good day." after it), as the room's music doesn't (decision 64).
119. **The words: "we had all afternoon"** (the creative director, the skeptic; the artist gave us the
     choice). Lowercase, no full stop. It says only what they had; under "five more minutes" it is the
     contradiction of asking for five more minutes when you had all afternoon. The artist is shown it
     beside their own line ("I thought it would last forever."; it fits one line at this size, 1.63
     m, as measured in the browser), and one string changes it.
120. **When: memory position 52.5** (the skeptic's finding 2): the far cicada has ended, the wall is
     white and the words have been back 1.2 s, the painting's place is still live, and the Director
     drops the room's own writing while the memory is active. Written at the hand's own pace (about 3
     s), silently, whether or not they are looking; done as the aftermath begins. Only when the
     afternoon reached that position while playing, in the room, with the visitor taken in and the
     memory not let go early. So once in a lifetime of visits: the afternoon plays only until it is
     counted.
121. **Pencil s, one line**, the size of "five more minutes" (the technical artist's 3, the
     interaction designer's 3, the skeptic's 4): the one size known to read from where the visitor
     is put back.
122. **Where: inside the painting's former place, nearest under the line** (the skeptic's 5, the
     technical artist's P0s): candidates inside the rect the painting took, nearest first to just
     under the start of the woodland's own line (read from its own key, never the phrase's blank
     layout slot); the first whose only obstacles are slots of lines not yet shown wins, and those
     lines are placed again elsewhere on their wall. If none fits, nothing is written and nothing is
     announced.
123. **Its identity**: `source: 'more-minutes'`, so a look at it counts as a look at "five more
     minutes"; a key that doesn't start with `memory:`; no phrase entry. Announced to a screen
     reader as it begins: "Written on the wall where the painting was: we had all afternoon."
124. **Not done**: a size smaller (xs), two lines, 50.3 s over the wash, a silence of 6–8 s after
     completion, a graphite sound under the hand, a line on a later visit, baking it ahead (the
     room bakes every line on demand; ahead only if a phone shows a hitch there), the specification's
     alignment rules, capturing the painting at the residue, a pacing hold for it.

### The build evaluated (the creative director, the sound designer) and tested (QA), and decisions

All three measured re-renders of b06217c that matched the shipped file (none of them can hear it).
- **The creative director**: "the piano itself" is honoured and the time loosened in kind, but
  strings and electronic air exist in name only: fused into the piano's own partials, sharing its
  onsets, pitches and decay, they would be heard as its tone. The ring is the build's most exposed
  sound. The high A♭ is a synthesised ring a third of a second after it is struck, pulsing about once
  a second, and it came back up 7–9 dB between his eyes and his roll. Every ringing note beat a
  fault's worth, so the F's one fault wasn't one. Crackle reached into both looks, two ticks 0.1 ms
  apart summing over the rule on his. B wasn't quite the same piano as A. The note to the artist
  overclaimed.
- **The sound designer**: placement, mono, correlation, the low mids and the texture's broadband rule
  are met, and the departures from his numbers (the aligned mid, the coincident room) were right. But
  a bass note's texture, set against its whole sound, was crowded into its one or two upper partials,
  1–7 dB under the note there, under both looks. The ring carries most of every long note and beats
  11–28 dB at 0.55–1.2 Hz on all of them, the drone's own construction. The mechanism sat about 15 dB
  under its spec (normalised to its sample peak), and the pedal's thump came 40 ms late. Confined to
  the melody, the bow and the air are below hearing. The go-round's last E♭ rang a ninth through the
  first bar (since 97f0d35), and F5's second string began with a step.
- **QA**: the shipped file holds (gapless 26.300 s in FFmpeg and Chromium, silent on the cut,
  byte-for-byte re-renders, the cue sheet and decoded budget unchanged, the films in sync). It found
  the step, the tick pair and B's piano too, plus four holes in the test: coincident ticks, a tick out
  of order, a crackle 20 dB louder, an unknown mechanism kind. Outside this commit: captions without
  their own moment came up 0.64–0.75 s before their sound in every memory, since the hand-out went to
  0.75 s ahead (decision 105). The library's own low-pass on three bass samples was read and never
  applied.

### Decisions (main session)

125. **The ring is one string's, mostly** (the sound designer's finding 2, the creative director's 1).
     Each partial's three strings are at 1, 0.4 and 0.2, a twentieth to a tenth of a hertz apart and
     in step as it is struck. A ring of four seconds only falls, never swells back. It blooms within a
     few hundredths of a second, under the note's own attack: the looks begin as their notes are
     struck. F5's ring carries its fault in its second string (about 1 Hz at its fundamental, 2 and 3
     at its partials), so its F is the note that beats (−4/+3 dB about its decay; every other ring
     within ±0.5).
126. **The texture only in the melody's strings** (the sound designer's finding 1).
127. **The bow and the air, and a hiss, for the artist to hear and choose** (the sound designer's
     finding 4, the creative director's 3). Confined to the melody, the bow and the air are below
     hearing, so A was B plus the crackle: a question the artist couldn't answer. They are sent the
     piano with its crackle, as the room now plays it, and short clips that make each texture audible
     on purpose: the piano alone, the bow and air raised 10 dB, a soft hiss (pink from 300 Hz, rolled
     off above 4 kHz, 28 LU under the piano, stepping back with the clearing's hush, 5 dB more than
     the piano's dip), and the crackle. What they choose is then built properly (a real bow, or a
     batch generated after a dry run, if they want strings that sound like strings).
128. **The mechanism heard** (the sound designer's finding 3, the creative director's 6, QA's 7).
     Its sounds are set by their loudest 10 ms. The key's wood is 38 dB under its note's attack: 8 of
     its 29 knocks stand above everything else in their band. The pedal's thump is gone (heard
     nowhere, and late). The pedal lifts a little early, 0.15 s, at three phrase ends: after the
     high A♭ (12.55), after home before the go-round (21.88, where the hands lift too and home's
     ring clears) and before the second time's ii (30.35). There the dampers brush is 24 dB under
     the melody's attack; it stands near everything else only at the last of them.
129. **The crackle** (the sound designer's finding 5, the creative director's 2, QA's 3).
     - Never in the looks.
     - Ticks at least 30 ms apart, within ±1.5 dB of their median and never 2 dB over.
     - Every tick in both ears, a little to one side.
     - 300 Hz–2.5 kHz, its median tick 36 dB under the melody's median attack. On the phone model
       that's 33.5 dB under, the loudest 30.4.
     - The test now also checks the gap, the order, the absolute level and the mechanism's kinds,
       and ties notes.json to the file by its hash.
130. **Small fixes**:
     - Each version is rendered from its own piano and matched on the piano, not the mix. The
       piano alone had come out 0.5 dB louder.
     - The go-round's last E♭ is let go before the next statement.
     - F5's second string fades in over 10 ms.
     - The habit's −2 velocity is gone (smaller than the hands' ±3).
     - The library's low-pass on its C3, D♯3 and C4 samples is applied, as it plays them.
     - The look test records the ring alone. The ring may not rise (0.08 dB in her look, 0 in his).
       The held note's band may rise 2 dB: the recorded E♭5's own strings beat 1.9 dB late in her
       look, as in every version.
     - notes.json records the toolchain.
     - `tests/playtest/woodland-spans.py` is committed for the loudness table.
131. **Captions with their sounds** (QA's finding 1). Every caption, a voice's words included, is
     shown as its sound is heard, with the picture. It was shown as its cue was handed out, up to
     0.75 s ahead. Tested at output latencies of 0 and 0.12 s: each within a frame. Three tests that
     read captions at hand-out now let time pass.
132. **The note to the artist** (the creative director's finding 4): what is likely heard and what
     isn't; the ring is made, not recorded; the F is the one beat; the hiss's real problem (the
     piano's dip against the clearing's hush, which an envelope of its own answers). "(Ushio's own
     way)" is sourced: it is how he describes the faint violin in "Reze" (Real Sound, 2025).

Measured after these (woodland-spans.py, the piano against the place): entry −9.0, first wide −4.2,
after the gust −10.5, two-shot −1.4, second wide −7.0, last 2 s +0.2, overall −5.1 LU; the cut falls
4.1 LU. Placement within 1.5 dB, mono 0.2 dB at worst, correlation 0.975. The films and clips are in
`test-output/review/woodland/sound/`: `woodland-film.mp4` (as the room plays it), its captions, and
`clip-1-piano-alone`, `clip-2-bow-and-air`, `clip-3-hiss`, `clip-4-crackle` (memory 9.0–21.5).

### The line as built, evaluated (the creative director), and decisions

Seen in the browser (`tests/playtest/woodland-coda.mjs`): written once at the memory's 52.5–53,
announced as it began, in both wordings. The creative director: the core keeps faith with the
three removals (only after the clearing has sunk, the room's own silent pencil, once, naming no
feeling), but the placement fails. The nearest free place anywhere in the painting's 3.2 × 1.8 m
put the line above "five more minutes" when the opening's own "I wanted you to" sat underneath (a
stanza read top-down, the plain fact first and the plea its punchline), or 34 cm under it past the
place kept for "That was a good day." (once that line is written, the coda reads as its answer), in
about a third of endings in the creative director's model. The note to the artist was misleading
too: its "usual case" was a near-bare wall the harness made, the stills carried two things a real
visit wouldn't have just then ("Esc to pause"; "We ate cereal for dinner and it was perfect."
written seconds before the memory), the artist's wording was shown only in the worst layout, and
decision 119 said wrongly that it wraps.

### Decisions (main session)

133. **Under its line, close, clear of other writing, or nothing** (the creative director's findings
     1–2). The line goes only just under "five more minutes":
     - its top 2–15 cm under that line's foot;
     - overlapping at least half the narrower of the two;
     - nearest first to just under its start, a little in.
     It is never written above or beside it. It keeps 20 cm clear of everything already written on
     that wall, drawings included. Places kept for lines not yet shown still give way, but a line's
     own authored place never moves. If nothing fits, nothing is written or announced.
     - In a quiet room it is nearly always written; with half the room's lines on the walls, about a
       quarter of the time. The creative director's model, with the walls as visits fill them, gives
       about half.
     - The artist is told so, and offered the other way: kept clear only of the lines decision 118
       names (the opening's unfinished line, the warm lines), written more often. Its direction and
       closeness stay.
     - Tested: on a clear wall just under its start; never above (a line written just under its own
       line) or beside; on the walls as laid out, under, close, clear and inside the painting's
       place; nothing where nothing can move.
134. **When stays at 52.5** (the creative director's finding 4, speculative). The creative director
     would start the hand about 2 s later (54.5): at 52.5 the far cicada's last quarter-second is
     still sounding. The skeptic's reasons for 52.5 stand: the visitor is most likely still facing
     the wall they were put back facing, and the painting's place is live. The artist is offered the
     later start.
135. **The note to the artist redone** (the creative director's finding 3). Both wordings are shown
     on a wall as a visit writes "five more minutes", with what else is on it said plainly. The
     consequence of "once" is spelled out: let go after her look, and the afternoon still counts as
     seen, so the line is never written in that browser. The room's own reason for its words is
     given: their hands lie almost touching and never move, and the line says what they had, never
     closed. Decision 118 is mentioned. The hardest layout is shown only as what now writes nothing.
136. **20 cm from every place on its wall, for the rest of the visit** (found checking the new stills
     before sending them). It kept 20 cm only from what was already written, and a line's own place
     never moves: on the east wall it went 1.5 cm beside the empty place of "That was a good day."
     (crayon, at its own place), and would have run on into it once the room wrote that line there.
     The creative director's finding 2 named that very line.
     - Now every place within 20 cm stops it, unless that place can go elsewhere: a line not yet
       shown is moved, as before; a line's own place, written or not, stops it.
     - Nothing placed after it comes within 20 cm, the moved lines included: its margin is kept in
       the layout.
     - The cost, in the layout model (120 endings): written about three times in four on a quiet
       wall (before, nearly always), about half with a third of the lines up (before, three in
       four), about a quarter with half up (unchanged). The artist's wording, longer, is written as
       often except with a fifth of the lines up (half, against three in four). By three minutes
       a visit has had 11–15 lines written (the engine playtest), and the woodland comes after 200 s.
     - Tested: kept clear of a line's own place, empty or written, while a place that can move gives
       way; on the walls as laid out, 20 cm from every place that stays.
137. **A line's own place waits, and its line is kept back** (measured in the browser after 136). The
     layout model behind 133 and 136 measured text about a third narrower than the browser draws
     it; its figures were wrong. In the browser's own layout early in a visit, "five more minutes"
     was written where the room writes it near 72 points at eye level on the four walls, and landed
     in 46 places (`tests/playtest/woodland-coda-walls.ts`). The room keeps a place for each of its
     120 lines from the start, so it lands in the few gaps left. Under 133 the line was written in
     27 of those 46; under 136 in 12 (the artist's wording, 11). 136 turned away most places under
     it for the empty places of lines with their own, close by.
     - A line's own place, not yet written, now waits: only overlapping it stops the line, as under
       133. A line whose own place is within 20 cm is kept off the walls for the rest of the visit
       (`Director.keepBack`, through the gate every reveal passes), so it is never written beside it.
       The walls aren't kept between visits, so the two never meet.
     - The rest of 136 stands. The line keeps 20 cm from what is written and from places that stay.
       Places of lines not yet shown give way within 20 cm. Nothing placed later comes within 20 cm.
     - Tested:
       - an empty own place waits and is returned;
       - written, a line's place keeps 20 cm, as does a place that stays;
       - a place that can move gives way;
       - the walls as laid out;
       - a kept-back line is never revealed (the test fails without the hold).
     - Measured the same way:
       - Early in a visit: 27 of 46 for both wordings, as under 133. One or two lines are kept
         back in 16 of the 27. In the middle of the east wall, "I think I was happy then." and
         "That was a good day." are both kept back.
       - With fifteen of the room's first lines up, as by the time the woodland usually comes
         (`SHOWN=15`, three choices of lines): 19–20 of 46, and 18 for the artist's wording.
       - The other way offered under 133 (20 cm only from the opening's unfinished line and the
         warm lines) writes it no more often: the lines up by then are the warm ones. The artist
         is offered instead: as now, about four times in ten, or always written (lower down, or
         further along, when there is no room just under).

### QA (52b7bd6, 70c7829, 5f9401c, aeefcf6; placement at bc3d818 and 35eccce), and what was fixed

QA verified that the four commits do what they claim (the line written and announced once, only
when it should be; the aftermath holding; captions within a frame; the score byte for byte). Its
findings, and what was done:

138. **Fixed, with tests.**
     - **Captions.** A vignette let go gracefully in the 0.3 s before a line said it uncaptioned (a
       regression from 70c7829). At 0.12 s latency, a pause just after a one-shot began lost that
       one-shot's caption. Each caption now goes with its own sound:
       - let go naturally, a sentence or a one-shot plays on and is captioned as it is heard;
       - interrupted or paused, one already begun is captioned at once.
       Caption timing is now tested within 20 ms, at 0, 0.12 and 0.33 s of latency.
     - **The line, past a long frame.** It is written as the memory ends if no frame was drawn
       between its moment and the end. QA saw 3 of 18 runs skip it under software GL.
     - **Kept-back lines (137).**
       - A memory's offer could re-ink one in its own place once a copy elsewhere had made it count
         as on the wall. Such re-inks are refused, and kept-back lines are left out of what faces
         the visitor.
       - A line the opening made ahead and hasn't written waits, as one with its own place does.
         This is why QA saw the line pushed further left.
       - A moved line stays on its own wall or waits. QA saw "humming" go to the west wall, 28.5 cm
         off the floor.
     - **The pencil's grain and the crayon's wax are CPU canvases**, as the writing drawn with them
       is. Each line's read-back waited 8–55 s under software GL; 2 ms after.
     - The runtime's cleanup no longer closes the living scene's missing bitmap.
     - **Tests.** The three behaviours of 52b7bd6 had none; now each has a test with its control. The
       score test says its crackle level is the render's own figure, and its periodicity check
       leaves out the looks' gaps.
139. **The crackle and the hiss made audible for the artist.** As built, both are probably below
     hearing in the room's mix:
     - the crackle's ticks sit a median 32 dB under everything in their 5 ms (300 Hz–2.5 kHz);
     - the hiss sits 33 dB under the mix (300 Hz–4 kHz).
     Two more clips raise only the texture (the version minus the piano alone):
     - the hiss by 20 dB, now 13 dB under the mix;
     - the crackle by 26 dB, its ticks now a median 7 dB under, 8 of 23 within 6 dB.
     The note to the artist says so, and asks at what level they want one, if any.
140. **For the creative director** (QA's finding 5). The line may hang well to the left of its line,
     down to half overlap, and on an upright phone it can run off the screen. "I thought it would
     last forever." (1.63 m) is wider than an upright phone shows at 2.4 m (about 1.3 m). Asked.
     Not done: baking the line ahead, until a phone is measured with a long-task observer.
