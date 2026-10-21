import { describe, it, expect } from 'vitest';
import { EventScheduler } from '../src/core/scheduler';
import { Director } from '../src/state/Director';
import { simulate, scripts } from './sim';
import type { Cue } from '../src/state/cues';

describe('requeue preserves scheduler options (Director.accept bug fix)', () => {
  it('a requeued sit: cue keeps its major flag, key, priority and expires across the requeue', () => {
    for (const seed of [1, 2, 3]) {
      const d = new Director({ seed, situations: ['humming'] });
      d.release();
      simulate(scripts.still, 30, seed, 0.1, d);
      const dn = d as unknown as {
        now: number;
        aftermathUntil: number;
        queue: (delay: number, cue: Cue, rule: string, opts?: { major?: boolean; key?: string; ttl?: number; priority?: number }) => void;
        scheduler: { pending(): { at: number; major: boolean; expires?: number; key?: string; priority: number; payload: { cue: Cue; rule: string } }[] };
      };
      dn.aftermathUntil = dn.now + 30;
      const musicCue: Cue = { type: 'music', mood: 'tender', notes: 4, truncate: false, melody: [60, 62, 64, 65] };
      dn.queue(0, musicCue, 'sit:humming', { major: true, ttl: 20, key: 'piano', priority: 3 });
      const before = dn.scheduler.pending().find((e) => e.payload.rule === 'sit:humming')!;
      expect(before.major, `seed ${seed}: original is major`).toBe(true);
      expect(before.key, `seed ${seed}: original key`).toBe('piano');
      expect(before.priority, `seed ${seed}: original priority`).toBe(3);
      expect(before.expires, `seed ${seed}: original expires`).not.toBe(undefined);

      const tickOut = d.tick(0.1, { x: 0.1, z: 2.2, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false }, 'north');
      expect(tickOut.some((c) => c.cue.type === 'music'), `seed ${seed}: requeued sit: cue held out of the aftermath`).toBe(false);
      const after = dn.scheduler.pending().find((e) => e.payload.rule === 'sit:humming')!;
      expect(after, `seed ${seed}: requeued copy is still pending`).toBeTruthy();
      expect(after.major, `seed ${seed}: requeued copy keeps major`).toBe(true);
      expect(after.key, `seed ${seed}: requeued copy keeps key`).toBe('piano');
      expect(after.priority, `seed ${seed}: requeued copy keeps priority`).toBe(3);
      expect(after.expires, `seed ${seed}: requeued copy has an expiry`).not.toBe(undefined);
    }
  });

  it('a cue without ttl before requeue still has no expires on the requeued copy', () => {
    const d = new Director({ seed: 1, situations: ['humming'] });
    d.release();
    simulate(scripts.still, 30, 1, 0.1, d);
    const dn = d as unknown as {
      aftermathUntil: number;
      queue: (delay: number, cue: Cue, rule: string, opts?: { major?: boolean }) => void;
      scheduler: { pending(): { at: number; major: boolean; expires?: number; payload: { cue: Cue; rule: string } }[] };
    };
    dn.aftermathUntil = d.now + 30;
    const cue: Cue = { type: 'sound', kind: 'chair-creak', position: { kind: 'chair' }, gain: 0.3 };
    dn.queue(0, cue, 'sit:humming', { major: true });
    d.tick(0.1, { x: 0.1, z: 2.2, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false }, 'north');
    const after = dn.scheduler.pending().find((e) => e.payload.rule === 'sit:humming')!;
    expect(after.expires, 'no-ttl before requeue → no expires after').toBe(undefined);
    expect(after.major, 'no-ttl before requeue → major still preserved').toBe(true);
  });

  it('a requeued copy can expire and be reported via scheduler.expired when no major slot opens in its window', () => {
    const s = new EventScheduler<{ cue: Cue; rule: string }>(7, 2.5);
    s.schedule(1, { cue: { type: 'silence', depth: 0.5, seconds: 1 }, rule: 'blocker' }, { major: true, priority: 5 });
    s.schedule(1, { cue: { type: 'music', mood: 'tender', notes: 4, truncate: false }, rule: 'music' }, { major: true, ttl: 5, key: 'mk', priority: 2 });
    expect(s.tick(1)).toEqual([{ cue: { type: 'silence', depth: 0.5, seconds: 1 }, rule: 'blocker' }]);
    s.schedule(2, { cue: { type: 'silence', depth: 0.5, seconds: 1 }, rule: 'blocker2' }, { major: true, priority: 5 });
    expect(s.tick(2)).toEqual([]);
    expect(s.expired.length, 'the deferred music with ttl:5 not yet expired').toBe(0);
    const out = s.tick(10);
    expect(out, 'blocker2 fired at t=10').toEqual([{ cue: { type: 'silence', depth: 0.5, seconds: 1 }, rule: 'blocker2' }]);
    expect(s.expired.length, 'music cue expired (ttl:5 + at=1, expires=6, fired at t≫6)').toBeGreaterThanOrEqual(1);
    const expired = s.expired.find((e) => e.rule === 'music');
    expect(expired, 'the expired event is the music one').toBeTruthy();
  });
});

