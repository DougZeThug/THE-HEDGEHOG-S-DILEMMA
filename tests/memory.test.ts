import { describe, it, expect } from 'vitest';
import { Director } from '../src/state/Director';
import type { VisitorInput } from '../src/state/VisitorModel';
import type { TimedCue } from '../src/state/cues';

const still: VisitorInput = { x: 0.1, z: 2.2, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
const run = (d: Director, seconds: number, input: (t: number) => VisitorInput, facing: 'north' | 'east' = 'north') => {
  const out: TimedCue[] = [];
  for (let t = 0; t < seconds; t += 0.1) out.push(...d.tick(0.1, input(t), facing));
  return out;
};

describe('a memory intruding as light', () => {
  it('is kept back from the first writing: not spent on arrival', () => {
    expect(Director.FIRST_WRITTEN).not.toContain(Director.MEMORY.phraseId);
  });

  for (const seed of [3, 11, 27]) {
    it(`seed ${seed}: late, its line is written where the visitor looks; staying with it brings the light, once`, () => {
      const d = new Director({ seed });
      d.release({ written: ['stay'], spoken: ['crumbs'] });
      const early = run(d, 150, () => still);
      expect(early.some((c) => c.cue.type === 'memory' || c.rule === 'memory-offer')).toBe(false);
      const later = run(d, 200, () => still);
      const offer = later.find((c) => c.rule === 'memory-offer');
      // Offered once the room has begun to contradict itself, on the wall being faced, as a repeat of the line.
      if (offer) {
        expect(offer.cue).toMatchObject({ type: 'write', surface: 'north', source: Director.MEMORY.phraseId });
        expect(['contradiction', 'transform']).toContain(d.phase);
      } else expect(d.visible.has(Director.MEMORY.phraseId)).toBe(true);
      // Not looked at: no light.
      expect(later.some((c) => c.cue.type === 'memory')).toBe(false);
      // Stay with it: the light.
      const looked = run(d, 40, () => ({ ...still, gazePhraseId: Director.MEMORY.phraseId }));
      const mem = looked.filter((c) => c.cue.type === 'memory');
      expect(mem.length).toBe(1);
      expect(mem[0].cue).toMatchObject({ phraseId: Director.MEMORY.phraseId, attack: 3, hold: 6, release: 4 });
      // And nothing else strong while it is there.
      const during = looked.filter((c) => c.t > mem[0].t && c.t < mem[0].t + 13 && (c.cue.type === 'voice' || c.cue.type === 'write' || c.cue.type === 'reveal'));
      expect(during.length).toBe(0);
      // Once a visit.
      expect(run(d, 120, () => ({ ...still, gazePhraseId: Director.MEMORY.phraseId })).some((c) => c.cue.type === 'memory')).toBe(false);
    });
  }

  it('a touch on the line is enough (phones)', () => {
    const d = new Director({ seed: 3 });
    d.release({ written: ['stay'], spoken: ['crumbs'] });
    run(d, 360, () => still);
    expect(d.visible.has(Director.MEMORY.phraseId)).toBe(true);
    d.tapped({ phraseId: Director.MEMORY.phraseId });
    expect(run(d, 3, () => still).some((c) => c.cue.type === 'memory')).toBe(true);
  });

  it('not while held', () => {
    const d = new Director({ seed: 3 });
    d.hold();
    expect(run(d, 400, () => ({ ...still, gazePhraseId: Director.MEMORY.phraseId })).length).toBe(0);
  });
});
