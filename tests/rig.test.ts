import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraRig, OPENING_POS } from '../src/world/CameraRig';
import { Director } from '../src/state/Director';
import type { Room } from '../src/world/Room';
import type { VisitorInput } from '../src/state/VisitorModel';

const room = { halfW: 3.2, halfD: 3.2 } as unknown as Room;
const chair = new THREE.Vector3();
const opened = () => {
  const r = new CameraRig(16 / 10);
  r.frameOpening(16 / 10);
  r.walk = true;
  return r;
};
const run = (r: CameraRig, seconds: number, keys: string[] = []) => {
  for (const k of keys) r.keys.add(k);
  const eyes: number[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    r.update(1 / 60, room, chair);
    eyes.push(r.eyeHeight);
  }
  for (const k of keys) r.keys.delete(k);
  return eyes;
};

describe('the opening seen low, standing up on the first step', () => {
  it('starts low and centred, as the reference is framed', () => {
    const r = opened();
    expect(r.pos.x).toBe(OPENING_POS.x);
    expect(r.pos.z).toBe(OPENING_POS.z);
    expect(r.eyeHeight).toBeCloseTo(1.4, 3);
  });

  it('looking around never stands the visitor up', () => {
    const r = opened();
    run(r, 3, ['ArrowLeft']);
    r.look(200, 50);
    run(r, 5);
    expect(r.eyeHeight).toBeCloseTo(1.4, 2);
  });

  it('a tap of a key doesn’t; a step does, once, eased at both ends', () => {
    const r = opened();
    run(r, 0.1, ['KeyW']);
    run(r, 3);
    expect(r.eyeHeight).toBeCloseTo(1.4, 2);
    const eyes = [...run(r, 0.5, ['KeyW']), ...run(r, 3)];
    expect(eyes[eyes.length - 1]).toBeCloseTo(1.58, 2);
    const speeds = eyes.slice(1).map((e, i) => (e - eyes[i]) * 60);
    // Never a lurch: it starts from rest (a few mm/s in its first frame) and peaks gently.
    const first = speeds.findIndex((v) => v > 0);
    expect(speeds[first]).toBeLessThan(0.02);
    expect(Math.max(...speeds)).toBeLessThan(0.5);
    // Once up, up: a later stillness or look leaves it standing.
    run(r, 4, ['ArrowLeft']);
    expect(r.eyeHeight).toBeCloseTo(1.58, 2);
  });

  it('under reduced motion, or after leaving and returning, the visitor is standing, with no rise', () => {
    const r = new CameraRig(16 / 10);
    r.reducedMotion = true;
    r.frameOpening(16 / 10);
    expect(r.eyeHeight).toBeCloseTo(1.58, 3);
    const s = opened();
    s.stand();
    expect(s.eyeHeight).toBeCloseTo(1.58, 3);
    s.walk = true;
    expect(Math.max(...run(s, 2, ['KeyW'])) - 1.58).toBeLessThan(1e-6);
  });
});

describe('where the visitor is put decides nothing by a few centimetres', () => {
  // A phone visitor who stays where the opening left them (2.3 m from the chair) still has the
  // room's slow loneliness and growth, as someone at 2.55 m always did.
  const still = (z: number): VisitorInput => ({ x: 0, z, yaw: 0, pitch: -0.1, gazePhraseId: null, gazeChair: true, nearSurface: null, kneeling: false });
  for (const z of [OPENING_POS.zPortrait, OPENING_POS.z]) {
    it(`staying at ${z} m: solitude by two minutes, the room larger by three`, () => {
      const d = new Director({ seed: 3 });
      d.release({ written: ['stay'], spoken: ['crumbs'] });
      for (let t = 0; t < 180; t += 0.1) {
        d.tick(0.1, still(z), 'north');
        if (Math.abs(t - 120) < 0.05) expect(d.field.v.solitude).toBeGreaterThan(0.45);
      }
      expect(d.env.roomScale).toBeGreaterThan(1.1);
    });
  }
});

