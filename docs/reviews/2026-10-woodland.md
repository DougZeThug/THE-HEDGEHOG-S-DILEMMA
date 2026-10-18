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
