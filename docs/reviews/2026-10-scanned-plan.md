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
