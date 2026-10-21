import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { squareBar } from '../src/world/Chair';

// The wood-atlas contract (src/world/wood.ts, atlasMetres): the legs' half of the atlas lays
// 2.2 units of v per metre round the bar. squareBar must keep that contract on every flat
// face: each face spans its own ~w*2.2 of v in the true wrap direction, with the single wrap
// closure sitting on an eased arris — never cutting a face in half. (atan2's ±π branch cut
// used to land mid-face on -x with no vertex to carry the wrap, sweeping 78 % of the band.)

const PERIM = (w: number) => 4 * w * 2.2;

/** Classify a flat-face vertex by its dominant axis (+x, -x, +z, -z). Caps and eased-arc
 *  vertices (whose normal is off-axis) return null. */
function faceOf(nx: number, ny: number, nz: number): '+x' | '-x' | '+z' | '-z' | null {
  if (Math.abs(ny) > 0.5) return null;
  if (Math.max(Math.abs(nx), Math.abs(nz)) < 0.95) return null;
  return Math.abs(nx) > 0.95 ? (nx > 0 ? '+x' : '-x') : nz > 0 ? '+z' : '-z';
}

function faceSpans(g: THREE.BufferGeometry) {
  const pos = g.attributes.position, uv = g.attributes.uv, nor = g.attributes.normal;
  const out = {
    '+x': { min: Infinity, max: -Infinity, n: 0 },
    '-x': { min: Infinity, max: -Infinity, n: 0 },
    '+z': { min: Infinity, max: -Infinity, n: 0 },
    '-z': { min: Infinity, max: -Infinity, n: 0 },
  } as Record<string, { min: number; max: number; n: number }>;
  for (let i = 0; i < pos.count; i++) {
    const face = faceOf(nor.getX(i), nor.getY(i), nor.getZ(i));
    if (!face) continue;
    const v = uv.getY(i);
    out[face].n++;
    if (v < out[face].min) out[face].min = v;
    if (v > out[face].max) out[face].max = v;
  }
  return out;
}

describe('squareBar wood-atlas per-face UV', () => {
  for (const [label, w] of [['legs and posts (w = 0.036)', 0.036], ['stretchers (w = 0.022)', 0.022]] as const) {
    describe(label, () => {
      const g = squareBar(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), w, 1);
      const f = faceSpans(g);
      const spans = {
        '+x': f['+x'].max - f['+x'].min,
        '-x': f['-x'].max - f['-x'].min,
        '+z': f['+z'].max - f['+z'].min,
        '-z': f['-z'].max - f['-z'].min,
      };
      const total = PERIM(w);

      it('no flat face sweeps more than half the perimeter band', () => {
        for (const k of Object.keys(spans)) expect(spans[k]).toBeLessThan(0.5 * total);
      });

      it('the four face spans are balanced', () => {
        const max = Math.max(...Object.values(spans));
        const min = Math.min(...Object.values(spans));
        // The bug had max/min ≈ 3.3 (the -x face carried ~4× its share); the fix ≈ 1.06.
        expect(max / min).toBeLessThan(1.2);
      });

      it('each flat face spans close to w*2.2 of v (the documented atlasMetres density)', () => {
        for (const k of Object.keys(spans)) {
          expect(spans[k]).toBeGreaterThan(0.65 * w * 2.2);
          expect(spans[k]).toBeLessThan(1.15 * w * 2.2);
        }
      });

      it('the wrap direction is right on every face (v increases round the bar)', () => {
        const pos = g.attributes.position, uv = g.attributes.uv, nor = g.attributes.normal;
        const corr = (face: string, axis: 'x' | 'z', dir: 1 | -1) => {
          let same = 0, opp = 0;
          for (let i = 0; i < pos.count; i++) {
            if (faceOf(nor.getX(i), nor.getY(i), nor.getZ(i)) !== face) continue;
            for (let j = i + 1; j < pos.count; j++) {
              if (faceOf(nor.getX(j), nor.getY(j), nor.getZ(j)) !== face) continue;
              const ci = axis === 'x' ? pos.getX(i) : pos.getZ(i);
              const cj = axis === 'x' ? pos.getX(j) : pos.getZ(j);
              const dv = uv.getY(j) - uv.getY(i);
              const dc = (cj - ci) * dir;
              if (dc === 0 || dv === 0) continue;
              if ((dc > 0) === (dv > 0)) same++; else opp++;
            }
          }
          return same / (same + opp);
        };
        // CCW from +x: +x → +z → -x → -z, v increasing. The cross coordinate must order v:
        // +x by +z, +z by -x, -x by -z, -z by +x.
        expect(corr('+x', 'z', +1)).toBeGreaterThan(0.95);
        expect(corr('+z', 'x', -1)).toBeGreaterThan(0.95);
        expect(corr('-x', 'z', -1)).toBeGreaterThan(0.95);
        expect(corr('-z', 'x', +1)).toBeGreaterThan(0.95);
      });
    });
  }

  it('the u (length) coordinate is unchanged: u = t * len * 2.2 with t = y_local/len + 0.5', () => {
    const g = squareBar(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.036, 1);
    const pos = g.attributes.position, uv = g.attributes.uv;
    // squareBar reorients the bar so its centre sits at (a+b)/2; here a=0, b=+y, so
    // centreY = 0.5 and the +y axis is preserved, recovering y_local from the world y.
    for (let i = 0; i < pos.count; i++) {
      const yLocal = pos.getY(i) - 0.5;
      const t = yLocal / 1 + 0.5;
      expect(uv.getX(i)).toBeCloseTo(t * 1 * 2.2, 6);
    }
  });
});
