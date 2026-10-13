import { describe, it, expect } from 'vitest';
import { simulate, scripts, rules } from './sim';
import { Director } from '../src/state/Director';
import { interpretLocally } from '../src/interpret/LocalInterpreter';

describe('Director', () => {
  it('is deterministic for a given seed and behaviour', () => {
    const a = simulate(scripts.wanderer, 200, 11).cues.map((c) => JSON.stringify(c));
    const b = simulate(scripts.wanderer, 200, 11).cues.map((c) => JSON.stringify(c));
    expect(a).toEqual(b);
  });

  it('a visitor who only stands still still experiences the room changing', () => {
    const { d, cues } = simulate(scripts.still, 240);
    const r = rules(cues);
    expect(r.has('still-1')).toBe(true);
    expect(r.has('still-silence')).toBe(true);
    expect(d.phase).not.toBe('arrival');
    expect(d.memory.has('stillness')).toBe(true);
  });

  it('stillness is not a fixed ladder: what it brings varies between visits', () => {
    const firstAt = new Set<number>();
    let withVoice = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { cues } = simulate(scripts.still, 120, seed);
      const s1 = cues.find((c) => c.rule === 'still-1');
      if (s1) firstAt.add(Math.round(s1.t));
      if (cues.some((c) => c.rule === 'still-voice')) withVoice++;
    }
    expect(firstAt.size).toBeGreaterThan(3);
    expect(withVoice).toBeGreaterThan(0);
    expect(withVoice).toBeLessThan(12);
  });

  it('the chair does not answer every approach with a voice', () => {
    let voiced = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { cues } = simulate(scripts.close, 30, seed);
      if (cues.some((c) => c.rule === 'first-approach' && c.cue.type === 'voice')) voiced++;
      expect(cues.some((c) => c.rule === 'first-approach' && c.cue.type === 'silence')).toBe(true);
    }
    expect(voiced).toBeLessThan(9);
  });

  it('a hesitant visitor forms the hesitation motif and the room answers with hesitation', () => {
    const { d, cues } = simulate(scripts.hesitant, 200);
    expect(d.memory.has('hesitation')).toBe(true);
    expect(rules(cues).has('motif-hesitation')).toBe(true);
    expect(d.env.shadowDrift).toBeGreaterThan(0.3);
  });

  it('different behaviour produces meaningfully different experiences', () => {
    const sets = Object.fromEntries(Object.entries(scripts).map(([k, s]) => [k, rules(simulate(s, 260).cues)]));
    const jaccard = (a: Set<string>, b: Set<string>) => {
      const inter = [...a].filter((x) => b.has(x)).length;
      return inter / new Set([...a, ...b]).size;
    };
    expect(jaccard(sets.still, sets.hesitant)).toBeLessThan(0.6);
    expect(jaccard(sets.close, sets.wanderer)).toBeLessThan(0.7);
    expect(sets.close.has('first-approach')).toBe(true);
    expect(sets.still.has('first-approach')).toBe(false);
  });

  it('warm memories resurface when the visitor is far away', () => {
    const { d, cues } = simulate(scripts.warmDweller, 260);
    expect(d.memory.warmMemories.length).toBeGreaterThan(0);
    expect(rules(cues).has('resurface')).toBe(true);
    const recall = cues.find((c) => c.rule === 'resurface' && c.cue.type === 'write');
    expect(recall).toBeTruthy();
  });

  it('progresses through phases without being forced by any interaction', () => {
    const { d } = simulate(() => ({ z: 2.4, yaw: 0.3 }), 600);
    expect(d.phase).toBe('transform');
  });

  it('never re-reveals a visible phrase and keeps within budget', () => {
    const { d, cues } = simulate(scripts.wanderer, 500);
    const reveals = cues.filter((c) => c.cue.type === 'reveal');
    expect(reveals.length).toBeGreaterThan(8);
    const revealedNow = [...d.visible.values()].filter((v) => !v.base && v.mode === 'shown').length;
    expect(revealedNow).toBeLessThanOrEqual(26 + 2);
  });

  it('spaces major events', () => {
    const { cues } = simulate(scripts.hesitant, 400);
    // The hush just before a recorded voice is part of that voice's gesture, not an event of its own.
    const majors = cues.filter((c) => (c.cue.type === 'voice' || c.cue.type === 'music' || c.cue.type === 'silence') && !c.rule.startsWith('hush:')).map((c) => c.t);
    for (let i = 1; i < majors.length; i++) expect(majors[i] - majors[i - 1]).toBeGreaterThanOrEqual(6.9);
  });

  it('writes a contribution on the wall and does not reply to it', () => {
    const text = 'I miss who I used to be.';
    const extras: number[] = [];
    for (let seed = 1; seed <= 24; seed++) {
      const { d } = simulate(scripts.still, 20, seed);
      d.contribute(text, interpretLocally(text));
      const { cues } = simulate(scripts.still, 220, seed, 0.1, d);
      const own = cues.filter((c) => c.rule.startsWith('contribution'));
      const w = own.find((c) => c.cue.type === 'write');
      expect(w && w.cue.type === 'write' && w.cue.text).toBe(text);
      // Nothing that could read as an answer arrives within the first minute.
      for (const c of own) if (c.cue.type === 'reveal' || c.cue.type === 'voice') expect(c.t - 20).toBeGreaterThanOrEqual(59);
      extras.push(new Set(own.filter((c) => c.cue.type !== 'write').map((c) => c.rule)).size);
    }
    // At most one other gesture, and often none at all.
    expect(Math.max(...extras)).toBeLessThanOrEqual(1);
    expect(extras.filter((n) => n === 0).length).toBeGreaterThan(4);
    expect(extras.filter((n) => n === 1).length).toBeGreaterThan(4);
  });

  it('chooses a departure line from the visit, and returns gracefully', () => {
    const d = simulate(scripts.hesitant, 200).d;
    const line = d.departureLine();
    expect(typeof line).toBe('string');
    d.depart();
    expect(d.env.darkness).toBeLessThanOrEqual(1);
    d.returnAfterDeparture();
    expect(d.departing).toBe(false);
  });

  it('remembers return visits', () => {
    const d = new Director({ seed: 3, visits: 3 });
    const { cues } = simulate(scripts.still, 40, 3, 0.1, d);
    expect(cues.some((c) => c.rule === 'return')).toBe(true);
  });
});

