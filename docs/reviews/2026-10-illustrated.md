# Review: the room toward the artist's reference image (October 2026)

**The brief.** The artist supplied a reference frame and asked for "Soft Illustrated Reality". It describes:
- a cream plaster room whose corners and ceiling fall away;
- a warm pool of light holding the small wooden chair;
- graphite writing;
- a restrained painterly quality, "a frame from a psychologically introspective animated film".

The brief also listed techniques:
- painterly shading;
- restrained contours;
- material-level texture;
- a muted grade;
- presets Original / Subtle / Reference Target, with sliders.

It asked for the result to stay real-time, mobile-first and faithful to the opening, and for the reference not to be used as an image.

**Reviewers.**
- `technical-artist`, `creative-director` and `cinematic-director` reviewed the plan against the reference and today's renders, with measurements and live probes.
- The `skeptic` challenged all three. The artist's own instruction to the skeptic was to name what would only make the image look *filtered*.
- `qa-accessibility` and the artistic reviewers evaluate the build (see the end).

**Evidence:**
- `test-output/review/style/` holds:
  - `reference.png`;
  - `before/`;
  - each capture run: contact sheet `index.html`, `style.json` and `metrics.json`.
- `test-output/review/style/technical-artist/` and `test-output/review/cine/` hold the reviewers' probes.

## What the reviews found

**The plan's diagnosis was backwards.** All four reviewers measured it the same way (sRGB luma, same framing):

| place | reference | before |
|---|---|---|
| back wall centre | 164–176 | 135–144 |
| side walls | 121–145 | 98–108 |
| floor pool | 208–229 | 210–220 |

The floor already matched. The wall the writing lives on was too *dark*, and too grey (R/B 1.12 against 1.23). The plan's main lever, "lower fill relative to key", would have darkened it further: probes took the wall from 139 to 124–128. The reference's lesson is the opposite: the wall you read is the brightest vertical surface.

## Decisions

