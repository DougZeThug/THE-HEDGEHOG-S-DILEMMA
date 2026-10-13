import { describe, it, expect } from 'vitest';
import { DRAWINGS, STATIC_DRAWINGS, DRAWING_BY_ID } from '../src/content/drawings';
import { PHRASES, PHRASE_BY_ID } from '../src/content/phrases';
import { bakeDrawing } from '../src/world/sketch';
import { layoutPhrases, overlaps, surfaceSize, RESERVED, drawingSpots, drawingBeside, layoutOf } from '../src/world/layout';
import { Director } from '../src/state/Director';
import type { VisitorInput } from '../src/state/VisitorModel';
import type { TimedCue } from '../src/state/cues';

const SZ: Record<string, number> = { xs: 0.13, s: 0.17, m: 0.22, l: 0.31, xl: 0.53 };
const measure = (p: (typeof PHRASES)[number]) => {
  const w = Math.min(2.6, p.text.length * 0.034 * (SZ[p.size] / 0.17));
  return { w, h: SZ[p.size] * Math.ceil((p.text.length * 0.034 * (SZ[p.size] / 0.17)) / 2.6) };
};

describe('the drawings: few, small, mostly already there', () => {
  it('eight or so; most were always there, one is drawn while watched', () => {
    expect(DRAWINGS.length).toBeGreaterThanOrEqual(6);
    expect(DRAWINGS.length).toBeLessThanOrEqual(14);
    expect(DRAWINGS.length - STATIC_DRAWINGS.length).toBeGreaterThanOrEqual(1);
    // Clearly visible from the start (not the half-erased ghosts): two to four.
    const plain = STATIC_DRAWINGS.filter((d) => d.style !== 'ghost');
    expect(plain.length).toBeGreaterThanOrEqual(2);
    expect(plain.length).toBeLessThanOrEqual(4);
  });
  it('small, faint, and never more than three on a wall; the opening wall left alone', () => {
    const per = new Map<string, number>();
    for (const d of DRAWINGS) {
      per.set(d.surface, (per.get(d.surface) ?? 0) + 1);
      expect(d.strength, d.id).toBeLessThanOrEqual(0.8);
      // Small: only the chair, drawn round at its own size, is bigger than a hand.
      if (d.id !== 'ghost-chair') expect(Math.max(...d.size), d.id).toBeLessThanOrEqual(0.3);
    }
    for (const [s, n] of per) expect(n, s).toBeLessThanOrEqual(3);
    expect(per.get('north') ?? 0).toBe(0);
  });
  it('not captions: at most one sits beside the words it echoes', () => {
    expect(DRAWINGS.filter((d) => d.beside).length).toBeLessThanOrEqual(1);
    for (const d of DRAWINGS) {
      if (d.beside) expect(PHRASE_BY_ID.get(d.beside), d.id).toBeTruthy();
      if (d.when !== 'start') expect(PHRASE_BY_ID.get(d.when.seen), d.id).toBeTruthy();
    }
  });
  it('their places are kept: no writing is laid over them, and they keep clear of the reserved spaces', () => {
    const m = layoutPhrases(PHRASES, measure, 4242, drawingSpots(DRAWINGS));
    const spots = drawingSpots(DRAWINGS);
    for (const s of spots) {
      const size = surfaceSize(s.surface);
      expect(s.u - s.w / 2).toBeGreaterThan(0.05);
      expect(s.u + s.w / 2).toBeLessThan(size.w - 0.05);
      // Above the skirting (8.5 cm and its shadow gap).
      expect(s.v - s.h / 2).toBeGreaterThan(0.095);
      for (const r of RESERVED[s.surface] ?? []) expect(overlaps(s, r, 0)).toBe(false);
      for (const p of PHRASES) {
        const pl = m.get(p.id);
        // Lines with a fixed place of their own are authored; everything else is laid out round the drawings.
        if (!pl || p.at || pl.surface !== s.surface) continue;
        expect(overlaps(pl, s, 0), `${p.id} over a drawing`).toBe(false);
      }
    }
    // Apart from each other: no little gallery.
    for (const a of spots) for (const b of spots) if (a !== b && a.surface === b.surface) expect(Math.hypot(a.u - b.u, a.v - b.v)).toBeGreaterThan(0.4);
    // The drawing that sits beside a line finds room there.
    const cups = DRAWING_BY_ID.get('cups')!;
    const p = drawingBeside(layoutOf(m), cups, m.get(cups.beside!));
    expect(p).toBeTruthy();
  });
});

describe('drawn by a hand', () => {
  for (const d of DRAWINGS) {
    it(`${d.id}: strokes in order, with pauses; ink only where drawn`, () => {
      const b = bakeDrawing(d);
      expect(b.words.length).toBeGreaterThan(1);
      for (let i = 0; i < b.words.length; i++) {
        expect(b.words[i][1]).toBeGreaterThan(b.words[i][0]);
        if (i) expect(b.words[i][0]).toBeGreaterThan(b.words[i - 1][1]);
      }
      let ink = 0;
      for (let p = 0; p < b.W * b.H; p++) if (b.data[p * 4 + 3] > 20) ink++;
      const frac = ink / (b.W * b.H);
      // Line, not fill: a few percent of the box.
      expect(frac).toBeGreaterThan(0.005);
      expect(frac).toBeLessThan(0.3);
      // Deterministic.
      expect(bakeDrawing(d).data).toEqual(b.data);
    });
  }
  it('the first stroke is drawn before the last', () => {
    const b = bakeDrawing(DRAWING_BY_ID.get('cups')!);
    let early = 0, late = 0;
    for (let p = 0; p < b.W * b.H; p++) if (b.data[p * 4 + 3] > 60) b.data[p * 4] < 80 ? early++ : b.data[p * 4] > 180 ? late++ : 0;
    expect(early).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(0);
  });
});

describe('the cups are drawn while their line is looked at', () => {
  const still: VisitorInput = { x: 0.1, z: 1.8, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
  const run = (d: Director, seconds: number, input: (t: number) => VisitorInput) => {
    const out: TimedCue[] = [];
    for (let t = 0; t < seconds; t += 0.1) out.push(...d.tick(0.1, input(t), 'east'));
    return out;
  };
  it('once, after a few seconds of looking; never before the line is there', () => {
    const d = new Director({ seed: 7 });
    d.release({ written: ['stay', 'two-cups'], spoken: ['crumbs'] });
    const before = run(d, 20, () => still);
    expect(before.some((c) => c.cue.type === 'draw')).toBe(false);
    const cues = run(d, 60, () => ({ ...still, gazePhraseId: 'two-cups' }));
    const draws = cues.filter((c) => c.cue.type === 'draw');
    expect(draws.length).toBe(1);
    expect(draws[0].cue).toEqual({ type: 'draw', id: 'cups' });
  });
  it('not while held', () => {
    const d = new Director({ seed: 7 });
    d.hold();
    expect(run(d, 30, () => ({ ...still, gazePhraseId: 'two-cups' })).length).toBe(0);
  });
});
