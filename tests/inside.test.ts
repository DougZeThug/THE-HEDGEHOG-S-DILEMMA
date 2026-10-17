import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '../src/world/CameraRig';
import { MemoryWindow } from '../src/world/MemoryWindow';
import { Immersion } from '../src/world/living/Immersion';
import { Inside } from '../src/world/living/Inside';
import type { Post } from '../src/world/Post';

// Going into a living memory and back (src/world/living/Inside.ts, docs/reviews/2026-10-woodland.md).

function setup() {
  const rig = new CameraRig(16 / 9);
  const win = new MemoryWindow();
  const post = { immersed: 0, roomHidden: false } as unknown as Post;
  const inside = new Inside(rig, win, new Immersion(new THREE.DataTexture(new Uint8Array(4), 1, 1)), post);
  // A wall 3.2 m in front of the visitor, facing them; the painting on it, 3.2 × 1.8 m.
  const wall = new THREE.Group();
  wall.position.set(0, 1.8, -3.2);
  wall.updateMatrixWorld(true);
  Object.assign(win.painting, { cx: 0, cy: 0, w: 3.2, h: 1.8 });
  rig.place(0.4, 0, 0.1, -0.05);
  const scene = new THREE.Texture();
  const step = (immerse: number, o: { leaving?: boolean; reduced?: boolean; dt?: number; approach?: number; away?: boolean } = {}) =>
    inside.step(o.dt ?? 1 / 60, { immerse, focus: [0.5, 0.5], enter: true, away: !!o.away, leavingNaturally: !!o.leaving, approach: o.approach }, { reduced: !!o.reduced, aspect: 16 / 9, scene, sketch: null, group: wall });
  // The way in at its own pace (~9 s): the drawing forms, then they are taken in.
  const goIn = () => {
    for (let a = 0; a <= 0.55; a += 0.01) step(0, { approach: a, dt: 0.1 });
    for (let k = 0; k <= 45; k++) step(Math.min(1, k / 40), { approach: 0.55 + (0.45 * k) / 45, dt: 0.1 });
    step(1, { approach: 1 });
  };
  const goOut = () => {
    for (let k = 0; k <= 60; k++) step(Math.max(0, 1 - k / 40), { approach: Math.max(0, 1 - k / 60), leaving: true, dt: 0.1 });
    step(0, { approach: 0, leaving: true });
  };
  return { rig, inside, post, step, goIn, goOut };
}

