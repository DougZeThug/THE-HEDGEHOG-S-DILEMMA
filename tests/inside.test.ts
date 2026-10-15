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
  const step = (immerse: number, o: { leaving?: boolean; reduced?: boolean; dt?: number } = {}) =>
    inside.step(o.dt ?? 1 / 60, { immerse, focus: [0.5, 0.5], enter: true, away: false, leavingNaturally: !!o.leaving }, { reduced: !!o.reduced, aspect: 16 / 9, scene, sketch: null, group: wall });
  return { rig, inside, post, step };
}

describe('inside a living memory', () => {
  it('carries the visitor in, square to the painting, and back exactly where they stood', () => {
    const { rig, inside, step } = setup();
    inside.begin(1);
    const start = { x: rig.pos.x, z: rig.pos.z, yaw: rig.yaw, pitch: rig.pitch };
    for (let e = 0; e <= 1; e += 0.02) step(e);
    step(1);
    expect(inside.locked).toBe(true);
    // Square to the wall (yaw 0 faces −z) and closer to it.
    expect(rig.yaw).toBeCloseTo(0, 5);
    expect(rig.pos.z).toBeLessThan(start.z - 0.5);
    for (let e = 1; e >= 0; e -= 0.02) step(e, { leaving: true });
    step(0, { leaving: true });
    expect(inside.locked).toBe(false);
    expect(rig.pos.x).toBeCloseTo(start.x, 6);
    expect(rig.pos.z).toBeCloseTo(start.z, 6);
    expect(rig.yaw).toBeCloseTo(start.yaw, 6);
    expect(rig.pitch).toBeCloseTo(start.pitch, 6);
  });

  it('a glance changes nothing; a turn of 30° lets it go, and they keep their turn', () => {
    const { rig, inside, step } = setup();
    inside.begin(2);
    for (let e = 0; e <= 1; e += 0.05) step(e);
    step(1);
    inside.look(50, 0); // about 6°
    step(1);
    expect(inside.eff).toBe(1);
    let out = null;
    for (let i = 0; i < 20 && !out; i++) {
      inside.look(30, 0);
      out = step(1);
    }
    expect(out).toBe('leave');
    // The memory reverses (its exit envelope takes `immerse` down); control comes back half-way.
    const yawInside = rig.yaw;
    let e = 1;
    while (inside.locked && e > 0) step((e -= 0.05));
    expect(inside.locked).toBe(false);
    expect(e).toBeGreaterThan(0.3);
    expect(rig.yaw).toBeLessThan(yawInside - 0.4);
  });

  it('a long frame cannot swallow a turn', () => {
    const { inside, step } = setup();
    inside.begin(3);
    for (let e = 0; e <= 1; e += 0.05) step(e);
    for (let i = 0; i < 9; i++) inside.look(30, 0);
    expect(step(1, { dt: 1 })).toBe('leave');
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
});
