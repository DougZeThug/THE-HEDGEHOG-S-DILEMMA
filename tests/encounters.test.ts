import { describe, it, expect } from 'vitest';
import { Director } from '../src/state/Director';
import type { VisitorInput } from '../src/state/VisitorModel';
import { ENCOUNTER } from '../src/state/VisitorModel';
import type { TimedCue, Cue } from '../src/state/cues';
import { ARCS } from '../src/content/encounters';
import { PHRASES, PHRASE_BY_ID } from '../src/content/phrases';

class Visit {
  d: Director;
  cues: TimedCue[] = [];
  constructor(seed = 3, situations: string[] = ['residue']) {
    // A quiet repertoire so situations don't interleave with what is being tested.
    this.d = new Director({ seed, situations });
    // After the opening: its line is on the wall (finished here, so encounters with it run as written).
    this.d.release({ written: ['stay'] });
  }
  run(seconds: number, inp: Partial<VisitorInput> = {}) {
    const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
    for (let t = 0; t < seconds; t += 0.1) this.cues.push(...this.d.tick(0.1, { ...base, ...inp }, 'north'));
  }
  look(id: string, seconds = 6) {
    const from = this.cues.length;
    this.run(seconds, { gazePhraseId: id });
    return this.cues.slice(from);
  }
  /** Look elsewhere and wander a little (so stillness doesn't take over the room). */
  away(seconds = 30) {
    const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
    for (let t = 0; t < seconds; t += 0.1)
      this.cues.push(...this.d.tick(0.1, { ...base, x: Math.sin(t * 0.4) * 0.8, z: 2.2 + Math.cos(t * 0.4) * 0.3, yaw: t * 0.2 }, 'north'));
  }
}
const own = (cs: TimedCue[], id: string) => cs.filter((c) => c.rule.startsWith(`encounter:${id}:`));
const types = (cs: TimedCue[]) => cs.map((c) => c.cue.type);

describe('a meeting that comes due while a memory plays', () => {
  const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
  const play = (cue: Cue, rule: string) => {
    const d = new Director({ seed: 3, situations: ['residue'] });
    d.release({ written: ['stay'] });
    const q = d as unknown as { queue: (delay: number, cue: Cue, rule: string) => void; scenes: { active: unknown } };
    q.scenes.active = { id: 'biscuit', since: d.now };
    q.queue(0.5, cue, rule);
    const during: TimedCue[] = [];
    for (let t = 0; t < 3; t += 0.1) during.push(...d.tick(0.1, base, 'north'));
    // (The memory has gone.)
    q.scenes.active = null;
    const after: TimedCue[] = [];
    for (let t = 0; t < 15; t += 0.1) after.push(...d.tick(0.1, base, 'north'));
    return { during: during.filter((c) => c.rule === rule), after: after.filter((c) => c.rule === rule) };
  };

  it('its door waits for the memory to go, and is not lost', () => {
    const r = play({ type: 'sound', kind: 'door', position: { kind: 'chair' }, gain: 0.45 }, 'encounter:stay:3');
    expect(r.during).toEqual([]);
    expect(r.after.length).toBe(1);
  });

  it('its answering line is written after it, not lost', () => {
    const r = play({ type: 'write', key: 'enc:stay:2', text: "I didn't know how.", hand: 'faint', size: 'xs', beside: 'stay', purpose: 'annotation', ttl: 300 } as Cue, 'encounter:stay:2');
    expect(r.during).toEqual([]);
    expect(r.after.length).toBe(1);
  });
});

