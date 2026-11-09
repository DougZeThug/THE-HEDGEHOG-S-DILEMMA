import { describe, it, expect } from 'vitest';
import { Director } from '../src/state/Director';
import type { VisitorInput } from '../src/state/VisitorModel';
import type { TimedCue } from '../src/state/cues';
import { PHRASE_BY_ID } from '../src/content/phrases';
import { MEMORIES } from '../src/memory/defs';
import { readFileSync } from 'node:fs';

const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
type Priv = {
  speakPhrase: (rule: string, p: unknown, pos: unknown, delay?: number) => boolean;
  memory: { spoken: Map<string, number> };
  memoryQuietUntil: number;
  hesitationOwed: boolean;
  onMotif: (m: string) => void;
  now: number;
};
const make = () => {
  const d = new Director({ seed: 3, situations: ['residue'] });
  d.release({ written: ['stay'] });
  return { d, p: d as unknown as Priv };
};
const run = (d: Director, seconds: number) => {
  const out: TimedCue[] = [];
  for (let t = 0; t < seconds; t += 0.1) out.push(...d.tick(0.1, base, 'north'));
  return out;
};

describe('a voice the room declines to say leaves no trace', () => {
  it('is not marked as spoken when it was never queued', () => {
    const { d, p } = make();
    p.memoryQuietUntil = p.now + 30;
    const line = PHRASE_BY_ID.get('closer')!;
    expect(p.speakPhrase('test', line, { kind: 'chair' })).toBe(false);
    expect(p.memory.spoken.has('closer')).toBe(false);
    p.memoryQuietUntil = -Infinity;
    expect(p.speakPhrase('test', line, { kind: 'chair' })).toBe(true);
    expect(p.memory.spoken.has('closer')).toBe(true);
    expect(run(d, 3).some((c) => c.cue.type === 'voice')).toBe(true);
  });

  it('owes the hesitation reply until the room can say it', () => {
    const { d, p } = make();
    p.memoryQuietUntil = p.now + 20;
    p.onMotif('hesitation');
    expect(p.hesitationOwed).toBe(true);
    const during = run(d, 15).filter((c) => c.rule === 'motif-hesitation');
    expect(during).toEqual([]);
    const after = run(d, 30).filter((c) => c.rule === 'motif-hesitation');
    expect(after.length).toBe(1);
    expect(p.hesitationOwed).toBe(false);
  });
});

describe('the Memory Editor', () => {
  it('knows a wall line for every memory it can list', () => {
    const src = readFileSync('src/memory/editor/MemoryEditor.ts', 'utf8');
    const map = /const PHRASE[^=]*=\s*\{([^}]*)\}/.exec(src)![1];
    for (const id of Object.keys(MEMORIES)) expect(map, id).toMatch(new RegExp(`\\b${id}:`));
  });
});
