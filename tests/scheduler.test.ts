import { describe, it, expect } from 'vitest';
import { EventScheduler } from '../src/core/scheduler';

describe('EventScheduler', () => {
  it('fires events in time order', () => {
    const s = new EventScheduler<string>(5);
    s.schedule(2, 'b');
    s.schedule(1, 'a');
    expect(s.tick(0.5)).toEqual([]);
    expect(s.tick(2)).toEqual(['a', 'b']);
    expect(s.pending().length).toBe(0);
  });
  it('spaces major events and defers rather than drops them', () => {
    const s = new EventScheduler<string>(5);
    s.schedule(1, 'm1', { major: true });
    s.schedule(1.5, 'm2', { major: true, ttl: 10 });
    expect(s.tick(2)).toEqual(['m1']);
    expect(s.tick(4)).toEqual([]);
    expect(s.tick(6.9)).toEqual([]);
    expect(s.tick(7.1)).toEqual(['m2']);
  });
  it('expires deferred majors past their ttl', () => {
    const s = new EventScheduler<string>(10);
    s.schedule(0, 'm1', { major: true });
    s.schedule(0, 'm2', { major: true, ttl: 2 });
    expect(s.tick(0)).toHaveLength(1);
    expect(s.tick(11)).toEqual([]);
  });
  it('replaces by key and cancels', () => {
    const s = new EventScheduler<string>();
    s.schedule(1, 'x', { key: 'k' });
    s.schedule(2, 'y', { key: 'k' });
    expect(s.pending().length).toBe(1);
    const id = s.schedule(3, 'z');
    s.cancel(id);
    expect(s.tick(10)).toEqual(['y']);
  });
  it('tracks cooldowns', () => {
    const s = new EventScheduler<string>();
    expect(s.ready('r', 0, 10)).toBe(true);
    s.mark('r', 0);
    expect(s.ready('r', 5, 10)).toBe(false);
    expect(s.ready('r', 10, 10)).toBe(true);
  });
});

describe('EventScheduler: putting a due event back', () => {
  it('as it was: its priority, its time to live from the new time', () => {
    const s = new EventScheduler<{ n: string }>(5);
    const a = { n: 'a' };
    s.schedule(1, a, { major: true, priority: 4, ttl: 10 });
    const due = s.tick(1);
    expect(due).toEqual([a]);
    expect(s.optsOf(a)).toEqual({ priority: 4, ttl: 10 });
    expect(s.optsOf({ n: 'never scheduled' })).toEqual({});
  });
  it('without its key if a newer event has taken it', () => {
    const s = new EventScheduler<{ n: string }>(5);
    const a = { n: 'a' };
    s.schedule(1, a, { key: 'k' });
    s.tick(1);
    expect(s.optsOf(a).key).toBe('k');
    s.schedule(5, { n: 'b' }, { key: 'k' });
    expect(s.optsOf(a).key).toBeUndefined();
  });
});

describe('EventScheduler: a major kept from earlier and one decided now', () => {
  const setup = (priority?: number) => {
    const s = new EventScheduler<string>(7);
    s.schedule(0, 'first', { major: true });
    s.schedule(1, 'kept', { major: true, ttl: 20 });
    expect(s.tick(0)).toEqual(['first']);
    expect(s.tick(1)).toEqual([]); // 'kept' waits for the gap
    // The gap has just passed: a moment is decided now, with a ttl shorter than the gap.
    s.schedule(7, 'decided', { major: true, ttl: 3, ...(priority === undefined ? {} : { priority }) });
    return s.tick(7);
  };
  it('an equal priority lets the older one take the slot, and the moment decided now is kept', () => {
    expect(setup()).toEqual(['kept']);
  });
  it('a higher priority lets the moment decided now go first (the other waits, it has time)', () => {
    expect(setup(3)).toEqual(['decided']);
  });
});

describe('EventScheduler: the room’s own gap', () => {
  it('the scheduler keeps the next of them until the gap has passed, and loses none', () => {
    const s = new EventScheduler<string>(7, 2.5);
    s.schedule(1, 'a', { room: true });
    s.schedule(1, 'b', { room: true });
    s.schedule(1, 'answer');
    expect(s.tick(1)).toEqual(['a', 'answer']);
    expect(s.tick(2)).toEqual([]);
    expect(s.tick(3.6)).toEqual(['b']);
  });

  it('a major one held back for the room’s gap takes no major slot, and is not lost', () => {
    const s = new EventScheduler<string>(7, 2.5);
    s.schedule(1, 'room', { room: true });
    s.schedule(2, 'major room', { room: true, major: true, ttl: 4 });
    expect(s.tick(1)).toEqual(['room']);
    expect(s.tick(2)).toEqual([]);
    expect(s.tick(3.6)).toEqual(['major room']);
    // A drawn gap: never a fixed pulse.
    let n = 0;
    const j = new EventScheduler<number>(7, () => [4, 6.5, 5][n++ % 3]);
    for (let i = 0; i < 4; i++) j.schedule(0, i, { room: true });
    const at: number[] = [];
    for (let t = 0; t < 20; t += 0.5) if (j.tick(t).length) at.push(t);
    expect(at).toEqual([0, 4, 10.5, 15.5]);
  });

});
