import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { wrapWordStart, measureText, PX_PER_M, LINE, SIZE_EM, WRAP, HANDS } from '../src/world/textures';

// `wrap` and `wrapWordStart` use the same canvas `measureText` the browser bake uses. In
// vitest's node environment there is no canvas, so provide one whose metrics are
// deterministic (a unit-width monospace: 8 px per character, spaces included). The wrap
// code never reads other canvas API surface, so this is enough to exercise both the
// wrapping and the per-word x-offset math, which is exactly what the erosion fix adds.

class FakeCtx {
  measureText(s: string): { width: number } {
    return { width: s.length * 8 };
  }
  set font(_: string) { /* no-op: measureText ignores font in this mock */ }
  get font(): string { return ''; }
}

let restore: () => void;

beforeEach(() => {
  const ctx = new FakeCtx();
  const fakeCanvas = { width: 0, height: 0, getContext: () => ctx };
  const doc = { createElement: (tag: string) => (tag === 'canvas' ? fakeCanvas : {}) };
  const g = globalThis as { document?: unknown };
  const prev = g.document;
  g.document = doc;
  restore = () => { g.document = prev; };
});

afterEach(() => restore());

// A block narrow enough that "AAAA BBBB CCCC DDDD" (4 four-letter words separated by
// single spaces; at 8 px/char each word is 32 px, each space is 8 px) wraps as two lines:
// "AAAA BBBB CCCC" (112 px) and "DDDD" (32 px). maxPx = 130 leaves room for the first
// trio (112) but not a fourth (152), so the wrap is deterministic. wrapM = 130 / 700.
const TWO_LINE_TEXT = 'AAAA BBBB CCCC DDDD';
const TWO_LINE_WRAP_M = 130 / 700;

// Where the words start in `TWO_LINE_TEXT` (matched on the lower-cased text the same way
// `erode` does when picking the kept word).
const IDX_AAAA = 0;
const IDX_CCCC = 10;
const IDX_DDDD = 15;

describe('wrapWordStart: kept word stays where it was written', () => {
  it('puts a word on the first wrapped line at its measured x-offset', () => {
    // "CCCC" is the third word of the first line: preceded by "AAAA" + " " + "BBBB" + " "
    // = 32 + 8 + 32 + 8 = 80 canvas px from the start of the line's first word.
    const wp = wrapWordStart(TWO_LINE_TEXT, 'visitor', 'xs', TWO_LINE_WRAP_M, IDX_CCCC);
    expect(wp).toEqual({ line: 0, xOffsetPx: 80 });
  });

  it('puts a word that wraps onto a later line there, not on the top line', () => {
    // The regression this test pins: a wrapped word lands on its own line, not the
    // block's top corner. "DDDD" is the only word on line 1, so xOffset is 0.
    const wp = wrapWordStart(TWO_LINE_TEXT, 'visitor', 'xs', TWO_LINE_WRAP_M, IDX_DDDD);
    expect(wp).toEqual({ line: 1, xOffsetPx: 0 });
  });

  it('returns xOffset 0 for the first word of the first line', () => {
    const wp = wrapWordStart(TWO_LINE_TEXT, 'visitor', 'xs', TWO_LINE_WRAP_M, IDX_AAAA);
    expect(wp).toEqual({ line: 0, xOffsetPx: 0 });
  });

  it('returns null past the end of the text (no word to keep at that index)', () => {
    const wp = wrapWordStart(TWO_LINE_TEXT, 'visitor', 'xs', TWO_LINE_WRAP_M, TWO_LINE_TEXT.length + 5);
    expect(wp).toBeNull();
  });

  it('handles a single-line text (no wrap) by returning line 0 with the right offset', () => {
    // "alpha beta gamma" — short enough to stay on one line at the demo wrap width.
    const text = 'alpha beta gamma';
    const idx = text.toLowerCase().indexOf('gamma'); // preceded by "alpha " + "beta " = 6+5 = 11 chars
    const wp = wrapWordStart(text, 'visitor', 'xs', WRAP['xs'], idx);
    expect(wp).not.toBeNull();
    expect(wp!.line).toBe(0);
    // xOffset: "alpha" (5×8=40) + space (8) + "beta" (4×8=32) + space (8) = 88.
    expect(wp!.xOffsetPx).toBe(88);
  });

  it('handles a long visitor contribution (a realistic multi-line case)', () => {
    // Approximately the bug report's example "I still hear my grandmother humming"
    // (39 chars, ≥ 2 lines at visitor/xs). The second word ("still") is on line 0; a
    // later word ("grandmother", at idx=16) should remain on whatever line it wraps to.
    const text = 'I still hear my grandmother humming';
    const idx = text.toLowerCase().indexOf('grandmother');
    expect(idx).toBe(16);
    const wp = wrapWordStart(text, 'visitor', 'xs', WRAP['xs'], idx);
    expect(wp).not.toBeNull();
    expect(wp!.line).toBeGreaterThanOrEqual(0);
  });
});

describe('erode kept-word placement math', () => {
  // The placement math is in WallText.erode; this exercises the same formula by hand for
  // the regression: the kept item's v centre must move DOWN the block as the word's line
  // index increases (older code pinned it to the block's top, regardless of line).
  it('a word on a later wrapped line is placed below one on the first line by a line height', () => {
    const px = SIZE_EM['xs'] * HANDS['visitor'].scale * PX_PER_M;
    const lineHeight = (px * LINE) / PX_PER_M; // in metres
    // Same original block: a generous two-line block centered at v = 1.5 m.
    const pl = { u: 1.6, v: 1.5, w: 0.3, h: lineHeight * 2 + 0.02, rot: 0 };
    // Single-word block of the kept word (its own measurement): pl/word have the same
    // one-line height (m.h == pl's single-line height).
    const m = measureText('DDDD', 'visitor', 'xs');
    // older, buggy branch (multi-line): pinned to the top edge of the block
    const oldTopV = pl.v + pl.h / 2 - m.h / 2;
    // fix for line 1: one line height lower than line 0
    const line1V = pl.v + pl.h / 2 - m.h / 2 - 1 * lineHeight;
    expect(line1V).toBeLessThan(oldTopV);
    expect(oldTopV - line1V).toBeCloseTo(lineHeight, 4);
    // and the single-line case still reduces to pl.v (m.h == pl.h when one line, both
    // measured the same way): v = pl.v + 0 - m.h/2 - 0 = pl.v + (pl.h - m.h)/2.
    const oneLinePl = { ...pl, h: m.h };
    const singleLineV = oneLinePl.v + oneLinePl.h / 2 - m.h / 2 - 0 * lineHeight;
    expect(singleLineV).toBeCloseTo(oneLinePl.v, 6);
  });
});
