import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { breath, blinkDrawing, gust, hash01, windForce, windResponse, windDrift } from '../src/memory/living/performance';
import { WOODLAND as SPEC } from '../src/memory/living/woodland';
import { compose, FULL } from '../src/memory/compose';
import { coverQuad, squareToQuad, visiblePart } from '../src/world/living/Immersion';
import { useInitialState, sheetSource } from '../src/memory/theatre';
import { memorySchema } from '../src/memory/sheets';
import { MEMORIES, sheetId } from '../src/memory/defs';
import { MemoryPlaybackController } from '../src/memory/MemoryPlaybackController';
import { renderCicadas, renderWoods, renderGrass, renderLast, cicada, RATE, TIMES } from '../src/memory/synthWoods';
import state from '../src/memory/theatre-state.json';
import manifest from '../public/memories/woodland/manifest.json';
import { LivingScene, celOf, type Closeup, type LivingArt } from '../src/memory/living/LivingScene';
import { DEFORMERS, livingMaterials } from '../src/world/living/materials';

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

  it('at the cut both are between breaths (still for more than half a second before it)', () => {
    for (const p of [SPEC.breath.a, SPEC.breath.b]) {
      const at = breath(34.5, p);
      for (let t = 33.9; t <= 34.5; t += 0.02) expect(Math.abs(breath(t, p) - at)).toBeLessThan(0.02);
    }
  });

  it("his breath is held off when their hands touch (a missed breath, not a sigh)", () => {
    const held = SPEC.breath.a.held![0];
    const free = { ...SPEC.breath.a, held: [] };
    let missed = 0;
    for (let t = held.at; t < held.at + held.span + 3; t += 0.05) if (breath(t, SPEC.breath.a) < breath(t, free) - 0.2) missed++;
    expect(missed).toBeGreaterThan(0);
  });

  it('a blink is drawn on twos (half, shut, half), only where authored, only in the wides, never before the cut', () => {
    const at = SPEC.blinks.a[0];
    expect(blinkDrawing(at - 0.01, SPEC.blinks.a)).toBe(0);
    expect(blinkDrawing(at + 0.04, SPEC.blinks.a)).toBe(0.5);
    expect(blinkDrawing(at + 0.12, SPEC.blinks.a)).toBe(1);
    expect(blinkDrawing(at + 0.2, SPEC.blinks.a)).toBe(0.5);
    expect(blinkDrawing(at + 0.3, SPEC.blinks.a)).toBe(0);
    for (const b of [...SPEC.blinks.a, ...SPEC.blinks.b]) {
      // In the first wide (to 16.5 s) or the second (from 28.5 s), and not in its last 2 s;
      // nothing in the first second after a cut.
      expect(b < 16.3 || (b > 28.5 && b < 32.5)).toBe(true);
      for (const cut of [10.5, 28.5]) expect(b < cut || b > cut + 1).toBe(true);
    }
  });

  it('the gust crosses the clearing left to right and settles', () => {
    const g = SPEC.gusts[0];
    const a = gust(g.at + 0.3, SPEC.gusts), b = gust(g.at + 1.2, SPEC.gusts);
    expect(b.front).toBeGreaterThan(a.front);
    expect(gust(g.at + g.cross * 3, SPEC.gusts).strength).toBe(0);
    expect(hash01(3, 7)).toBe(hash01(3, 7));
  });
});