| Question | Positions | Decision |
|---|---|---|
| How to form the pool and brighten the wall | Technical artist: an in-shader world-space wash, applied to ink too. Cinematic: rebalance the lights (less hemisphere, more panel, panel brighter). Skeptic: measured both. The wash didn't brighten the wall, only darkened corners; the rebalance matched wall and seat. | **Rebalance the lights. No shader wash.** Every Director behaviour (dims, warmth, intensity) multiplies the same lights, so it survives for free. |
| Where warmth lives | Technical artist and cinematic: a cream albedo, a highlight tint, a small split. Creative director: plaster stays white, warmth from the light. Skeptic: any warmth fixed after lighting dulls the Director's cooling as the visitor comes close (the dilemma's "hurt"). | **In the light's colour only.** The cream fades as the Director cools the light, so a fully cooled room is exactly as cool as before (tested). Ceiling bounce and panel glass are warmed too. No grade tint, lift, shoulder or split. |
| Contours | Brief: restrained contours on the chair and architectural edges. Technical artist: an in-material rim (0.5) plus screen-constant edge lines (0.3); the inverted hull aliases on phones, thickens 6 mm stretchers and costs a draw. Creative director and skeptic: the reference chair has no outline, and a line makes it look pasted in. Screen-constant lines stay 1 px when kneeling (the toon tell); the existing seams already draw a 1-px line. | **Contour as tone, not line.** The hard 1-px seams at skirting and ceiling become soft 3–4 cm shadows. The chair's edges are shaped by wear (paler arrises, darker joints). No hull, no rim, no drawn lines. If the artist still wants a line after seeing this, a rim of ≤ 0.3 faded in only within about 1.2 m of the chair is the fallback. |
| Painterly shading (tonal simplification) | All four: value grouping bands the smooth pool and wall gradients on 8-bit phones, and the ink would be tone-mapped differently from its wall. | **Not built.** The softness comes from the light's hierarchy and soft seams. Higher stylisation is kept for memory windows, if they come. |
| Surface texture: the reference's damp drips and stains | Technical artist: drips near corners, packed in the bump map. Creative director: a drip is made by nobody; it brings a building's decay, a derelict or horror reading, and breaks "one writer". Skeptic: the room's authored history is already there but drawn so faint no render shows it. | **No drips.** The room's own marks are raised to be found from a metre or two: erased lines, tape, height ticks, the tally, a scribbled-out word. The erased "I'm sorry" stays a ghost. Graphite dust above the skirting under the busiest writing. The plaster's relief is a little stronger. |
| Grade | Grain (moving, `sin()` hash), vignette 0.32 (darkened the side walls on desktop, and the panel). | **Grain off, vignette 0.1** (at 0.15 the same wall patch still read 6 luma darker near a frame corner; at 0.1, 4), still deepened by the Director's darkness. The one-step dither stays. |
| The chair | Creative director: material truth, not an outline, and contact is essential. Technical artist: high-frequency grain mips to flat, sheen makes the seat velvet. Skeptic: keep the seat's value, fix its structure. | **Oiled walnut.** Broad, uneven figure; a two-board seat with a glue line, its top worn amber; edges and turnings paler; joints darker. One slat set in not quite level. No clearcoat or sheen in any preset. MeshStandard. Foot contacts, and under the seat the panel's shade, which three can't cast from a rect-area light: seat-shaped, and doesn't drift. |
| The chair's shadow | Technical artist: the shadow frustum was 115°, so 18 mm texels on phones and a blob. | **Focused** (`shadow.focus` 0.4, 5 mm texels), blur scaled to the map so the penumbra is the same on every device. Redrawn only when the light or chair moves. |
| Presets | Plan: three tuned presets, with "Original" exactly today. Skeptic: an exact identity forces every asset change into uniforms; subtle is just halfway; the reserved memory style is speculative. | **One look between two ends** (`src/world/Style.ts`). Original is the old light and grade (its ceiling bounce re-set for the new ceiling map, so not identical), subtle halfway, reference the target. Uniforms and light levels only: switching compiles nothing (tested). The asset improvements are unconditional. For an exact "before", serve `main` on a second port (`BASE` in `style.mjs`). |
| Composition | Creative director: the reference's centred, level view is half its effect (a diorama seen through its missing wall). Cinematic: centring is cheap, moving the spawn point is a pacing question. Skeptic: the spawn is already nearly centred, and exact symmetry lands on the stock "lonely chair" frame. | **Out of scope.** The spawn, eye height and the opening's framing are unchanged. Raised for the artist. |
| The opening | Cinematic: the chair-alone stage already meets the reference's best quality; the style must be a no-op there. | **The look arrives with the room**: its light balance is weighted by the room's own light level, so black and the chair alone are unchanged (tested). Rejected: a moving key aim during the room's arrival (it would announce the engine). |
| The reference itself | Skeptic: it contains this work's own lines in one generic hand, with no crayon, drawings or crumbs. Its sepia and stains may be a generator's idea of "sad room". | **Take its light and composition, not its decay.** Raised for the artist: which features of the reference are intended? |

**Guards added** (`tests/playtest/style.mjs`, `style-metrics.py`, `tests/style.test.ts`):
- per-item ink contrast, luma (Weber) and colour (ΔE, ΔC), so the warm crayon lines can't sink unnoticed;
- screen invariance: one wall patch measured centred and near a frame corner;
- the room's range: a dim's drop and the cooled pool's colour under each look;
- the opening frozen at its exact stages;
- no shader compiled by switching looks.

## After implementation: the evaluations

QA, the creative director, the technical artist and the cinematic director evaluated the first build (build1). Their findings were fixed in 32e47ca and c94d450, and checked again in later captures (build2, final).

**QA and accessibility.**
- **[P0] The chair's shadow map was drawn once at warm-up and never again.** The redraw-on-change signature started as `NaN`, and `NaN` never compares as changed. So turns, nudges, drift and the opening's cone all left a stale shadow, with the chair turned out of it.
  - Fixed with per-field tolerances: 3 mm, 0.003 rad.
  - A unit test now fails on the old code.
  - In the browser the shadow follows the opening, nudges, turns, drift, quality changes, and leaving and returning.
- **[P1] After a WebGL context loss and restore the shadow stayed empty** until something moved. It is now redrawn on `webglcontextrestored` and on quality changes, through `Lighting.invalidateShadow()`.
- **[P2] The tune panel:**
  - the ceiling slider's range was below the looks' values;
  - slider names repeated across groups (now fieldsets);
  - the preset buttons didn't say which was pressed (now `aria-pressed`);
  - a key of 0 made the contact NaN.
