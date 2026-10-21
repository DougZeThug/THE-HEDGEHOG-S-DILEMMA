import { describe, it, expect } from 'vitest';
import { simulate, scripts, rules } from './sim';
import { Director } from '../src/state/Director';
import { interpretLocally } from '../src/interpret/LocalInterpreter';
import type { VisitorInput } from '../src/state/VisitorModel';

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

describe('a beat whose gesture never found room is owed to its next meeting, not lost', () => {
  // The encounter beat's `played` count is incremented before its gestures are queued, so a
  // gesture cue being dropped (by a living memory's bare refusal, or by TTL) must roll it back.
  // The rollback used to sit after a voice-only early return; only a voice gesture could reach it.
  type Played = Map<string, number>;

  const withPlayed = (d: Director) => d as unknown as { played: Played; lost: (cue: unknown, rule: string) => void };

  it('rolls back the played count for a reveal, a write, a sound, a silence or a link gesture, not only a voice', () => {
    const gestures = [
      { type: 'reveal', phraseId: 'closer', mode: 'emerge' as const, seconds: 8 },
      { type: 'write', key: 'enc:stay:1', text: 'x', hand: 'pencil' as const, size: 's' as const, beside: 'stay', purpose: 'annotation' as const, ttl: 300, source: 'r' },
      { type: 'sound', kind: 'door' as const, position: { kind: 'beyond' as const, surface: 'north' as const }, gain: 0.4 },
      { type: 'silence', depth: 0.6, seconds: 6 },
      { type: 'link', a: 'stay', b: 'closer', ttl: 60 },
    ];
    // Each beat plays at count N (so its cue is queued as `encounter:stay:N`); losing it must
    // set played back to N-1, so the next meeting replays the same beat. The rollback uses the
    // rule's N, not the live count — verify each beat independently.
    gestures.forEach((cue, i) => {
      const d = new Director({ seed: 3 + i });
      d.release({ written: ['stay'] });
      const dd = withPlayed(d);
      const n = i + 1;
      dd.played.set('stay', n);
      dd.lost(cue, `encounter:stay:${n}`);
      expect(dd.played.get('stay'), `gesture ${cue.type}`).toBe(n - 1);
    });
  });

  it('clamps to zero rather than underflowing, when a beat at the very start of an arc is lost', () => {
    const d = new Director({ seed: 3 });
    d.release({ written: ['stay'] });
    const dd = withPlayed(d);
    dd.played.set('stay', 1);
    dd.lost({ type: 'silence', depth: 0.6, seconds: 6 }, 'encounter:stay:1');
    expect(dd.played.get('stay')).toBe(0);
  });

  it('does not roll back for a rule that is not an encounter rule', () => {
    const d = new Director({ seed: 3 });
    d.release({ written: ['stay'] });
    const dd = withPlayed(d);
    dd.played.set('stay', 3);
    dd.lost({ type: 'reveal', phraseId: 'closer', mode: 'emerge', seconds: 8 }, 'contribution-related');
    dd.lost({ type: 'silence', depth: 0.6, seconds: 6 }, 'still-silence');
    dd.lost({ type: 'write', key: 'k', text: 'x', hand: 'pencil', size: 's', purpose: 'contribution', ttl: 0 }, 'contribution');
    expect(dd.played.get('stay')).toBe(3);
  });

  it('a non-voice gesture cue does not reach the voice-only cleanups (unfinished, memory.spoken, heard)', () => {
    const d = new Director({ seed: 3 });
    d.release({ written: ['stay'], spoken: [], unfinished: [] });
    const dd = d as unknown as {
      played: Map<string, number>;
      lost: (cue: unknown, rule: string) => void;
      unfinished: Set<string>;
      heard: Map<string, string>;
      memory: { spoken: Map<string, number> };
    };
    dd.unfinished.add('stay');
    dd.heard.set('stay', 'perf-1');
    dd.memory.spoken.set('stay', 10);
    dd.played.set('stay', 3);

    dd.lost({ type: 'reveal', phraseId: 'closer', mode: 'emerge', seconds: 8 }, 'encounter:stay:3');

    expect(dd.played.get('stay')).toBe(2);
    // The reveal cue has no phraseId that could carry voice-specific bookkeeping; the
    // voice-only `unfinished`, `heard` and `memory.spoken` entries are unchanged.
    expect([...dd.unfinished]).toContain('stay');
    expect(dd.heard.has('stay')).toBe(true);
    expect(dd.memory.spoken.has('stay')).toBe(true);
  });

  it('a voice gesture cue still rolls back played and reaches the voice-only cleanups (no regression)', () => {
    const d = new Director({ seed: 3 });
    d.release({ written: ['stay'], spoken: [], unfinished: [] });
    const dd = d as unknown as {
      played: Map<string, number>;
      lost: (cue: unknown, rule: string) => void;
      unfinished: Set<string>;
      heard: Map<string, string>;
      memory: { spoken: Map<string, number> };
    };
    dd.heard.set('stay', 'perf-1');
    dd.memory.spoken.set('stay', 10);
    dd.played.set('stay', 3);

    dd.lost({ type: 'voice', kind: 'whisper', text: 'I wanted you to stay.', caption: '', position: { kind: 'surface', phraseId: 'stay' }, gain: 0.5, phraseId: 'stay', finish: true }, 'encounter:stay:3');

    expect(dd.played.get('stay')).toBe(2);
    // The voice's `finish` and `phraseId` reach the voice-only cleanups: the room was finishing
    // this line, unheard, so the line stays unfinished; and the room's accounting of having
    // spoken it and having heard the chosen reading is undone.
    expect([...dd.unfinished]).toContain('stay');
    expect(dd.memory.spoken.has('stay')).toBe(false);
    expect(dd.heard.has('stay')).toBe(false);
  });

  it('end-to-end: an encounter sound beat dropped during a living memory rolls back played through the tick flow', () => {
    // Beat 3 of `stay` is a door sound. Its `played` count is incremented before its cue is
    // queued, and the cue carries rule `encounter:stay:3`. The bug: when the cue comes due
    // during a living memory, accept() drops it (non-`sit:` sound) and `lost()` does not reach
    // the encounter rollback — so the beat is skipped forever (the next meeting plays beat 4).
    // After the fix, `lost()` decrements `played` back to 2, so the next meeting replays beat 3.
    const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
    const d = new Director({ seed: 3, situations: ['residue'] });
    d.release({ written: ['stay'] });
    // Beat 3 of `stay` was queued, with its cue due now.
    const dd = d as unknown as { played: Map<string, number>; queue: (delay: number, cue: unknown, rule: string, opts?: unknown) => void };
    dd.played.set('stay', 3);
    dd.queue(0.05, { type: 'sound', kind: 'door', position: { kind: 'beyond', surface: 'north' }, gain: 0.5 }, 'encounter:stay:3', { major: true, ttl: 8 });
    // A living memory is playing (the App reports it).
    d.memoryExternal('a-bag');
    // Drive a few short ticks so the scheduler pops the due cue and the Director's tick()
    // routes it: accept() refuses it (non-`sit:` sound over a memory), then lost() rolls it back.
    for (let t = 0; t < 1; t += 0.1) d.tick(0.1, base, 'north');
    // The beat is not skipped: `played` is back to 2, so the next meeting replays beat 3.
    expect(dd.played.get('stay')).toBe(2);
  });

  it('end-to-end: a `contribution` write deferred past a memory fires once the memory has gone', () => {
    const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
    const d = new Director({ seed: 3, situations: ['residue'] });
    d.release({ written: ['stay'] });
    // The visitor's own contribution's write is queued 0.5 s out; if a memory is active then,
    // the bug dropped it (a `write` under rule `contribution`, which ROOM_OWN does not rescue).
    const dd = d as unknown as { queue: (delay: number, cue: unknown, rule: string, opts?: unknown) => void };
    d.memoryExternal('a-bag');
    dd.queue(0.05, { type: 'write', key: 'contrib:1', text: 'something said', hand: 'visitor', size: 's', surface: 'north', purpose: 'contribution', ttl: 0, source: 'contrib' }, 'contribution');
    // Confirm the cue was re-queued (deferred) during the memory: it is still pending.
    const pending = () =>
      (d as unknown as { scheduler: { pending(): { payload: { cue: { type: string; key?: string }; rule: string } }[] } }).scheduler.pending().filter((e) => e.payload.cue.type === 'write' && e.payload.rule === 'contribution').length;
    expect(pending()).toBeGreaterThan(0);
    // The memory ends: the next ticks should let the deferred write through.
    d.memoryEnded('a-bag', true, true);
    let delivered: { rule: string; cue: { type: string; text: string } } | null = null;
    for (let t = 0; t < 12; t += 0.1) {
      for (const c of d.tick(0.1, base, 'north')) if (c.rule === 'contribution' && c.cue.type === 'write') delivered = { rule: c.rule, cue: c.cue };
    }
    // The write reaches the wall despite the memory having been playing when it came due.
    expect(delivered).not.toBeNull();
    expect((delivered!.cue as { text: string }).text).toBe('something said');
  });
});
