import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '../src/world/CameraRig';
import { MemoryWindow } from '../src/world/MemoryWindow';
import { Immersion } from '../src/world/living/Immersion';
import { Inside } from '../src/world/living/Inside';
import type { Post } from '../src/world/Post';
import type { Room } from '../src/world/Room';
import { LivingScene, type Closeup, type LivingArt } from '../src/memory/living/LivingScene';
import { WOODLAND as SPEC } from '../src/memory/living/woodland';
import manifest from '../public/memories/woodland/manifest.json';

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
    // (As they looked when taken in: their look was their own until then.)
    expect(rig.yaw).toBeCloseTo(start.yaw + 0.002 * turns, 6);
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

// In the App's order (src/App.ts): the room's rig moves first, then the memory's frame. What a
// visitor's own steps, thumbs and looks do on the committed timeline's shape (QA review, 2026-10-17).
function app(o: { reduced?: boolean } = {}) {
  const w = setup();
  const room = { halfW: 6, halfD: 6 } as unknown as Room;
  const chair = new THREE.Vector3(5, 0, 5);
  const tex = () => new THREE.Texture();
  const cu: Closeup = { base: tex(), wind: tex(), cels: null, cells: [-1, null, null, null], grid: [0, 0], rect: [0, 0, 0, 0], focus: [0.5, 0.7], breath: 'a', chest: null };
  const lm = manifest.living.afternoon;
  const scene = new LivingScene(
    { plate: tex(), maps: tex(), grade: null, after: null, sky: null, flowers: null, clouds: null, size: manifest.plate as [number, number], closeups: [cu],
      figures: { ...(lm.figures as unknown as NonNullable<LivingArt['figures']>), texture: tex(), lids: tex() } },
    SPEC, { width: 64, height: 36, noise: tex(), reduced: false },
  );
  const sceneTex = new THREE.Texture();
  const group = new THREE.Group();
  group.position.set(0, 1.8, -3.2);
  group.updateMatrixWorld(true);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  let t = 0;
  const frame = (f: { dt?: number; held?: boolean; away?: boolean; shot?: number; view?: [number, number] } = {}) => {
    const dt = f.dt ?? 1 / 60;
    t += dt;
    w.rig.enabled = !w.inside.locked;
    w.rig.update(dt || 1 / 60, room, chair);
    const shot = scene.choose({ 'scene.shot': f.shot ?? 0 }, { inside: w.inside.taken, turned: w.inside.turned > 0.244 });
    w.inside.step(dt, { immerse: clamp((t - 6.2) / 3.6), focus: [0.5, 0.5], view: f.view, held: f.held, enter: true, away: !!f.away, leavingNaturally: false, approach: clamp((t - 1.2) / 9.3) },
      { reduced: !!o.reduced, aspect: 16 / 9, scene: sceneTex, sketch: null, group });
    return shot;
  };
  const until = (end: number, f: Parameters<typeof frame>[0] = {}) => {
    let most = 0;
    while (t < end - 1e-9) {
      const x = w.rig.pos.x, z = w.rig.pos.z;
      frame(f);
      most = Math.max(most, Math.hypot(w.rig.pos.x - x, w.rig.pos.z - z));
    }
    return most;
  };
  w.inside.begin(11, !!o.reduced);
  return { ...w, frame, until, now: () => t };
}

describe('the way in, in the App\'s order', () => {
  it('walking up to it while the drawing forms: the drift waits, goes on from where they stop (no snap back), and they are taken in', () => {
    const a = app();
    a.until(3);
    a.rig.keys.add('KeyW');
    a.until(3.4);
    a.rig.keys.delete('KeyW');
    const z = a.rig.pos.z;
    // (Their walk eases to a stop on its own; then the drift goes on from there.)
    const most = a.until(9.9);
    expect(most).toBeLessThan(0.02);
    expect(a.rig.pos.z).toBeLessThan(z);
    a.until(11);
    expect(a.inside.entered).toBe(true);
    expect(a.inside.locked).toBe(true);
  });

  it('a left-thumb turn while the drawing forms is a turn, not a step: they are taken in', () => {
    const a = app();
    a.until(3);
    a.rig.touchMove.set(0.6, 0);
    a.until(3.4);
    a.rig.touchMove.set(0, 0);
    a.until(11);
    expect(a.inside.entered).toBe(true);
  });

  it('a step back held while the drawing forms lets it go, under reduced motion too', () => {
    for (const reduced of [false, true]) {
      const a = app({ reduced });
      a.until(3);
      a.rig.keys.add('KeyS');
      a.until(3.5);
      a.rig.keys.delete('KeyS');
      a.until(11);
      expect(a.inside.entered, `reduced ${reduced}`).toBe(false);
      expect(a.inside.locked, `reduced ${reduced}`).toBe(false);
    }
  });

  it('a frame in which no time passed moves nothing; held at a position, it is on the curve', () => {
    const a = app();
    a.until(4);
    // Two seconds looking elsewhere, then back: catching up, with frames of no time among them.
    a.until(6, { away: true });
    let most = 0;
    for (let k = 0; k < 40; k++) {
      const x = a.rig.pos.x, z = a.rig.pos.z;
      a.frame({ dt: k % 4 === 0 ? 0 : 1 / 60 });
      most = Math.max(most, Math.hypot(a.rig.pos.x - x, a.rig.pos.z - z));
    }
    expect(most).toBeLessThan(0.02);
    // Held (the editor, a capture): exactly where the curve is.
    const b = app();
    b.until(5, { held: true });
    const c = app();
    c.until(5);
    expect(b.rig.pos.z).toBeCloseTo(c.rig.pos.z, 4);
    const x = b.rig.pos.x, z = b.rig.pos.z;
    b.frame({ dt: 0 });
    expect(b.rig.pos.x).toBe(x);
    expect(b.rig.pos.z).toBe(z);
  });

  it('a close-up stays through a small look round, and gives way at 14° for the rest of its shot', () => {
    const turnTo = (deg: number) => {
      const a = app();
      a.until(16.5);
      expect(a.inside.taken).toBe(true);
      const shots: number[] = [];
      // A slow turn (about 15° a second), then still while it springs back.
      while (a.inside.turned < (deg * Math.PI) / 180) {
        a.inside.look(2, 0);
        shots.push(a.frame({ shot: 1 }));
      }
      for (let k = 0; k < 240; k++) shots.push(a.frame({ shot: 1 }));
      return shots;
    };
    expect(turnTo(12).every((s) => s === 1)).toBe(true);
    const past = turnTo(20);
    const first = past.indexOf(0);
    expect(first).toBeGreaterThan(0);
    // (Once it has given way, it stays the wide, even after the turn springs back.)
    expect(past.slice(first).every((s) => s === 0)).toBe(true);
  });

  it('on an upright screen a close-up moves the view, not the body', () => {
    const a = app();
    a.until(16.5);
    const x = a.rig.pos.x, z = a.rig.pos.z;
    a.frame({ shot: 1, view: [0.3, 0.6] });
    a.frame({ shot: 1, view: [0.3, 0.6] });
    expect(a.rig.pos.x).toBeCloseTo(x, 3);
    expect(a.rig.pos.z).toBeCloseTo(z, 3);
  });
});
