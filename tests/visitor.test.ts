import { describe, it, expect } from 'vitest';
import { VisitorModel, type VisitorInput } from '../src/state/VisitorModel';

const inp = (o: Partial<VisitorInput>): VisitorInput => ({ x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false, ...o });

describe('VisitorModel', () => {
  it('measures stillness, and movement resets it', () => {
    const v = new VisitorModel();
    for (let i = 0; i < 100; i++) v.update(0.1, inp({}));
    expect(v.stillFor).toBeGreaterThan(9);
    expect(v.deepStillFor).toBeGreaterThan(9);
    for (let i = 0; i < 10; i++) v.update(0.1, inp({ z: 2.4 - i * 0.1 }));
    expect(v.stillFor).toBe(0);
    expect(v.longestStill).toBeGreaterThan(9);
  });
  it('looking around is still, but not deep stillness', () => {
    const v = new VisitorModel();
    for (let i = 0; i < 100; i++) v.update(0.1, inp({ yaw: i * 0.08 }));
    expect(v.stillFor).toBeGreaterThan(9);
    expect(v.deepStillFor).toBeLessThan(2);
  });
  it('counts approach → quick retreat as hesitation, but not a long stay', () => {
    const v = new VisitorModel();
    const walk = (from: number, to: number, secs: number) => {
      const n = secs * 10;
      for (let i = 0; i <= n; i++) v.update(0.1, inp({ z: from + ((to - from) * i) / n }));
    };
    walk(2.6, 0.8, 3);
    walk(0.8, 0.8, 2);
    walk(0.8, 2.6, 3);
    expect(v.hesitations).toBe(1);
    walk(2.6, 0.8, 3);
    walk(0.8, 0.8, 20);
    walk(0.8, 2.6, 3);
    expect(v.hesitations).toBe(1);
    expect(v.approaches.length).toBe(2);
  });
  it('has hysteresis: hovering at the edge is not repeated approaches', () => {
    const v = new VisitorModel();
    for (let i = 0; i < 200; i++) v.update(0.1, inp({ z: 1.15 + Math.sin(i * 0.3) * 0.1 }));
    expect(v.approaches.length).toBeLessThanOrEqual(1);
  });
  it('does not take a memory\'s carry for the visitor approaching or withdrawing', () => {
    const sweep = (v: VisitorModel, carried: boolean) => {
      for (let i = 0; i < 20; i++) v.update(0.1, inp({ carried }));
      const n = 60;
      for (const [from, to] of [[2.4, 0.8], [0.8, 2.8]]) {
        for (let i = 0; i <= n; i++) v.update(0.1, inp({ z: from + ((to - from) * i) / n, carried }));
      }
    };
    const carriedV = new VisitorModel();
    sweep(carriedV, true);
    expect(carriedV.approaches.length).toBe(0);
    expect(carriedV.hesitations).toBe(0);
    expect(carriedV.totalNear).toBe(0);
    expect(carriedV.totalFar).toBe(0);
    expect(carriedV.near).toBe(false);
    expect(carriedV.lastWithdrawAt).toBe(-Infinity);
    expect(carriedV.distance).toBeCloseTo(2.8);
    expect(carriedV.movedDistance).toBe(0);

    const ownV = new VisitorModel();
    sweep(ownV, false);
    expect(ownV.approaches.length).toBe(1);
    expect(ownV.hesitations).toBe(1);
    expect(ownV.totalNear).toBeGreaterThan(0);
  });
  it('marks phrases as read after sustained attention', () => {
    const v = new VisitorModel();
    for (let i = 0; i < 10; i++) v.update(0.1, inp({ gazePhraseId: 'stay' }));
    expect(v.read.has('stay')).toBe(false);
    for (let i = 0; i < 10; i++) v.update(0.1, inp({ gazePhraseId: 'stay' }));
    expect(v.read.has('stay')).toBe(true);
  });
});