// Post-attend gaze: a deliberate turn (keyboard arrows or the touch walk-thumb)
// takes the gaze back, like a mouse/touch drag-look already does. Before the
// fix, the lookGoal spring kept easing the view toward the attended target every
// frame after a short attend arrived, fought and capped a held turn at ~yawVel × τ
// (≈1.0 rad off the target) and erased it on release — see the bug report.
describe('a turn after an attend walk arrives overrides the lingering gaze spring', () => {
  const room = { halfW: 3.2, halfD: 3.2 } as unknown as Room;
  const chair = new THREE.Vector3();
  const freshRig = () => {
    const r = new CameraRig(16 / 10);
    r.walk = true;
    // Standing, centred, facing -z (yaw 0): a known, simple starting state.
    r.pos.set(0, 0, 0);
    r.yaw = 0;
    r.pitch = 0;
    return r;
  };
  // A short attend: ≈0.5 m walk toward a target 1 m ahead, gaze aimed ~π rad away
  // (the body must turn 180° on arrival). The 0.9 s gaze spring does not converge
  // inside that short walk, so lookGoal is still set when the walk completes —
  // the precondition the bug strikes in.
  const shortAttend = (r: CameraRig) => r.attend(new THREE.Vector3(0, 0.35, 1.0), 0.5);
  const lookGoal = (r: CameraRig) =>
    (r as unknown as { lookGoal: { yaw: number; pitch: number } | null }).lookGoal;
  const step = (r: CameraRig, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) r.update(1 / 60, room, chair);
  };

  it('a held turn after arrival clears lookGoal at once, like a drag-look does', () => {
    const r = freshRig();
    shortAttend(r);
    step(r, 3);
    expect(lookGoal(r)).not.toBeNull();
    r.keys.add('ArrowLeft');
    r.update(1 / 60, room, chair);
    expect(lookGoal(r)).toBeNull();
  });

  it('a held turn advances freely and is not undone on release (no spring-back)', () => {
    const r = freshRig();
    shortAttend(r);
    step(r, 3);
    const yawAtArrival = r.yaw;
    r.keys.add('ArrowLeft');
    step(r, 2);
    const yawAfterTurn = r.yaw;
    // Pre-fix the spring capped the yaw near yawVel × τ (~1.0 rad off the
    // attended target) and froze it there; post-fix the turn advances at the
    // full eased rate (~2 rad in 2 s).
    expect(yawAfterTurn - yawAtArrival).toBeGreaterThan(1.5);
    r.keys.delete('ArrowLeft');
    step(r, 1);
    // Pre-fix the spring snapped the view all the way back to the attended
    // target, erasing the turn; post-fix the visitor's turn stays put — still
    // turned well past the attended direction, never falling back toward it.
    expect(r.yaw - yawAtArrival).toBeGreaterThan(1.5);
    expect(r.yaw).toBeGreaterThanOrEqual(yawAfterTurn);
  });

  it('the touch walk-thumb turn after arrival also overrides the spring', () => {
    const r = freshRig();
    shortAttend(r);
    step(r, 3);
    expect(lookGoal(r)).not.toBeNull();
    r.touchMove.x = 0.5;
    r.update(1 / 60, room, chair);
    expect(lookGoal(r)).toBeNull();
    r.touchMove.x = 0;
  });

  it('walking input (fwd/strafe) alone after arrival does not clear lookGoal', () => {
    // The fix is scoped to `turn`: walking away after arrival keeps the view
    // pinned facing the attended target for a few seconds — the case the bug
    // report flags as self-resolving and far less disorienting than the turn
    // fight (and so deliberately left untouched).
    const r = freshRig();
    shortAttend(r);
    step(r, 3);
    expect(lookGoal(r)).not.toBeNull();
    r.keys.add('KeyW');
    r.update(1 / 60, room, chair);
    expect(lookGoal(r)).not.toBeNull();
  });
});