describe('the air, which moves everything (one wind, seekable)', () => {
  const G = SPEC.gusts;
  it('a spring answers it as a spring would, however its time was reached', () => {
    for (const [hz, z] of [[0.7, 0.5], [1.2, 0.3], [0.45, 0.6]]) {
      // Simulated from long before (steady), step by step, against the closed form.
      let y = 0, v = 0, err = 0;
      const wn = 2 * Math.PI * hz, dt = 1 / 500;
      for (let t = -60; t < 36; t += dt) {
        const a = wn * wn * (windForce(t, 0.3, G) - y) - 2 * z * wn * v;
        v += a * dt;
        y += v * dt;
        if (t > 0) err = Math.max(err, Math.abs(y - windResponse(t + dt, 0.3, hz, z, G)));
      }
      expect(err).toBeLessThan(0.06);
    }
  });
  it('what it carries has moved by the integral of it', () => {
    let p = 0;
    for (let t = 0; t < 35; t += 1 / 1000) p += windForce(t + 1 / 2000, 0.6, G) / 1000;
    expect(Math.abs(p - windDrift(35, 0.6, G))).toBeLessThan(0.01);
  });
  it('three gusts: one in each wide, none in the close-ups or the stillness before the cut, one over the empty grass', () => {
    expect(G.length).toBe(3);
    for (let t = 15.6; t < 30.3; t += 0.05) expect(gust(t, G).strength).toBe(0);
    for (let t = 32.7; t < 34.5; t += 0.05) expect(gust(t, G).strength).toBe(0);
    expect(gust(31.0, G).strength).toBeGreaterThan(0);
    expect(gust(37.5, G).strength).toBeGreaterThan(0);
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
  const CUT = 34.5;

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
    for (let t = 0; t < 40; t += 1 / 60) {
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

describe('the close-ups: the artist\'s drawings, cut on keys', () => {
  // (The committed timeline: the state was set for the cut's tests, above.)
  const def = MEMORIES.woodland;
  const src = sheetSource(sheetId('woodland', 'afternoon'), memorySchema(def.layers, true), { sections: def.sections, markers: def.markers });

  it('a drawing not made yet holds the one before; the first is the base itself', () => {
    const c = { cells: [-1, 0, null, 1, null, 2] };
    expect([0, 1, 2, 3, 4, 5].map((k) => celOf(c, k))).toEqual([-1, 0, 0, 1, 1, 2]);
    expect(celOf(c, 9)).toBe(2);
    expect(celOf({ cells: [-1, null, null] }, 2)).toBe(-1); // a stand-in: its one drawing, held
  });

  it('each change is a whole drawing (a cut), and nothing changes in a shot\'s first 0.9 s', () => {
    const starts = [16.5, 20.5, 25.1];
    for (let i = 0; i < 3; i++) {
      const end = i < 2 ? starts[i + 1] : 28.5;
      let prev = src.at(starts[i])['scene.cel'], first = Infinity;
      expect(prev).toBe(0);
      for (let t = starts[i]; t < end - 1e-6; t += 1 / 120) {
        const v = src.at(t);
        expect(Number.isInteger(v['scene.cel'])).toBe(true);
        expect(v['scene.shot']).toBe(i + 1);
        if (v['scene.cel'] !== prev) first = Math.min(first, t - starts[i]);
        prev = v['scene.cel'];
      }
      expect(first).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('the shot is chosen before it is drawn; turned from a close-up, it is the wide for the rest of that shot', () => {
    const tex = () => new THREE.Texture();
    const cu: Closeup = { base: tex(), cels: tex(), cells: [-1, 0, null, 1], grid: [2, 1], rect: [0.2, 0.3, 0.4, 0.5], focus: [0.4, 0.6], breath: 'a', chest: [0.5, 0.1, 0.3, 0.2], size: [1920, 1080] };
    const lm = manifest.living.afternoon;
    const s = new LivingScene(
      { plate: tex(), maps: tex(), grade: null, after: null, sky: null, flowers: null, clouds: null, size: manifest.plate as [number, number], closeups: [cu, null],
        figures: { ...(lm.figures as unknown as NonNullable<LivingArt['figures']>), texture: tex(), lids: tex() } },
      SPEC, { width: 64, height: 36, noise: tex(), reduced: false },
    );
    const gl = { getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {} } as unknown as THREE.WebGLRenderer;
    const m = livingMaterials(tex());
    const draw = (t: number, v: Record<string, number>) => s.update(gl, t, v, { view: new THREE.Vector4(0, 0, 1, 1), parallax: new THREE.Vector2() });
    const inside = { inside: true, turned: false };
    expect(s.choose({ 'scene.shot': 1, 'scene.cel': 1 }, inside)).toBe(1);
    draw(17, { 'scene.shot': 1, 'scene.cel': 1 });
    expect(m.frame.uniforms.uFrame.value).toBe(cu.base);
    expect((m.frame.uniforms.uCel.value as THREE.Vector4).toArray()).toEqual([0, 0, 0.5, 1]);
    // Its third drawing isn't made: the second holds. Its fourth: the atlas's second cell.
    s.choose({ 'scene.shot': 1, 'scene.cel': 2 }, inside);
    draw(17.5, { 'scene.shot': 1, 'scene.cel': 2 });
    expect((m.frame.uniforms.uCel.value as THREE.Vector4).toArray()).toEqual([0, 0, 0.5, 1]);
    s.choose({ 'scene.shot': 1, 'scene.cel': 3 }, inside);
    draw(18, { 'scene.shot': 1, 'scene.cel': 3 });
    expect((m.frame.uniforms.uCel.value as THREE.Vector4).toArray()).toEqual([0.5, 0, 0.5, 1]);
    // Breathing (his), on the chest.
    expect(m.frame.uniforms.uBreathe.value).toBeGreaterThanOrEqual(0);
    expect((m.frame.uniforms.uChest.value as THREE.Vector4).toArray()).toEqual(cu.chest);
    // Turned away: the wide, and it stays the wide until the next shot.
    expect(s.choose({ 'scene.shot': 1, 'scene.cel': 3 }, { inside: true, turned: true })).toBe(0);
    expect(s.choose({ 'scene.shot': 1, 'scene.cel': 3 }, inside)).toBe(0);
    // A close-up that couldn't be had is the wide.
    expect(s.choose({ 'scene.shot': 2, 'scene.cel': 0 }, inside)).toBe(0);
    expect(s.choose({ 'scene.shot': 0 }, inside)).toBe(0);
    expect(s.choose({ 'scene.shot': 1, 'scene.cel': 0 }, inside)).toBe(1);
    // Not inside (seen on the wall, or not yet in, as on a jump straight into the shot): the
    // wide, until they are.
    expect(s.choose({ 'scene.shot': 1, 'scene.cel': 0 }, { inside: false, turned: false })).toBe(0);
    expect(s.choose({ 'scene.shot': 1, 'scene.cel': 0 }, inside)).toBe(1);
    s.dispose();
    expect(m.frame.uniforms.uFrame.value).toBe(m.empty);
    expect(m.frame.uniforms.uCels.value).toBe(m.empty);
  });
});

describe('the woodland, heard', () => {
  const energy = (x: Float32Array, a: number, b: number) => {
    let e = 0;
    for (let i = Math.floor(a * RATE); i < Math.floor(b * RATE); i++) e += x[i] * x[i];
    return e / ((b - a) * RATE);
  };
  it('the cicada over them falls quiet for the close-ups, and sings straight across the cut', () => {
    const [x] = renderCicadas(0);
    expect(energy(x, 17, 28)).toBeLessThan(energy(x, 11, 14) * 0.01);
    // Across the cut (34.5 s): sounding just before and just after, unchanged.
    expect(energy(x, 33.5, 34.5)).toBeGreaterThan(energy(x, 11, 14) * 0.2);
    expect(energy(x, 34.5, 35.5)).toBeGreaterThan(energy(x, 11, 14) * 0.2);
    expect(energy(x, 35.5, 36.5) / energy(x, 33.5, 34.5)).toBeGreaterThan(0.5);
    expect(x.length).toBe(Math.ceil(TIMES.length * RATE));
  });
  it('the clearing carries on across the cut (no hole, no swell, on that second)', async () => {
    const [l, r] = await renderWoods(0);
    const e = (a: number, b: number) => energy(l, a, b) + energy(r, a, b);
    const before = e(33.5, 34.5);
    // The afternoon carries on unchanged past the cut (the picture says later first): its first
    // second (the gust over the empty grass is heard from ~35.5 s).
    for (const [a, b] of [[34.5, 35.5]]) {
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

describe('the scene, as built (no GL: what it would draw and let go)', () => {
  const lm = manifest.living.afternoon;
  const tex = () => new THREE.Texture();
  const art = (): LivingArt => ({
    plate: tex(),
    maps: tex(),
    grade: null,
    after: tex(),
    sky: null,
    flowers: { texture: tex(), heads: lm.flowers.heads as [number, number, number][] },
    clouds: { mask: tex(), day: tex(), after: tex(), box: lm.clouds.box as [number, number, number, number], pad: lm.clouds.pad },
    figures: { ...(lm.figures as unknown as NonNullable<LivingArt['figures']>), texture: tex(), lids: tex() },
    size: manifest.plate as [number, number],
  });
  const make = (o: { reduced?: boolean; low?: boolean } = {}) =>
    new LivingScene(art(), SPEC, { width: 64, height: 36, noise: tex(), reduced: !!o.reduced, low: o.low });

  it('every deformer the manifest names fits, and the shared program stays inside WebGL2\'s vertex uniforms', () => {
    expect(lm.figures.deformers.length).toBeLessThanOrEqual(DEFORMERS);
    // Vertex stage vec4s: the deformers, the wind, the drift (floats pad to a vec4 each), the
    // matrices, and a margin for the scalars.
    expect(DEFORMERS * 4 + 16 + 16 + 8 + 16).toBeLessThanOrEqual(256);
  });

  it('the puppet is lighter on the low tier, and fewer motes under reduced motion', () => {
    const verts = (s: LivingScene) => ((s as unknown as { grid: THREE.BufferGeometry }).grid.getAttribute('position').count);
    const full = make(), low = make({ low: true });
    expect(verts(low)).toBeLessThan(verts(full) * 0.5);
    expect(verts(full)).toBeLessThan(20000);
    full.dispose();
    low.dispose();
    const m = livingMaterials(tex());
    make({ reduced: true });
    expect(m.air.uniforms.uCount.value).toBeLessThanOrEqual(Math.ceil(SPEC.air.motes / 3));
    make();
    expect(m.air.uniforms.uCount.value).toBe(SPEC.air.motes);
  });

  it('lets go of everything it made (twice is safe), and leaves the shared materials holding nothing', () => {
    const s = make();
    const geos = ['grid', 'strips', 'air', 'quad'].map((k) => (s as unknown as Record<string, THREE.BufferGeometry>)[k]);
    let freed = 0;
    for (const g of geos) g.addEventListener('dispose', () => freed++);
    s.dispose();
    s.dispose();
    expect(freed).toBe(4);
    const m = livingMaterials(tex());
    for (const mat of [m.plate, m.people, m.flowers, m.air])
      for (const k of ['uPlate', 'uFigures', 'uFlowers', 'uClouds', 'uSkyMask']) expect(mat.uniforms[k].value).toBe(m.empty);
  });
});
