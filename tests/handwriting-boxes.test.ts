import { describe, it, expect } from 'vitest';
import { charBox } from '../src/world/textures';
import { bakeStrokes, type CharBox } from '../src/world/strokes';
import { handTiming } from '../src/world/handwriting';

// The handwriting bake: each glyph's box, and the per-pixel times derived from it. The fix is
// in `charBox` (the box layout); `bakeStrokes` is the consumer. These tests guard both the
// layout (adjacent boxes never overlap) and the behaviour it buys (a glyph's left strip is
// timed with its own character, not the one before, and not deferred after the word).

const PAD = (px: number) => px * 0.04;

describe('character boxes: adjacent glyphs meet at the advance boundary (no overlap)', () => {
  it("a word's first glyph keeps the outer left pad; the rest start at the advance boundary", () => {
    const px = 100, x = 15, y = 200, dy = 0;
    // "Tb": T advance 60 px, b advance 50 px.
    const T = charBox(0, x, 0, 60, px, y, dy, true, false, 'typed');
    const b = charBox(1, x, 60, 50, px, y, dy, false, true, 'typed');
    expect(T.x0).toBe(x - PAD(px)); // outer left pad of the word
    expect(T.x1).toBe(x + 60);      // no right pad: T's advance is the boundary
    expect(b.x0).toBe(x + 60);      // no left pad: b starts where T's advance ends
    expect(b.x1).toBe(x + 60 + 50 + PAD(px)); // outer right pad of the word
    // The guarantee: no overlap, no gap.
    expect(T.x1).toBeLessThanOrEqual(b.x0);
    expect(b.x0 - T.x1).toBe(0);
  });

  it("a single-glyph word keeps both pads (it is both first and last)", () => {
    const px = 100, x = 10, y = 200, dy = 0;
    const a = charBox(0, x, 0, 40, px, y, dy, true, true, 'pencil');
    expect(a.x0).toBe(x - PAD(px));
    expect(a.x1).toBe(x + 40 + PAD(px));
  });

  it("a three-glyph word pads only at its own left and right edges", () => {
    const px = 100, x = 8, y = 200, dy = 0;
    const g0 = charBox(0, x, 0, 30, px, y, dy, true, false, 'pencil');
    const g1 = charBox(1, x, 30, 40, px, y, dy, false, false, 'pencil');
    const g2 = charBox(2, x, 70, 20, px, y, dy, false, true, 'pencil');
    expect(g0.x0).toBe(x - PAD(px));
    expect(g0.x1).toBe(x + 30);
    expect(g1.x0).toBe(x + 30);
    expect(g1.x1).toBe(x + 70);
    expect(g2.x0).toBe(x + 70);
    expect(g2.x1).toBe(x + 70 + 20 + PAD(px));
    expect(g0.x1).toBeLessThanOrEqual(g1.x0);
    expect(g1.x1).toBeLessThanOrEqual(g2.x0);
  });

  it('keeps `stamp` true only for the typed hand', () => {
    const mk = (hand: 'typed' | 'pencil') => charBox(0, 0, 0, 40, 100, 0, 0, true, true, hand);
    expect(mk('typed').stamp).toBe(true);
    expect(mk('pencil').stamp).toBe(false);
  });

  it('keeps the tall line band and baseline the padded layout had', () => {
    const px = 100, y = 200, dy = 3;
    const b = charBox(0, 10, 0, 40, px, y, dy, true, true, 'pencil');
    expect(b.yTop).toBe(y + dy - px * 1.05);
    expect(b.yBottom).toBe(y + dy + px * 0.55);
    expect(b.base).toBe(y + dy);
    expect(b.xHeight).toBe(px * 0.45);
  });
});

