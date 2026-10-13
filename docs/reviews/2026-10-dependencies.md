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
- `test-output/perf/{baseline,after}-{1,2}/`: `perf.json` and fixed-state frames.
- `test-output/review/memory/`: the memory frame by frame, reduced motion, the tune panel.

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
| Staging | Cinematic: a gobo spot folding at the skirting. Technical artist: no `SpotLight.map` (it recompiles every program, or costs every lit fragment all visit), no additive decal (it greys the ink and floats); a multiply quad instead. Skeptic: keep the frame's cross shadow, cut the floor fold and the leaves. | **A multiply-blended quad on the wall:** <br>• the plaster brightens about 26% and warms; <br>• the ink keeps its contrast, and shadows stay shadows; <br>• a soft cross of frame shadow; <br>• the edge is softer at the top; <br>• slanted for a low sun, and slides 4 cm over its time. <br>No leaves, no floor fold, no modelled window. |
| Envelope | Cinematic 3/6/4 s; technical artist 1.8/5/2.2. | **3 s in, 6 s held, 4 s out.** If the visitor looks away it carries on, since light doesn't wait (Interaction). |
| The words | Cinematic: they stay, washed out. Technical artist: through `uOpacity`, not the erosion (that would read as rubbing out). | **Washed to about 55%, then given back.** |
| The global "memory" grade: edge blur, warmth, lifted blacks | Cinematic: the TV-flashback cliché. Skeptic: cut it, including a global exposure shift. Technical artist: it would compete with legibility on a phone. | **Cut.** The style comes from rare moments, not an always-on effect. The room's only always-on animation stays the grain and its slow light drift. |
| Reduced motion | Cinematic: keep the light, since light isn't movement. | **The same light, no slide, 4 s rise.** Under gentle intensity, ×0.6. |

**One clock.** The Director queues one `memory` cue. `MemoryLight` evaluates its envelope against the scene's time each frame, as Lighting does for `dimToChair`. Nothing else keeps time.

## Shader enhancements
1. **The memory's light** (`src/world/MemoryLight.ts`): an analytic soft window mask with a frame cross, multiplied into the linear scene before tone mapping.
2. **The grade's dither** (`src/world/Post.ts`): a still, triangular half-step dither after the black fade. The title card, the dims and leaving have no grain to hide banding in their dark gradients.

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

**Before and after** (software GL, two runs each):

| | Before | After |
|---|---|---|
| Ready to enter, desktop / phone | 3.4, 3.35 s / 1.60, 1.58 s | 3.21, 3.19 s / 1.66, 1.37 s |
| Hand-off, phone | 23.5–23.9 s | 23.8, 23.8 s |
| Programs at the threshold → later | 18 → 18 | 20 → 20 (the memory's light, warmed at boot) |
| Draw calls / triangles per frame | 55–56 / 32.8k | 55–56 / 32.8k (the light isn't drawn until a memory) |
| Textures / geometries | 34–35 / 25 | 34–35 / 26 |
| Estimated texture memory, desktop / phone | 86 MB / 30 MB | 86 MB / 30 MB |
| Main JS bundle | 1,119 KB | 1,126 KB, plus a 2 KB tune chunk loaded only with `?tune` |
| Fixed-state frames, mean difference (run-to-run noise ≈ 2.0–2.3) | | 1.96–2.20 |

**Visual continuity.** Outside the memory, before and after differ no more than two runs of the same build do (the grain). The memory itself plays with no shader compiled and no console errors, on desktop and phone, with and without reduced motion.

## After implementation
(See the evaluation below.)