describe('same-tick same-rule co-fire elimination (Director.accept bug fix)', () => {
  it('two independent major same-group room events queued at the same tick are not both dispatched', () => {
    type P = { cue: Cue; rule: string };
    const s = new EventScheduler<P>(7, 2.5);
    const a: P = { cue: { type: 'music', mood: 'warm', notes: 4, truncate: false }, rule: 'music' };
    const b: P = { cue: { type: 'music', mood: 'uneasy', notes: 5, truncate: false }, rule: 'music' };
    s.schedule(10, a, { major: true, ttl: 30, room: true, group: 'music' });
    s.schedule(10, b, { major: true, ttl: 30, room: true, group: 'music' });
    const out = s.tick(10);
    expect(out.length, 'only one of two co-due major room events fires in one tick').toBe(1);
    expect(s.pending().length, 'the other is held').toBe(1);
    expect(out[0].rule, 'the dispatched one is a music event').toBe('music');
  });

  it('the room-gap sameEvent exemption no longer admits a second independent same-group event when both are major', () => {
    type P = { cue: Cue; rule: string };
    const s = new EventScheduler<P>(7, 2.5);
    s.schedule(10, { cue: { type: 'music', mood: 'warm', notes: 4, truncate: false }, rule: 'music' }, { major: true, ttl: 30, room: true, group: 'music' });
    s.schedule(10.1, { cue: { type: 'music', mood: 'uneasy', notes: 5, truncate: false }, rule: 'music' }, { major: true, ttl: 30, room: true, group: 'music' });
    const out = s.tick(10.1);
    expect(out.length, 'first fires; second held by the major gap even though group matches').toBe(1);
  });

  it('a requeued copy that previously would have lost its major flag still defers a same-tick twin', () => {
    type P = { cue: Cue; rule: string };
    const s = new EventScheduler<P>(7, 2.5);
    s.schedule(10, { cue: { type: 'music', mood: 'warm', notes: 4, truncate: false }, rule: 'music' }, { major: true, ttl: 30, room: true, group: 'music' });
    s.schedule(10.2, { cue: { type: 'music', mood: 'uneasy', notes: 6, truncate: false }, rule: 'music' }, { major: false, ttl: 30, room: true, group: 'music' });
    const outBuggy = s.tick(10.2);
    expect(outBuggy.length, 'bug repro: the non-major twin slips through sameEvent').toBe(2);
    expect(s.pending().length).toBe(0);

    const s2 = new EventScheduler<P>(7, 2.5);
    s2.schedule(10, { cue: { type: 'music', mood: 'warm', notes: 4, truncate: false }, rule: 'music' }, { major: true, ttl: 30, room: true, group: 'music' });
    s2.schedule(10.2, { cue: { type: 'music', mood: 'uneasy', notes: 6, truncate: false }, rule: 'music' }, { major: true, ttl: 30, room: true, group: 'music' });
    const outFixed = s2.tick(10.2);
    expect(outFixed.length, 'fix: preserving major => second held by major gap').toBe(1);
    expect(s2.pending().length, 'fix: the deferred twin remains in the queue').toBe(1);
  });
});
