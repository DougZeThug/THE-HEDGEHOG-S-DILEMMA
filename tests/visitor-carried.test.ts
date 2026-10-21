/**
 * Regression test for the `carried` contract on `VisitorInput` (decision 117): a memory that
 * carries the visitor's body across the near/withdraw/far bands is not the visitor's own
 * restlessness, so the band bookkeeping is paused while `carried` is true. The body's position
 * is still honestly observed (`distance`/`distanceSlow` keep updating), but no approach is
 * opened or closed, no withdrawal is stamped, no hesitation is counted, and `totalNear`/
 * `totalFar` do not accrue; once the carry ends, the visitor's own movement counts again.
 */
import { describe, it, expect } from 'vitest';
import { VisitorModel, BANDS, type VisitorInput } from '../src/state/VisitorModel';

const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
const inp = (o: Partial<VisitorInput>): VisitorInput => ({ ...base, ...o });

/** Drive a VisitorModel for `seconds` from `from` at `dt`, letting `script` set each tick's input. */
function driveModel(v: VisitorModel, script: (t: number) => VisitorInput, from: number, seconds: number, dt = 0.1) {
  for (let t = from; t < from + seconds; t += dt) v.update(dt, script(t));
}

describe('VisitorModel.carried', () => {
  it('does not record approach, withdrawal, hesitation, totalNear or totalFar while the body is carried across the bands', () => {
    // A still visitor at z=0.8 (inside the near band) carried linearly out to z=3.0 (past the
    // withdraw radius and the far band) over 8 s, gaze and yaw/pitch constant. Before the fix
    // the model recorded a closed approach with dwell ~4.7 s, a hesitation, a `lastWithdrawAt`
    // and ~4.7 s of `totalNear` from the carry, while `speed` stayed 0 and `movedDistance`
    // stayed 0 (the bug report's reproduction, carried one metre further to cross the far band).
    const v = new VisitorModel();
    // Stand inside the near band on the visitor's own two feet: opens an approach.
    driveModel(v, () => inp({ x: 0, z: 0.8 }), 0, 3);
    expect(v.near).toBe(true);
    expect(v.approaches.length).toBe(1);
    expect(v.approaches[0].leftAt).toBeNull();
    const approachedAt = v.approaches[0].enteredAt;
    const totalNearBefore = v.totalNear;
    const totalFarBefore = v.totalFar;
    expect(v.hesitations).toBe(0);
    expect(v.lastWithdrawAt).toBe(-Infinity);
    // The memory carries the body out across the near exit and the withdraw radius, past the
    // far band (BANDS.near=1.15, BANDS.withdraw=2.1, BANDS.far=2.6).
    const secs = 8, dt = 1 / 30;
    driveModel(v, (t) => inp({ x: 0, z: 0.8 + ((3.0 - 0.8) * (t - 3)) / secs, carried: true }), 3, secs, dt);
    // The body's position is honestly observed (it is where the memory put it: past the far band).
    expect(v.x).toBe(0);
    expect(v.distance).toBeGreaterThan(BANDS.far);
    // The carry was not the visitor's walking or looking.
    expect(v.movedDistance).toBe(0);
    expect(v.speed).toBeLessThan(0.04);
    // Nor was it their approach/withdrawal/closeness: the open approach is left open, none is
    // opened or closed, no withdrawal is stamped, no hesitation is counted, and the tallies
    // that feed the memory motifs and the director rules stay where they were.
    expect(v.approaches.length).toBe(1);
    expect(v.approaches[0].enteredAt).toBe(approachedAt);
    expect(v.approaches[0].leftAt).toBeNull();
    expect(v.lastWithdrawAt).toBe(-Infinity);
    expect(v.hesitations).toBe(0);
    expect(v.totalNear).toBe(totalNearBefore);
    expect(v.totalFar).toBe(totalFarBefore);
  });

  it("after the carry ends, the visitor's own band movement counts again (no hangover)", () => {
    // Guards against an over-fix that pauses the band bookkeeping forever: the carry is gated,
    // but a self-driven walk in and out afterwards opens an approach and counts a hesitation
    // exactly as the non-carried paths do.
    const v = new VisitorModel();
    // Stand far from the chair, then a memory carries the body all the way through the near
    // band and out the other side (nothing recorded by the gated block).
    driveModel(v, () => inp({ x: 0, z: 2.6 }), 0, 3);
    expect(v.near).toBe(false);
    expect(v.approaches.length).toBe(0);
    driveModel(v, (t) => inp({ x: 0, z: 2.6 + ((0.6 - 2.6) * (t - 3)) / 3, carried: true }), 3, 3, 1 / 30);
    expect(v.distance).toBeLessThanOrEqual(BANDS.near);
    expect(v.near).toBe(false); // the carry did not latch 'near'
    expect(v.approaches.length).toBe(0);
    // Now the visitor walks themselves in and out on their own two feet: their approach opens,
    // settles briefly (dwell < 9 s), and walks out past the withdraw radius — a hesitation.
    const walk = (from: number, to: number, secs: number) => {
      const n = secs * 10;
      for (let i = 0; i <= n; i++) v.update(0.1, inp({ x: 0, z: from + ((to - from) * i) / n }));
    };
    walk(0.6, 0.8, 1);
    walk(0.8, 0.8, 2);
    walk(0.8, 2.6, 3);
    expect(v.approaches.length).toBe(1);
    expect(v.hesitations).toBe(1);
    expect(v.lastWithdrawAt).toBeGreaterThan(0);
  });
});
