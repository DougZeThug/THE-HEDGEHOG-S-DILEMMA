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
    expect(r.has('still-2')).toBe(true);
    expect(r.has('still-silence')).toBe(true);
    expect(cues.some((c) => c.cue.type === 'voice')).toBe(true);
    expect(d.phase).not.toBe('arrival');
    expect(d.memory.has('stillness')).toBe(true);
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
    const majors = cues.filter((c) => c.cue.type === 'voice' || c.cue.type === 'music' || c.cue.type === 'silence').map((c) => c.t);
    for (let i = 1; i < majors.length; i++) expect(majors[i] - majors[i - 1]).toBeGreaterThanOrEqual(6.9);
  });

  it('turns a contribution into composition, not a reply', () => {
    const { d } = simulate(scripts.still, 30);
    const text = 'I miss who I used to be.';
    d.contribute(text, interpretLocally(text));
    const { cues } = simulate(scripts.still, 40, 7, 0.1, d);
    const types = new Set(cues.map((c) => c.cue.type));
    expect(types.has('write')).toBe(true);
    expect(types.has('silence')).toBe(true);
    expect(cues.some((c) => c.rule === 'contribution' && c.cue.type === 'reveal') || cues.some((c) => c.rule === 'contribution-echo')).toBe(true);
    expect(cues.some((c) => c.rule === 'contribution-recollection')).toBe(true);
    // The written text is the visitor's own; nothing generated is addressed back at them.
    const w = cues.find((c) => c.cue.type === 'write' && c.rule === 'contribution');
    expect(w && w.cue.type === 'write' && w.cue.text).toBe(text);
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
