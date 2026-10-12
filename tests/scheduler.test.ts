import { describe, it, expect } from 'vitest';
import { EventScheduler } from '../src/core/scheduler';
import { Rng } from '../src/core/rng';

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

describe('Rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });
  it('weighted never picks zero weights', () => {
    const r = new Rng(1);
    for (let i = 0; i < 200; i++) expect(r.weighted([0, 1, 0, 2])).not.toBe(0);
    expect(r.weighted([0, 0])).toBe(-1);
  });
});
