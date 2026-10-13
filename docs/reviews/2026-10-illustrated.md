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
| Grade | Grain (moving, `sin()` hash), vignette 0.32 (darkened the side walls on desktop, and the panel). | **Grain off, vignette 0.15**, still deepened by the Director's darkness. The one-step dither stays. |
| The chair | Creative director: material truth, not an outline, and contact is essential. Technical artist: high-frequency grain mips to flat, sheen makes the seat velvet. Skeptic: keep the seat's value, fix its structure. | **Oiled walnut.** Broad, uneven figure; a two-board seat with a glue line, its top worn amber; edges and turnings paler; joints darker. One slat set in not quite level. No clearcoat or sheen in any preset. MeshStandard. Foot contacts, and under the seat the panel's shade, which three can't cast from a rect-area light: seat-shaped, and doesn't drift. |
| The chair's shadow | Technical artist: the shadow frustum was 115°, so 18 mm texels on phones and a blob. | **Focused** (`shadow.focus` 0.4, 5 mm texels), blur scaled to the map so the penumbra is the same on every device. Redrawn only when the light or chair moves. |
| Presets | Plan: three tuned presets, with "Original" exactly today. Skeptic: an exact identity forces every asset change into uniforms; subtle is just halfway; the reserved memory style is speculative. | **One look between two ends** (`src/world/Style.ts`). Original is today's light and grade, subtle halfway, reference the target. Uniforms and light levels only: switching compiles nothing (tested). The asset improvements are unconditional. For an exact "before", serve `main` on a second port (`BASE` in `style.mjs`). |
| Composition | Creative director: the reference's centred, level view is half its effect (a diorama seen through its missing wall). Cinematic: centring is cheap, moving the spawn point is a pacing question. Skeptic: the spawn is already nearly centred, and exact symmetry lands on the stock "lonely chair" frame. | **Out of scope.** The spawn, eye height and the opening's framing are unchanged. Raised for the artist. |
| The opening | Cinematic: the chair-alone stage already meets the reference's best quality; the style must be a no-op there. | **The look arrives with the room**: its light balance is weighted by the room's own light level, so black and the chair alone are unchanged (tested). Rejected: a moving key aim during the room's arrival (it would announce the engine). |
| The reference itself | Skeptic: it contains this work's own lines in one generic hand, with no crayon, drawings or crumbs. Its sepia and stains may be a generator's idea of "sad room". | **Take its light and composition, not its decay.** Raised for the artist: which features of the reference are intended? |

**Guards added** (`tests/playtest/style.mjs`, `style-metrics.py`, `tests/style.test.ts`):
- per-item ink contrast, luma (Weber) and colour (ΔE, ΔC), so the warm crayon lines can't sink unnoticed;
- screen invariance: one wall patch measured centred and near a frame corner;
- the room's range: a dim's drop and the cooled pool's colour under each look;
- the opening frozen at its exact stages;
- no shader compiled by switching looks.