describe('stroke order with advance-boundary boxes', () => {
  // Reproduces the bug's mechanism: glyph k+1 has ink a couple of px into the pad (lsb < pad).
  // With the old boxes that strip lay in the overlap and was claimed by glyph k; with the fix
  // it lies in glyph k+1's own box and is timed with it.

  it("a glyph's left strip (lsb inside the outer pad) is timed inside its own character's window", () => {
    const W = 120, H = 40, x = 10, y = 26, px = 100;
    const a = new Uint8Array(W * H);
    // Glyph 0 ("h"): a stem at x+12 (well inside its box, which spans [x-pad, x+50]).
    for (let yy = y - 18; yy <= y; yy++) a[yy * W + (x + 12)] = a[yy * W + (x + 13)] = 255;
    // Glyph 1 ("b"): a stem at x+52 — 2 px past the advance boundary x+50 (lsb 2 em-hundredths),
    // i.e. the strip the overlap used to steal — and a bowl to its right.
    for (let yy = y - 18; yy <= y; yy++) a[yy * W + (x + 52)] = a[yy * W + (x + 53)] = 255;
    for (let xx = x + 52; xx <= x + 88; xx++) a[(y - 6) * W + xx] = 255;

    const h = charBox(0, x, 0, 50, px, y, 0, true, false, 'pencil');   // box [x-pad, x+50]
    const b = charBox(1, x, 50, 40, px, y, 0, false, true, 'pencil');  // box [x+50, x+50+40+pad]
    const boxes: CharBox[] = [h, b];
    const timing = handTiming('hb', 'pencil', 'test-hb');
    const bk = bakeStrokes(a, W, H, boxes, timing, () => 0);
    const at = (xx: number, yy: number) => bk.time[yy * W + xx];

    const [hs, he] = timing.chars[0];
    const [bs, be] = timing.chars[1];
    const inside = (t: number, s: number, e: number) => t >= s - 1e-6 && t <= e + 1e-6;

    // Glyph 0's ink is timed in glyph 0's window.
    for (let yy = y - 18; yy <= y; yy++)
      for (let xx = x + 12; xx <= x + 13; xx++)
        expect(inside(at(xx, yy), hs, he), `h stem (${xx},${yy})`).toBe(true);

    // Glyph 1's ink — the left strip at the advance boundary onward — is timed in glyph 1's
    // own window, never in glyph 0's. (Before the fix this strip was owned by glyph 0 and
    // written a whole character early, or deferred after the word as a stray dot.)
    for (let yy = y - 18; yy <= y; yy++)
      for (let xx = x + 52; xx <= x + 53; xx++) {
        const t = at(xx, yy);
        expect(inside(t, bs, be), `b left strip (${xx},${yy}) in b's window`).toBe(true);
        expect(t, `b left strip (${xx},${yy}) not in h's window`).toBeGreaterThan(he - 1e-6);
      }
    for (let xx = x + 52; xx <= x + 88; xx++)
      expect(inside(at(xx, y - 6), bs, be), `b bowl (${xx},${y - 6})`).toBe(true);

    // The strip is not deferred after the word: its time is at most glyph 1's char end, not
    // `word end + LIFT + DOT` (which is where a deferred "dot" lands).
    expect(bk.words[0][1]).toBeGreaterThanOrEqual(be - 1e-6);
    for (let yy = y - 18; yy <= y; yy++)
      for (let xx = x + 52; xx <= x + 53; xx++)
        expect(at(xx, yy)).toBeLessThanOrEqual(be + 1e-6);

    // Every inked pixel received a finite time.
    for (let p = 0; p < W * H; p++) if (a[p]) expect(Number.isFinite(bk.time[p])).toBe(true);
  });

  it("the same strip is stamped whole with its own glyph for the typed hand (no early stamp)", () => {
    // `typed` stamps each glyph's ink at its character start; the strip must stamp with its
    // own glyph, not the previous one.
    const W = 120, H = 40, x = 10, y = 26, px = 100;
    const a = new Uint8Array(W * H);
    for (let yy = y - 18; yy <= y; yy++) a[yy * W + (x + 12)] = a[yy * W + (x + 13)] = 255;
    for (let yy = y - 18; yy <= y; yy++) a[yy * W + (x + 52)] = a[yy * W + (x + 53)] = 255;
    for (let xx = x + 52; xx <= x + 88; xx++) a[(y - 6) * W + xx] = 255;

    const T = charBox(0, x, 0, 50, px, y, 0, true, false, 'typed');
    const b = charBox(1, x, 50, 40, px, y, 0, false, true, 'typed');
    const timing = handTiming('Tb', 'typed', 'test-Tb');
    const bk = bakeStrokes(a, W, H, [T, b], timing, () => 0);
    const at = (xx: number, yy: number) => bk.time[yy * W + xx];

    const [hs] = timing.chars[0];
    const [bs] = timing.chars[1];
    // All of T's ink stamps at T's start; all of b's ink (the strip included) stamps at b's start.
    for (let yy = y - 18; yy <= y; yy++)
      for (let xx = x + 12; xx <= x + 13; xx++) expect(at(xx, yy)).toBeCloseTo(hs, 5);
    for (let yy = y - 18; yy <= y; yy++)
      for (let xx = x + 52; xx <= x + 53; xx++) expect(at(xx, yy)).toBeCloseTo(bs, 5);
    for (let xx = x + 52; xx <= x + 88; xx++) expect(at(xx, y - 6)).toBeCloseTo(bs, 5);
    expect(bs).toBeGreaterThan(hs);
  });

  it('a glyph whose ink is wholly inside its box is unaffected (regression: well-separated boxes)', () => {
    // The existing opening.test.ts case uses well-separated boxes; mirror it here through
    // `charBox` to make sure advance-boundary boxes don't disturb clean glyphs.
    const W = 80, H = 40, x = 6, y = 24, px = 100;
    const a = new Uint8Array(W * H);
    for (let yy = y - 16; yy <= y; yy++) a[yy * W + (x + 6)] = a[yy * W + (x + 7)] = 255;  // glyph 0 stem
    for (let yy = y - 16; yy <= y; yy++) a[yy * W + (x + 46)] = a[yy * W + (x + 47)] = 255; // glyph 1 stem
    const g0 = charBox(0, x, 0, 40, px, y, 0, true, false, 'pencil');
    const g1 = charBox(1, x, 40, 30, px, y, 0, false, true, 'pencil');
    const timing = handTiming('ab', 'pencil', 'test-ab');
    const bk = bakeStrokes(a, W, H, [g0, g1], timing, () => 0);
    const at = (xx: number, yy: number) => bk.time[yy * W + xx];
    // Glyph 0 written before glyph 1; each glyph's ink spans downward (pen at the top).
    expect(at(x + 6, y - 14)).toBeLessThan(at(x + 6, y));
    expect(at(x + 6, y)).toBeLessThanOrEqual(at(x + 46, y - 14));
    for (let p = 0; p < W * H; p++) if (a[p]) expect(Number.isFinite(bk.time[p])).toBe(true);
  });
});
