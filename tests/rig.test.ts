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

describe('turning after the view was drawn to something', () => {
  it('keyboard turning takes the gaze back: the attended target does not pull it round again', () => {
    const r = opened();
    // (Close enough that it only turns to face it: nothing to walk, the gaze goal left to settle.)
    r.attend(new THREE.Vector3(r.pos.x + 2, 1.2, r.pos.z), 5);
    run(r, 0.3);
    run(r, 3, ['ArrowLeft']);
    const turned = r.yaw;
    run(r, 3);
    // Released, the view stays where the visitor turned it.
    expect(Math.abs(r.yaw - turned)).toBeLessThan(0.3);
    // And the turn went on past what the spring would have allowed (about a radian).
    expect(turned).toBeGreaterThan(1.5);
  });
});
