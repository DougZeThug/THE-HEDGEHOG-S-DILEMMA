import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { breath, blink, gust, hash01 } from '../src/memory/living/performance';
import { WOODLAND as SPEC } from '../src/memory/living/woodland';
import { compose, FULL } from '../src/memory/compose';
import { coverQuad, squareToQuad, visiblePart } from '../src/world/living/Immersion';
import { useInitialState, sheetSource } from '../src/memory/theatre';
import { memorySchema } from '../src/memory/sheets';
import { MEMORIES, sheetId } from '../src/memory/defs';
import { MemoryPlaybackController } from '../src/memory/MemoryPlaybackController';
import { renderCicadas, renderWoods, renderGrass, renderLast, cicada, RATE, TIMES } from '../src/memory/synthWoods';
import state from '../src/memory/theatre-state.json';

// The woodland memory (docs/reviews/2026-10-woodland.md): its people's involuntary life, the
// rules it composes by, the way into it, and its ending: a cut, on one frame.

describe('their involuntary life, from time alone', () => {
  it('breathing is deterministic, seekable, and never a metronome', () => {
    const a = SPEC.breath.a;
    const xs = Array.from({ length: 600 }, (_, i) => breath(i * 0.1, a));
    // The same t, the same chest, forward or back.
    expect(breath(17.3, a)).toBe(breath(17.3, a));
    expect(Array.from({ length: 600 }, (_, i) => breath((599 - i) * 0.1, a)).reverse()).toEqual(xs);
    // Breaths in (rising through 0.5) are not evenly spaced.
    const ups: number[] = [];
    for (let i = 1; i < xs.length; i++) if (xs[i - 1] < 0.5 && xs[i] >= 0.5) ups.push(i * 0.1);
    const gaps = ups.slice(1).map((u, i) => u - ups[i]);
    expect(gaps.length).toBeGreaterThan(8);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.6);
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(0), expect(x).toBeLessThan(1.4);
  });

  it('the two of them breathe differently (never in step)', () => {
    let same = 0;
    for (let t = 0; t < 60; t += 0.1) if (Math.abs(breath(t, SPEC.breath.a) - breath(t, SPEC.breath.b)) < 0.05) same++;
    expect(same / 600).toBeLessThan(0.25);
  });

  it("his breath is held off when their hands touch (a missed breath, not a sigh)", () => {
    const held = SPEC.breath.a.held![0];
    const free = { ...SPEC.breath.a, held: [] };
    let missed = 0;
    for (let t = held.at; t < held.at + held.span + 3; t += 0.05) if (breath(t, SPEC.breath.a) < breath(t, free) - 0.2) missed++;
    expect(missed).toBeGreaterThan(0);
  });

  it('a blink is quick, shut for a moment, and only where authored', () => {
    const at = SPEC.blinks.a[0];
    expect(blink(at - 0.01, SPEC.blinks.a)).toBe(0);
    expect(blink(at + 0.07, SPEC.blinks.a)).toBe(1);
    expect(blink(at + 0.3, SPEC.blinks.a)).toBe(0);
  });

  it('the gust crosses the clearing left to right and settles', () => {
    const g = SPEC.gusts[0];
    const a = gust(g.at + 0.3, SPEC.gusts), b = gust(g.at + 1.2, SPEC.gusts);
    expect(b.front).toBeGreaterThan(a.front);
    expect(gust(g.at + g.cross * 3, SPEC.gusts).strength).toBe(0);
    expect(hash01(3, 7)).toBe(hash01(3, 7));
  });
});

describe('a living memory composes in order', () => {
  const base = { 'scene.immerse': 1, 'scene.people': 1, 'layer:scene.opacity': 1, 'window.reveal': 1, 'window.presence': 1 };
  it('let go early: the people first, then the way in reverses, the wall painting last', () => {
    const at = (exit: number) => compose(base, { emerge: 1, exit, dissolve: 0.4 }, FULL, true);
    const mid = at(0.6);
    expect(mid['scene.people']).toBeLessThan(0.2);
    expect(mid['scene.immerse']).toBeGreaterThan(0.6);
    expect(mid['layer:scene.opacity']).toBe(1);
    const late = at(0.2);
    expect(late['scene.immerse']).toBe(0);
    expect(late['layer:scene.opacity']).toBeGreaterThan(0.4);
    // Its withdrawal is authored: the dissolve doesn't take its colour.
    expect(at(1)['window.reveal']).toBe(1);
  });
  it('gentle intensity still goes all the way in', () => {
    expect(compose(base, { emerge: 1, exit: 1 }, { ...FULL, presence: 0.6 }, true)['scene.immerse']).toBe(1);
  });
});

describe('the way in: one homography from the wall to the view', () => {
  it('maps the painting square to its quad, corner for corner', () => {
    const q = [new THREE.Vector2(0.2, 0.3), new THREE.Vector2(0.7, 0.25), new THREE.Vector2(0.75, 0.8), new THREE.Vector2(0.15, 0.7)];
    const m = squareToQuad(q);
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
      const p = new THREE.Vector3(u, v, 1).applyMatrix3(m);
      expect(p.x / p.z).toBeCloseTo(q[i].x, 6);
      expect(p.y / p.z).toBeCloseTo(q[i].y, 6);
    });
  });
  it('covers any screen, keeping the focus as central as the painting allows', () => {
    for (const aspect of [0.46, 0.75, 1.33, 1.78, 2.33]) {
      const c = coverQuad(aspect, 16 / 9, [0.37, 0.5]);
      expect(c[0].x).toBeLessThanOrEqual(0);
      expect(c[0].y).toBeLessThanOrEqual(0);
      expect(c[2].x).toBeGreaterThanOrEqual(1);
      expect(c[2].y).toBeGreaterThanOrEqual(1);
    }
    // Upright, only a column of it is seen: the one with the two of them.
    const up = coverQuad(0.46, 16 / 9, [0.37, 0.5]);
    const inv = squareToQuad(up).invert();
    const v = visiblePart(inv, new THREE.Vector3(0.5, 0.5, 1), new THREE.Vector4());
    expect(v.z).toBeLessThan(0.35);
    expect(v.x).toBeLessThan(0.37);
    expect(v.x + v.z).toBeGreaterThan(0.37);
  });
});

