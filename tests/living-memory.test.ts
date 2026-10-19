import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CANOPY, breath, blinkDrawing, gust, hash01, windForce, windResponse, windDrift } from '../src/memory/living/performance';
import { WASH, washInputs, washOf } from '../src/world/living/wash';
import { MemoryWindow } from '../src/world/MemoryWindow';
import { WOODLAND as SPEC } from '../src/memory/living/woodland';
import { compose, FULL, weightsFor } from '../src/memory/compose';
import { coverQuad, squareToQuad, visiblePart } from '../src/world/living/Immersion';
import { useInitialState, sheetSource } from '../src/memory/theatre';
import { memorySchema } from '../src/memory/sheets';
import { BREEZE_KEYS, CUT as CUT_AT, MEMORIES, SHOTS, TURN_EYES, TURN_STEPS, TWO_SHOT, sheetId } from '../src/memory/defs';
import { SCENE_MEMORIES } from '../src/content/memories';
import { MemoryPlaybackController } from '../src/memory/MemoryPlaybackController';
import { renderCicadas, renderWoods, renderLast, cicada, heard, leavesPan, midPhrases, RATE, TIMES } from '../src/memory/synthWoods';
import state from '../src/memory/theatre-state.json';
import manifest from '../public/memories/woodland/manifest.json';
import { LivingScene, headFor, type HeadCels, type LivingArt, type NearArt } from '../src/memory/living/LivingScene';
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

  it('nothing in their breathing answers either look (no held breath: its pauses are for the cut)', () => {
    for (const p of [SPEC.breath.a, SPEC.breath.b]) {
      const free = { ...p, held: [] };
      for (let t = TWO_SHOT.herEyes - 0.5; t < TWO_SHOT.to + 0.5; t += 0.05) expect(Math.abs(breath(t, p) - breath(t, free)), `${t.toFixed(2)} s`).toBeLessThan(0.02);
      // Nor a long pause: a chest still for more than a second while one of them looks at the
      // other reads as a held breath (his fell exactly in her look, 18.8–21.3 s).
      for (const [from, to] of [[TWO_SHOT.herEyes, TWO_SHOT.to]]) {
        let still = 0, longest = 0;
        for (let t = from; t <= to; t += 0.05) longest = Math.max(longest, (still = breath(t, p) < 0.005 ? still + 0.05 : 0));
        expect(longest, `${from}–${to} s`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a blink is drawn on twos (half, shut, half), only where authored, only in the wides, never before the cut', () => {
    const at = SPEC.blinks.a[0];
    expect(blinkDrawing(at - 0.01, SPEC.blinks.a)).toBe(0);
    expect(blinkDrawing(at + 0.04, SPEC.blinks.a)).toBe(0.5);
    expect(blinkDrawing(at + 0.12, SPEC.blinks.a)).toBe(1);
    expect(blinkDrawing(at + 0.2, SPEC.blinks.a)).toBe(0.5);
    expect(blinkDrawing(at + 0.3, SPEC.blinks.a)).toBe(0);
    for (const b of [...SPEC.blinks.a, ...SPEC.blinks.b]) {
      // Not within half a second of a cut, nor in a shot's first second; not in the stillness
      // before the dusk cut; never during either look (a blink then reads as a reaction), and
      // their looks hold to the cut.
      for (const cut of [10.5, SHOTS.two, SHOTS.wideAgain]) expect(b + 0.25 < cut - 0.5 || b > cut + 1).toBe(true);
      expect(b).toBeLessThan(CUT_AT - 2);
      expect(b + 0.25).toBeLessThan(TWO_SHOT.herEyes);
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
  it('one gust, in the first wide, settled (as seen, everywhere across the clearing) before the cut to them; none in the second, none after the cut', () => {
    expect(G.length).toBe(1);
    // What each gust adds to anything on a spring (grass, flowers, the canopy, locks of hair).
    const springs = [[0.7, 0.5], [1.2, 0.3], [...CANOPY], [1.3, 0.35], [0.9, 0.45], [1.6, 0.3]];
    const seen = (t: number, g: (typeof G)[number]) => {
      let m = 0;
      for (let x = 0; x <= 1.0001; x += 0.1) for (const [hz, z] of springs) m = Math.max(m, Math.abs(windResponse(t, x, hz, z, [g]) - windResponse(t, x, hz, z, [])));
      return m;
    };
    const peak = (g: (typeof G)[number]) => Math.max(...Array.from({ length: 160 }, (_, i) => seen(g.at + i * 0.05, g)));
    // (Settled for the last 0.8 s before the cut to them; under 4% of its peak by the cut itself,
    // the canopy's slow sway all that is left of it.)
    const p = peak(G[0]);
    for (let t = SHOTS.two - 0.8; t < SHOTS.two; t += 0.05) expect(seen(t, G[0]), `${t.toFixed(2)} s`).toBeLessThan(0.08 * p);
    expect(seen(SHOTS.two, G[0])).toBeLessThan(0.04 * p);
    // (None from a second before the second wide to the end: its stillness, and the cut's.)
    for (let t = SHOTS.wideAgain - 1; t < 53; t += 0.05) expect(gust(t, G).strength).toBe(0);
  });
  it('nothing the air does starts in a shot\'s first second', () => {
    const starts = [10.5, SHOTS.two, SHOTS.wideAgain, CUT_AT];
    for (const at of G.map((g) => g.at))
      for (const s of starts) expect(at < s || at >= s + 1, `${at} s, after the shot at ${s} s`).toBe(true);
  });
  it('what is heard of a gust (the sound itself) swells and settles with the canopy it moves, a moment before it is seen', () => {
    const g = G[0];
    const sway = (t: number) => windResponse(t, 0.5, CANOPY[0], CANOPY[1], [g], 0);
    let seenAt = 0, heardAt = 0, top = 0, topHeard = 0;
    for (let t = g.at; t < g.at + 6; t += 0.01) {
      if (sway(t) > top) (top = sway(t)), (seenAt = t);
      const h = heard(t).strength;
      if (h > topHeard) (topHeard = h), (heardAt = t);
    }
    expect(seenAt - heardAt).toBeCloseTo(0.4, 1);
    // A full gust is heard nearly full (a quick one moves the slow canopy a little less); nothing
    // is heard of the gusts in the stillness.
    expect(topHeard).toBeGreaterThan(0.8);
    expect(topHeard).toBeLessThanOrEqual(1);
    for (let t = SHOTS.wideAgain; t < CUT_AT; t += 0.1) expect(heard(t).strength).toBe(0);
  });
  it('the leaves are heard moving across with the gust and back to the middle as it dies, never jumping', () => {
    const dt = 64 / RATE;
    let prev = leavesPan(0), most = 0;
    for (let t = dt; t < TIMES.length; t += dt) {
      const p = leavesPan(t);
      most = Math.max(most, Math.abs(p - prev));
      prev = p;
    }
    expect(most).toBeLessThanOrEqual(0.02);
    expect(Math.abs(leavesPan(G[0].at - 1))).toBe(0);
    // It starts on the left with the near oak and goes right with its front.
    expect(leavesPan(G[0].at + 0.4)).toBeLessThan(-0.3);
    expect(leavesPan(G[0].at + 1.5)).toBeGreaterThan(0.3);
  });
  it("the sound's times are the picture's", () => {
    expect(TIMES.cut).toBe(CUT_AT);
    expect(TIMES.breeze).toBe(BREEZE_KEYS);
    // The near cicada and the two either side are quiet while the two of them are close, never
    // within 0.7 s of a cut.
    const [, first, last] = TIMES.near;
    expect(first[1]).toBeLessThanOrEqual(SHOTS.two - 0.7);
    expect(last[0]).toBeGreaterThanOrEqual(SHOTS.wideAgain + 0.7);
    expect(TIMES.midQuiet[0]).toBeLessThan(SHOTS.two);
    expect(TIMES.midQuiet[1]).toBeGreaterThan(SHOTS.wideAgain);
    // Held still across the cut, from before it to past the cicada's first seconds after it.
    expect(TIMES.stillAcross[0]).toBeLessThan(CUT_AT - 1);
    expect(TIMES.stillAcross[1]).toBeGreaterThan(CUT_AT + 3);
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

  it("let go early, the room's writing under the painting comes back as the painting goes, never after it", () => {
    // A line inside the painting where the colour has come.
    const box = { x: 0.2, y: 0.1, w: 1, h: 0.1 }, painting = { cx: 0, cy: 0, w: 3.2, h: 1.8 };
    for (const at of [7, 20]) {
      const c = new MemoryPlaybackController({ timeline: src, weights: FULL, reduced: false, entrance: 2, sways: [], exit: def.exit, maxHold: 60, tail: 0, living: true });
      c.start();
      for (let t = 0; t < at; t += 1 / 60) c.step(1 / 60);
      c.release('interrupt');
      let prev: number | null = null, gone = false;
      for (let k = 0; k < 60 * 12; k++) {
        const f = c.step(1 / 60);
        if (!f || f.state === 'complete') break;
        const presence = f.final['window.presence'] ?? 1;
        const w = washed(box, painting, () => 0.2, f.final);
        if (presence <= 0.02) (gone = true), expect(w, `${at} s, let go`).toBeLessThanOrEqual(0.02);
        if (prev !== null) expect(Math.abs(w - prev)).toBeLessThanOrEqual(0.1);
        prev = w;
      }
      expect(gone).toBe(true);
      c.dispose(0);
    }
  });

  it("played through, the writing stays a trace while the pencil stays, the colour gone, and comes back with the plaster", () => {
    const box = { x: 0.2, y: 0.1, w: 1, h: 0.1 }, painting = { cx: 0, cy: 0, w: 3.2, h: 1.8 };
    // (Held to the hold point and a little past it: then the memory ends as it was made to.)
    const c = new MemoryPlaybackController({ timeline: src, weights: FULL, reduced: false, entrance: 2, sways: [], exit: def.exit, maxHold: src.sections.exit + 1, tail: 0, living: true });
    c.start();
    let prev: number | null = null, coloured = false, pencilOnly = 0, plaster = 0;
    for (let k = 0; k < 60 * 80; k++) {
      const f = c.step(1 / 60);
      if (!f || f.state === 'complete') break;
      const reveal = f.final['window.reveal'] ?? 0, sketch = f.final['window.sketch'] ?? 0;
      const w = washed(box, painting, () => 0.2, f.final);
      if (reveal >= 0.99) coloured = true;
      // The colour gone, the pencil still there: the writing still a trace.
      if (coloured && reveal <= 0.01 && sketch >= 0.99) pencilOnly++, expect(w).toBeGreaterThanOrEqual(WASH * 0.99);
      // The pencil gone after it: the writing back, whole.
      if (coloured && sketch <= 0.01) plaster++, expect(w).toBeLessThanOrEqual(0.01);
      if (prev !== null) expect(Math.abs(w - prev)).toBeLessThanOrEqual(0.1);
      prev = w;
    }
    expect(pencilOnly).toBeGreaterThan(60);
    expect(plaster).toBeGreaterThan(0);
    c.dispose(0);
  });
});

/** As the App washes the writing (src/App.ts, `washUnderPainting`), from a frame's values. */
function washed(box: { x: number; y: number; w: number; h: number }, painting: { cx: number; cy: number; w: number; h: number }, colourAt: (u: number, v: number) => number, final: Record<string, number>) {
  const hold = Math.min(final['window.sketch'] ?? 0, final['window.wash'] ?? 0);
  return washOf(box, painting, colourAt, final['window.reveal'] ?? 0, final['window.presence'] ?? 1, hold);
}

describe("the room's writing under a living memory's painting", () => {
  const painting = { cx: 0, cy: 0, w: 3.2, h: 1.8 };
  const coloured = () => 0.3;
  it('goes to a trace where the colour has come, only as far as the painting is there', () => {
    expect(washOf({ x: 0, y: 0, w: 1, h: 0.1 }, painting, coloured, 1, 1)).toBeCloseTo(WASH, 6);
    expect(washOf({ x: 0, y: 0, w: 1, h: 0.1 }, painting, coloured, 0.1, 1)).toBe(0);
    expect(washOf({ x: 0, y: 0, w: 1, h: 0.1 }, painting, coloured, 1, 0.6)).toBeCloseTo(WASH * 0.6, 6);
    expect(washOf({ x: 0, y: 0, w: 1, h: 0.1 }, painting, coloured, 1, 0)).toBe(0);
  });
  it('a line half over the painting goes half way; one off it, or above or below it, not at all', () => {
    // Its middle just past the painting's right edge (1.6 m from the centre): two of its five
    // points on it.
    expect(washOf({ x: 1.65, y: 0, w: 1, h: 0.1 }, painting, coloured, 1, 1)).toBeCloseTo(WASH * 0.4, 6);
    expect(washOf({ x: 3, y: 0, w: 1, h: 0.1 }, painting, coloured, 1, 1)).toBe(0);
    expect(washOf({ x: 0, y: 1.2, w: 1, h: 0.1 }, painting, coloured, 1, 1)).toBe(0);
  });
  it('a line goes as soon as the colour comes to any of it, a little ahead of it, not once it has crossed it', () => {
    // The colour comes from the left: the line's left end (u 0.2) at 0.28, its right (u 0.8) at 0.76.
    const fromLeft = (u: number) => 0.12 + 0.8 * u;
    const box = { x: 0, y: 0, w: 2.4, h: 0.1 };
    const at = (reveal: number) => washOf(box, painting, fromLeft, reveal, 1);
    expect(at(0.14)).toBe(0);
    expect(at(0.22)).toBeGreaterThan(0);
    // Its left end coloured (0.28), its right far from it: the whole line gone.
    expect(at(0.32)).toBeCloseTo(WASH, 6);
    // (No caption over the colour: a line half washed, words still read over the two of them.)
    for (let r = 0.14; r < 1; r += 0.01) expect(at(r + 0.01)).toBeGreaterThanOrEqual(at(r));
  });
  it('held, it stays a trace after the colour has gone, as far as it is held and the painting is there', () => {
    const box = { x: 0, y: 0, w: 1, h: 0.1 };
    expect(washOf(box, painting, coloured, 0, 1, 1)).toBeCloseTo(WASH, 6);
    expect(washOf(box, painting, coloured, 0, 1, 0.5)).toBeCloseTo(WASH * 0.5, 6);
    expect(washOf(box, painting, coloured, 0, 0.5, 1)).toBeCloseTo(WASH * 0.5, 6);
    expect(washOf(box, painting, coloured, 0, 1, 0)).toBe(0);
    // Off the painting, held or not, it is never washed.
    expect(washOf({ x: 3, y: 0, w: 1, h: 0.1 }, painting, coloured, 0, 1, 1)).toBe(0);
  });
});

describe("which memories lie under the room's writing (the App's wiring, through washInputs)", () => {
  // (The committed timelines: the state was set for the cut's tests, above.)
  const box = { x: 0.2, y: 0.1, w: 1, h: 0.1 }, painting = { cx: 0, cy: 0, w: 3.2, h: 1.8 };
  const scenes = manifest.living as Record<string, unknown>;
  // Played as the App plays a memory (src/memory/runtime.ts, LivingMemory), to its end, its
  // writing washed as the App washes it (src/App.ts, washUnderPainting).
  const play = (id: string, variant: string, gentle = false) => {
    const def = MEMORIES[id];
    const src = sheetSource(sheetId(id, variant), memorySchema(def.layers, def.living), { sections: def.sections, markers: def.markers });
    const scene = def.living && scenes[variant] ? { colourAt: () => 0.2 } : null;
    const c = new MemoryPlaybackController({ timeline: src, weights: weightsFor(false, gentle), reduced: false, entrance: Math.min(2, src.sections.active * 0.4), sways: def.sways, exit: def.exit, maxHold: Math.max(def.maxHold, src.sections.exit), tail: def.tail, living: !!scene });
    c.start();
    const frames: { t: number; w: number; state: string }[] = [];
    for (let k = 0; k < 60 * 120; k++) {
      // (Its last frame is the residue's; then it completes, and gives no frame.)
      const f = c.step(1 / 60);
      if (!f) break;
      const m = washInputs(def, scene, f.final, c.weights.presence);
      frames.push({ t: f.t, w: m ? washOf(box, painting, m.colourAt, m.reveal, m.presence, m.hold) : 0, state: f.state });
    }
    const complete = c.state === 'complete';
    c.dispose(0);
    return Object.assign(frames, { complete });
  };

  it('every other memory keeps its words, on every frame of every variant', () => {
    let played = 0;
    for (const def of Object.values(MEMORIES)) {
      if (def.living) continue;
      for (const v of def.variants) {
        expect(washInputs(def, null, { 'window.reveal': 1, 'window.presence': 1, 'window.sketch': 1, 'window.wash': 1 })).toBeNull();
        const frames = play(def.id, v);
        expect(frames.complete, `${def.id}-${v}`).toBe(true);
        expect(Math.max(...frames.map((x) => x.w)), `${def.id}-${v}`).toBe(0);
        played++;
      }
    }
    expect(played).toBeGreaterThanOrEqual(6);
  });

  it("the woodland's revisit, on the wall with no scene of its own, washes them as its colour comes, and gives them back by its end", () => {
    expect(scenes.empty).toBeNull();
    const frames = play('woodland', 'empty');
    expect(frames.find((x) => x.w >= WASH * 0.99)?.t ?? Infinity).toBeLessThanOrEqual(6);
    expect(frames.complete).toBe(true);
    expect(frames[frames.length - 1].w).toBeLessThanOrEqual(0.01);
  });

  it('gentle intensity paints it fainter, but the words still go to their trace', () => {
    for (const v of ['afternoon', 'empty']) {
      const peak = Math.max(...play('woodland', v, true).map((x) => x.w));
      expect(peak, v).toBeCloseTo(WASH, 3);
    }
  });

  it("the wall: the revisit sunk and lifted in the plaster, keeping no plaster round its words; let go, as any memory's", () => {
    const w = new MemoryWindow();
    const u = w['u'] as Record<string, { value: unknown }>;
    w.setLiving(null, true);
    expect(u.uUnder.value).toBe(1);
    expect(u.uSunk.value).toBeCloseTo(0.72, 6);
    expect(u.uLift.value).toBeGreaterThan(0);
    w.release();
    expect([u.uUnder.value, u.uSunk.value, u.uLift.value]).toEqual([0, 1, 0]);
    // Any other memory's painting: none of it.
    w.setLiving(null);
    expect([u.uUnder.value, u.uSunk.value, u.uLift.value]).toEqual([0, 1, 0]);
  });
});

describe('the two of them close: one shot, three beats, held drawings', () => {
  // (The committed timeline: the state was set for the cut's tests, above.)
  const def = MEMORIES.woodland;
  const src = sheetSource(sheetId('woodland', 'afternoon'), memorySchema(def.layers, true), { sections: def.sections, markers: def.markers });
  const T = TWO_SHOT;

  it('is on from the cut in to the second wide, and only then; the memory is as long as it was', () => {
    for (let t = 0; t < CUT_AT + 2; t += 1 / 120) {
      const v = src.at(t);
      expect(v['scene.shot'], `${t.toFixed(3)} s`).toBe(t >= SHOTS.two && t < SHOTS.wideAgain ? 1 : 0);
    }
    expect(def.sections.end).toBe(53);
    expect(CUT_AT).toBe(34.5);
    expect(SHOTS.wideAgain).toBe(27.0);
  });

  it('her look: her eyes lead her head to him by half a second, her turn on twos, a head\'s own easing in and out; she stays there to the cut; every head a held drawing', () => {
    let prev = 0;
    const changes: [number, number][] = [];
    for (let t = SHOTS.two; t < SHOTS.wideAgain; t += 1 / 120) {
      const v = src.at(t);
      expect(v['figure:b.turn']).toBeGreaterThanOrEqual(0);
      expect(v['figure:b.turn']).toBeLessThanOrEqual(1);
      expect([0, 1]).toContain(v['figure:b.eyes']);
      if (v['figure:b.turn'] !== prev) {
        expect(t - SHOTS.two).toBeGreaterThan(1);
        changes.push([t, v['figure:b.turn']]);
      }
      prev = v['figure:b.turn'];
    }
    // First her eyes on him (a drawing: her head turned nowhere you could see), then toward him a
    // drawing every twelfth of a second from `herTurn`, arriving turned; never back (the artist:
    // "glance toward him, settle into that gaze, and simply remain there").
    const n = TURN_STEPS.length;
    expect(changes.map(([, f]) => f)).toEqual([TURN_EYES, ...TURN_STEPS, 1]);
    expect(Math.abs(changes[0][0] - T.herEyes)).toBeLessThanOrEqual(1 / 120 + 1e-9);
    changes.slice(1).forEach(([t], i) => expect(Math.abs(t - (T.herTurn + i / 12))).toBeLessThanOrEqual(1 / 120 + 1e-9));
    expect(TURN_EYES * 14).toBeLessThan(0.02);
    // A head's own movement (minimum jerk over fifteen drawings, the first and last left out):
    // slow out, fastest in the middle, slow in, the same at both ends; no step a jump.
    const mj = (x: number) => x ** 3 * (10 - 15 * x + 6 * x * x);
    TURN_STEPS.forEach((f, i) => expect(Math.abs(f - mj((i + 2) / 15))).toBeLessThanOrEqual(0.0006));
    const steps = [...TURN_STEPS, 1].map((f, i, a) => f - (i ? a[i - 1] : 0));
    steps.forEach((d, i) => expect(d).toBeCloseTo(steps[steps.length - 1 - i], 2));
    const mid = Math.floor(steps.length / 2);
    for (let i = 1; i < mid; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(Math.max(...steps)).toBeLessThan(0.13);
    expect(steps[0]).toBeLessThan(0.03);
    expect(n / 12).toBeCloseTo(1, 6);
    const at = (t: number) => src.at(t);
    expect(at(T.herEyes - 0.01)['figure:b.eyes']).toBe(0);
    expect(at(T.herEyes + 0.01)['figure:b.eyes']).toBe(1);
    expect(at(T.herEyes - 0.01)['figure:b.turn']).toBe(0);
    expect(at(T.herTurn - 0.01)['figure:b.turn']).toBe(TURN_EYES);
    expect(at(T.herTurn + 0.01)['figure:b.turn']).toBeGreaterThan(TURN_EYES);
    expect(T.herTurn - T.herEyes).toBeCloseTo(0.5, 6);
    // And she stays: her head turned to him and her eyes on him, through the wide, to the cut.
    for (const t of [T.herTurn + n / 12 + 0.01, SHOTS.wideAgain, CUT_AT - 0.01]) {
      expect(at(t)['figure:b.turn']).toBe(1);
      expect(at(t)['figure:b.eyes']).toBe(1);
    }
  });

  it('her head: the drawing nearest to how far she has turned, a tie going to the one further on', () => {
    const at = [TURN_EYES, ...TURN_STEPS, 1];
    // Her eyes on him, each of the turn's steps, its own drawing; all the way, the last.
    expect(at.map((f) => headFor(f, at))).toEqual(at.map((_, i) => i + 1));
    // Not turned at all: the panel's own head (her eyes moved, without the drawings, by the shader).
    expect(headFor(0, at)).toBe(0);
    expect(headFor(TURN_EYES / 3, at)).toBe(0);
    expect(headFor(0.005, at)).toBe(1);
    // A tie goes to the one further on.
    expect(headFor(0.5, [0.25, 0.75])).toBe(2);
    expect(headFor(0.125, [0.25, 0.75])).toBe(1);
  });

  it('his look comes last, once she has settled into hers, and holds: the shot ends while he is still looking, and so does the wide', () => {
    const at = (t: number) => src.at(t);
    expect(at(T.hisEyes - 0.01)['figure:a.eyes']).toBe(0);
    expect(at(T.hisEyes + 0.01)['figure:a.eyes']).toBe(1);
    expect(T.hisEyes - (T.herTurn + TURN_STEPS.length / 12)).toBeGreaterThanOrEqual(3);
    expect(SHOTS.wideAgain - T.hisEyes).toBeLessThanOrEqual(3);
    for (const t of [SHOTS.wideAgain - 0.01, CUT_AT - 0.01]) {
      expect(at(t)['figure:a.eyes']).toBe(1);
      expect(at(t)['figure:a.look']).toBeGreaterThan(0);
    }
    // His head rolls a little (about 2°: the rig was made for the wide) after his eyes.
    expect(at(T.hisRoll - 0.01)['figure:a.look']).toBe(0);
    expect(Math.abs(at(T.hisRoll + 0.6)['figure:a.look']) * SPEC.roll).toBeLessThan(0.04);
    expect(at(T.hisRoll + 0.6)['figure:a.look']).toBeGreaterThan(0);
  });

  it('their hands stay as the artist drew them, never drawn back, never moved; nothing is heard of them', () => {
    for (let t = 0; t < def.sections.end; t += 0.25) expect(src.at(t)['figure:b.hand']).toBe(1);
    expect(def.markers.some((m) => m.label === 'sfx:grass')).toBe(false);
    expect(Object.keys(def.cues('afternoon').cues)).not.toContain('sfx:grass');
  });

  it('the spec, the timeline and the room agree on when it is and where its heart is', () => {
    expect(SPEC.near!.span).toEqual([T.from, T.to]);
    for (const b of [T.herEyes, T.herTurn, T.hisEyes, T.hisRoll]) expect(SPEC.near!.beats).toContain(b);
    // Her turn whole: no return of the two-shot from half a second before her eyes move until
    // half a second after her head has arrived.
    const settled = T.herTurn + TURN_STEPS.length / 12;
    expect(SPEC.near!.beats).toContain(settled);
    for (let t = T.herEyes - 0.49; t < settled + 0.49; t += 0.01) expect(SPEC.near!.beats.some((b) => Math.abs(t - b) < 0.5), `${t.toFixed(2)} s`).toBe(true);
    // (Time inside moves on twos: not at any of its twelfths either, half a second from two beats.)
    for (let k = Math.ceil((T.herEyes - 0.49) * 12); k / 12 < settled + 0.49; k++) expect(SPEC.near!.beats.some((b) => Math.abs(k / 12 - b) < 0.5), `${(k / 12).toFixed(3)} s`).toBe(true);
    const woodland = SCENE_MEMORIES.find((m) => m.id === 'woodland')!;
    expect(woodland.seenAt).toBe(T.herTurn);
    expect(woodland.span).toBe(def.sections.end);
  });

  it('what a screen reader is told of it: only what is seen, in order, at least 3.5 s apart', () => {
    const lines = def.announce!('afternoon').filter((l) => l.at >= SHOTS.two && l.at < SHOTS.wideAgain);
    expect(lines.map((l) => l.text)).toEqual(['Closer: the two of them side by side in the grass, looking up.', 'She turns her head a little toward him.', 'He turns his eyes to her.']);
    for (let i = 1; i < lines.length; i++) expect(lines[i].at - lines[i - 1].at).toBeGreaterThanOrEqual(3.5);
    // What they do is told to anyone inside, in whichever shot it is seen.
    expect(lines.slice(1).every((l) => l.inside && l.shot === undefined)).toBe(true);
  });
});

describe('the woodland, heard', () => {
  const energy = (x: Float32Array, a: number, b: number) => {
    let e = 0;
    for (let i = Math.floor(a * RATE); i < Math.floor(b * RATE); i++) e += x[i] * x[i];
    return e / ((b - a) * RATE);
  };
  it('the cicada over them falls quiet while the two of them are close, and sings straight across the cut', () => {
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
    // The afternoon carries on unchanged past the cut (the picture says later first), to the
    // cicada's phrase's end: in half seconds, nothing rises or falls by more than 1.5 dB (the
    // trees' own slow swell rose 2.6 dB just after it, a little mark: QA, 2026-10-18).
    for (let a = 33.5; a < 37; a += 0.5) {
      const db = 10 * Math.log10(e(a, a + 0.5) / before);
      expect(Math.abs(db), `${a}–${a + 0.5} s`).toBeLessThan(1.5);
    }
  });
  it('the woods neither swell nor fall on either cut of the two-shot, and stay level through it (nothing scores the looks)', async () => {
    const [l, r] = await renderWoods(0);
    const e = (a: number, b: number) => energy(l, a, b) + energy(r, a, b);
    // Half a second either side of each cut: within 1 dB.
    for (const c of [SHOTS.two, SHOTS.wideAgain]) {
      const db = 10 * Math.log10(e(c, c + 0.5) / e(c - 0.5, c));
      expect(Math.abs(db), `${c} s`).toBeLessThan(1);
    }
    // Through the heart its half seconds range by no more than 3 dB (the chorus's swells, deep,
    // ranged 7.6 dB under the looks).
    const dbs: number[] = [];
    for (let a = SHOTS.two; a < SHOTS.wideAgain; a += 0.5) dbs.push(10 * Math.log10(e(a, a + 0.5)));
    expect(Math.max(...dbs) - Math.min(...dbs)).toBeLessThan(3);
  });
  it("the two either side go quiet at a phrase's end and come back at a phrase's start (never a fade mid-phrase)", () => {
    const [start, end] = TIMES.midQuiet;
    for (const list of midPhrases(0)) {
      for (const [a, b] of list) expect((a < end && b > end) || (a < start && b > start), `${a.toFixed(2)}–${b.toFixed(2)} s`).toBe(false);
      // (Each still comes back, within a few seconds.)
      expect(list.some(([a]) => a >= end && a < end + 4)).toBe(true);
    }
  });
  it("a cicada's phrase swells in and falls away, never a gated tone", () => {
    const x = new Float32Array(8 * RATE);
    cicada(x, { f: 5200, q: 3, pulse: 230, beat: 2.6, seed: 1 }, 1, 7, () => 1);
    expect(energy(x, 0, 1)).toBe(0);
    expect(energy(x, 1, 1.15)).toBeLessThan(energy(x, 3, 5) * 0.1);
    expect(energy(x, 6.85, 7)).toBeLessThan(energy(x, 3, 5) * 0.1);
  });
  it('the last evening cicada is one call', () => {
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
  // The two-shot's art as the runtime builds it from the manifest (scripts/two-shot.py).
  const near = (): NearArt => {
    type Cells = { box: [number, number, number, number]; at: number[]; cells: number; grid: [number, number, number, number] };
    const n = lm.near as unknown as { pixels: [number, number]; gutter: number; reach: number; lidBox: [number, number, number, number]; heads: Cells; ground: { box: [number, number, number, number] }; eyes: { a: number[][]; b: number[][] } };
    const wh = (lm.figures as unknown as { heads: Cells }).heads;
    return {
      texture: tex(), lids: tex(), ground: tex(), maps: tex(),
      heads: { texture: tex(), box: n.heads.box, at: n.heads.at, cells: n.heads.cells, grid: n.heads.grid },
      pixels: n.pixels, gutter: n.gutter, reach: n.reach, lidBox: n.lidBox, groundBox: n.ground.box,
      eyes: [...n.eyes.a, ...n.eyes.b] as NearArt['eyes'],
      // (Her turn in the wide: the scene's own, given with it below.)
      wide: { texture: tex(), box: wh.box, at: wh.at, cells: wh.cells, grid: wh.grid },
    } as NearArt & { wide: HeadCels };
  };
  const both = () => {
    const n = near() as NearArt & { wide: HeadCels };
    return { art: { ...art(), near: n, heads: n.wide }, n };
  };
  const gl = { getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {} } as unknown as THREE.WebGLRenderer;
  const view = { view: new THREE.Vector4(0, 0, 1, 1), parallax: new THREE.Vector2() };

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

  it('the manifest has all of the two-shot: its eyes, her turn at both sizes, its ground and its air', () => {
    const n = lm.near as unknown as Record<string, unknown> & { eyes: { a: number[][]; b: number[][] }; heads: { cells: number; takes: string[] }; reach: number };
    for (const k of ['file', 'lids', 'maps']) expect(typeof n[k], k).toBe('string');
    expect(n.eyes.a.length).toBe(2);
    expect(n.eyes.b.length).toBe(2);
    for (const e of [...n.eyes.a, ...n.eyes.b]) expect(e.length).toBe(11);
    // Her turn: its drawings, each with how far it is (the timeline's steps, then all the way), and
    // the region they are laid in by, in a grid no longer than it is wide; the same at the wide's size.
    const heads = n.heads as { cells: number; takes: string[]; at: number[]; grid: number[]; standIns?: unknown };
    expect(heads.at).toEqual([TURN_EYES, ...TURN_STEPS, 1]);
    expect(heads.takes).toEqual(heads.at.map((_, i) => `b-turn-${String(i + 1).padStart(2, '0')}`));
    expect(heads.cells).toBe(heads.takes.length + 1);
    expect(heads.standIns).toBeUndefined();
    const [cols, rows, ix, iy] = heads.grid;
    expect(cols * rows).toBeGreaterThanOrEqual(heads.cells);
    expect(cols * (rows - 1)).toBeLessThan(heads.cells);
    expect(rows).toBeLessThanOrEqual(cols);
    for (const inset of [ix, iy]) expect(inset > 0 && inset < 0.05).toBe(true);
    const wide = (lm.figures as unknown as { heads: { cells: number; at: number[]; grid: number[] } }).heads;
    expect(wide.cells).toBe(heads.cells);
    expect(wide.at).toEqual(heads.at);
    expect(wide.grid.slice(0, 2)).toEqual([cols, rows]);
    // The camera never looks past the atlas's reach (every frame, every screen it is shown on).
    for (const { frame: [x, , w] } of SPEC.near!.frames) expect(x + w).toBeLessThanOrEqual(n.reach);
  });

  it('the two-shot holds both faces and all three hands on every screen it is shown on', () => {
    // Their features (stage px: x0, y0, x1, y1), as drawn: his face and ear, hers, her hand on
    // her stomach, his hand and hers between them (measured on the film's frame 204).
    const features: Record<string, number[]> = {
      'his face': [165, 55, 276, 177], 'her face': [467, 26, 567, 137], 'her resting hand': [639, 195, 719, 261], 'his hand': [567, 317, 602, 358], 'her hand': [607, 317, 672, 381],
    };
    const { art: a } = both();
    const paint = a.size[0] / a.size[1];
    const s = new LivingScene(a, SPEC, { width: 64, height: 36, noise: tex(), reduced: false });
    const m = livingMaterials(tex());
    const v = { 'scene.shot': 1 };
    const [lo, hi] = SPEC.near!.aspect;
    let i = 0;
    const framed = (aspect: number, why: string) => {
      s.update(gl, 16 + ++i / 6, v, { ...view, aspect });
      // What the screen sees of the stage: the painting as it covers the screen, through the frame.
      const q = coverQuad(aspect, paint, SPEC.cover.wide);
      const qw = q[1].x - q[0].x, qh = q[3].y - q[0].y;
      const pl = m.people.uniforms.uPlace.value as THREE.Vector4;
      // (uPlace: painting uv = (sheet px / SHEET) * zw + xy, v up from the painting's foot.)
      const sx = (u: number) => ((u - pl.x) / pl.z) * 1448, sy = (vv: number) => (1 - (vv - pl.y) / pl.w) * 505;
      const seen = [sx(-q[0].x / qw), sy((1 - q[0].y) / qh), sx((1 - q[0].x) / qw), sy(-q[0].y / qh)];
      for (const [name, [x0, y0, x1, y1]] of Object.entries(features)) {
        const margin = Math.min(x0 - seen[0], y0 - seen[1], seen[2] - x1, seen[3] - y1);
        expect(margin, `${name} at ${aspect.toFixed(2)} (${why})`).toBeGreaterThanOrEqual(8);
      }
    };
    // Coming on afresh at every aspect it is shown for.
    for (let k = 0, aspect = lo; aspect <= hi + 1e-9; k++, aspect = lo + k * 0.05) {
      s.choose({ 'scene.shot': 0 }, { inside: true, turn: 0, t: 16, aspect });
      expect(s.choose(v, { inside: true, turn: 0, t: 16, aspect })).toBe(1);
      framed(aspect, 'fresh');
    }
    // And held: come on in each band, then the screen resized across every aspect, both ways;
    // whenever it is still on, whatever frame it kept or took, they are all in it.
    for (const start of [1.4, 1.7, 2.0, 2.3]) {
      for (const dir of [1, -1]) {
        s.choose({ 'scene.shot': 0 }, { inside: true, turn: 0, t: 16, aspect: start });
        s.choose(v, { inside: true, turn: 0, t: 16, aspect: start });
        for (let aspect = start; aspect > 1.1 && aspect < 2.7; aspect += dir * 0.025) {
          if (s.choose(v, { inside: true, turn: 0, t: 16, aspect }) === 1) framed(aspect, `held from ${start}`);
        }
      }
    }
    s.dispose();
  });

  it('the two-shot: only for someone inside; gives way past 14° and comes back once they have settled, never near a beat nor in its last 2 s', () => {
    const s = new LivingScene(both().art, SPEC, { width: 64, height: 36, noise: tex(), reduced: false });
    const v = { 'scene.shot': 1 };
    expect(s.choose(v, { inside: true, turn: 0, t: 16 })).toBe(1);
    // Not inside (seen on the wall): the wide.
    expect(s.choose(v, { inside: false, turn: 0, t: 16.1 })).toBe(0);
    expect(s.choose(v, { inside: true, turn: 0, t: 16.2 })).toBe(1);
    // A screen it can't frame (upright, square, 4:3's narrower kin; a 21:9 monitor's full width):
    // the wide. (Each coming on afresh.)
    const fresh = (aspect: number) => (s.choose({ 'scene.shot': 0 }, { inside: true, turn: 0, t: 16.2, aspect }), s.choose(v, { inside: true, turn: 0, t: 16.2, aspect }));
    for (const aspect of [9 / 19.5, 1, 1.25, 2.6, 32 / 9]) expect(fresh(aspect), `${aspect}`).toBe(0);
    for (const aspect of [1.3, 4 / 3, 16 / 10, 2.165, 2.45]) expect(fresh(aspect), `${aspect}`).toBe(1);
    // On, its frame holds through a browser's bars coming and going while it still holds them,
    // and is framed again past that; a screen turned past every frame, the wide.
    const u = livingMaterials(tex()).people.uniforms;
    fresh(1.85);
    s.update(gl, 16.25, v, { ...view, aspect: 1.85 });
    const framed = (u.uPlace.value as THREE.Vector4).clone();
    expect(s.choose(v, { inside: true, turn: 0, t: 16.3, aspect: 1.9 })).toBe(1);
    s.update(gl, 16.3, v, { ...view, aspect: 1.9 });
    expect((u.uPlace.value as THREE.Vector4).equals(framed)).toBe(true);
    expect(s.choose(v, { inside: true, turn: 0, t: 16.4, aspect: 2.05 })).toBe(1);
    s.update(gl, 16.4, v, { ...view, aspect: 2.05 });
    expect((u.uPlace.value as THREE.Vector4).equals(framed)).toBe(false);
    expect(s.choose(v, { inside: true, turn: 0, t: 16.5, aspect: 2.5 })).toBe(1);
    expect(s.choose(v, { inside: true, turn: 0, t: 16.6, aspect: 0.46 })).toBe(0);
    // Turned back, it comes back as after giving way: never within half a second of a beat (her
    // eyes at 17.5, her turn from 18.0 to 19.0, never cut into), on a new drawing.
    for (let t = 17.2; t < 19.5 - 1e-9; t += 1 / 12) expect(s.choose(v, { inside: true, turn: 0, t, aspect: 16 / 9 }), `${t.toFixed(2)} s`).toBe(0);
    expect(s.choose(v, { inside: true, turn: 0, t: 19.55, aspect: 16 / 9 })).toBe(1);
    expect(fresh(16 / 9)).toBe(1);
    // Turned past 14°: the wide; still turned, still the wide.
    expect(s.choose(v, { inside: true, turn: 0.3, t: 19.6 })).toBe(0);
    expect(s.choose(v, { inside: true, turn: 0.2, t: 19.8 })).toBe(0);
    // Settled under 6°: back after 1.2 s, on a new drawing.
    let back = -1;
    for (let t = 19.9; t < 21.7; t += 1 / 60) if (s.choose(v, { inside: true, turn: 0.05, t }) === 1 && back < 0) back = t;
    expect(back).toBeGreaterThanOrEqual(19.9 + 1.2 - 1e-9);
    expect(back).toBeLessThan(19.9 + 1.4);
    // Never within half a second of a beat: settled from 21.6, it comes back 1.2 s later, with no
    // beat near; settled from 23.1, it could come back at 24.3, but his eyes go to her at 24.0 and
    // his head at 24.5, and half a second past them is its last 2 s: the wide holds.
    s.choose(v, { inside: true, turn: 0.3, t: 21.5 });
    let between = -1;
    for (let t = 21.6; t < 24; t += 1 / 60) if (s.choose(v, { inside: true, turn: 0, t }) === 1 && between < 0) between = t;
    expect(between).toBeGreaterThanOrEqual(21.6 + 1.2 - 1e-9);
    expect(between).toBeLessThan(21.6 + 1.4);
    s.choose(v, { inside: true, turn: 0.3, t: 23.0 });
    let again = -1;
    for (let t = 23.1; t < 27; t += 1 / 60) if (s.choose(v, { inside: true, turn: 0, t }) === 1 && again < 0) again = t;
    expect(again < 0 || again >= TWO_SHOT.hisRoll + 0.5 - 1e-9).toBe(true);
    for (const b of SPEC.near!.beats) expect(again < 0 || Math.abs(again - b) >= 0.5 - 1e-9).toBe(true);
    // In its last 2 s it doesn't come back: the wide holds to the cut.
    s.choose(v, { inside: true, turn: 0.3, t: 25.2 });
    let late = -1;
    for (let t = 25.3; t < 27; t += 1 / 60) if (s.choose(v, { inside: true, turn: 0, t }) === 1 && late < 0) late = t;
    expect(late).toBe(-1);
    // The next shot asks afresh.
    expect(s.choose({ 'scene.shot': 0 }, { inside: true, turn: 0, t: 27.1 })).toBe(0);
    s.dispose();
    // Without her look drawn in the wide there is no two-shot (a turn away would undo her look).
    const { n } = both();
    const none = new LivingScene({ ...art(), near: n, heads: null }, SPEC, { width: 64, height: 36, noise: tex(), reduced: false });
    expect(none.choose(v, { inside: true, turn: 0, t: 16 })).toBe(0);
    none.dispose();
  });

  it('her turn is drawn in either shot, his look only close; the two-shot is the panel at its reach, lit as the wide', () => {
    const { art: a, n } = both();
    const s = new LivingScene(a, SPEC, { width: 64, height: 36, noise: tex(), reduced: false });
    const m = livingMaterials(tex());
    const u = m.people.uniforms;
    const v = { 'scene.shot': 1, 'figure:b.turn': 1, 'figure:a.eyes': 1 };
    s.choose(v, { inside: true, turn: 0, t: 19 });
    s.update(gl, 19, v, view);
    expect(u.uNear.value).toBe(1);
    expect(u.uFigures.value).toBe(n.texture);
    expect(u.uHeads.value).toBe(n.heads.texture);
    expect(u.uMaps.value).toBe(n.maps);
    expect(u.uFigU.value).toBeCloseTo(n.reach / 1448, 6);
    // (All the way: the last drawing, from its place in the grid.)
    expect((u.uHeadCel.value as THREE.Vector2).toArray()).toEqual([n.heads.at.length - 1, n.heads.cells]);
    expect((u.uHeadGrid.value as THREE.Vector4).toArray()).toEqual(n.heads.grid);
    expect((u.uGaze.value as THREE.Vector2).x).toBeCloseTo(SPEC.near!.gaze[0], 6);
    // (Her eyes are still while her head is the drawing: its eyes are drawn on him.)
    expect((u.uGazeB.value as THREE.Vector2).length()).toBe(0);
    expect((u.uWidePlace.value as THREE.Vector4).toArray()).toEqual(lm.figures.place);
    expect(m.frame.uniforms.uFrame.value).toBe(n.ground);
    // Turned away: the wide, her head still turned to him (its own size), no look drawn in the eyes.
    s.choose(v, { inside: true, turn: 0.3, t: 19.5 });
    s.update(gl, 19.5, v, view);
    expect(u.uNear.value).toBe(0);
    expect(u.uHeads.value).toBe(n.wide.texture);
    expect((u.uHeadCel.value as THREE.Vector2).toArray()).toEqual([n.wide.at.length - 1, n.wide.cells]);
    expect((u.uHeadGrid.value as THREE.Vector4).toArray()).toEqual(n.wide.grid);
    expect((u.uGaze.value as THREE.Vector2).length()).toBe(0);
    expect(u.uFigU.value).toBe(1);
    expect(u.uMaps.value).not.toBe(n.maps);
    // Her eyes on him, then on the way there: each its own drawing, in the order they lie in the atlas.
    s.choose(v, { inside: true, turn: 0, t: 18.1 });
    [TURN_EYES, ...TURN_STEPS].forEach((f, i) => {
      s.update(gl, 17.6 + i / 12, { 'scene.shot': 1, 'figure:b.turn': f, 'figure:b.eyes': 1 }, view);
      expect(headFor(f, n.heads.at)).toBe(i + 1);
      expect((u.uHeadCel.value as THREE.Vector2).toArray()).toEqual([i, n.heads.cells]);
      // (Her eyes are the drawing's: the shader moves them only on the panel's own head.)
      expect((u.uGazeB.value as THREE.Vector2).length()).toBe(0);
    });
    // Her head as the panel has it: none of the drawing.
    s.update(gl, 22.6, { 'scene.shot': 1, 'figure:b.turn': 0 }, view);
    expect((u.uHeadCel.value as THREE.Vector2).x).toBe(-1);
    s.dispose();
    expect(u.uHeads.value).toBe(m.empty);
    expect(m.frame.uniforms.uFrame.value).toBe(m.empty);
  });

  it("the shared program stays inside the 16 texture units every phone has (there is no 17th: add data to an existing one)", () => {
    const m = livingMaterials(tex());
    const names = new Set<string>();
    for (const src of [m.people.vertexShader, m.people.fragmentShader])
      for (const line of src.split('\n')) {
        const x = line.match(/^\s*uniform\s+sampler2D\s+([^;]+);/);
        if (x) for (const n of x[1].split(',')) names.add(n.trim());
      }
    expect(names.size).toBeGreaterThan(8);
    expect(names.size).toBeLessThanOrEqual(16);
  });

  it('lets go of everything it made (twice is safe), and leaves the shared materials holding nothing', () => {
    const s = make();
    const geos = ['grid', 'strips', 'air', 'quad'].map((k) => (s as unknown as Record<string, THREE.BufferGeometry>)[k]);
    let freed = 0;
    for (const g of geos) g.addEventListener('dispose', () => freed++);
    // (And its own one-texel ground map: one texture a play leaked without it.)
    let stir = 0;
    (s as unknown as { stir: THREE.Texture }).stir.addEventListener('dispose', () => stir++);
    s.dispose();
    s.dispose();
    expect(freed).toBe(4);
    expect(stir).toBe(1);
    const m = livingMaterials(tex());
    for (const mat of [m.plate, m.people, m.flowers, m.air])
      for (const k of ['uPlate', 'uFigures', 'uFlowers', 'uClouds', 'uSkyMask']) expect(mat.uniforms[k].value).toBe(m.empty);
  });
});