describe('inside a living memory', () => {
  it('carries the visitor in, square to the painting, and back exactly where they stood', () => {
    const { rig, inside, goIn, goOut } = setup();
    inside.begin(1);
    const start = { x: rig.pos.x, z: rig.pos.z, yaw: rig.yaw, pitch: rig.pitch };
    goIn();
    expect(inside.locked).toBe(true);
    // Square to the wall (yaw 0 faces −z) and closer to it.
    expect(rig.yaw).toBeCloseTo(0, 5);
    expect(rig.pos.z).toBeLessThan(start.z - 0.5);
    goOut();
    expect(inside.locked).toBe(false);
    expect(rig.pos.x).toBeCloseTo(start.x, 6);
    expect(rig.pos.z).toBeCloseTo(start.z, 6);
    expect(rig.yaw).toBeCloseTo(start.yaw, 6);
    expect(rig.pitch).toBeCloseTo(start.pitch, 6);
  });

  it('a glance changes nothing; a turn of 30° lets it go, and they keep their turn', () => {
    const { rig, inside, step, goIn } = setup();
    inside.begin(2);
    goIn();
    inside.look(50, 0); // about 6°
    step(1, { approach: 1 });
    expect(inside.eff).toBe(1);
    let out = null;
    for (let i = 0; i < 20 && !out; i++) {
      inside.look(30, 0);
      out = step(1, { approach: 1 });
    }
    expect(out).toBe('leave');
    // The memory reverses (its exit envelope takes `immerse` down); control comes back half-way.
    const yawInside = rig.yaw;
    let e = 1;
    while (inside.locked && e > 0) step((e -= 0.05), { approach: e });
    expect(inside.locked).toBe(false);
    expect(e).toBeGreaterThan(0.3);
    expect(rig.yaw).toBeLessThan(yawInside - 0.4);
  });

  it('a long frame cannot swallow a turn', () => {
    const { inside, step, goIn } = setup();
    inside.begin(3);
    goIn();
    for (let i = 0; i < 9; i++) inside.look(30, 0);
    expect(step(1, { dt: 1, approach: 1 })).toBe('leave');
  });

  it('reduced motion is as it was when the memory began (nobody carried, put back where they were)', () => {
    const { rig, inside, step } = setup();
    inside.begin(4, true);
    const start = { x: rig.pos.x, z: rig.pos.z };
    for (let e = 0; e <= 1; e += 0.05) step(e, { reduced: false });
    expect(rig.pos.x).toBeCloseTo(start.x, 6);
    expect(rig.pos.z).toBeCloseTo(start.z, 6);
    for (let e = 1; e >= 0; e -= 0.05) step(e, { leaving: true, reduced: false });
    step(0, { leaving: true });
    expect(inside.locked).toBe(false);
    expect(rig.pos.z).toBeCloseTo(start.z, 6);
  });

  it('one move in: the body first (their look their own), then taken in on the same curve without a jump; back to where they stood', () => {
    const { rig, inside, step } = setup();
    inside.begin(5);
    const start = { x: rig.pos.x, z: rig.pos.z, yaw: rig.yaw, pitch: rig.pitch };
    let turns = 0;
    let lastZ = rig.pos.z;
    let jump = 0;
    // The drawing forms (approach rising, not yet taken in): they drift, looking as they like.
    for (let a = 0; a <= 0.55; a += 0.01) {
      rig.yaw += 0.002;
      turns++;
      step(0, { approach: a, dt: 0.1 });
      jump = Math.max(jump, Math.abs(rig.pos.z - lastZ));
      lastZ = rig.pos.z;
    }
    expect(inside.locked).toBe(false);
    expect(rig.pos.z).toBeLessThan(start.z - 0.2); // nearer the wall (it is at z −3.2)
    expect(rig.yaw).toBeCloseTo(start.yaw + 0.002 * turns, 6); // their look untouched
    // Taken in: the same move carries on (no jump), square to the wall by its end.
    for (let k = 0; k <= 45; k++) {
      step(Math.min(1, k / 40), { approach: 0.55 + (0.45 * k) / 45, dt: 0.1 });
      jump = Math.max(jump, Math.abs(rig.pos.z - lastZ));
      lastZ = rig.pos.z;
    }
    step(1, { approach: 1 });
    expect(jump).toBeLessThan(0.08);
    expect(inside.locked).toBe(true);
    expect(inside.entered).toBe(true);
    expect(rig.yaw).toBeCloseTo(0, 4);
    // Back: all the way to where they first stood, as they first looked.
    for (let k = 0; k <= 60; k++) step(Math.max(0, 1 - k / 40), { approach: Math.max(0, 1 - k / 60), leaving: true, dt: 0.1 });
    step(0, { approach: 0, leaving: true });
    expect(inside.locked).toBe(false);
    expect(rig.pos.x).toBeCloseTo(start.x, 6);
    expect(rig.pos.z).toBeCloseTo(start.z, 6);
    // (As they looked when the move began: they had turned a little by then.)
    expect(Math.abs(rig.yaw - start.yaw)).toBeLessThan(0.01);
  });

  it('a look away while the drawing forms only holds them; looking back, they go on (no lurch) and are taken in', () => {
    const { rig, inside, step } = setup();
    inside.begin(6);
    let a = 0;
    for (; a <= 0.3; a += 0.01) step(0, { approach: a, dt: 0.1 });
    const z = rig.pos.z;
    // Two seconds looking elsewhere (toward a voice): held where they are.
    for (let k = 0; k < 20; k++, a += 0.01) step(0, { approach: a, away: true, dt: 0.1 });
    expect(rig.pos.z).toBeCloseTo(z, 6);
    // Back to it: on along the way, catching up gently.
    let last = rig.pos.z;
    let jump = 0;
    for (; a <= 0.6; a += 0.01) {
      step(0, { approach: a, dt: 0.1 });
      jump = Math.max(jump, Math.abs(rig.pos.z - last));
      last = rig.pos.z;
    }
    expect(rig.pos.z).toBeLessThan(z - 0.2);
    for (let k = 0; k <= 45; k++) {
      step(Math.min(1, k / 40), { approach: 0.6 + (0.4 * k) / 45, dt: 0.1 });
      jump = Math.max(jump, Math.abs(rig.pos.z - last));
      last = rig.pos.z;
    }
    expect(jump).toBeLessThan(0.08);
    expect(inside.entered).toBe(true);
  });

  it('looking away when it would take them: it stays on the wall', () => {
    const { inside, step } = setup();
    inside.begin(8);
    let a = 0;
    for (; a <= 0.5; a += 0.01) step(0, { approach: a, dt: 0.1 });
    for (let k = 0; k < 8; k++, a += 0.01) step(0, { approach: a, away: true, dt: 0.1 });
    for (let e = 0; e <= 1; e += 0.05) step(e, { approach: 1, away: true, dt: 0.1 });
    expect(inside.locked).toBe(false);
    expect(inside.entered).toBe(false);
  });

  it('a step held while the drawing forms lets it go for good: they are free, and it stays on the wall', () => {
    const { rig, inside, step } = setup();
    inside.begin(9);
    let a = 0;
    for (; a <= 0.3; a += 0.01) step(0, { approach: a, dt: 0.1 });
    rig.keys.add('KeyS');
    for (let k = 0; k < 5; k++, a += 0.01) step(0, { approach: a, dt: 0.1 });
    rig.keys.delete('KeyS');
    const z = rig.pos.z;
    for (; a <= 1; a += 0.01) step(0, { approach: a, dt: 0.1 });
    expect(rig.pos.z).toBeCloseTo(z, 6);
    for (let e = 0; e <= 1; e += 0.05) step(e, { approach: 1, dt: 0.1 });
    expect(inside.locked).toBe(false);
    expect(inside.entered).toBe(false);
  });

  it('never backwards: someone standing nearer than the carry would put them stays at their distance', () => {
    const { rig, inside, step } = setup();
    rig.place(0.2, -2.4, 0, 0); // 0.8 m from the wall (the framing distance is about 1.5 m)
    inside.begin(7);
    for (let a = 0; a <= 0.5; a += 0.01) step(0, { approach: a, dt: 0.1 });
    for (let k = 0; k <= 40; k++) step(k / 40, { approach: 0.5 + k / 80, dt: 0.1 });
    expect(rig.pos.z).toBeLessThanOrEqual(-2.4 + 1e-6);
  });
});
