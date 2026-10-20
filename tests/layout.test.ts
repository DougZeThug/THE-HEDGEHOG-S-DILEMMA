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

describe('a line under another, inside a place on its wall (the line where the painting was: decisions 122, 133, 137, 141)', () => {
  const W = 1.11, H = 0.17; // "we had all afternoon" in the pencil at s
  const inside = (r: { u: number; v: number; w: number; h: number }, z: { u: number; v: number; w: number; h: number }) =>
    r.u - r.w / 2 >= z.u - z.w / 2 - 1e-9 && r.u + r.w / 2 <= z.u + z.w / 2 + 1e-9 && r.v - r.h / 2 >= z.v - z.h / 2 - 1e-9 && r.v + r.h / 2 <= z.v + z.h / 2 + 1e-9;
  /** Just under its line and close: its top 2–15 cm under the line's foot, beginning within 25 cm of
   *  where the line begins, or, a longer line, centred under it to within 15 cm (decision 141). */
  const under = (r: { u: number; v: number; w: number; h: number }, a: Placement) => {
    const gap = a.v - a.h / 2 - (r.v + r.h / 2);
    const start = r.u - r.w / 2 - (a.u - a.w / 2);
    return gap >= 0.02 - 1e-9 && gap <= 0.15 + 1e-9 && start >= -Math.max(0.25, (r.w - a.w) / 2 + 0.15) - 1e-9 && start <= 0.25 + 1e-9;
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

  it('20 cm from a place that stays, or nothing; a place that can go elsewhere gives way; a line’s own place, not yet written, waits', () => {
    // (A line with its place a little to the right of where the line would go, and lower.)
    const at = (l: SurfaceLayout) => [l.add({ surface: 'east', u: 3.56, v: 1.535, w: 0.9, h: 0.21, rot: 0 }), l.add({ surface: 'east', u: 4.78, v: 1.25, w: 1.37, h: 0.29, rot: 0 })];
    const within = { u: 3.62, v: 1.2, w: 3.2, h: 1.8 };
    const ideal = (a: Placement) => a.u - a.w / 2 + W / 2 + a.w * 0.08;
    // Something there that stays (a drawing): 20 cm from it would mean hanging off to the left of its
    // line, where it reads as a line of its own; so nothing.
    const l1 = new SurfaceLayout(new Rng(1));
    const [a1] = at(l1);
    expect(l1.findUnder(a1, W, H, within, () => false)).toBeNull();
    // A line not yet shown, with no place of its own: it is moved, and the line goes where it would.
    const l2 = new SurfaceLayout(new Rng(1));
    const [a2, slot] = at(l2);
    const moved = l2.findUnder(a2, W, H, within, (p) => p === slot)!;
    expect(moved.displaced).toEqual([slot]);
    expect(Math.abs(moved.rect.u - ideal(a2))).toBeLessThanOrEqual(0.02);
    // A line's own place, not yet written: the line may come as close as to anything else (never
    // over it), and that line waits (kept off the walls from then on, decision 137).
    const l3 = new SurfaceLayout(new Rng(1));
    const [a3, own] = at(l3);
    const waits = l3.findUnder(a3, W, H, within, () => false, [], (p) => p === own)!;
    expect(waits.waiting).toEqual([own]);
    expect(overlaps(waits.rect, own, 0.015)).toBe(false);
    expect(under(waits.rect, a3)).toBe(true);
    // Written, it is writing like any other: 20 cm, so here nothing.
    const l4 = new SurfaceLayout(new Rng(1));
    const [a4, written] = at(l4);
    expect(l4.findUnder(a4, W, H, within, () => false, [written], (p) => p === written)).toBeNull();
  });

  it('never hanging off to one side: it begins within 25 cm of where its line begins, a longer line centred at most', () => {
    // (QA, 2026-10-20: at half overlap the line began 0.62 m left of "five more minutes", and the
    // artist's longer wording 0.96 m: read as a line of its own, or the plea as its caption.)
    const layout = new SurfaceLayout(new Rng(1));
    const anchor = layout.add({ surface: 'east', u: 3, v: 1.6, w: 0.9, h: 0.21, rot: 0 });
    // Taken just under it and a little to the right: the place left is too far to the left.
    layout.add({ surface: 'east', u: 3.5, v: 1.35, w: 0.9, h: 0.2, rot: 0 });
    expect(layout.findUnder(anchor, W, H, { u: 3, v: 1.4, w: 3.2, h: 1.8 }, () => false)).toBeNull();
    // The artist's wording (1.63 m) on a clear wall: from where its line begins, at most centred.
    const l2 = new SurfaceLayout(new Rng(1));
    const a2 = l2.add({ surface: 'east', u: 3, v: 1.6, w: 0.9, h: 0.21, rot: 0 });
    const got = l2.findUnder(a2, 1.63, H, { u: 3, v: 1.4, w: 3.2, h: 1.8 }, () => false)!;
    expect(under(got.rect, a2)).toBe(true);
    // With the place on its right taken, it may sit centred under its line, no further left.
    const taken = (u: number) => {
      const l = new SurfaceLayout(new Rng(1));
      const a = l.add({ surface: 'east', u: 3, v: 1.6, w: 0.9, h: 0.21, rot: 0 });
      l.add({ surface: 'east', u, v: 1.35, w: 0.4, h: 0.2, rot: 0 });
      return { a, got: l.findUnder(a, 1.63, H, { u: 3, v: 1.4, w: 3.2, h: 1.8 }, () => false) };
    };
    const centred = taken(4.1);
    expect(under(centred.got!.rect, centred.a)).toBe(true);
    expect(Math.abs(centred.got!.rect.u - centred.a.u)).toBeLessThanOrEqual(0.15);
    expect(taken(3.95).got).toBeNull();
  });

  it('on the walls as laid out: under its line, close, inside the painting’s place, 20 cm from everything but places that give way or wait', () => {
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
        // place of its own (`at`) never moves, and waits, as in WallText.writeWithin.
        const ids = [...lay.keys()];
        const shownIds = new Set(ids.filter((_, k) => k % 3 === 0));
        const shown = ids.filter((id) => shownIds.has(id) && lay.get(id)!.surface === surface).map((id) => lay.get(id)!);
        const unshown = (p: Placement, own: boolean) => ids.some((id) => lay.get(id) === p && !shownIds.has(id) && !!PHRASES.find((x) => x.id === id)?.at === own);
        const movable = (p: Placement) => unshown(p, false), waits = (p: Placement) => unshown(p, true);
        tried++;
        const got = layout.findUnder(anchor, W, H, within, movable, shown, waits);
        if (!got) continue;
        written++;
        expect(under(got.rect, anchor)).toBe(true);
        expect(inside(got.rect, within)).toBe(true);
        expect(overlaps(got.rect, anchor, 0.015)).toBe(false);
        for (const q of shown) expect(overlaps(got.rect, q, 0.2)).toBe(false);
        for (const q of layout.placed.get(surface)!) if (q !== anchor && !got.displaced.includes(q) && !got.waiting.includes(q)) expect(overlaps(got.rect, q, 0.2)).toBe(false);
        for (const q of got.displaced) expect(movable(q)).toBe(true);
        for (const q of got.waiting) expect(waits(q) && !overlaps(got.rect, q, 0.015)).toBe(true);
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
