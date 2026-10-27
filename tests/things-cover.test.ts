import { describe, it, expect } from 'vitest';
import { THINGS, thingsCover } from '../src/memory/living/things';
import { coverQuad, UPRIGHT } from '../src/world/living/Immersion';

// The sheet (1280×1440) and the drawing's rows on it, from the top (every pose of v2, scripts/things/).
const PAINT = 1280 / 1440;
const ROWS = { lintel: 412, feet: 1047, head: 499 };

/** The sheet's rows a screen of this aspect shows (from the top), covered with the film's rule. */
function shown(aspect: number): [number, number] {
  const q = coverQuad(aspect, PAINT, THINGS.coverAt(aspect));
  const y0 = q[0].y, h = q[3].y - q[0].y;
  return [(1 - (1 - y0) / h) * 1440, (1 + y0 / h) * 1440];
}

describe('Things I Should Have Said on a screen (QA, 2026-10-21)', () => {
  const aspects: number[] = [];
  for (let a = UPRIGHT; a <= 2.39 + 1e-9; a += 0.01) aspects.push(a);

  it('never cuts his head as he turns back to her, up to 2.39:1; their feet only beyond about 2.1:1 (QA, 2026-10-22)', () => {
    for (const a of aspects) expect(ROWS.head - shown(a)[0], `his head at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(8 - 1e-6);
    for (const a of aspects.filter((x) => x <= 2.1)) expect(shown(a)[1] - ROWS.feet, `their feet at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(10 - 1e-6);
  });

  it('keeps the lintel in, with room, to 16:10 and 16:9, and in at all to 1.85:1', () => {
    for (const a of aspects.filter((x) => x <= 16 / 9 + 1e-9)) expect(ROWS.lintel - shown(a)[0], `the lintel at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(12);
    for (const a of aspects.filter((x) => x <= 1.85)) expect(shown(a)[0], `the lintel at ${a.toFixed(2)}`).toBeLessThanOrEqual(ROWS.lintel);
  });

  it('on an upright phone, closer than covering, and the drawing still whole across (columns 390-873)', () => {
    for (const [w, h] of [[390, 844], [360, 800], [430, 932], [768, 1024]]) {
      const a = w / h;
      if (a >= UPRIGHT) continue;
      const q = coverQuad(a, PAINT, THINGS.cover.upright, 1.06 * THINGS.cover.uprightScale);
      const x0 = q[0].x, wq = q[1].x - q[0].x;
      // (screen u 0..1 is sheet column (u - x0) / wq)
      const left = ((0 - x0) / wq) * 1280, right = ((1 - x0) / wq) * 1280;
      expect(left, `${w}x${h} left`).toBeLessThanOrEqual(390 - 8);
      expect(right, `${w}x${h} right`).toBeGreaterThanOrEqual(873 + 8);
    }
    expect(THINGS.cover.uprightScale).toBeGreaterThanOrEqual(1.2);
  });

  it('moves continuously as a window is resized', () => {
    for (let i = 1; i < aspects.length; i++) expect(Math.abs(thingsCover(aspects[i])[1] - thingsCover(aspects[i - 1])[1])).toBeLessThan(0.005);
    expect(THINGS.cover.wide).toEqual(thingsCover(16 / 9));
  });
});
