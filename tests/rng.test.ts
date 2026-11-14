import { describe, it, expect } from 'vitest';
import { Rng } from '../src/core/rng';

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
