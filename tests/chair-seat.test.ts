import { describe, it, expect } from 'vitest';
import { seatGeometry } from '../src/world/Chair';

describe('the chair\'s seat', () => {
  const top = 0.345;
  const g = seatGeometry(top);
  const pos = g.attributes.position, nor = g.attributes.normal;

  it('is dished about 6 mm at its middle, and holds the top plane at its edges', () => {
    let centre = Infinity, centreD = Infinity, highest = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      highest = Math.max(highest, pos.getY(i));
      const d = Math.hypot(pos.getX(i), pos.getZ(i));
      if (pos.getY(i) > top - 0.02 && d < centreD) {
        centreD = d;
        centre = pos.getY(i);
      }
    }
    expect(centreD).toBeLessThan(0.03);
    expect(top - centre).toBeGreaterThan(0.0045);
    expect(top - centre).toBeLessThan(0.0065);
    expect(highest).toBeLessThanOrEqual(top + 1e-6);
  });

  it('is smooth and whole: unit normals, the middle of the top near vertical, no NaNs', () => {
    let middle = 0;
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
      expect(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i))).toBeCloseTo(1, 4);
      if (pos.getY(i) > top - 0.02 && Math.hypot(pos.getX(i), pos.getZ(i)) < 0.1) {
        middle++;
        expect(nor.getY(i)).toBeGreaterThan(0.98);
      }
    }
    expect(middle).toBeGreaterThan(20);
  });
});
