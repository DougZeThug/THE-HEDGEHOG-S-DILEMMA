import { describe, it, expect } from 'vitest';
import { livingMaterials } from '../src/world/living/materials';

// Source-level regression guard for the sun-fleck sign fix in
// `src/world/living/materials.ts`. The fleck sampler must displace its pattern
// the same way the plate warp displaces the leaves (and the same way `leafLight`
// displaces its noise, and the same way the two-shot's two grass warps displace
// their content). A reversion of the fleck sampler to `uv - fs ...` (pattern
// displaced +fs, opposite the leaves' -d) must fail this test
// (`docs/reviews/2026-10-woodland.md`: "the flecks' brightness pattern, shifted
// with the leaves"). The shader's own comment at the fleck block says so too:
// "The painted sun flecks move as the leaves above them move (a moment behind
// them, a few pixels at most)".

describe('the plate shader follows the leaves one way (sign guard for the fleck fix)', () => {
  const frag = livingMaterials(new (class T {})() as never).plate.fragmentShader;

  it('the fleck sampler uses `uv + fs` (pattern displaced -fs, same direction as the leaves)', () => {
    expect(frag).toMatch(/float f1 = texture2D\(uMaps, uv \+ fs \* uPx \* uMotion\)\.a;/);
    // The bug pattern must be gone.
    expect(frag).not.toMatch(/texture2D\(uMaps, uv - fs \* uPx \* uMotion\)/);
  });

  it('the plate warp samples at `uv + d` (content displaced -d)', () => {
    expect(frag).toMatch(/vec2 at = uv \+ d \* uPx;/);
  });

  it('leafLight samples its noise at `... + o` (content displaced -o, same as the leaves)', () => {
    expect(frag).toMatch(/texture2D\(uNoise, uv \* vec2\(1\.1, 0\.8\) \+ o\)\.r/);
  });

  it('the two-shot ground grass warp adds +dx to its sample coordinate (content -dx)', () => {
    expect(frag).toMatch(/uv \+= vec2\(dx, -0\.25 \* abs\(dx\)\) \* uPx;/);
  });

  it('the bed grass warp adds +dx to uvF (content -dx)', () => {
    expect(frag).toMatch(/uvF \+= vec2\(dx, -0\.25 \* abs\(dx\)\) \/ uSheet;/);
  });

  it('all four sample-offset displacers share the same sampling sense (no lone minus stands against them)', () => {
    // The four "follows the leaves" sample-offset displacers in the plate shader:
    // plate warp (+d), fleck sampler (+fs), two-shot ground grass (+dx), bed grass (+dx),
    // and `leafLight`'s noise sampler (+o). All must read at `+ offset`; none may read at
    // `- offset` against the others. Counting the minuses on these specific displacers
    // gives a single, isolated diagnostic: any minus on the fleck is the regression.
    const displacers = [
      /vec2 at = uv \+ d \* uPx;/,
      /float f1 = texture2D\(uMaps, uv \+ fs \* uPx \* uMotion\)\.a;/,
      /uv \+= vec2\(dx, -0\.25 \* abs\(dx\)\) \* uPx;/,
      /uvF \+= vec2\(dx, -0\.25 \* abs\(dx\)\) \/ uSheet;/,
      /texture2D\(uNoise, uv \* vec2\(1\.1, 0\.8\) \+ o\)\.r/,
    ];
    for (const re of displacers) expect(frag, String(re)).toMatch(re);
  });
});
