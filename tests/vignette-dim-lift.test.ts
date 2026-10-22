import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Lighting } from '../src/world/Lighting';
import { VignettePlayer, type VignetteHost } from '../src/memory/VignettePlayer';
import { VIGNETTE_BY_ID, type VignetteDef } from '../src/content/vignettes';
import { FakeCtx, FakeNode } from './fakeAudio';
import type { Environment } from '../src/state/Director';

const env = { lightIntensity: 1, lightWarmth: 0, shadowDrift: 0, chairGlow: 0.2 } as unknown as Environment;
const chair = new THREE.Vector3();

/**
 * The dim five-minutes issues (the game's only vignette dim): down to the chair alone over its
 * first 3 s, held, and back over its final 4 s — its authored return.
 *
 * These tests cover the gap the bug report names: the vignette host's `letGo` only lifted the dim
 * for a release mode of `'interrupt'`, so the two graceful cut-short paths (walking off, turning
 * to write) — which release `'natural'` after setting `cutShort = true` — left the room pinned at
 * the dim's target long after the vignette was gone. `App` itself can't be built in the Node test
 * environment (it touches the DOM, matchMedia and WebGL at construction), so this harness is a
 * faithful in-process model of `App.vignetteHost`'s lighting: the `dim` fx routes to a real
 * `Lighting` (as `vignetteEffect`'s `case 'dim'` does), and `letGo` lifts it exactly as the fixed
 * App handler does — `mode === 'interrupt' || cutShort`. `state` stands in for App's per-vignette
 * record and `time` for its scene clock.
 */
function harness(def: VignetteDef, variant: string) {
  const ctx = new FakeCtx();
  const bus = new FakeNode(ctx);
  const lighting = new Lighting('low');
  let time = 0;
  let lifts = 0;
  let state: { id: string; cutShort: boolean } | null = null;

  // A short buffer for each of the vignette's own lines; synth beds and sfx load to nothing (the
  // audio mock handles missing buffers without playing — only the lighting is under test).
  const LEN: Record<string, number> = {};
  for (const l of def.lines) LEN[`vig:${def.id}:${l.id}`] = 1.2;

  const host: VignetteHost = {
    ctx: ctx as unknown as BaseAudioContext,
    out: bus as unknown as AudioNode,
    load: async (asset) => (LEN[asset] ? ({ duration: LEN[asset] } as AudioBuffer) : null),
    impulse: () => ({}) as AudioBuffer,
    intensity: 1,
    where: () => [0, 1.5, 0],
    caption: () => {},
    fallback: () => {},
    level: () => 1,
    effect: (fx) => {
      // App.vignetteEffect: a dim takes the room toward the chair. The dim fx of five-minutes is
      // at at:0 (delay 0), applied to the scene clock as the App's deferred call does.
      if (fx.kind === 'dim' && state?.id === def.id) lighting.dimToChair(fx.to, fx.seconds, time);
    },
    letGo: (mode) => {
      // The fix under test (App.vignetteHost.letGo): lift for a hard interrupt or a cut-short
      // release (walking off, turning to write both set cutShort before release('natural')).
      if (mode === 'interrupt' || state?.cutShort) { lighting.liftDim(time); lifts++; }
    },
  };

  const player = new VignettePlayer(def, variant, host);

  const step = (dt: number) => {
    time += dt;
    ctx.advance(dt);
    lighting.update(dt, env, time, chair);
    player.step(dt);
  };
  const run = (seconds: number, dt = 1 / 60) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) step(dt);
  };

  return {
    lighting, player,
    start: () => { state = { id: def.id, cutShort: false }; player.start(); },
    cutShort: () => { if (state) state.cutShort = true; },
    release: (mode: 'natural' | 'interrupt') => player.release(mode),
    run, step,
    roomLight: () => lighting.roomLight,
    lifts: () => lifts,
  };
}

describe('the dim that outlives a cut-short vignette (five-minutes)', () => {
  it('with nothing lifted at a natural release, the room stays pinned at the dim target long after it ends', () => {
    // Driving the real Lighting as the bug report's reproduction does: dimToChair(0.35, 27.5, 0)
    // and no lift at a simulated natural release at t=5 (exactly what letGo('natural') did before).
    const l = new Lighting('low');
    l.dimToChair(0.35, 27.5, 0);
    const at: number[] = [];
    for (let t = 0; t <= 30; t += 0.05) {
      l.update(0.05, env, t, chair);
      at.push(l.roomLight);
    }
    const level = (t: number) => at[Math.round(t / 0.05)];
    expect(level(4)).toBeCloseTo(0.35, 2);
    // A natural release at t=5 lifts nothing here: the dim holds the floor for ~18 more seconds.
    for (const t of [6, 8, 12, 18, 23]) expect(level(t)).toBeCloseTo(0.35, 2);
    expect(level(28)).toBeCloseTo(1, 2); // the dim's own tail rise, only now
  });

  it('liftDim at the release restores the light over a few seconds, never a jump', () => {
    const l = new Lighting('low');
    l.dimToChair(0.35, 27.5, 0);
    const at: number[] = [];
    let prev = 1, jump = 0;
    for (let t = 0; t <= 30; t += 0.05) {
      if (Math.abs(t - 5) < 0.05 / 2) l.liftDim(5); // the lift an interrupt release gets
      l.update(0.05, env, t, chair);
      at.push(l.roomLight);
      jump = Math.max(jump, Math.abs(l.roomLight - prev));
      prev = l.roomLight;
    }
    const level = (t: number) => at[Math.round(t / 0.05)];
    expect(level(4)).toBeCloseTo(0.35, 2);
    expect(level(5)).toBeCloseTo(0.35, 2); // no jump at the lift: it reads the level from where it is
    expect(jump).toBeLessThan(0.05);
    expect(level(6)).toBeCloseTo(0.4516, 3);
    expect(level(7)).toBeCloseTo(0.675, 3);
    expect(level(8)).toBeCloseTo(0.8984, 3);
    expect(level(9)).toBeCloseTo(1, 2);
  });
});

