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

  /** Run still until the line is offered (or is already there), late in the visit. */
  const untilOffered = (d: Director) => {
    const cues: TimedCue[] = [];
    for (let t = 0; t < 600; t += 0.1) {
      const out = d.tick(0.1, still, 'north');
      cues.push(...out);
      if (out.some((c) => c.rule === 'memory-offer')) return { cues, offered: true };
      if (d.now > 150 && d.visible.has(Director.MEMORY.phraseId) && (d.phase === 'contradiction' || d.phase === 'transform')) return { cues, offered: false };
    }
    return { cues, offered: false };
  };

  it('late, its line is written where the visitor looks, never earlier', () => {
    for (const seed of [3, 11, 27]) {
      const d = new Director({ seed });
      d.release({ written: ['stay'], spoken: ['crumbs'] });
      const { cues, offered } = untilOffered(d);
      expect(d.now, `seed ${seed}`).toBeGreaterThanOrEqual(150);
      expect(offered, `seed ${seed}`).toBe(true);
      const offer = cues.find((c) => c.rule === 'memory-offer')!;
      expect(offer.cue).toMatchObject({ type: 'write', surface: 'north', source: Director.MEMORY.phraseId });
      expect(['contradiction', 'transform']).toContain(d.phase);
      // Not looked at: no light.
      expect(cues.some((c) => c.cue.type === 'memory')).toBe(false);
    }
  });

  it('staying with it brings the light at 2.5 s, not later (30 seeds), and nothing talks over it', () => {
    const late: string[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const d = new Director({ seed });
      d.release({ written: ['stay'], spoken: ['crumbs'] });
      untilOffered(d);
      const t0 = d.now;
      const cues = run(d, 30, () => ({ ...still, gazePhraseId: Director.MEMORY.phraseId }));
      const mem = cues.find((c) => c.cue.type === 'memory');
      if (!mem || mem.t - t0 > 30.0) late.push(`seed ${seed}: ${mem ? (mem.t - t0).toFixed(1) + ' s' : 'never'}`);
      if (mem) {
        expect(mem.cue).toMatchObject({ phraseId: Director.MEMORY.phraseId, attack: 3, hold: 6, release: 4 });
        // Nothing else while they stay with it, either.
        const waiting = cues.filter((c) => c.t < mem.t && (c.cue.type === 'voice' || c.cue.type === 'write' || c.cue.type === 'reveal' || c.cue.type === 'music'));
        expect(waiting, `seed ${seed}`).toEqual([]);
        // Nothing of the room's own while it is there.
        const during = cues.filter((c) => c.t > mem.t && c.t < mem.t + 13 && !c.rule.startsWith('sit:') && (c.cue.type === 'voice' || c.cue.type === 'write' || c.cue.type === 'reveal'));
        expect(during, `seed ${seed}`).toEqual([]);
      }
    }
    expect(late).toEqual([]);
  });

  it('once a visit', () => {
    const d = new Director({ seed: 3 });
    d.release({ written: ['stay'], spoken: ['crumbs'] });
    untilOffered(d);
    const look = () => ({ ...still, gazePhraseId: Director.MEMORY.phraseId });
    expect(run(d, 10, look).filter((c) => c.cue.type === 'memory').length).toBe(1);
    expect(run(d, 200, look).some((c) => c.cue.type === 'memory')).toBe(false);
  });

  it('a touch on the line is enough (phones), even soon after another touch', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const d = new Director({ seed });
      d.release({ written: ['stay'], spoken: ['crumbs'] });
      untilOffered(d);
      d.tapped({ phraseId: Director.MEMORY.phraseId });
      run(d, 4, () => still);
      // Even if that first touch came before the room could answer, it is not lost.
      d.tapped({ phraseId: Director.MEMORY.phraseId });
      const all = [...run(d, 6, () => still)];
      expect(d.memoryPlayed || all.some((c) => c.cue.type === 'memory'), `seed ${seed}`).toBe(true);
    }
  });

  it('nothing else writes its line before the memory offers it (40 seeds, two walls)', () => {
    const early: string[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      for (const facing of ['north', 'east'] as const) {
        const d = new Director({ seed });
        d.release({ written: ['stay'], spoken: ['crumbs'] });
        for (let t = 0; t < 150; t += 0.1) {
          const out = d.tick(0.1, { ...still, gazePhraseId: t % 20 < 6 ? 'stay' : null }, facing);
          const hit = out.find((c) => c.rule !== 'memory-offer' && JSON.stringify(c.cue).includes(Director.MEMORY.phraseId));
          if (hit) early.push(`seed ${seed} ${facing} at ${d.now.toFixed(0)} s: ${hit.rule}`);
        }
        if (d.visible.has(Director.MEMORY.phraseId) && d.now < 150) early.push(`seed ${seed} ${facing}: visible`);
      }
    }
    expect(early).toEqual([]);
  });

  it('if its line found no room, it is offered again', () => {
    const d = new Director({ seed: 3 });
    d.release({ written: ['stay'], spoken: ['crumbs'] });
    untilOffered(d);
    d.writeFailed(`memory:${Director.MEMORY.phraseId}`);
    expect(d.visible.has(Director.MEMORY.phraseId)).toBe(false);
    expect(run(d, 60, () => still).some((c) => c.rule === 'memory-offer')).toBe(true);
  });
});
