/**
 * Regression: the `kneel` signal gate in Engagement must use the duration of the *current*
 * kneel episode, not the visitor's lifetime cumulative `kneelTime` (which is deliberately
 * cumulative for Memory.closeness and the Director's kneel-voice / departure rules).
 *
 * Bug (9b95b7c): `v.kneelTime > 1` was a lifetime counter, so after the first second of
 * kneeling *ever*, every later kneel — even a single tick — raised a full-weight `kneel`
 * signal the moment it began. Mashing the kneel toggle inflated depth at ~0.625 points/s
 * and could open the `transform` phase (depth 45) as fast as the phase floors allowed.
 *
 * Fix: Engagement tracks `kneelEpisode`, reset on standing, so each kneel must be held for
 * more than a second before the room notes it — a deliberate gesture, not a toggle to spam.
 */
import { describe, it, expect } from 'vitest';
import { Engagement } from '../src/state/Engagement';
import { VisitorModel, type VisitorInput } from '../src/state/VisitorModel';

const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
const dt = 0.1;

/** Drive a VisitorModel and its Engagement together for `seconds` with a fixed kneeling state. */
function step(v: VisitorModel, e: Engagement, seconds: number, kneeling: boolean) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    v.update(dt, { ...base, kneeling });
    e.update(dt, v, 0);
  }
}

describe('engagement: the kneel signal is a held gesture, not a toggle to spam', () => {
  it('a kneel held under a second is not noted; held past a second, it is noted once', () => {
    const v = new VisitorModel();
    const e = new Engagement();
    step(v, e, 0.9, true);
    expect(e.count('kneel')).toBe(0);
    step(v, e, 1.1, true); // total held ~2 s, crossing the 1 s note threshold
    expect(e.count('kneel')).toBe(1);
    step(v, e, 10, true); // keep holding: still exactly one — a held kneel is noted once
    expect(e.count('kneel')).toBe(1);
  });

  it('a brief kneel after a long one is not counted as a new gesture (the reported bug)', () => {
    const v = new VisitorModel();
    const e = new Engagement();
    step(v, e, 5, true); // a real, held kneel: one signal, lifetime kneelTime now well past 1 s
    expect(e.count('kneel')).toBe(1);
    step(v, e, 3, false); // stand (re-arms the gate)
    step(v, e, 0.1, true); // a brush — a single kneel tick
    expect(e.count('kneel')).toBe(1); // unchanged: the brush added nothing
    step(v, e, 3, false);
    step(v, e, 0.1, true); // a second brush also adds nothing
    expect(e.count('kneel')).toBe(1);
  });

  it('a second, held kneel is noted again — the room thanks a deliberate return', () => {
    const v = new VisitorModel();
    const e = new Engagement();
    step(v, e, 5, true);
    step(v, e, 3, false);
    step(v, e, 0.5, true); // not yet a second signal
    expect(e.count('kneel')).toBe(1);
    step(v, e, 1.1, true); // held past a second again
    expect(e.count('kneel')).toBe(2);
    step(v, e, 5, true);
    expect(e.count('kneel')).toBe(2); // once per held episode, not per second
  });

  it('VisitorModel.kneelTime stays lifetime-cumulative for its other consumers (Memory, Director)', () => {
    // The fix must not touch VisitorModel.kneelTime: Memory.closeness, Director.ruleKneel
    // (kneelTime < 4) and Director.leaving (kneelTime >= 8) all read the lifetime total.
    const v = new VisitorModel();
    const e = new Engagement();
    step(v, e, 4, true);
    step(v, e, 2, false);
    step(v, e, 4, true);
    step(v, e, 2, false);
    expect(v.kneelTime).toBeCloseTo(8, 5); // 4 + 4, not reset on standing
    expect(e.count('kneel')).toBe(2); // two separate held kneels, each noted once
  });
});
