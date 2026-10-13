# Review: dependencies, a memory as light, artistic controls, measurement (October 2026)

**The brief.**
- Evaluate gsap, vite-plugin-glsl, tweakpane, three-perf, playwright / @playwright/test and postprocessing for architectural compatibility and artistic value.
- The goals:
  1. a restrained animated visual style through subtle shader effects;
  2. selected lines of writing turning into short, fleeting visual memories ("memories intruding upon reality, not a fantasy game or a special-effects demonstration");
  3. better artistic controls;
  4. better testing and performance measurement.
- Preserve Three.js, the Director, OpeningScore, visitor memory, handwriting and audio. No competing clocks or state machines. Nothing added only for novelty.

**Reviewers.**
- `technical-artist`, `cinematic-director`, `interaction-designer` and `qa-accessibility` reviewed the proposal.
- The `skeptic` challenged them.
- QA, the cinematic director and the technical artist then evaluated the build (see the end).

**Evidence:**
- `test-output/perf/{baseline,after}-{1,2}/`: `perf.json` and fixed-state frames for the first build; `after-{3,4}` after the evaluations; `ab-{dither,nodither}-{1,2}` the dither's cost.
- `test-output/review/memory/`: the memory frame by frame, desktop and phone, reduced motion (`reduced/`), the tune panel.
- `test-output/review/qa-memory/`: QA's scripts and logs (latency over 30 seeds, taps, the panel by keyboard, dither noise).

## Ranked dependency assessment

| Rank | Dependency | Verdict | Why |
|---|---|---|---|
| 1 | **playwright** (exact `1.56.1`) | **Added**, devDependency | The browser tests already `require('playwright')` but resolved to whatever global install a machine had. Pinned to the version whose browser build (Chromium 1194) is installed here. It downloads no browsers on install, and doesn't touch `vite build` or the page. |
| 2 | **@playwright/test** | **Deferred** | Useful for pass/fail tests with desktop, phone and reduced-motion projects and `toHaveScreenshot`. But QA found screenshots can't be made deterministic yet: grain time and handwriting run on the wall clock, and Web Audio time isn't faked. Add it together with a `?test` fixed-step hook. The existing real-time scripts stay as they are. |
| 3 | **tweakpane** | **Not added**; a small `?tune` panel instead | The need is real (goal 3), but what the artist needs is a few sliders bound to live values, a button to call the memory, and "copy values". That is about 70 lines with no dependency. It loads as its own 2 KB chunk, only with `?tune`, and writes only presentation values (light levels, uniforms), never Director state. |
| 4 | **postprocessing** (pmndrs) | **Rejected** | The existing composer is colour-correct: RenderPass → OutputPass (Neutral tone mapping, sRGB) → one grade pass in display space, where its thresholds were tuned. The library's main benefit, merging passes, can be done by hand (fold OutputPass into the grade, saving one full-screen pass). That is deferred until it can be measured on a phone. Adopting the library would mean rewriting Post and its tone mapping, and it has its own timer. |
| 5 | **vite-plugin-glsl** | **Rejected** | The shaders are a few inline strings, most injected into three's own materials with `onBeforeCompile` string replacement. A build plugin (plus vitest configuration) would change nothing a visitor sees. |
| 6 | **gsap** | **Rejected** | It runs its own requestAnimationFrame ticker: a second clock. That clock ignores the Director's hold, the playtests' engine time and a hidden tab. Every transition here is already a function of the scene's time: `approach()`, OpeningScore keyframes, `dimToChair`, and now the memory's envelope. |
| 7 | **three-perf** | **Rejected** | It can't be installed: its peer is `three >= 0.170` and the project uses 0.169, so npm stops with ERESOLVE, on Vercel too. It also pulls in troika-three-text and tweakpane@3, and it runs inside the page. Three already gives what it shows: `renderer.info` and `EXT_disjoint_timer_query_webgl2`, used by the new harness. |