describe('the ending: a cut, on one frame', () => {
  useInitialState(state as never);
  const def = MEMORIES.woodland;
  const src = sheetSource(sheetId('woodland', 'afternoon'), memorySchema(def.layers, true), { sections: def.sections, markers: def.markers });
  const CUT = 31.5;

  it('the afternoon and the two of them until it; the same place later, empty, from it', () => {
    const before = src.at(CUT - 1 / 60);
    const after = src.at(CUT);
    expect(before['scene.people']).toBe(1);
    expect(before['scene.after']).toBe(0);
    expect(after['scene.people']).toBe(0);
    expect(after['scene.after']).toBe(1);
    // Nothing in between: no frame is half there.
    for (let t = CUT - 2; t < CUT + 2; t += 1 / 60) {
      const v = src.at(t);
      expect([0, 1]).toContain(v['scene.people']);
      expect([0, 1]).toContain(v['scene.after']);
    }
    // The view doesn't move across it: inside before and after.
    expect(before['scene.immerse']).toBe(1);
    expect(after['scene.immerse']).toBe(1);
  });

  it('seeking back across it brings them back; forward past it, they are gone', () => {
    expect(src.at(CUT + 5)['scene.people']).toBe(0);
    expect(src.at(CUT - 5)['scene.people']).toBe(1);
    expect(src.at(CUT + 0.5)['scene.after']).toBe(1);
    expect(src.at(10)['scene.after']).toBe(0);
  });

  it('the empty clearing is held 6–8 s before the way out begins', () => {
    const exit = src.sections.exit;
    expect(exit - CUT).toBeGreaterThanOrEqual(6);
    expect(exit - CUT).toBeLessThanOrEqual(8);
    expect(src.at(exit - 0.01)['scene.immerse']).toBe(1);
    expect(src.at(exit + 2)['scene.immerse']).toBeLessThan(1);
  });

  it('played through the controller, the cut lands on a single step', () => {
    const c = new MemoryPlaybackController({ timeline: src, weights: FULL, reduced: false, entrance: 2, sways: [], exit: def.exit, maxHold: 60, tail: 0, living: true });
    c.start();
    let prev = 1, flips = 0, halfway = 0;
    for (let t = 0; t < 37; t += 1 / 60) {
      const f = c.step(1 / 60)!;
      const p = f.final['scene.people'];
      if (p !== prev) flips++;
      if (p > 0 && p < 1 && f.t > 20) halfway++;
      prev = p;
    }
    expect(flips).toBe(1);
    expect(halfway).toBe(0);
    c.dispose(0);
  });
});

describe('the woodland, heard', () => {
  const energy = (x: Float32Array, a: number, b: number) => {
    let e = 0;
    for (let i = Math.floor(a * RATE); i < Math.floor(b * RATE); i++) e += x[i] * x[i];
    return e / ((b - a) * RATE);
  };
  it('the cicada over them falls quiet while the hand moves, and sings straight across the cut', () => {
    const [x] = renderCicadas(0);
    expect(energy(x, 16, 24.5)).toBeLessThan(energy(x, 11, 14) * 0.01);
    // Across the cut (31.5 s): sounding just before and just after, unchanged.
    expect(energy(x, 30.5, 31.5)).toBeGreaterThan(energy(x, 11, 14) * 0.2);
    expect(energy(x, 31.5, 32.5)).toBeGreaterThan(energy(x, 11, 14) * 0.2);
    expect(energy(x, 32.5, 33.5) / energy(x, 30.5, 31.5)).toBeGreaterThan(0.5);
    expect(x.length).toBe(Math.ceil(TIMES.length * RATE));
  });
  it('the clearing carries on across the cut (no hole, no swell, on that second)', async () => {
    const [l, r] = await renderWoods(0);
    const e = (a: number, b: number) => energy(l, a, b) + energy(r, a, b);
    const before = e(30.5, 31.5);
    // The afternoon carries on unchanged a few seconds past the cut (the picture says later first).
    for (const [a, b] of [[31.5, 32.5], [32.5, 33.5], [33.5, 34.5]]) {
      expect(e(a, b) / before).toBeGreaterThan(0.6);
      expect(e(a, b) / before).toBeLessThan(1.6);
    }
  });
  it("a cicada's phrase swells in and falls away, never a gated tone", () => {
    const x = new Float32Array(8 * RATE);
    cicada(x, { f: 5200, q: 3, pulse: 230, beat: 2.6, seed: 1 }, 1, 7, () => 1);
    expect(energy(x, 0, 1)).toBe(0);
    expect(energy(x, 1, 1.15)).toBeLessThan(energy(x, 3, 5) * 0.1);
    expect(energy(x, 6.85, 7)).toBeLessThan(energy(x, 3, 5) * 0.1);
  });
  it('grass is short and quiet; the last evening cicada is one call', () => {
    const [g] = renderGrass(0);
    expect(g.length / RATE).toBeLessThan(2);
    let pk = 0;
    for (const v of g) pk = Math.max(pk, Math.abs(v));
    expect(pk).toBeCloseTo(10 ** (-12 / 20), 3);
    expect(renderLast()[0].length / RATE).toBeLessThan(7);
  });
});
