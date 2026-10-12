import { describe, it, expect } from 'vitest';
import { PHRASES, PHRASE_BY_ID } from '../src/content/phrases';
import { RECONTEXTS, VOICE_FRAGMENTS } from '../src/content/relations';
import { DIMENSIONS } from '../src/content/types';

describe('phrase corpus', () => {
  it('has 80–120 phrases with unique ids', () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(80);
    expect(PHRASES.length).toBeLessThanOrEqual(120);
    expect(new Set(PHRASES.map((p) => p.id)).size).toBe(PHRASES.length);
  });
  it('every relation points at a real phrase', () => {
    for (const p of PHRASES) for (const r of [...(p.echoes ?? []), ...(p.contradicts ?? [])]) expect(PHRASE_BY_ID.has(r), `${p.id} → ${r}`).toBe(true);
    for (const r of RECONTEXTS) {
      expect(PHRASE_BY_ID.has(r.phrase)).toBe(true);
      expect(PHRASE_BY_ID.has(r.beside)).toBe(true);
    }
  });
  it('covers every emotional dimension, and most phrases are more than one thing', () => {
    for (const d of DIMENSIONS) expect(PHRASES.some((p) => (p.dims[d] ?? 0) >= 0.5), d).toBe(true);
    const multi = PHRASES.filter((p) => Object.keys(p.dims).length >= 2).length;
    expect(multi / PHRASES.length).toBeGreaterThan(0.75);
  });
  it('dimension weights are in range', () => {
    for (const p of PHRASES) for (const v of Object.values(p.dims)) expect(v).toBeGreaterThan(0), expect(v).toBeLessThanOrEqual(1);
  });
  it('has enough writing on the walls at arrival, and something on the south wall', () => {
    const arrival = PHRASES.filter((p) => p.tier === 'arrival');
    expect(arrival.length).toBeGreaterThanOrEqual(30);
    expect(arrival.some((p) => p.surface === 'south')).toBe(true);
  });
  it('voice fragments are well formed', () => {
    for (const f of VOICE_FRAGMENTS) expect(f.caption.length).toBeGreaterThan(0);
  });
});