- **[P2] `perf.mjs` compared one arbitrary frame.** It now reports a still frame and a shadow-redraw frame from a fixed pose.
- **Passed:**
  - programs compiled at the threshold, none later, none by switching looks or moving any slider;
  - smoke and opening (hand-off 23.4 s);
  - no errors;
  - reduced motion;
  - legibility per hand on a phone: no item down more than 15% in Weber. The crayon "crumbs" line is 0.236 → 0.231, with ΔE unchanged.

**Creative director.**
- **Verdict.** The room now has the reference's hierarchy without looking filtered. It still reads as this room: the toy-scale chair, the crayon "crumbs", the noughts and crosses, the tally, the height ticks.
- **Fixed:**
  - **The flat grey ceiling**, the most generic "office" element left. It now has a bounce map strongest round the panel, and the panel's rim is lit.
  - **The erased "I'm sorry" sat in the brightest spot of the brightest wall,** straight behind the chair, legible as the room arrived and before the first stroke. It moved off to the side; behind the chair now only "you" is rubbed out.
  - **Too many confessions among the erasures.** The west wall's became a shopping list.
  - **The chair's frame was too dark** (legs at luma 31 against the reference's 50). The hand that made it disappeared, so the frame was lightened.
  - **Faint writing lost contrast on the brighter wall.** It is strengthened 1.2× with the room's light.
  - **The dim was shallower** (see the cinematic director's finding).
  - **The graphite dust read as grime.** It is now warm and fainter.
- **Kept, on their advice:**
  - The cooling swing is now larger than before: pool R/B falls 0.13, against 0.07.
  - The plaster stays clean: a white card, not the reference's stains.

**Technical artist.**
- **The P0 shadow above** (found independently).
- **Fixed:**
  - **A pine seat on near-black legs.** The palette is lighter and less saturated, and the seat quieter.
  - **The finials sampled the seat's part of the texture** and glowed as two orange beads. Their UVs are remapped.
  - The seam gradient's darkest row left a 2-px line at the ceiling. Softer stops.
  - The contact drawn before floor writing. It now draws after, in a near-neutral colour.
  - `ctx.filter` blur may not exist on iOS. The contacts and dust are now baked per pixel.
  - Per-frame allocations in `Lighting.update` removed.
- **Checked:**
  - no banding (HalfFloat target plus the dither);
  - seams don't sort against writing;
  - cost: +2 draws (the contacts and the seat shade) and +3 programs; the shadow pass is now skipped on still frames.
  - The shadow is a legless slab because the key is almost overhead, not because of blur. Leg shadows like the reference's would need a different key position: the cinematic director's call, not taken here.

**Cinematic director.**
- **Verdict.** The lit room has the reference's light structure:
  - the back wall's profile is within ±10 luma of the reference at every sample;
  - the main phrase reads harder ("stay" Weber 0.538 → 0.544, phone 0.393 → 0.431);
  - the first stroke reads much harder (0.139 → 0.232).
- **Fixed:**
  - **The chair-alone image had gone sepia**, with the same brightness but cream light. The look's warmth and balance now come and go with the room's own light: the opening's level × the Director's dim. The first image is white light on a dark room again, and the colour arc runs white → cream as the room arrives → cool when the visitor comes close.
  - **The dim's lowest point no longer matched the chair alone.** It left a mid-grey wall and a brown smudge above the chair. The look's balance and exposure now recede with the dim.
  - **The panel's glass and the ceiling stayed warm when the light cooled.** They now follow the light.
  - **The room's arrival had become an accelerating ramp.** It keeps the opening's curve again.
  - **Harness:** the opening captures were late on desktop; the cooled state was unsettled; the dim was tested at 0.35 instead of the Director's 0.15. Fixed: a virtual clock, settled values, the real depth.
- **Advised against, and not done:**
  - adding vignette to darken the floor's front corners;
  - pushing warmth past the light toward the reference's sepia.

## Round 2: the artist's comparisons

**"It still doesn't completely look like the reference image."** Side by side, the remaining gaps were:
- **Framing:** the reference looks from low, centred and closer.
- **Walls:** visible plaster texture and grime.
- **Floor:** a pool of light on grey concrete.
- **The chair's shape.**

The reviewers had left the grime and the framing out, so the artist was asked. They chose:
- **Walls:** "Texture, no stains": much more visible plaster and graphite smudges, no streaks or water stains.
- **Viewpoint:** "Opening only": the opening framed like the reference, rising to standing height when the visitor walks.
- **Chair:** "Like the reference": a square-legged ladder-back, still small.

**"The lighting and detail is also better in the reference."** Added:
- **The skylight's glow**, so the wall behind the chair is lit from its top centre and the ceiling round the opening. It is an unshadowed light a metre under the glass, part of the look, and it comes and goes with the room's own light.
- **A gentle luminance S-curve** in the grade.
- **Fine surface detail:** specks, pits and hairline scratches in the plaster and concrete, and a glossier floor by the chair.

### What was built
- **The opening:** eye 1.1 m (a child's eye height), centred, 2.45 m back; landscape is 6° wider.
  - A deliberate first step stands the visitor up: a third of a second of walking, or 15 cm, or being walked toward something.
  - The rise is one eased movement over 2.8 s, the view narrowing with it. Looking around doesn't trigger it.
  - Under reduced motion, after leaving and returning, or when reduced motion is turned on, the visitor is standing.
  - A desktop visitor still seated 25 s after the hand-off is told once that they can walk.
- **The chair:** square tapered legs eased at the arrises, raked posts (one 12 mm short), a top rail and two slats (one 0.055 rad off level), square stretchers, a two-board seat (55/45).
- **The walls:** plaster tooth a few centimetres across, and gentle broad mottling. The large dark clouds of a first try read as damp, and its large pits as spots; both were removed. Fine specks, pits and scratches. Graphite drags and thumbs under the lines present at the start. A crisp lit top edge.
- **The floor:** sealed concrete darker than the walls, with a soft sheen by the chair. It is greyer and duller away from the chair, in neutral grey (brown read as dirt).
- **Light:**
  - the skylight's glow;
  - the key's cone at 0.65;
  - the ceiling bounce at 6;
  - the reveal of the skylight a hard bevelled ring (a feathered halo read as bloom);
  - contrast 0.35.

### Evaluations of this round
- **Creative director.** The composition now matches the reference: the chair's centre, height and the floor line within 2–3%. What separated them was surface and tone, and was fixed:
  - the wall texture's scale;
  - the floor's tonal structure;
  - the wall's top edge;
  - the chair's split values;
  - the skylight as a fitting.

  Deliberately left:
  - the room's proportion (the reference's room is taller or narrower; re-laying every wall's writing for it isn't worth it);
  - the writing's content, the crayon, stains and sepia, and the chair's shadow without legs.

  The low view gave the opening a meaning worth keeping: the diorama as the child who made it saw it. The first step stands the visitor up into an adult, and the chair becomes too small.
- **Interaction designer:**
  - **The phone's spawn sat just inside the Director's hard 2.4 m "far" edge,** so a still phone visitor lost most of the solitude arc (solitude 0.16 against 0.70 at 300 s). Being apart now counts in proportion from 1.7 to 2.3 m, and the air writing answers someone who never came near from 2.1 m. This is tested at both spawns, and the personas now start where the opening leaves the visitor.
  - **A key tap or a thumb's drift stood the visitor up,** and the rise lurched. Fixed as above.
- **QA:**
  - **The first line lost its "I" on narrow phones.** The portrait opening is now as far back as the landscape one and turned 0.07 rad.
  - **Turning reduced motion on didn't stop the rise.** It stands the visitor now.
  - **The harnesses took their fixed views from the seated height.** They now stand the rig first.
  - **Captions on desktop lay over the chair's feet.** Landscape captions now sit lower.
  - **Smaller items:** the wider view on rotation, the click area, and the ring's corner creases.
  - Programs: 16, none later. Draw calls: 33 still, 49 when the shadow redraws. The new chair is 5k triangles (the old one 27k).

## Round 3: "it should really look exactly like the reference"

The artist was asked about every feature the reviewers had left out. They chose:
- **Stains:** "Yes, like the reference": streaks and old damp, mostly on the side walls, as a look value (`stains`, 0–1) laid over the walls, so it can be turned down without baking again. This reverses the round-1 decision against drips: the artist's choice.
- **Writing:** "Keep the authored opening". The reference's phrases illustrate composition, not text to copy, so "I wanted you to" stays unfinished and the crumbs stay.
- **Room:** "Yes, taller room": 3.6 m (was 3.1). The lights are compensated for the reach (`REACH = (height / 3.1)²`), so the original look is still the old light.
- **Chair:** "Enlarge the chair". At 72 cm it was 37% of the back wall's height on screen; the reference's is 56%. No camera position gives the reference's composition with a chair that small. It is scaled 1.28 (`CHAIR_SCALE`): seat about 44 cm, posts about 92 cm. The hit area, contacts and seat shade scale with it; the chair's glow is raised to 0.7 m.

The opening was re-framed for it: eye 1.4 m, 2.85 m back, pitch −0.03, landscape 10° wider. Measured against the reference: chair centre at 69–71% of the frame height (reference 69%), chair height 25% (26%), the skylight whole at the top, the horizon at about 48% (44%).

**"In the reference the lighting is still better and the walls and floor look a little more cinematic, less beat up."** Side by side, the walls had become a building's decay: 22 hard streaks per side wall, dark damp clouds, specks and pits everywhere, and a floor of dense speckle. The reference's surfaces are soft: a few faint, wide runs, a gentle mottle, nothing sharp. Its light is warmer (back wall R/B 1.23, against our 1.18), its pool brighter than its wall (pool/wall 1.30, against 1.17), its chair's shadow soft, and the skylight's halo small.
- **Walls:** streaks 9 / 5 / 4 per wall (side / south / north, was 22 / 10 / 7), wider (2.5–7 cm) and far fainter (alpha 0.05–0.12, was 0.18–0.4); old damp at less than half; corner and foot grime halved and spread. The plaster's tooth is half as strong; smudges 3 per wall (was 8); specks, pits and scratches cut by about 70%.
- **Floor:** a softer concrete mottle; specks 20, pits 3, scratches 0.5 per m² (was 45 / 12 / 2).
- **Light** (the reference look; measured with the probe at the hand-off pose, sweeping candidates):
  - the cream deeper (`#ffedd4`, was `#fff1de`), which brings the back wall's R/B to the reference's;
  - the key stronger (1.8, was 1.1), its cone wider (0.75, was 0.65) and the panel's area light lower (1.85, was 2.2), so the pool outshines the wall as in the reference;
  - the chair's shadow softer (2.4, was 1);
  - the skylight's glow smaller (1.4, was 2.5), so the opening is a fitting, not a halo;
  - contrast 0.25 (was 0.35) and vignette 0.2 (was 0.1).

### The creative director's evaluation, and what changed from it
The cleaned room matched the reference's wall, warmth and corners within a few percent, but the director measured what still separated them:
- **The floor was floodlit to the camera** (front/pool 0.93 against the reference's 0.63). Widening the cone had made it worse. In the reference the chair is held by the light and the visitor stands just outside it, in the dim.
- **Too little bounce:** side walls at 0.67–0.72 of the back wall (reference 0.78), the chair's shadow core at 0.45 of the pool (0.57), and a brown skirting stripe where the reference has a light grey board.
- **The tone curve crushed the darks** (1st percentile 53, reference 68) and stopped short of the highlights.
- **The back wall had dark bands** under the ceiling and along the foot, where the reference's is one even sheet.
- **The surfaces were now cleaner than the reference** (fine texture about half), so they read as CG, and the side-wall stains the artist chose had all but gone. The beat-up look had come from how many streaks there were and how evenly they covered the walls, not from how dark each one was.

What was changed:
- **The key** is narrower again (cone 0.68) and aimed 0.35 m behind the chair (a new look value, `aim`), so the pool spreads toward the wall behind, as in the reference. The floor's own darkening toward the visitor starts closer to the chair and goes deeper (0.5), and its corners are darker.
- **Bounce:** fill 0.85 (was 0.6), a light grey skirting (`0xb8b3aa`).
- **Grade:** contrast 0.15, exposure 1.15, and vignette 0.3 to keep the frame's corners falling away. A faint moving grain (0.015) that reads as film, not decay.
- **The back wall:** a lighter foot (corner shading and grime halved on that wall only). The skylight's glow is a little lower and nearer the wall (1.2); a first try put it closer to the ceiling and brought the halo back.
- **Surfaces:** the plaster's tooth back to three-quarters, floor specks 30.
- **Stains:** four distinct runs per side wall, gathered near each end with clean wall between (alpha 0.14–0.22, 1.5–3.5 cm wide, 0.9–2.2 m long); two faint ones on the others.
- **The chair's wood** about 6% darker and a little less saturated, nearer old wood than new pine.

Measured at the hand-off pose with the key still at 1.8 (probe; reference in brackets): back wall about 180 (177), side wall 138 (139), pool 228 (229), frame median 129 (131), 1st percentile 71 (68), floor bottom-centre 203 (198), all at R/B 1.22 (1.23). The key then came down (below).

Not done: the skylight's reveal as a sharp-cornered opening rather than a fitting (P2). The director's own caveat stands too: the reference is one rendered image, and the artist should judge the stains and the grain moving at full frame rate.

### QA's findings, and the key brought back down
QA tested the first pass (6e4bb3d) on its own build and on 1806b3c for comparison. It broke nothing:
- Smoke passes with no console errors or failed requests; the opening passes when run alone.
- No shader programs are compiled after the threshold. Draw calls, triangles and texture memory are identical, and phone frame times did not regress (the shadow's blur takes a fixed 20 samples however soft it is).
- On phones the first line starts at least 40 px inside the left edge, and captions never overlapped the chair.

The one real regression was **the pencil on the floor by the chair**. "It used to fit me" and "Budge up" had all but gone: Weber contrast 0.124 → 0.036 and 0.059 → 0.023, with nearly all of the loss from the stronger key. The style metrics could not see it, because they skip floor writing.

The cause is the tone curve, not the ink. With the key at 1.8 the pool sits deep in the tone mapper's shoulder: raising the key from 1.3 to 1.8 moved the pool's luma only from 228 to 230, while it compressed everything in the pool, pencil included. Raising the floor writing's opacity alone did not bring it back. The key was the wrong lever for the pool's brightness.
- **Key 1.1** (was 1.8), glow 0.6, and the panel's area light **1.45**, so the wall comes down with it. Pool 222 against the wall's 180, a ratio of 1.23 (reference 1.30); the pencil reads again at the chair.
- **Floor writing** gets more of the look's faint boost than wall writing (`faint`², capped at 0.8): the pool is the brightest surface in the room. The original look is unchanged.
- The floor's ink was not added to the style harness. A text quad's box takes in the chair's shadow, so its darkest pixels are the shadow, not the pencil, and the number would guard nothing. It is checked in the chair view by eye, against the original look.

Also from QA, all P2:
- **Invariance 8.0 is the vignette** (0.1 with the vignette off). The figure measures the grade, not the light; the harness should take those two frames with the vignette at 0.
- **The dim is not shallower.** r9 and r10 were already at 0.721, and the pool now holds through the dim more firmly than before.
- **The opening harness can fail under load**, when its 11 s screenshot stalls the sampler during the first line (it passes alone). It should move to the virtual clock that `style.mjs` uses.
- **The faint wall drawings lost some contrast against r10** (desktop median 0.109 → 0.086). The lower key and lifted darks should give some of it back; the r13 capture re-measures it.

### Final capture (r13, the build at 1d16546)
`test-output/review/style/r13/compare.png`: the reference beside the desktop and phone hand-off frames.
- **Against the reference** (desktop, reference-framed view; reference in brackets): pool/wall 1.23 (1.30), wall R/B 1.20 (1.23), chair shadow/pool 0.58 (0.68), the back wall's top corners 0.62 of its centre (0.49).
- **Guards:**
  - no programs compiled by switching looks, 16 at the threshold, no errors;
  - the dim takes 72% of the back wall (the original 73%), and the pool holds through it (pool/wall 4.1);
  - a cooled pool is no warmer than the original's (R/B 1.047 against 1.056);
  - crumbs ΔE 20.1 (the original 19.2);
  - ink median Weber 0.076 desktop and 0.153 phone (original 0.070 and 0.097);
  - the floor's pencil by the chair reads in the reference look as in the original (`r13/chair-orig-vs-ref.png`).
- **Harnesses:** smoke and the opening pass on the final build. The invariance pair in this run still had the vignette on, because the capture had loaded before the harness changed (13.0 at vignette 0.3, against the original's 12.5 at 0.32). The phone context-loss pair is over the stale threshold in the original look only (3.45). It was 3.33 before this round, and it does not come from grain alone: it predates this work and is left for its own look.
- **Left for the artist:**
  - whether the side walls' runs read "like the reference" or as beaten up;
  - whether the grain reads as film at full frame rate;
  - the skylight's reveal, still a fitting rather than a sharp-cornered opening (P2).
