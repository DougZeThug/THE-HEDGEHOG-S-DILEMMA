import { describe, it, expect } from 'vitest';
import { PHRASES, PHRASE_BY_ID } from '../src/content/phrases';
import { RECONTEXTS, VOICE_FRAGMENTS } from '../src/content/relations';
import { DIMENSIONS } from '../src/content/types';
import { DRAWING_IDS, FIRST_WRITTEN, FRAGMENT_IDS, MEMORY_IDS, PHRASE_IDS, SITUATION_IDS } from '../src/content/ids';
import { ALL_MEMORIES } from '../src/content/memories';
import { DRAWING_BY_ID } from '../src/content/drawings';
import { SITUATION_BY_ID } from '../src/state/situations/library';

describe('phrase corpus', () => {
  it('has unique ids', () => {
    expect(new Set(PHRASES.map((p) => p.id)).size).toBe(PHRASES.length);
  });
  it('every relation points at a real phrase', () => {
    for (const p of PHRASES) for (const r of [...(p.echoes ?? []), ...(p.contradicts ?? [])]) expect(PHRASE_BY_ID.has(r), `${p.id} → ${r}`).toBe(true);
    for (const r of RECONTEXTS) {
      expect(PHRASE_BY_ID.has(r.phrase)).toBe(true);
      expect(PHRASE_BY_ID.has(r.beside)).toBe(true);
    }
  });
  it('covers every emotional dimension', () => {
    for (const d of DIMENSIONS) expect(PHRASES.some((p) => (p.dims[d] ?? 0) >= 0.5), d).toBe(true);
  });
  it('dimension weights are in range', () => {
    for (const p of PHRASES) for (const v of Object.values(p.dims)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it('has writing on the walls at arrival, and something on the south wall', () => {
    const arrival = PHRASES.filter((p) => p.tier === 'arrival');
    expect(arrival.length).toBeGreaterThan(0);
    expect(arrival.some((p) => p.surface === 'south')).toBe(true);
  });
});

describe('ids the Director names', () => {
  it('every phrase id exists', () => {
    for (const id of Object.values(PHRASE_IDS)) expect(PHRASE_BY_ID.has(id), id).toBe(true);
    for (const id of FIRST_WRITTEN) expect(PHRASE_BY_ID.has(id), id).toBe(true);
  });
  it('every living memory id exists', () => {
    for (const id of Object.values(MEMORY_IDS)) expect(ALL_MEMORIES.some((m) => m.id === id), id).toBe(true);
  });
  it('every drawing a memory is written under exists', () => {
    for (const m of ALL_MEMORIES) if (m.under) expect(DRAWING_BY_ID.has(m.under), m.id).toBe(true);
  });
  it('every drawing, fragment and situation id exists', () => {
    for (const id of Object.values(DRAWING_IDS)) expect(DRAWING_BY_ID.has(id), id).toBe(true);
    for (const id of Object.values(FRAGMENT_IDS)) expect(VOICE_FRAGMENTS.some((f) => f.id === id), id).toBe(true);
    for (const id of Object.values(SITUATION_IDS)) expect(SITUATION_BY_ID.has(id), id).toBe(true);
  });
});
