import { describe, it, expect } from 'vitest';
import { seedState } from '../src/memory/seed';
import { useInitialState, sheetSource, sheetMarkers } from '../src/memory/theatre';
import { MemoryPlaybackController } from '../src/memory/MemoryPlaybackController';
import { FULL } from '../src/memory/compose';

const state = seedState({
  probe: {
    tracks: {
      'window.reveal': [[0, 0], [4, 1]],
      'light.intensity': [[0, 0], [5, 1], [12, 1], [14, 0.2]],
      'layer:bowl.opacity': [[2, 0, 'linear'], [3, 1], [5, 1]],
      'window.parallax': [[0, 0.3]],
    },
    markers: [
      { label: 'active', position: 5 },
      { label: 'exit', position: 12 },
      { label: 'residue', position: 15 },
      { label: 'end', position: 18 },
      { label: 'sfx:spoon', position: 6.5 },
      { label: 'bed:kitchen', position: 3 },
    ],
  },
});
useInitialState(state);
const schema = {
  window: { reveal: [0, 0, 1], parallax: [0, 0, 1] },
  light: { intensity: [0, 0, 3] },
  'layer:bowl': { opacity: [0, 0, 1] },
} as const;
const FALLBACK = { sections: { active: 1, exit: 2, residue: 3, end: 4 }, markers: [] };

describe('Theatre.js as the authored timeline', () => {
  it('reads sections and sound markers from the committed state, with fallbacks', () => {
    const m = sheetMarkers('probe', FALLBACK);
    expect(m.sections).toEqual({ active: 5, exit: 12, residue: 15, end: 18 });
    expect(m.markers.map((x) => x.label)).toEqual(['bed:kitchen', 'sfx:spoon']);
    expect(sheetMarkers('missing', FALLBACK).sections).toEqual(FALLBACK.sections);
  });

  it('values follow the position synchronously, both ways, including static ones', () => {
    const src = sheetSource('probe', schema as never, FALLBACK);
    const a = src.at(2);
    expect(a['window.reveal']).toBeGreaterThan(0.2);
    expect(a['window.reveal']).toBeLessThan(0.8);
    expect(src.at(4)['window.reveal']).toBeCloseTo(1, 5);
    expect(src.at(2.5)['layer:bowl.opacity']).toBeCloseTo(0.5, 5); // a linear key
    expect(src.at(2)['window.reveal']).toBe(a['window.reveal']);
    expect(src.at(9)['window.parallax']).toBeCloseTo(0.3, 6);
    expect(src.at(13)['light.intensity']).toBeLessThan(1);
  });

  it('production reproduces the authored sequence through the controller, without Studio', () => {
    const src = sheetSource('probe', schema as never, FALLBACK);
    const c = new MemoryPlaybackController({ timeline: src, weights: FULL, reduced: false, entrance: 0.5, sways: [], exit: 1, maxHold: 60, tail: 0 });
    c.start();
    const seen: number[] = [];
    for (let t = 0; t < 5.5; t += 0.5) seen.push(+c.step(0.5)!.base['window.reveal'].toFixed(4));
    // The same as reading the sheet directly at those positions.
    const direct: number[] = [];
    for (let p = 0.5; p < 6; p += 0.5) direct.push(+src.at(p)['window.reveal'].toFixed(4));
    expect(seen.slice(0, 8)).toEqual(direct.slice(0, 8));
    c.dispose(0);
  });
});
