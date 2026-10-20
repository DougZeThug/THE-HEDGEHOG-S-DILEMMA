import { describe, it, expect } from 'vitest';
import { PHRASES } from '../src/content/phrases';
import { layoutPhrases, layoutOf, overlaps, surfaceSize, RESERVED, SurfaceLayout, drawingSpots, type Placement } from '../src/world/layout';
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

describe('a line under another, inside a place on its wall (the line where the painting was: decisions 122, 133)', () => {
  const W = 1.11, H = 0.17; // "we had all afternoon" in the pencil at s
  const inside = (r: { u: number; v: number; w: number; h: number }, z: { u: number; v: number; w: number; h: number }) =>
    r.u - r.w / 2 >= z.u - z.w / 2 - 1e-9 && r.u + r.w / 2 <= z.u + z.w / 2 + 1e-9 && r.v - r.h / 2 >= z.v - z.h / 2 - 1e-9 && r.v + r.h / 2 <= z.v + z.h / 2 + 1e-9;
  /** Just under its line and close: its top 2–15 cm under the line's foot, overlapping half the narrower. */
  const under = (r: { u: number; v: number; w: number; h: number }, a: Placement) => {
    const gap = a.v - a.h / 2 - (r.v + r.h / 2);
    const overlap = Math.min(r.u + r.w / 2, a.u + a.w / 2) - Math.max(r.u - r.w / 2, a.u - a.w / 2);
    return gap >= 0.02 - 1e-9 && gap <= 0.15 + 1e-9 && overlap >= 0.5 * Math.min(r.w, a.w) - 1e-9;
  };

  it('on a clear wall, just under the start of its line, a little in', () => {
    const layout = new SurfaceLayout(new Rng(1));
    const anchor = layout.add({ surface: 'east', u: 3, v: 1.6, w: 0.9, h: 0.17, rot: 0 });
    const got = layout.findUnder(anchor, W, H, { u: 3, v: 1.4, w: 3.2, h: 1.8 }, () => false)!;
    expect(got.displaced).toEqual([]);
    expect(Math.abs(got.rect.u - (anchor.u - anchor.w / 2 + W / 2 + anchor.w * 0.08))).toBeLessThanOrEqual(0.02);
    expect(Math.abs(got.rect.v - (anchor.v - anchor.h / 2 - H / 2 - 0.04))).toBeLessThanOrEqual(0.02);
  });

  it('never above or beside: with a line already written just under its own, nothing', () => {
    // (The opening's "I wanted you to" under "five more minutes": above, the wall read as a stanza.)
    const layout = new SurfaceLayout(new Rng(1));
    const anchor = layout.add({ surface: 'north', u: 1.2, v: 2.34, w: 0.9, h: 0.21, rot: 0 });
    const below = layout.add({ surface: 'north', u: 1.6, v: 1.95, w: 1.6, h: 0.34, rot: 0 });
    expect(layout.findUnder(anchor, W, H, { u: 1.7, v: 2.2, w: 3.2, h: 1.8 }, () => false, [below])).toBeNull();
    // Nor next to a line written nearby (it would be read as its answer, or run on into it).
    const l2 = new SurfaceLayout(new Rng(1));
    const a2 = l2.add({ surface: 'east', u: 3, v: 1.6, w: 0.9, h: 0.17, rot: 0 });
    const near = l2.add({ surface: 'east', u: 4.6, v: 1.33, w: 0.9, h: 0.17, rot: 0 });
    const got = l2.findUnder(a2, W, H, { u: 3, v: 1.4, w: 3.2, h: 1.8 }, () => false, [near]);
    if (got) expect(overlaps(got.rect, near, 0.2)).toBe(false);
  });

  it('on the walls as laid out: under its line, close, inside the painting’s place, over nothing but places of lines not yet shown', () => {
    let written = 0, tried = 0;
    for (const surface of ['north', 'east', 'south', 'west'] as const)
      for (let i = 0; i < 15; i++) {
        const lay = layoutPhrases(PHRASES, measure, 4242, drawingSpots(DRAWINGS));
        const layout = layoutOf(lay);
        const size = surfaceSize(surface);
        // The woodland's line, written near where the visitor looks (as WallText.write's `near`).
        const rect = layout.findIn(surface, 0.9, 0.17, [(0.6 + (i / 14) * (size.w - 1.2)) / size.w - 0.08, (0.6 + (i / 14) * (size.w - 1.2)) / size.w + 0.08], [1.1 + (i % 3) * 0.35, 1.6 + (i % 3) * 0.35], 0.03, 200)
          ?? layout.scan(surface, 0.9, 0.17, 0.02);
        if (!rect) continue;
        const anchor = layout.add({ surface, ...rect, rot: 0 });
        // Its painting round it, kept on the wall (3.2 × 1.8 m).
        const within = { u: Math.min(Math.max(anchor.u, 1.65), size.w - 1.65), v: Math.min(Math.max(anchor.v - 0.4, 1.0), size.h - 1.0), w: 3.2, h: 1.8 };
        // Some lines are already on the walls (every third), the rest not yet shown; a line with a
        // place of its own (`at`) never moves, as in WallText.writeWithin.
        const ids = [...lay.keys()];
        const shownIds = new Set(ids.filter((_, k) => k % 3 === 0));
        const shown = ids.filter((id) => shownIds.has(id) && lay.get(id)!.surface === surface).map((id) => lay.get(id)!);
        const movable = (p: Placement) => ids.some((id) => lay.get(id) === p && !shownIds.has(id) && !PHRASES.find((x) => x.id === id)?.at);
        tried++;
        const got = layout.findUnder(anchor, W, H, within, movable, shown);
        if (!got) continue;
        written++;
        expect(under(got.rect, anchor)).toBe(true);
        expect(inside(got.rect, within)).toBe(true);
        expect(overlaps(got.rect, anchor, 0.015)).toBe(false);
        for (const q of shown) expect(overlaps(got.rect, q, 0.2)).toBe(false);
        for (const q of layout.placed.get(surface)!) if (q !== anchor && !got.displaced.includes(q)) expect(overlaps(got.rect, q, 0.015)).toBe(false);
        for (const q of got.displaced) expect(movable(q)).toBe(true);
      }
    // (Written in a good share of endings; where the place under its line is crowded, nothing.)
    expect(written / tried).toBeGreaterThan(0.3);
  });

  it('writes nothing where nothing can move', () => {
    const layout = new SurfaceLayout(new Rng(1));
    const anchor = layout.add({ surface: 'west', u: 3, v: 1.6, w: 0.9, h: 0.17, rot: 0 });
    for (let u = 0.3; u < 6.2; u += 0.5) for (let v = 0.3; v < 3.4; v += 0.2) if (!overlaps({ u, v, w: 0.5, h: 0.2 }, anchor, 0.01)) layout.add({ surface: 'west', u, v, w: 0.5, h: 0.2, rot: 0 });
    expect(layout.findUnder(anchor, W, H, { u: 3, v: 1.4, w: 3.2, h: 1.8 }, () => false)).toBeNull();
  });
});
