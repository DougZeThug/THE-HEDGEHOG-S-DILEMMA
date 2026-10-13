import { describe, it, expect } from 'vitest';
import { PHRASES } from '../src/content/phrases';
import { layoutPhrases, overlaps, surfaceSize, RESERVED, SurfaceLayout, drawingSpots } from '../src/world/layout';
import { DRAWINGS } from '../src/content/drawings';
import { Rng } from '../src/core/rng';

// Approximate text metrics (the browser uses real font measurement).
const SZ: Record<string, number> = { xs: 0.13, s: 0.17, m: 0.22, l: 0.31, xl: 0.53 };
const measure = (p: (typeof PHRASES)[number]) => {
  const w = Math.min(2.6, p.text.length * 0.034 * (SZ[p.size] / 0.17));
  return { w, h: SZ[p.size] * Math.ceil((p.text.length * 0.034 * (SZ[p.size] / 0.17)) / 2.6) };
};

describe('wall layout', () => {
  const m = layoutPhrases(PHRASES, measure, 4242, drawingSpots(DRAWINGS));
  it('places every placeable phrase inside its surface', () => {
    for (const p of PHRASES) {
      if (p.tier === 'annotation') continue;
      const pl = m.get(p.id)!;
      expect(pl, p.id).toBeTruthy();
      const s = surfaceSize(pl.surface);
      expect(pl.u - pl.w / 2).toBeGreaterThanOrEqual(0);
      expect(pl.u + pl.w / 2).toBeLessThanOrEqual(s.w);
    }
  });
  it('never lets unanchored writing overlap other writing', () => {
    const list = [...m.entries()];
    for (const [a, pa] of list)
      for (const [b, pb] of list) {
        if (a >= b || pa.surface !== pb.surface) continue;
        const anchoredBoth = PHRASES.find((p) => p.id === a)?.at && PHRASES.find((p) => p.id === b)?.at;
        if (anchoredBoth) continue;
        expect(overlaps(pa, pb, 0), `${a} / ${b}`).toBe(false);
      }
  });
  it('keeps the wall behind the chair, and the visitors\' band, empty', () => {
    for (const [id, pl] of m) {
      if (PHRASES.find((p) => p.id === id)?.at) continue;
      for (const r of RESERVED[pl.surface] ?? []) expect(overlaps(pl, r, 0), id).toBe(false);
    }
  });
  it('is deterministic', () => {
    const m2 = layoutPhrases(PHRASES, measure, 4242, drawingSpots(DRAWINGS));
    for (const [id, pl] of m) expect(m2.get(id)).toEqual(pl);
  });
  it('finds a place beside a phrase for annotations', () => {
    const l = new SurfaceLayout(new Rng(1));
    const target = l.add({ surface: 'west', u: 3, v: 1.6, w: 1, h: 0.2, rot: 0 });
    const r = l.findBeside(target, 0.8, 0.12)!;
    expect(r).toBeTruthy();
    expect(overlaps(r, target, 0)).toBe(false);
  });
});