**What Three.js already provides** (no dependency needed): post passes and colour management (`EffectComposer`, `OutputPass`), shader injection (`onBeforeCompile`), blending modes (the memory's multiply blend), warm-up compilation (`renderer.compile`), counters (`renderer.info`), and timing (scene time, `performance.now`).

## The memory: "the light in the kitchen at four in the afternoon"

**Decisions**
| Question | Positions | Decision |
|---|---|---|
| Which memory | Cinematic: kitchen-light. It is a line about light, in a work whose motif is light, and it breaks the room's one-source rule. Interaction: a set of three, since one line misses whole personas. Skeptic: a set dilutes it, and needs non-amber light. | **One line, one light.** |
| When | Cinematic: late, behind six conditions. Interaction: 4 s of gaze, plus tap. Skeptic: in 40 engine visits the line was looked at for 0 s in all 40, so neither trigger could fire. | **Kept back from the first writing. From 150 s, in contradiction or later, it is written where the visitor is facing. Staying with it 2.5 s (or a touch) brings the light. Once a visit. The Director holds 16 s around it.** |
| Staging | Cinematic: a gobo spot folding at the skirting. Technical artist: no `SpotLight.map` (it recompiles every program, or costs every lit fragment all visit), no additive decal (it greys the ink and floats); a multiply quad instead. Skeptic: keep the frame's cross shadow, cut the floor fold and the leaves. | **A quad on the wall that adds light in proportion to what is there** (`dst·(1+s)`): <br>• the plaster brightens and warms (after the evaluation: about +27% red, +22% green, +16% blue in display pixels); <br>• the ink keeps its contrast, and shadows stay shadows; <br>• a kitchen sash's shadow, the transom high and the upright off centre; <br>• the edge is softer at the top, and a faint warmth spills round it; <br>• slanted for a low sun, and slides 4 cm over its time. <br>No leaves, no floor fold, no modelled window. |
| Envelope | Cinematic 3/6/4 s; technical artist 1.8/5/2.2. | **3 s in, 6 s held, 4 s out.** If the visitor looks away it carries on, since light doesn't wait (Interaction). |
| The words | Cinematic: they stay, washed out. Technical artist: through `uOpacity`, not the erosion (that would read as rubbing out). | **Washed to about 65%, then given back** (55% at first; the evaluation found the ink went grey on a phone). |
| The global "memory" grade: edge blur, warmth, lifted blacks | Cinematic: the TV-flashback cliché. Skeptic: cut it, including a global exposure shift. Technical artist: it would compete with legibility on a phone. | **Cut.** The style comes from rare moments, not an always-on effect. The room's only always-on animation stays the grain and its slow light drift. |
| Reduced motion | Cinematic: keep the light, since light isn't movement. | **The same light, no slide, 4 s rise.** Under gentle intensity, ×0.6. |

**One clock.** The Director queues one `memory` cue. `MemoryLight` evaluates its envelope against the scene's time each frame, as Lighting does for `dimToChair`. Nothing else keeps time.

## Shader enhancements
1. **The memory's light** (`src/world/MemoryLight.ts`): an analytic soft window mask with a sash's shadow, added in proportion to the linear scene before tone mapping (so it works on 8-bit targets too).
2. **The grade's dither** (`src/world/Post.ts`): a still, triangular dither of one step (interleaved gradient noise, no `sin()` hash) after the black fade. The title card, the dims and leaving have no grain to hide banding in their dark gradients.

**Pass order and colour space, reviewed:**
- Render to a linear HalfFloat target (MSAA by quality).
- OutputPass applies Neutral tone mapping and sRGB.
- The grade works in display space (luma, not luminance, which is what grain and vignette want).
- Then to screen, with no second conversion. Correct.

## Measurement
`tests/playtest/perf.mjs` (`npm run perf`) records:
- startup: navigation → enter enabled, → the score running, → the hand-off;
- long tasks;
- rAF frame intervals (p50/p95/p99, over 50 ms);
- shader programs at the threshold and later (none may compile after entering);
- draw calls and triangles across all of the composer's passes;
- textures, geometries and estimated texture memory;
- fixed-state frames.

The app's own `fps` (an average with dt clamped) isn't used. Under software GL, counts, memory and ordering are trustworthy; absolute times are not.

**Before and after** (software GL; "before" is `main` before this work, "after" the final build, `after-4`, with earlier runs where they differ):

| | Before | After |
|---|---|---|
| Ready to enter, desktop / phone | 3.42, 3.35 s / 1.60, 1.58 s | 3.14 s / 1.61 s (first build: 3.21, 3.19 / 1.66, 1.37) |
| Hand-off, phone (wall clock) | 23.5, 23.9 s | 23.8 s |
| Shader programs at the threshold → compiled later | 18 → none | **13 → none** (by key). The first build had 20; warm-up now compiles for the composer's target, not the screen. |
| Draw calls / triangles per frame, chair view | 53–54 / 32.8k | 53–54 / 32.8k (the light isn't drawn until a memory) |
| During the memory, phone frame p50 | | 133 ms (the room at the chair: 133–150 ms) |
| Textures / geometries | 28–29 / 25 | 28–29 / 25 |
| Estimated GPU memory, desktop / phone | 85 / 30 MB textures | 116 / 34 MB, now counting the composer's two HalfFloat targets (about 31 / 4 MB); textures alone unchanged |
| Main JS bundle | 1,119 KB | 1,126 KB, plus a 2 KB tune chunk loaded only with `?tune` |
| Long tasks, phone (count / worst) | 4–5 / 1.6–1.7 s | 5 / 1.8 s |
| Fixed-state frames, mean difference (run-to-run noise ≈ 2.0–2.3) | | 1.96–2.20 |

Frame times under software GL come in steps of one vsync, so 133 → 150 ms is a single step. **The dither's cost** was checked by alternating builds with and without it. The phone measured 150 then 133 ms without it, and 133 then 133 ms with it. That is noise, not cost.

**Visual continuity.** Outside the memory, before and after differ no more than two runs of the same build do (the grain). The memory plays with no shader compiled and no console errors, on desktop and phone, with and without reduced motion.

## After implementation: the evaluations

**Cinematic director** (on the first build). Right in principle, but it read as a gobo, not a memory. Fixed:
- **Too faint and neutral.** It was +15% R / +10% B, cream rather than late sun. Gain 0.32 → 0.6, warmth (1, 0.8, 0.55) → (1, 0.68, 0.36). Now +27–29% R, +22–24% G, +16–18% B in display pixels, against a target of about +28 / +18 / +6. Red is on target; it is still less amber than asked, which the artist can judge with `?tune`.
- **The transom ran along the words.** The cross read as a template. Now an asymmetric sash: the transom 8 cm above the line, the upright 15 cm off centre.
- **It was clamped above the skirting** and looked hung. Now it runs down behind the skirting, and is wider than the line.
- **A projector, not sun.** Added a faint halo round it, a lower sun (shear 0.55) and a softer top edge. The room's own light gives way 7% while it is there.
- **The ambience dip was −3 dB and left with the image.** Now the room hushes (depth 0.55) 0.8 s *before* the light, stays hushed until it has gone, then comes back over 2.5 s: the present returns after the memory.
- **The ink went grey on a phone.** Wash 0.45 → 0.35.

**Technical artist** (on the first build). Fixed:
- **Unused programs.** The boot warm-up compiled for the screen (an sRGB variant), so the memory's first frame compiled again. Warm-up now binds the composer's target: 13 programs, none later.
- **The multiply blend needed a float target.** `dst·(1+s)` works on 8-bit too.
- **Polygon offset** dropped (the quad sits 6 mm off the wall).
- **Clamped inside the wall's corners**, and never narrower than the line.
- **The dither** is now interleaved gradient noise (QA measured no structure at lags 1–32).
- **Harness gaps:** frames during the memory, the composer's buffers in memory, and too-short samples marked invalid.

**QA and accessibility** (on the first build). Fixed:
- **[P1] Looking at the line usually didn't bring the light on time.** In 16 of 30 seeds the light came about 25 s late: a voice fired just after the offer, and its recovery blocked the light.
  - Now no voice of the room's own for 15 s after the offer.
  - The line arrives alone, with a 2.4 s hold, so no reveal, music or stray line comes with it.
  - While the visitor stays with it, the room waits.
  - The light needs only no voice in the last 4 s and no light in the last 10 s.
  - Over 30 seeds it now comes at 2.6 s of gaze in every one, with nothing before or during it.
  - (Fixing this showed a second cause: four other cues started in the same tick as the offer.)
- **[P1] A touch on a phone was usually lost** (16 of 30 seeds), because of a 3 s window and the 9 s re-tap guard. The touch is now latched until the light can play.
- **[P2] A failed offer lost the memory for the visit.** `writeFailed` now resets it, and it is offered again.
- **[P2] The light could land on another copy of the line.** It now prefers the copy looked at or touched.
- **[P2] The tune panel:**
  - Enter and Space now work on its buttons.
  - The head button has a focus ring and `aria-expanded`.
  - The sliders show the room's live values, not the black boot frame.
  - It sits below the settings dialog.
  - Not fixed: Tab doesn't reach it from the room, because Tab is the room's own key (turn to the next line). It is an artist's tool for a mouse.
- **[P2] Reduced motion cut the hold short by 1 s.** It now keeps the full 6 s.
- **[P2] Tests that passed without testing the claim.** `tests/memory.test.ts` was rewritten:
  - 30 seeds, the light within 0.5 s of 2.5 s of gaze;
  - nothing before or during it;
  - the touch latch;
  - the reset after a failed write;
  - a strict offer.

  The perf harness counts programs compiled later by key, not by count.

**Regression after the fixes:**
- `tsc` clean;
- 184 tests pass;
- smoke ok and opening ok;
- the engine playtest is unchanged except at 180 s, where the offer lands: slightly fewer events, and the same longest gaps.

**Still open:**
- On a real GPU and phone: frame times, banding in the dark frames, and how strong the light reads on an OLED screen. These need a person and a device.
- The memory, like all wall writing, is not announced to screen readers. Whether it should be (a caption) is the artist's call.
- None of the five playtest personas ever stays with the line, so the playtest never plays the memory. Only the dedicated tests do.
- **@playwright/test** is still deferred until a fixed-step `?test` mode makes screenshots deterministic.