describe('a cut-short vignette lifts its dim', () => {
  it('five-minutes cut short by walking off (or turning to write) releases natural and lifts the dim back to full', async () => {
    const h = harness(VIGNETTE_BY_ID.get('five-minutes')!, 'first');
    await h.player.prepare();
    h.start();
    h.run(5);
    expect(h.roomLight()).toBeCloseTo(0.35, 2); // the dim has the room at chair-alone darkness
    // The two graceful cut-short paths both do this: set cutShort, then release('natural').
    h.cutShort();
    h.release('natural'); // the bug's path: a 'natural' release that used to lift nothing
    expect(h.lifts()).toBe(1); // the fix: liftDim fires for a cut-short 'natural' release
    h.run(1);
    expect(h.roomLight()).toBeGreaterThan(0.4); // rising over the lift's seconds, not a jump
    expect(h.roomLight()).toBeLessThan(0.9);
    h.run(4);
    expect(h.roomLight()).toBeCloseTo(1, 2); // back to full light well within the lift's few seconds
  });

  it('a cut-short release never jumps the light: it rises smoothly from where the dim had it', async () => {
    const h = harness(VIGNETTE_BY_ID.get('five-minutes')!, 'first');
    await h.player.prepare();
    h.start();
    h.run(2.5); // part-way down, before the dim's 3 s down-ramp is done
    const before = h.roomLight();
    expect(before).toBeGreaterThan(0.4); // mid-fall, not yet reached its target
    expect(before).toBeLessThan(1);
    let prev = before, jump = 0;
    h.cutShort();
    h.release('natural');
    for (let i = 0; i < 5 * 60; i++) {
      h.step(1 / 60);
      jump = Math.max(jump, Math.abs(h.roomLight() - prev));
      prev = h.roomLight();
    }
    expect(jump).toBeLessThan(0.05); // a continuous rise, never a step
    expect(h.roomLight()).toBeCloseTo(1, 2);
  });
});

describe('the authored full playthrough is left untouched', () => {
  it('five-minutes played to its end lifts nothing: the dim returns on its own curve', async () => {
    const h = harness(VIGNETTE_BY_ID.get('five-minutes')!, 'first');
    await h.player.prepare();
    h.start();
    h.run(10);
    expect(h.roomLight()).toBeCloseTo(0.35, 2); // held at the dim's target mid-span
    expect(h.lifts()).toBe(0); // no lift: cutShort is still false, so letGo('natural') lifts nothing
    h.run(22); // past the span (29 s): the player self-releases 'natural' (cutShort still false)
    expect(h.lifts()).toBe(0); // the authored return is never cut short by a premature lift
    expect(h.roomLight()).toBeCloseTo(1, 2); // the dim's own final-4 s rise brought it back
  });
});

describe('the paths that already worked', () => {
  it('five-minutes hard-interrupted (depart, switch, settings) still lifts the dim', async () => {
    const h = harness(VIGNETTE_BY_ID.get('five-minutes')!, 'first');
    await h.player.prepare();
    h.start();
    h.run(5);
    expect(h.roomLight()).toBeCloseTo(0.35, 2);
    h.release('interrupt'); // the already-working path: release('interrupt') lifts unconditionally
    expect(h.lifts()).toBe(1);
    h.run(5);
    expect(h.roomLight()).toBeCloseTo(1, 2);
  });

  it('the again variant (a shorter dim) is lifted too when cut short', async () => {
    const h = harness(VIGNETTE_BY_ID.get('five-minutes')!, 'again');
    await h.player.prepare();
    h.start();
    h.run(5);
    expect(h.roomLight()).toBeCloseTo(0.5, 2); // the again variant dims to 0.5
    h.cutShort();
    h.release('natural');
    expect(h.lifts()).toBe(1);
    h.run(5);
    expect(h.roomLight()).toBeCloseTo(1, 2);
  });
});

describe('a vignette that never dims', () => {
  it('letGo lifts nothing and never throws (liftDim no-ops when no dim is active)', async () => {
    const h = harness(VIGNETTE_BY_ID.get('charger')!, 'first');
    await h.player.prepare();
    h.start();
    h.run(5);
    expect(h.roomLight()).toBe(1); // charger never dims
    h.cutShort();
    h.release('natural');
    h.run(2);
    expect(h.roomLight()).toBe(1); // liftDim found no dim and did nothing
  });

  it('an interrupt release on a non-dimming vignette is equally a no-op', async () => {
    const h = harness(VIGNETTE_BY_ID.get('charger')!, 'first');
    await h.player.prepare();
    h.start();
    h.run(3);
    h.release('interrupt');
    h.run(2);
    expect(h.roomLight()).toBe(1);
  });
});
