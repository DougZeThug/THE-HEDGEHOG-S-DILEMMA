# Proposal: scanned materials and render detail, toward the reference (October 2026)

**The artist's note after PR #7:** "the lighting and texture is still not as cinematic, those should look exactly the same, the reference is especially professional looking."
**The artist's choice:** "Scanned materials". Real CC0 scans of plaster, concrete and wood replace the code-painted surface detail, alongside geometry and shading upgrades. This needs about 2–4 MB of downloads, with smaller versions on phones.

## What separates the frames now
The tones already match within a few levels (`docs/reviews/2026-10-illustrated.md`, round 3). Close crops of the reference against `test-output/review/style/r13/desktop-reference-open-handoff.png` (`test-output/review/scanned/crops.png`: reference left, ours right; skylight, corner, chair, floor–wall) show what's left: rendering and detail, not light levels.
1. **Surfaces.** The reference has crisp, photographic micro-detail that responds to light: plaster pores, hairline cracks, scuffs, and a concrete floor with soft mottling and a sheen. Ours is smooth and soft, and flat to the light (only a faint bump).
2. **Geometry.**
   - The reference's skylight is a recessed opening with lit inner faces and sharp corners; ours is a flat ring texture with rounded corners.
   - Its skirting is a real board with a lit top edge and a shadow line; ours is a flat strip.
   - Its chair has chunkier members, finials, worn arrises, and strong form shading.
3. **Reflection.** The reference floor carries a soft, broad reflection of the light: polished concrete. Ours is matte.
4. **Edges and occlusion.** The reference's corners and wall–floor junctions are crisp with tight occlusion; ours are soft gradients.

## Proposed approach
**A. Scanned detail, our tones.** Use Poly Haven CC0 scans:
- walls: `white_plaster_02`;
- floor: `plastered_wall_04` or `smooth_concrete_floor`;
- chair: `wood_table_worn`.

For each, take the colour map's luminance as detail only: high-passed, normalised to mean 1, with its contrast set per surface. Multiply it into the existing canvas bake, so the tone, warmth and the room's authored marks (erasures, tape, tallies, stains, smudges, dust) are unchanged and measured as before. Use the scan's normal map (`nor_gl`) as `normalMap` and its roughness as `roughnessMap`. These tile independently (each texture has its own `repeat`): plaster at about a 1.5 m repeat, broken up by the existing low-frequency mottle in the bake. Keep the bake's `bumpMap` for the authored relief (erasures press into the plaster). Sizes:
- desktop (medium/high): 2K diffuse-detail, normal and roughness, as JPG, about 1.5 MB per material;
- low quality (phones): 1K.

The files are committed to `public/textures/`, with CC0 credits in the README.

**B. Geometry.**
- **Skylight well:** a real recessed box, about 0.25 m deep, with four inner faces lit by the panel and sharp corners. This replaces the ring texture.
- **Skirting:** a profiled board, 0.1 m high and 1.5 cm proud, with a bevelled top that catches the light, and a thin occlusion line where it meets the floor.
- **Chair:** finials on the back posts, chamfered arrises, slightly thicker members, as in the reference. Scanned wood detail and normals on top of the existing wood maps. Edge wear stays.

