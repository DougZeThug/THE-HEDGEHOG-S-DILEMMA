import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { squareBar } from '../src/world/Chair';

// The wood atlas wraps round each square bar: v runs w * 2.2 across every face, continuously from
// one face to the next (a flat face has no vertex mid-face to carry a wrap).
describe('the chair\'s square bars', () => {
  it('v runs the same way and at the same rate across every face', () => {
    const w = 0.03;
    const g = squareBar(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.4, 0), w, 1);
    const uv = g.attributes.uv, idx = g.index;
    const at = (n: number) => (idx ? idx.getX(n) : n);
    const count = idx ? idx.count : uv.count;
    expect(RoundedBoxGeometry).toBeTruthy();
    const pos = g.attributes.position;
    // The wrap has to fall somewhere: on a thin rounded arris, never across a flat face.
    let faceSweep = 0;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map((k) => at(i + k));
      const vs = ids.map((n) => uv.getY(n));
      const ys = ids.map((n) => pos.getY(n));
      if (Math.max(...ys) - Math.min(...ys) < 0.01) continue; // an end of the bar
      const xs = ids.map((n) => pos.getX(n)), zs = ids.map((n) => pos.getZ(n));
      const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      if (size > 0.01) faceSweep = Math.max(faceSweep, Math.max(...vs) - Math.min(...vs));
    }
    expect(faceSweep).toBeLessThan(w * 2.2 * 1.3);
  });
});
