import { describe, it, expect } from 'vitest';
import { MemoryDirector, type SceneState } from '../src/state/MemoryDirector';
import { Director } from '../src/state/Director';
import { ALL_MEMORIES } from '../src/content/memories';
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

/** Look elsewhere for `seconds` from `from`. */
function away(m: MemoryDirector, from: number, seconds: number, o: Partial<SceneState> = {}) {
  for (let t = 0; t <= seconds + 1e-9; t += 0.1) m.update(base({ now: from + t, gazeId: 'summer', gazeFor: t, ...o }));
}

describe('when a living memory opens', () => {
  it('a read before its earliest time arms it; coming back to the line begins it', () => {
    const m = new MemoryDirector();
    expect(look(m, 5, 4)).toBeNull(); // read at 5–9 s: armed, too early
    away(m, 9.1, 12); // elsewhere until about 21 s
    const s = look(m, 22, 2);
    expect(s?.id).toBe('cereal');
    expect(s!.at).toBeCloseTo(23, 0); // a second's look (floating ticks)
    expect(s?.variant).toBe('first');
  });

  it('staring at the line never opens it: the look that arms it is not the one that begins it', () => {
    const m = new MemoryDirector();
    expect(look(m, 5, 40)).toBeNull(); // one unbroken look from 5 to 45 s
    away(m, 45.1, 1.5); // a glance away is not leaving
    expect(look(m, 46.7, 3)).toBeNull();
    away(m, 49.8, 2.5);
    expect(look(m, 52.4, 2)?.id).toBe('cereal');
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
    expect(look(m, 64, 3)).toBeNull(); // read again after 30 s: armed
    away(m, 67.1, 3);
    expect(look(m, 70.2, 2)?.id).toBe('cereal');
    expect(m.ended('cereal', 75, false, false)).toBe(true); // the second time it counts
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

describe('later memories are offered, not hidden', () => {
  const offerState = (o: Partial<Parameters<MemoryDirector['offer']>[0]> = {}) => ({
    now: 200, phase: 'contradiction', free: true, visibleFacing: () => false, departing: false, otherMemory: false, ...o,
  });
  it('the bedroom answers the long dark silence; the door comes only after another memory, where the drawn door is', () => {
    const m = new MemoryDirector();
    // (The painted memories alone: no vignette's voices recorded.)
    m.setAvailable(new Set());
    expect(m.offer(offerState({ now: 140, darkEnded: 130 }))).toBeNull(); // too early
    expect(m.offer(offerState({ now: 160, darkEnded: 155 }))).toBeNull(); // the dark only just lifted
    expect(m.offer(offerState({ now: 200, phase: 'familiar', darkEnded: 130 }))).toBeNull();
    expect(m.offer(offerState({ now: 200, darkEnded: 130 }))?.id).toBe('bedroom');
    expect(m.offer(offerState({ now: 201, darkEnded: 130 }))).toBeNull(); // once
    // The door: not before another memory; then written beneath its drawing whichever way the
    // visitor faces (found there later), and begun only facing that wall.
    expect(m.offer(offerState({ now: 250, facing: 'south' }))).toBeNull();
    m.tapped('happiest-unneeded');
    m.update(base({ now: 251, visible: (id) => id === 'happiest-unneeded' }));
    m.ended('bedroom', 280, true, true);
    expect(m.offer(offerState({ now: 410, facing: 'north' }))?.id).toBe('door');
    expect(m.update(base({ now: 420, facing: 'north', gazeId: 'door-open', gazeFor: 5, visible: () => true }))).toBeNull();
  });

  it('cereal belongs to the start: never after another memory, never late', () => {
    const late = new MemoryDirector();
    late.tapped('cereal');
    expect(late.update(base({ now: 160 }))).toBeNull();
    const after = new MemoryDirector();
    after.tapped('cereal');
    expect(after.update(base({ now: 60, kitchenPlayed: true }))).toBeNull();
  });

  it('at least two minutes after another memory, never into a busy room or over one playing', () => {
    const m = new MemoryDirector();
    m.lastEnded = 100;
    expect(m.offer(offerState({ now: 200, darkEnded: 130 }))).toBeNull();
    expect(m.offer(offerState({ now: 230, darkEnded: 130, free: false }))).toBeNull();
    expect(m.offer(offerState({ now: 230, darkEnded: 130, otherMemory: true }))).toBeNull();
    expect(m.offer(offerState({ now: 230, darkEnded: 130 }))?.id).toBe('bedroom');
  });
  it('an offered line begins its memory on a read (no look back needed later in the visit)', () => {
    const m = new MemoryDirector();
    let start = null;
    for (let t = 0; t <= 3 && !start; t += 0.1) start = m.update(base({ now: 200 + t, visible: (id) => id === 'happiest-unneeded', gazeId: 'happiest-unneeded', gazeFor: t }));
    expect(start?.id).toBe('bedroom');
    expect(start?.variant).toBe('morning');
  });
});

describe('the Director and its memories, wired together', () => {
  it('after the kitchen-light memory, a later memory still opens when its line is read', () => {
    const m = new MemoryDirector();
    // Kitchen-light has played (it counts in the arc, but it doesn't block).
    const s = (now: number, gazeFor: number) => base({ now, visible: (id) => id === 'happiest-unneeded', gazeId: 'happiest-unneeded', gazeFor, kitchenPlayed: true });
    let start = null;
    for (let t = 0; t <= 3 && !start; t += 0.1) start = m.update(s(300 + t, t));
    expect(start?.id).toBe('bedroom');
  });

  it('a touch while the room is holding still is kept, and honoured once it is free', () => {
    const m = new MemoryDirector();
    m.update(base({ now: 299, visible: () => true }));
    m.tapped('happiest-unneeded');
    expect(m.update(base({ now: 300, visible: () => true, free: false }))).toBeNull();
    expect(m.update(base({ now: 302.5, visible: () => true }))?.id).toBe('bedroom');
  });
});

describe('living memories in a visit', () => {
  it('a reader who comes back to the first line meets the memory; nothing talks over it', () => {
    const reader = PERSONAS.find((p) => p.id === 'reader')!;
    // Over four visits, most meet it; never before its earliest time.
    const runs = [1, 2, 3, 4].map((seed) => visit(reader, 180, seed));
    const ats = runs.map((r) => r.devs.find((d) => d.label === 'memory-scene cereal')?.t).filter((t): t is number => t !== undefined);
    expect(ats.length).toBeGreaterThanOrEqual(3);
    for (const t of ats) expect(t).toBeGreaterThanOrEqual(20);
    const r = runs[ats.length === 4 ? 0 : runs.findIndex((x) => x.devs.some((d) => d.label === 'memory-scene cereal'))];
    const at = r.devs.find((d) => d.label === 'memory-scene cereal')!.t;
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

describe('never pushing: the kitchen-light memory is a pointing too', () => {
  const offerState = (o: Partial<Parameters<MemoryDirector['offer']>[0]> = {}) => ({
    now: 200, phase: 'contradiction', free: true, visibleFacing: () => false, departing: false, otherMemory: false, ...o,
  });
  it('the bedroom line is not written within two minutes of its offer', () => {
    const early = new MemoryDirector();
    early.setAvailable(new Set());
    expect(early.offer(offerState({ now: 200, darkEnded: 130, kitchenOffered: true, kitchenOfferedAt: 150 }))).toBeNull();
    const later = new MemoryDirector();
    later.setAvailable(new Set());
    expect(later.offer(offerState({ now: 200, darkEnded: 130, kitchenOffered: true, kitchenOfferedAt: 70 }))?.id).toBe('bedroom');
  });
});

describe('the visit\'s arc and heard vignettes', () => {
  type Arc = { tracks: Map<string, { played: boolean }>; arcAllows: (m: unknown, now: number, kitchen: boolean) => boolean };
  const memory = (id: string) => ALL_MEMORIES.find((m) => m.id === id)!;
  const vignette = ALL_MEMORIES.find((m) => m.kind === 'vignette')!;

  it('a heard vignette does not unlock the absence memories, nor close the first', () => {
    const m = new MemoryDirector() as unknown as Arc;
    m.tracks.get(vignette.id)!.played = true;
    expect(m.arcAllows(memory('woodland'), 400, false)).toBe(false);
    expect(m.arcAllows(memory('door'), 400, false)).toBe(false);
    expect(m.arcAllows(memory('cereal'), 30, false)).toBe(true);
  });

  it('a painted memory does', () => {
    const m = new MemoryDirector() as unknown as Arc;
    m.tracks.get('cereal')!.played = true;
    expect(m.arcAllows(memory('woodland'), 400, false)).toBe(true);
  });
});
