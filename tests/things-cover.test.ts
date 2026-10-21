import { describe, it, expect } from 'vitest';
import { THINGS, thingsCover } from '../src/memory/living/things';
import { coverQuad, UPRIGHT } from '../src/world/living/Immersion';

// The sheet (1280×1440) and the drawing's rows on it, from the top (every beat: QA, 2026-10-21).
const PAINT = 1280 / 1440;
const ROWS = { lintel: 426, feet: 1007 };

/** The sheet's rows a screen of this aspect shows (from the top), covered with the film's rule. */
function shown(aspect: number): [number, number] {
  const q = coverQuad(aspect, PAINT, THINGS.coverAt(aspect));
  const y0 = q[0].y, h = q[3].y - q[0].y;
  return [(1 - (1 - y0) / h) * 1440, (1 + y0 / h) * 1440];
}

describe('Things I Should Have Said on a screen (QA, 2026-10-21)', () => {
  const aspects: number[] = [];
  for (let a = UPRIGHT; a <= 2.39 + 1e-9; a += 0.01) aspects.push(a);

  it('never cuts her feet, up to 2.39:1', () => {
    for (const a of aspects) expect(shown(a)[1] - ROWS.feet, `her feet at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(12 - 1e-6);
  });

  it('keeps the lintel in, with room, to 16:10 and 16:9, and in at all to 1.95:1', () => {
    for (const a of aspects.filter((x) => x <= 16 / 9 + 1e-9)) expect(ROWS.lintel - shown(a)[0], `the lintel at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(20);
    for (const a of aspects.filter((x) => x <= 1.95)) expect(shown(a)[0], `the lintel at ${a.toFixed(2)}`).toBeLessThanOrEqual(ROWS.lintel);
  });

  it('moves continuously as a window is resized', () => {
    for (let i = 1; i < aspects.length; i++) expect(Math.abs(thingsCover(aspects[i])[1] - thingsCover(aspects[i - 1])[1])).toBeLessThan(0.005);
    expect(THINGS.cover.wide).toEqual(thingsCover(16 / 9));
  });
});