**C. Light and render.**
- **Floor reflection:** a small PMREM environment of the room itself (the bright panel, the walls in their tone), generated once, as `envMap` on the floor only. Intensity on a look value, and scaled by the room's light, so the dims and the cooling still read. Roughness from the scan, polished near the chair.
- **Tone mapping:** compare Neutral (now), AgX and ACES Filmic for highlight roll-off. Keep whichever matches the reference's pool and skylight without hue shifts in the cooling.
- **Occlusion:** tighter baked occlusion at the corners and at the wall–floor and wall–ceiling junctions in the bakes; the chair keeps its contacts. No screen-space AO on phones; GTAO is optional on high quality only, if the reviewers think it pays.
- **Skylight bloom:** a restrained glow only if the reference needs it (it shows a slight one at the opening's edge).

**D. Constraints that hold.**
- Original and subtle stay selectable.
- No shader compiles when switching looks: new maps are always bound, and looks change only uniforms.
- The Director's dims and cooling keep their range.
- Writing contrast (Weber and ΔE) is no worse.
- Mobile frame time is no worse than today on low quality.
- The authored opening is unchanged.
- The reference is never used as a texture.

## Questions for the reviewers
1. Does detail transfer (the scan's luminance as detail, our tones kept) match the reference better than using the scan's albedo directly?
2. Which candidates best match the reference's plaster, floor and wood? See `test-output/review/scanned/sheet.png`.
3. Is an environment map on the floor worth its cost, or does a cheaper sheen do?
4. Is a tone-mapping change worth the re-measure?
5. What is missing from this list that would make the frame read "professional"?

## Reviews and decision

The technical artist, the cinematic director and the skeptic reviewed the plan above.

**What they found:**
- **The technical artist:** a bound normal map silently disables the bump map that carries the authored relief, and the floor's roughness slot is already used by its authored polish. 2K maps download 25 MB and buy nothing; detail transfer is right for colour. They recommended `concrete_floor_worn_001` for the floor, fine-grained wood for the chair's members and worn table wood for its seat. A PMREM environment adds diffuse light and can't follow the cooling. The skylight's well can't be lit by the area light.
- **The cinematic director:** the mid-tones match; what's missing is the extremes and the edges.
  - The skylight isn't a source: 225 against 241, and its halo reads as an LED fitting.
  - The chair has no fill.
  - The edges are fog, not lines.
  - The vignette does the lighting's job.
  - The PMREM's mirror point is out of frame.
  - Keep Neutral tone mapping.
  - The ceiling needs plaster detail too.
- **The skeptic:**
  - The crops compared different pixel densities (the reference has 1.5× ours). At the same scale our wall detail is within about 15% of the reference; the floor is the real gap (1.3–1.5×).
  - The reference's professional edges are 1–2 px dark lines, which round 1 removed on purpose.
  - Lowering the floor's roughness has the same flaw as the PMREM: it would re-light the front floor round 3 darkened, and glare would sit under the floor pencil.
  - The chair's median already matches the reference once the mask is right; a "bounce card" light would duplicate the existing `glow`, add a cooling leak and flatten the chair.
  - Scan detail at the handwriting's scale can mask it, and the guards can't see that.
  - Phones gain little from wall and floor scans.

**Decided** (the main session, reconciling):
1. **Edges:** seams narrowed to a 1 cm core fading by 3 cm, with vertical corner seams added, and a contact seam where the skirting meets the floor. The skirting stays a box, made 1.5 cm proud so its top catches the light. This reverses round 1's "contour as tone": the artist's standard is the reference.
2. **Skylight:**
   - square corners;
   - a real recess built from 4 MeshBasic faces, the far face brighter, all coloured through `panelFor × panelLit`, so the dims and the cooling reach it;
   - the panel brighter (a `panel` look value), its brightest pixels at 240 or more;
   - the ceiling's glow reshaped from a rim halo into a broad bounce toward the back wall;
   - a test that the panel and the well follow a dim and a full cooling.
3. **Vignette:** centred lower and sparing the highlights. The Director's darkness path is unchanged.
4. **Chair:** members about 20% thicker, the back posts extended into capped tops, the seat overhanging, and darker joints and undersides. **No new light** (skeptic): the existing `glow` is the fill.
5. **Floor:** roughness stays at 0.7 or more, with gloss only in the authored polish near the chair (skeptic, against the technical artist and cinematic director). The floor's extra detail goes into the 10–60 cm mottle and the scan's fine band.
6. **Scans** (the artist's choice):
   - Walls, ceiling and floor take the scan's high-passed luminance folded into their existing colour and relief bakes. No new samplers, no shader patch, and the authored relief is kept.
   - The amplitudes are set from measurements at matched pixel density: walls about 1.2× the measured gap, the floor more.
   - The chair takes the two woods into its atlas, plus a tiled normal map (512 px on phones).
   - Maps: `scripts/scan-detail.py`, 1.5 MB in all; the detail maps are sized to the bakes.
7. **Guards added:** ink contrast-to-noise (Weber ÷ local background std) in `style-metrics.py`; front-floor/pool ratio; the panel and well following the dim and cooling.
8. **Cut:** PMREM, the bounce light, the glossier floor, the profiled extruded skirting, lathe finials, plank groove and chamfers, the tone-mapping change, KTX2, GTAO, bloom, DOF and haze.