describe('a voice that was to write its line, and was never heard', () => {
  it('leaves the line unwritten in the room’s account, free to appear later', () => {
    // Find a seed where the voice takes the "write as heard" path (about one in three).
    for (let seed = 1; seed < 60; seed++) {
      const d = new Director({ seed });
      d.release({ written: ['stay'], spoken: [] });
      const dd = d as unknown as {
        voice: (rule: string, delay: number, kind: string, text: string, caption: string, pos: { kind: 'chair' }, extra: { phraseId: string }) => void;
        lost: (cue: unknown, rule: string) => void;
        scheduler: { pending(): { payload: { cue: { type: string; write?: boolean; phraseId?: string }; rule: string } }[] };
      };
      dd.voice('test', 5, 'tender', 'I think I was happy then.', 'I think I was happy then.', { kind: 'chair' }, { phraseId: 'happy-then' });
      const queued = dd.scheduler.pending().find((e) => e.payload.cue.type === 'voice' && e.payload.cue.phraseId === 'happy-then');
      if (!queued?.payload.cue.write) continue;
      expect(d.visible.has('happy-then')).toBe(true);
      dd.lost(queued.payload.cue, queued.payload.rule);
      expect(d.visible.has('happy-then')).toBe(false);
      return;
    }
    throw new Error('no seed took the write-as-heard path');
  });
});
