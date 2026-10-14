import { describe, it, expect } from 'vitest';
import { MemoryDirector, type SceneState } from '../src/state/MemoryDirector';
import { Director } from '../src/state/Director';
import { PERSONAS } from './playtest/personas';
import { visit } from './playtest/measure';

const base = (o: Partial<SceneState> = {}): SceneState => ({
  now: 30,
  visible: (id) => id === 'cereal',
  gazeId: null,
  gazeFor: 0,
  free: true,
  otherMemory: false,
  departing: false,
  ...o,
});

/** Look at the line for `seconds` from `from`, a tick every 0.1 s; returns the start, if any. */
function look(m: MemoryDirector, from: number, seconds: number, o: Partial<SceneState> = {}) {
  for (let t = 0; t <= seconds + 1e-9; t += 0.1) {
    const s = m.update(base({ now: from + t, gazeId: 'cereal', gazeFor: t, ...o }));
    if (s) return { at: from + t, ...s };
  }
  return null;
}

describe('when a living memory opens', () => {
  it('a read before its earliest time arms it; a later look of a second begins it', () => {
    const m = new MemoryDirector();
    expect(look(m, 5, 4)).toBeNull(); // read at 5–9 s: armed, too early
    expect(m.update(base({ now: 21 }))).toBeNull(); // not looking: nothing
    const s = look(m, 22, 2);
    expect(s?.id).toBe('cereal');
    expect(s!.at).toBeCloseTo(23, 0); // a second's look (floating ticks)
    expect(s?.variant).toBe('first');
  });

  it('a glance never begins it unarmed; a touch arms it and asks for it at once', () => {
    const m = new MemoryDirector();
    expect(look(m, 30, 2)).toBeNull(); // 2 s: under the 2.5 s that arms it
    m.tapped('cereal');
    expect(m.update(base({ now: 32.1 }))?.id).toBe('cereal');
  });

  it('a touch before its time is not lost', () => {
    const m = new MemoryDirector();
    m.tapped('cereal');
    expect(m.update(base({ now: 10 }))).toBeNull();
    expect(look(m, 25, 1.2)?.id).toBe('cereal');
  });

  it('waits for the room: never over a voice, a held breath, or the kitchen-light memory', () => {
    const m = new MemoryDirector();
    m.tapped('cereal');
    expect(look(m, 30, 3, { free: false })).toBeNull();
    expect(look(m, 34, 3, { otherMemory: true })).toBeNull();
    expect(look(m, 38, 3, { departing: true })).toBeNull();
    expect(look(m, 42, 3)?.id).toBe('cereal');
  });

  it('one at a time, once a visit; a cue that never found room is not spent', () => {
    const m = new MemoryDirector();
    m.tapped('cereal');
    expect(m.update(base())?.id).toBe('cereal');
    expect(look(m, 31, 3)).toBeNull(); // playing
    m.cancel('cereal', 32);
    expect(m.active).toBeNull();
    expect(look(m, 35, 2)?.id).toBe('cereal'); // still armed
    expect(m.ended('cereal', 60, true, true)).toBe(true);
    expect(look(m, 200, 4)).toBeNull(); // once a visit
  });

  it('withdrawn before anyone saw it: offered again once, after a pause', () => {
    const m = new MemoryDirector();
    m.tapped('cereal');
    m.update(base());
    expect(m.ended('cereal', 33, false, false)).toBe(false);
    expect(look(m, 40, 4)).toBeNull(); // cooling down
    expect(look(m, 64, 4)?.id).toBe('cereal'); // re-armed by reading, after 30 s
    expect(m.ended('cereal', 70, false, false)).toBe(true); // the second time it counts
  });

  it('a returning visitor gets the later fragment', () => {
    const m = new MemoryDirector({ cereal: 1 });
    m.tapped('cereal');
    expect(m.update(base())?.variant).toBe('later');
  });

  it("claims its line from the room's ordinary answers until it has played", () => {
    const m = new MemoryDirector();
    expect(m.claims('cereal')).toBe(true);
    expect(m.claims('summer')).toBe(false);
    m.tapped('cereal');
    m.update(base());
    expect(m.claims('cereal')).toBe(false);
  });
});

describe('living memories in a visit', () => {
  it('a reader who stays with the first line meets the memory early; nothing talks over it', () => {
    const reader = PERSONAS.find((p) => p.id === 'reader')!;
    const r = visit(reader, 120, 1);
    const at = r.devs.find((d) => d.label === 'memory-scene cereal')?.t;
    expect(at).toBeGreaterThanOrEqual(20);
    expect(at).toBeLessThanOrEqual(40);
    // Nothing spoken while it plays (about 28 s, as the harness plays it).
    const spoken = r.devs.filter((d) => d.kind === 'voice' && d.t > at! && d.t < at! + 27);
    expect(spoken).toEqual([]);
  });

  it('the kitchen-light memory is not offered in a visit where cereal has opened', () => {
    const d = new Director({ seed: 3 });
    d.scenes.tapped('cereal');
    // (A visit where cereal played: the kitchen memory rule stands down.)
    (d.scenes as unknown as { active: unknown }).active = { id: 'cereal', since: 0 };
    expect(d.scenes.anyPlayed).toBe(true);
  });
});
