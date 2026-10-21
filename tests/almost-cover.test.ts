import { describe, it, expect } from 'vitest';
import { ALMOST, almostCover } from '../src/memory/living/almost';
import { coverQuad, UPRIGHT } from '../src/world/living/Immersion';

// The film's open matte (1280×1440) and rows of its photograph 0, from the top (2026-10-21).
const PAINT = 1280 / 1440;
const ROWS = { shade: 260, crossBar: 350, hatTop: 454, eyes: 606, fingertips: 1012, cupFoot: 1038 };

/** The open matte's rows a screen of this aspect shows (from the top), covered with the film's rule. */
function shown(aspect: number): [number, number] {
  const q = coverQuad(aspect, PAINT, ALMOST.coverAt(aspect));
  const y0 = q[0].y, h = q[3].y - q[0].y;
  // (screen v 0..1 is film v (s - y0) / h, from the bottom)
  return [(1 - (1 - y0) / h) * 1440, (1 + y0 / h) * 1440];
}

describe('Almost on a screen (the cinematic review, 2026-10-21)', () => {
  const aspects: number[] = [];
  // (to 2.39:1, the widest common screen: beyond about 2.45:1 nothing holds both her eyes and the cup)
  for (let a = UPRIGHT; a <= 2.39 + 1e-9; a += 0.01) aspects.push(a);

  it('never cuts the cup or their hands, and keeps her eyes off the top edge, up to 2.39:1', () => {
    for (const a of aspects) {
      const [top, bottom] = shown(a);
      expect(bottom - ROWS.cupFoot, `the cup's foot at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(12);
      expect(bottom - ROWS.fingertips, `his fingertips at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(36);
      expect((ROWS.eyes - top) / (bottom - top), `her eyes at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(0.12 - 1e-9);
    }
  });

  it('shows the hat with room above it at 16:9, and keeps the shade and the window bar out from 4:3', () => {
    const [top] = shown(16 / 9);
    expect(ROWS.hatTop - top).toBeGreaterThanOrEqual(40);
    for (const a of aspects.filter((x) => x >= 4 / 3)) {
      expect(shown(a)[0], `the shade at ${a.toFixed(2)}`).toBeGreaterThan(ROWS.shade + 20);
    }
    expect(shown(1.6)[0], 'the window bar at 16:10').toBeGreaterThan(ROWS.crossBar + 10);
  });

  it('moves continuously as a window is resized (no jump at 2:1)', () => {
    for (let i = 1; i < aspects.length; i++) {
      expect(Math.abs(almostCover(aspects[i])[1] - almostCover(aspects[i - 1])[1])).toBeLessThan(0.005);
    }
    expect(ALMOST.cover.wide).toEqual(almostCover(16 / 9));
  });
});
