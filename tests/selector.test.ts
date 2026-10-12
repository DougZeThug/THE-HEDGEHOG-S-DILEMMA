import { describe, it, expect } from 'vitest';
import { PhraseSelector } from '../src/state/PhraseSelector';
import { Memory } from '../src/state/Memory';
import { Rng } from '../src/core/rng';
import type { FieldValues } from '../src/state/EmotionalField';
import { PHRASE_BY_ID } from '../src/content/phrases';

const field = (o: Partial<FieldValues>): FieldValues => ({ warmth: 0, exposure: 0, solitude: 0, relief: 0, tension: 0, reminiscence: 0, hush: 0, dissonance: 0, ...o });

describe('PhraseSelector', () => {
  const sel = new PhraseSelector();
  const ctx = (f: Partial<FieldValues>, seed = 1, mem = new Memory()) => ({ field: field(f), phase: 'transform' as const, memory: mem, now: 100, recentRead: [], rng: new Rng(seed) });

  it('is deterministic with a seed', () => {
    const a = sel.select(ctx({ warmth: 0.8 }, 5));
    const b = sel.select(ctx({ warmth: 0.8 }, 5));
    expect(a?.id).toBe(b?.id);
  });
  it('follows the field', () => {
    const warm = sel.score(PHRASE_BY_ID.get('good-day')!, ctx({ warmth: 0.9, reminiscence: 0.6 }));
    const cold = sel.score(PHRASE_BY_ID.get('good-day')!, ctx({ exposure: 0.9, tension: 0.7 }));
    expect(warm).toBeGreaterThan(cold);
  });
  it('contrast can pull against the field', () => {
    const p = PHRASE_BY_ID.get('good-day')!;
    const c = ctx({ exposure: 0.9, tension: 0.7 });
    expect(sel.score(p, c, { contrast: 0.9 })).toBeGreaterThan(sel.score(p, c, { contrast: 0 }));
  });
  it('penalises recently surfaced phrases', () => {
    const mem = new Memory();
    const p = PHRASE_BY_ID.get('good-day')!;
    const before = sel.score(p, ctx({ warmth: 0.8 }, 1, mem));
    mem.surfaced.set('good-day', 95);
    expect(sel.score(p, ctx({ warmth: 0.8 }, 1, mem))).toBeLessThan(before - 0.3);
  });
  it('hesitation motif biases towards hesitation language', () => {
    const mem = new Memory();
    const p = PHRASE_BY_ID.get('if-closer')!;
    const before = sel.score(p, ctx({}, 1, mem));
    mem.strength.hesitation = 1;
    expect(sel.score(p, ctx({}, 1, mem))).toBeGreaterThan(before + 0.2);
  });
  it('boosts contradictions of what was just read, late in the visit', () => {
    const p = PHRASE_BY_ID.get('closer')!;
    const c = { ...ctx({}), recentRead: ['stay'] };
    expect(sel.score(p, c)).toBeGreaterThan(sel.score(p, ctx({})) + 0.25);
  });
});