describe('encounters: the same words, met again', () => {
  it('"I wanted you to stay." — alone; then a voice behind and an answer; then only a door', () => {
    const v = new Visit();
    v.run(5);
    const first = v.look('stay', 8);
    expect(own(first, 'stay')).toEqual([]);

    v.away(30);
    const second = own(v.look('stay', 8), 'stay');
    const voice = second.find((c) => c.cue.type === 'voice')?.cue as Extract<Cue, { type: 'voice' }>;
    expect(voice.text).toBe('I wanted you to stay.');
    expect(voice.position.kind).toBe('behind');
    const write = second.find((c) => c.cue.type === 'write')?.cue as Extract<Cue, { type: 'write' }>;
    expect(write.text).toBe("I didn't know how.");
    expect(write.beside).toBe('stay');

    v.away(30);
    const third = own(v.look('stay', 10), 'stay');
    expect(types(third)).toEqual(['sound']);
    expect((third[0].cue as Extract<Cue, { type: 'sound' }>).kind).toBe('door');
    // The line itself is unchanged: nothing hidden, struck or rewritten.
    expect(v.d.visible.get('stay')?.mode).toBe('shown');

    v.away(30);
    expect(own(v.look('stay', 10), 'stay')).toEqual([]);
    expect(v.d.visitor.encounterCount('stay')).toBe(4);
  });

  it('a long look is one meeting; glancing away briefly does not make a new one', () => {
    const v = new Visit();
    v.run(5);
    v.look('stay', 40);
    expect(v.d.visitor.encounterCount('stay')).toBe(1);
    v.away(ENCOUNTER.apart - 10);
    v.look('stay', 6);
    expect(v.d.visitor.encounterCount('stay')).toBe(1);
    v.away(ENCOUNTER.apart + 5);
    v.look('stay', 6);
    expect(v.d.visitor.encounterCount('stay')).toBe(2);
  });

  it('a phrase without an authored arc develops through its relations, then rests', () => {
    const p = PHRASES.find((x) => !ARCS[x.id] && (x.echoes?.length ?? 0) + (x.contradicts?.length ?? 0) >= 2 && x.tier === 'arrival')!;
    expect(p).toBeTruthy();
    const v = new Visit();
    v.run(5);
    const beats: TimedCue[][] = [];
    for (let i = 0; i < 4; i++) {
      beats.push(own(v.look(p.id, 8), p.id));
      v.away(30);
    }
    expect(beats[0]).toEqual([]);
    expect(beats[1].length).toBeGreaterThan(0);
    expect(beats[2].length).toBeGreaterThan(0); // no longer a one-shot
    expect(JSON.stringify(beats[1].map((c) => c.cue))).not.toEqual(JSON.stringify(beats[2].map((c) => c.cue)));
    expect(beats[3]).toEqual([]);
  });

  it('a phrase with nothing to relate to just stays itself', () => {
    const p = PHRASES.find((x) => !ARCS[x.id] && !x.echoes?.length && !x.contradicts?.length && !x.voice && x.tier === 'arrival')!;
    const v = new Visit();
    v.run(5);
    for (let i = 0; i < 4; i++) {
      expect(own(v.look(p.id, 8), p.id)).toEqual([]);
      v.away(30);
    }
  });

  it('the same meeting can mean something different depending on the visit', () => {
    const plain = new Visit();
    plain.run(5);
    const hes = new Visit();
    hes.run(5);
    hes.d.memory.formed.set('hesitation', 0);
    const third = (v: Visit) => {
      v.look('closer', 8);
      v.away(30);
      v.look('closer', 8);
      v.away(30);
      return own(v.look('closer', 8), 'closer');
    };
    expect(third(plain)).toEqual([]);
    const h = third(hes);
    expect(h.some((c) => c.cue.type === 'write' && c.cue.text === "Come back. Don't.")).toBe(true);
  });

  it('beats are spaced; a meeting during a busy moment simply waits for a later one', () => {
    const v = new Visit();
    v.run(5);
    v.look('laugh', 6);
    v.away(30);
    v.look('stay', 6);
    v.away(30);
    v.look('laugh', 6); // second meeting with "laugh"
    v.look('stay', 6); // second meeting with "stay", within 10 s of the laugh beat
    const beats = v.cues.filter((c) => c.rule.startsWith('encounter:')).map((c) => c.t);
    const starts = [...new Set(v.cues.filter((c) => c.rule.startsWith('encounter:')).map((c) => c.rule))].map(
      (r) => v.cues.find((c) => c.rule === r)!.t,
    );
    // Beats are 8 s apart; a beat that waited plays 1.2 s sooner after it is released.
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(6.5);
    expect(beats.length).toBeGreaterThan(0);
    // The crowded beat is never lost: it waits while the visitor keeps looking, or is owed to the next meeting.
    v.away(30);
    v.look('stay', 8);
    expect(own(v.cues, 'stay').filter((c) => c.cue.type === 'write')).toHaveLength(1);
  });

  it('a door does not sound while a situation is using the space beyond the walls', () => {
    const v = new Visit(3, ['next-room']);
    v.run(5);
    v.look('stay', 6);
    v.away(30);
    v.look('stay', 6);
    v.away(30);
    // Wait for the situation's laughter to claim the space beyond the walls.
    for (let i = 0; i < 300 && !v.d.situations.claimed('beyond'); i++) v.run(1);
    expect(v.d.situations.claimed('beyond')).toBe(true);
    expect(own(v.look('stay', 6), 'stay').some((c) => c.cue.type === 'sound')).toBe(false);
  });
});

describe('encounter arcs (content)', () => {
  it('refer to real phrases and are well-formed', () => {
    for (const [id, arc] of Object.entries(ARCS)) {
      expect(PHRASE_BY_ID.has(id), id).toBe(true);
      expect(arc[0].every((b) => b.gestures.length === 0), `${id} begins alone`).toBe(true);
      for (const variants of arc)
        for (const b of variants)
          for (const g of b.gestures) {
            if ('annotate' in g) expect(PHRASE_BY_ID.has(g.annotate), `${id} → ${g.annotate}`).toBe(true);
            if ('reveal' in g) expect(PHRASE_BY_ID.has(g.reveal), `${id} → ${g.reveal}`).toBe(true);
          }
    }
  });
});
