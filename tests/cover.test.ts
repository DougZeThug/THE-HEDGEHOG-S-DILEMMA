import { describe, it, expect } from 'vitest';
import { ALMOST, almostCover } from '../src/memory/living/almost';
import { THINGS, thingsCover } from '../src/memory/living/things';
import { coverQuad, UPRIGHT } from '../src/world/living/Immersion';

// How a film's open matte (1280x1440) is framed on a screen of any shape. Each film has its own
// rows that must stay in; that the framing moves smoothly as a window is resized is shared.
const PAINT = 1280 / 1440;
const ASPECTS: number[] = [];
// (to 2.39:1, the widest common screen)
for (let a = UPRIGHT; a <= 2.39 + 1e-9; a += 0.01) ASPECTS.push(a);

/** The matte's rows a screen of this aspect shows (from the top), covered with the film's rule. */
const shownBy = (film: { coverAt: typeof ALMOST.coverAt }) => (aspect: number): [number, number] => {
  const q = coverQuad(aspect, PAINT, film.coverAt(aspect));
  const y0 = q[0].y, h = q[3].y - q[0].y;
  return [(1 - (1 - y0) / h) * 1440, (1 + y0 / h) * 1440];
};

describe.each([
  ['Almost', almostCover],
  ['Things I Should Have Said', thingsCover],
])('%s on a screen', (_name, cover) => {
  it('moves continuously as a window is resized', () => {
    for (let i = 1; i < ASPECTS.length; i++) expect(Math.abs(cover(ASPECTS[i])[1] - cover(ASPECTS[i - 1])[1])).toBeLessThan(0.005);
  });
});

describe('Almost keeps what matters in frame', () => {
  const shown = shownBy(ALMOST);
  const ROWS = { shade: 260, crossBar: 350, hatTop: 454, eyes: 606, fingertips: 1012, cupFoot: 1038 };

  it('never cuts the cup or their hands, and keeps her eyes off the top edge, up to 2.39:1', () => {
    for (const a of ASPECTS) {
      const [top, bottom] = shown(a);
      expect(bottom - ROWS.cupFoot, `the cup's foot at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(12);
      expect(bottom - ROWS.fingertips, `his fingertips at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(36);
      expect((ROWS.eyes - top) / (bottom - top), `her eyes at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(0.12 - 1e-9);
    }
  });

  it('shows the hat with room above it at 16:9, and keeps the shade and the window bar out from 4:3', () => {
    expect(ROWS.hatTop - shown(16 / 9)[0]).toBeGreaterThanOrEqual(40);
    for (const a of ASPECTS.filter((x) => x >= 4 / 3)) expect(shown(a)[0], `the shade at ${a.toFixed(2)}`).toBeGreaterThan(ROWS.shade + 20);
    expect(shown(1.6)[0], 'the window bar at 16:10').toBeGreaterThan(ROWS.crossBar + 10);
  });
});

describe('Things I Should Have Said keeps what matters in frame', () => {
  const shown = shownBy(THINGS);
  // The drawing's rows on the sheet, from the top (every pose of v2): his crown at its highest, the
  // goodbye's opening beats, measured on the film (turning back to her it is 499).
  const ROWS = { lintel: 412, feet: 1047, head: 473 };

  it('never cuts his head, up to 2.39:1; their feet only beyond about 2:1', () => {
    for (const a of ASPECTS) expect(ROWS.head - shown(a)[0], `his head at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(8 - 1e-6);
    for (const a of ASPECTS.filter((x) => x <= 2.0)) expect(shown(a)[1] - ROWS.feet, `their feet at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(10 - 1e-6);
  });

  it('keeps the lintel in, with room, to 16:10 and 16:9, and in at all to 1.85:1', () => {
    for (const a of ASPECTS.filter((x) => x <= 16 / 9 + 1e-9)) expect(ROWS.lintel - shown(a)[0], `the lintel at ${a.toFixed(2)}`).toBeGreaterThanOrEqual(12);
    for (const a of ASPECTS.filter((x) => x <= 1.85)) expect(shown(a)[0], `the lintel at ${a.toFixed(2)}`).toBeLessThanOrEqual(ROWS.lintel);
  });

  it('on an upright phone, closer than covering, and the drawing still whole across (columns 390-873)', () => {
    for (const [w, h] of [[390, 844], [360, 800], [430, 932], [768, 1024]]) {
      const a = w / h;
      if (a >= UPRIGHT) continue;
      const q = coverQuad(a, PAINT, THINGS.cover.upright, 1.06 * THINGS.cover.uprightScale);
      const x0 = q[0].x, wq = q[1].x - q[0].x;
      const left = ((0 - x0) / wq) * 1280, right = ((1 - x0) / wq) * 1280;
      expect(left, `${w}x${h} left`).toBeLessThanOrEqual(390 - 8);
      expect(right, `${w}x${h} right`).toBeGreaterThanOrEqual(873 + 8);
    }
  });
});
