import { describe, it, expect } from 'vitest';
import { Director } from '../src/state/Director';
import { PHRASE_BY_ID } from '../src/content/phrases';
import { run } from './sim';

type Priv = {
  speakPhrase: (rule: string, p: unknown, pos: unknown, delay?: number) => boolean;
  voicing: { hesitationOwed: boolean; onMotif: (m: string) => void };
};
const make = () => {
  const d = new Director({ seed: 3, situations: ['residue'] });
  d.release({ written: ['stay'] });
  return { d, p: d as unknown as Priv };
};

describe('a voice the room declines to say leaves no trace', () => {
  it('is not marked as spoken when it was never queued', () => {
    const { d, p } = make();
    d.shared.memoryQuietUntil = d.now + 30;
    const line = PHRASE_BY_ID.get('closer')!;
    expect(p.speakPhrase('test', line, { kind: 'chair' })).toBe(false);
    expect(d.memory.spoken.has('closer')).toBe(false);
    d.shared.memoryQuietUntil = -Infinity;
    expect(p.speakPhrase('test', line, { kind: 'chair' })).toBe(true);
    expect(d.memory.spoken.has('closer')).toBe(true);
    expect(run(d, 3).some((c) => c.cue.type === 'voice')).toBe(true);
  });

  it('owes the hesitation reply until the room can say it', () => {
    const { d, p } = make();
    d.shared.memoryQuietUntil = d.now + 20;
    p.voicing.onMotif('hesitation');
    expect(p.voicing.hesitationOwed).toBe(true);
    const during = run(d, 15).filter((c) => c.rule === 'motif-hesitation');
    expect(during).toEqual([]);
    const after = run(d, 30).filter((c) => c.rule === 'motif-hesitation');
    expect(after.length).toBe(1);
    expect(p.voicing.hesitationOwed).toBe(false);
  });
});
