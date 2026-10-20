/**
 * Resonance, absence, aftermath and return (docs/reviews/2026-10-emotional-depth.md). These check
 * that the mechanisms behave as decided; whether any of it is felt is for visitors to say.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Director, returnYaw, ROOM_OWN, CLOSE_TURN } from '../src/state/Director';
import { EventScheduler } from '../src/core/scheduler';
import { VIGNETTE_BY_ID } from '../src/content/vignettes';
import { PERSONAS, type Persona } from './playtest/personas';
import { visit, type Development } from './playtest/measure';
import { simulate } from './sim';
import type { VisitorInput } from '../src/state/VisitorModel';
import type { Surface } from '../src/content/types';
import type { TimedCue } from '../src/state/cues';

const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
const looped = (p: Persona): Persona => ({ ...p, frame: (t) => p.frame(t < 240 ? t : 60 + ((t - 240) % 180)) });
const isMemory = (d: Development) => /^(vignette|memory-scene) /.test(d.label);

/** Drive a Director with a script, returning every cue with its rule. */
function drive(d: Director, script: (t: number) => Partial<VisitorInput> & { facing?: Surface }, from: number, seconds: number, dt = 0.1) {
  const out: TimedCue[] = [];
  for (let t = from; t < from + seconds; t += dt) {
    const s = script(t);
    out.push(...d.tick(dt, { ...base, ...s }, s.facing ?? 'north'));
  }
  return out;
}

/** A memory has been playing and ends now (as the App reports it). */
function ends(d: Director, id: string, seen = true, ranToEnd = true) {
  (d.scenes as unknown as { active: unknown }).active = { id, since: d.now };
  return d.memoryEnded(id, seen, ranToEnd);
}

describe('the aftermath of a memory', () => {
  it('lasts 25 s after one heard to its end, 12 s after one let go early; none after one never seen', () => {
    const d = new Director({ seed: 3 });
    d.release();
    drive(d, () => ({}), 0, 30);
    ends(d, 'biscuit', true, true);
    expect(d.aftermathLeft()).toBeCloseTo(25, 5);
    const e = new Director({ seed: 3 });
    e.release();
    drive(e, () => ({}), 0, 30);
    ends(e, 'biscuit', true, false);
    expect(e.aftermathLeft()).toBeCloseTo(12, 5);
    const f = new Director({ seed: 3 });
    f.release();
    drive(f, () => ({}), 0, 30);
    ends(f, 'biscuit', false, false);
    expect(f.aftermathLeft()).toBe(0);
  });

  it("the room's own life waits it out in every persona's visit; what the visitor does is still answered", () => {
    let answered = 0;
    for (const p of PERSONAS) {
      for (const seed of [1, 2, 3]) {
        const r = visit(looped(p), 420, seed);
        for (const m of r.devs.filter(isMemory)) {
          const end = m.endsAt!;
          // (The harness reports a memory's end when it plays it out; the aftermath follows.)
          const own = r.devs.filter((e) => e.t > end + 0.5 && e.t < end + 24 && ROOM_OWN.test(e.rule) && !isMemory(e));
          expect(own.map((e) => `${p.id}:${seed} ${e.t} ${e.rule}`)).toEqual([]);
          answered += r.devs.filter((e) => e.t > end && e.t < end + 25 && e.responsive && !isMemory(e)).length;
        }
      }
    }
    expect(answered).toBeGreaterThan(0);
  });

  it('a still visitor carried through a memory to its end is not answered for that stillness: nothing of the room comes for 25 s', () => {
    // (Decision 117: stillness and closeness that grew while the visitor was carried were counted
    // as theirs, and answered as soon as the 6 s hold lifted: a whisper at +6.9 s in about one
    // still ending in four.)
    const leaks: string[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const where of [{ x: 0.6, z: 2.6 }, { x: 0, z: 0.9 }]) {
        const d = new Director({ seed });
        d.release();
        drive(d, (t) => ({ x: where.x + 0.4 * Math.sin(t / 2), z: where.z }), 0, 30);
        (d.scenes as unknown as { active: unknown }).active = { id: 'woodland', since: d.now };
        drive(d, () => ({ ...where, carried: true }), 0, 55);
        d.memoryEnded('woodland', true, true);
        d.withdrawMusic();
        const after = drive(d, () => where, 0, 25);
        for (const c of after) if (/^(still|near-|long-near|finish|resurface)/.test(c.rule) || ROOM_OWN.test(c.rule)) leaks.push(`seed ${seed} at ${where.z}: ${c.rule}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it('nothing of the room’s own is postponed onto a memory while it plays', () => {
    for (const p of PERSONAS) {
      const r = visit(looped(p), 420, 2);
      for (const m of r.devs.filter(isMemory)) {
        const during = r.devs.filter((e) => e.t > m.t && e.t < m.endsAt! - 0.5 && ROOM_OWN.test(e.rule) && (e.kind === 'voice' || e.kind === 'sound' || e.kind === 'music' || e.kind === 'silence'));
        expect(during.map((e) => `${p.id} ${e.t} ${e.rule}`)).toEqual([]);
      }
    }
  });
});

describe('never two of the room’s own things at once', () => {
  it('the scheduler keeps the next of them until the gap has passed, and loses none', () => {
    const s = new EventScheduler<string>(7, 2.5);
    s.schedule(1, 'a', { room: true });
    s.schedule(1, 'b', { room: true });
    s.schedule(1, 'answer');
    expect(s.tick(1)).toEqual(['a', 'answer']);
    expect(s.tick(2)).toEqual([]);
    expect(s.tick(3.6)).toEqual(['b']);
  });

  it('a major one held back for the room’s gap takes no major slot, and is not lost', () => {
    const s = new EventScheduler<string>(7, 2.5);
    s.schedule(1, 'room', { room: true });
    s.schedule(2, 'major room', { room: true, major: true, ttl: 4 });
    expect(s.tick(1)).toEqual(['room']);
    expect(s.tick(2)).toEqual([]);
    expect(s.tick(3.6)).toEqual(['major room']);
    // A drawn gap: never a fixed pulse.
    let n = 0;
    const j = new EventScheduler<number>(7, () => [4, 6.5, 5][n++ % 3]);
    for (let i = 0; i < 4; i++) j.schedule(0, i, { room: true });
    const at: number[] = [];
    for (let t = 0; t < 20; t += 0.5) if (j.tick(t).length) at.push(t);
    expect(at).toEqual([0, 4, 10.5, 15.5]);
  });

  it('in every persona’s visit, the room’s own events are at least 4 s apart, and never on a fixed pulse', () => {
    for (const p of PERSONAS) {
      for (const seed of [1, 4]) {
        const own = visit(looped(p), 600, seed).devs.filter((d) => ROOM_OWN.test(d.rule));
        for (let i = 1; i < own.length; i++) {
          // (One event's several cues — a line revealed and then written beside — share a rule.)
          if (own[i].rule === own[i - 1].rule) continue;
          expect(own[i].t - own[i - 1].t, `${p.id}:${seed} ${own[i - 1].rule} → ${own[i].rule} at ${own[i].t}`).toBeGreaterThanOrEqual(3.9);
        }
        // (No gap between different things repeats more than a few times: no pulse.)
        const gaps = new Map<string, number>();
        for (let i = 1; i < own.length; i++) {
          if (own[i].rule === own[i - 1].rule) continue;
          const g = (own[i].t - own[i - 1].t).toFixed(1);
          gaps.set(g, (gaps.get(g) ?? 0) + 1);
        }
        expect(Math.max(0, ...gaps.values()), `${p.id}:${seed}`).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe('resonance: "the table"', () => {
  /** Sit by the chair, still, from 150 s on (contradiction has begun by then). */
  const sitter = (t: number) => (t < 150 ? { x: 2.6, z: 2.6, facing: 'east' as Surface } : { x: 0.3, z: 1.2, gazeChair: true });

  it('once cereal or the biscuit has been heard, the held silence waits for the visitor still at the chair and comes there', () => {
    const d = new Director({ seed: 5, memoryCounts: { biscuit: 1 }, visits: 2 });
    d.release();
    const cues = drive(d, sitter, 0, 320);
    const table = cues.filter((c) => c.rule === 'resonance:table');
    expect(table.length).toBe(1);
    expect(table[0].t).toBeGreaterThanOrEqual(158);
    expect(cues.some((c) => c.rule === 'held-silence')).toBe(false);
  });

  it('without them, the held silence comes as it always has, wherever the visitor is', () => {
    const d = new Director({ seed: 5, visits: 2 });
    d.release();
    const cues = drive(d, sitter, 0, 320);
    expect(cues.some((c) => c.rule === 'resonance:table')).toBe(false);
    expect(cues.filter((c) => c.rule === 'held-silence').length).toBe(1);
  });

  it('moving away lifts it; never twice in a visit', () => {
    const d = new Director({ seed: 5, memoryCounts: { cereal: 2 }, visits: 3 });
    d.release();
    let at = -1;
    for (let t = 0; t < 300 && at < 0; t += 0.1) if (drive(d, sitter, t, 0.1).some((c) => c.rule === 'resonance:table')) at = t;
    expect(at).toBeGreaterThan(0);
    // Six seconds more by the chair, then walking off.
    const after = drive(d, (t) => (t < at + 6 ? { x: 0.3, z: 1.2 } : { x: 0.3 + (t - at - 6) * 0.8, z: 1.2 }), at + 0.1, 30);
    expect(after.filter((c) => c.rule === 'resonance:table-lift').length).toBe(1);
    expect(after.find((c) => c.rule === 'resonance:table-lift')!.cue).toEqual({ type: 'lift', seconds: 10 });
    const later = drive(d, sitter, at + 30, 300);
    expect(later.some((c) => c.rule === 'resonance:table' || c.rule === 'held-silence')).toBe(false);
  });

  it('stepping round the chair to see it is closeness, not leaving: it holds', () => {
    const d = new Director({ seed: 5, memoryCounts: { cereal: 2 }, visits: 3 });
    d.release();
    let at = -1;
    for (let t = 0; t < 300 && at < 0; t += 0.1) if (drive(d, sitter, t, 0.1).some((c) => c.rule === 'resonance:table')) at = t;
    // Walking a half circle round it at 1.3 m, briskly.
    const round = drive(d, (t) => { const a = (t - at) * 0.5; return { x: 1.3 * Math.sin(a), z: 1.3 * Math.cos(a) }; }, at + 0.1, 6);
    expect(round.some((c) => c.rule === 'resonance:table-lift')).toBe(false);
  });

  it('only to someone looking at the chair: with their back to it, the held silence comes as it always has', () => {
    const d = new Director({ seed: 5, memoryCounts: { biscuit: 1 }, visits: 2 });
    d.release();
    const cues = drive(d, (t) => (t < 150 ? { x: 2.6, z: 2.6, facing: 'east' as Surface } : { x: 0.3, z: 1.2, gazeChair: false }), 0, 420);
    expect(cues.some((c) => c.rule === 'resonance:table')).toBe(false);
  });

  it('someone who never comes near the chair is not followed: it waits for them 45 s at most, then comes as always', () => {
    const at = (memoryCounts: Record<string, number>) => {
      const d = new Director({ seed: 5, memoryCounts, visits: 2 });
      d.release();
      const cues = drive(d, () => ({ x: 2.6, z: 2.6, facing: 'east' as Surface }), 0, 420);
      expect(cues.some((c) => c.rule === 'resonance:table')).toBe(false);
      return cues.find((c) => c.rule === 'held-silence')?.t;
    };
    const plain = at({}), withMeal = at({ biscuit: 1 });
    expect(plain).toBeDefined();
    expect(withMeal).toBeDefined();
    expect(withMeal! - plain!).toBeLessThanOrEqual(50);
  });
});

describe('resonance: "tomorrow"', () => {
  it('B’s word is found by the room’s drawn door, never written while that wall is watched', () => {
    const echo = VIGNETTE_BY_ID.get('charger')!.echoes!.find((e) => e.id === 'tomorrow')!;
    expect(echo.write?.atDoor).toBe(true);
    // Heard B, then turned to the south wall the whole time: the word waits.
    const d = new Director({ seed: 9 });
    d.release();
    drive(d, () => ({}), 0, 40);
    ends(d, 'charger');
    const facingSouth = drive(d, () => ({ facing: 'south' as Surface, x: 0, z: -1 }), 40, 200);
    expect(facingSouth.some((c) => c.rule === 'echo:charger')).toBe(false);
    // Another visit: looking elsewhere, it is written beneath the drawn door (or beside its line).
    const e = new Director({ seed: 9 });
    e.release();
    drive(e, () => ({}), 0, 40);
    ends(e, 'charger');
    const elsewhere = drive(e, (t) => ({ facing: (['east', 'west', 'north'] as Surface[])[Math.floor(t / 20) % 3] }), 40, 200);
    const w = elsewhere.find((c) => c.rule === 'echo:charger')?.cue;
    expect(w?.type).toBe('write');
    if (w?.type === 'write') {
      expect(w.surface).toBe('south');
      expect(w.text).toBe('tomorrow');
      expect(w.under === 'ghost-door' || w.beside === 'door-open').toBe(true);
    }
  });
});

describe('absence: how the visitor left the chair', () => {
  it('staying close is told by what the visitor did: kneeling, or staying by the chair', () => {
    const kinds = Object.fromEntries(PERSONAS.map((p) => [p.id, visit(looped(p), 600, 1).director.leaving()]));
    expect(kinds.chair).toBe('close');
    expect(kinds.still).toBe(null);
    expect(kinds.explorer).toBe(null);
    expect(kinds.reader).toBe(null);
    // A look and a step back, or walking past, is not closeness.
    expect(simulate((t) => (t < 10 ? { x: 0, z: 2.6 } : t < 16 ? { x: 0, z: 0.9, gazeChair: true } : { x: 0, z: 3 }), 40).d.leaving()).toBe(null);
    expect(simulate((t) => ({ x: -3 + t * 0.4, z: 0.6 }), 16).d.leaving()).toBe(null);
    expect(simulate((t) => ({ x: 0, z: 0.8, kneeling: t > 5 && t < 15 }), 30).d.leaving()).toBe('close');
  });
});

describe('return: one word kept, and forgotten on asking', () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
  });

  it('only how the visit left the chair is stored, versioned, and nothing else about it', async () => {
    const { writeTrace, readTrace } = await import('../src/ui/prefs');
    writeTrace('close');
    expect(store.get('hh.trace.v1')).toBe(JSON.stringify({ v: 1, leaving: 'close' }));
    expect(readTrace()).toBe('close');
    // Anything else (an older version, a hand-edited value) is ignored.
    store.set('hh.trace.v1', JSON.stringify({ v: 2, leaving: 'close' }));
    expect(readTrace()).toBe(null);
    store.set('hh.trace.v1', '{not json');
    expect(readTrace()).toBe(null);
    store.set('hh.trace.v1', JSON.stringify({ v: 1, leaving: 'I wrote this' }));
    expect(readTrace()).toBe(null);
    store.set('hh.trace.v1', JSON.stringify({ v: 1, leaving: 'retreat' }));
    expect(readTrace()).toBe(null);
    writeTrace(null);
    expect(store.has('hh.trace.v1')).toBe(false);
  });

  it('forget clears it with the visits and the memories, and this visit’s counts in memory too', async () => {
    const { writeTrace, readTrace, forgetVisits, writeMemoryCounts } = await import('../src/ui/prefs');
    writeTrace('close');
    writeMemoryCounts({ cereal: 1 });
    forgetVisits();
    expect(readTrace()).toBe(null);
    expect([...store.keys()].filter((k) => /^hh\.(trace|visits|memories|opening)/.test(k))).toEqual([]);
    const d = new Director({ seed: 2, memoryCounts: { cereal: 1, biscuit: 2 } });
    expect(d.scenes.heard('cereal')).toBe(true);
    d.forgetVisits();
    expect(d.scenes.heard('cereal')).toBe(false);
    expect(d.scenes.heard('biscuit')).toBe(false);
  });

  it('the chair on return: turned away after closeness, as it was otherwise; and then nothing asks', () => {
    expect(returnYaw('close', 0.22)).toBeCloseTo(0.22 + CLOSE_TURN, 5);
    expect(returnYaw(null, 0.22)).toBe(null);
    const asked = (trace: 'close' | null) => {
      const d = new Director({ seed: 3, visits: 2, trace });
      d.release();
      return drive(d, () => ({}), 0, 20).some((c) => c.cue.type === 'reveal' && c.cue.phraseId === 'remember-me');
    };
    expect(asked(null)).toBe(true);
    expect(asked('close')).toBe(false);
  });

  it('a return no longer nudges the chair at random: nothing moves it in the visit’s first minutes', () => {
    const r = visit(looped(PERSONAS[0]), 120, 4, 0.1, { visits: 5, memoryCounts: { cereal: 1 } });
    expect(r.devs.filter((d) => d.kind === 'chair')).toEqual([]);
  });
});

describe('replay and duplicates', () => {
  it('a seed replays the same visit, return visits included', () => {
    for (const past of [{}, { visits: 3, memoryCounts: { cereal: 1, biscuit: 1 } }]) {
      const a = visit(looped(PERSONAS[2]), 400, 6, 0.1, past).devs.map((d) => `${d.t} ${d.rule} ${d.label}`);
      const b = visit(looped(PERSONAS[2]), 400, 6, 0.1, past).devs.map((d) => `${d.t} ${d.rule} ${d.label}`);
      expect(a).toEqual(b);
    }
  });

  it('no memory twice in a visit, none over another, and each consequence at most once', () => {
    for (const p of PERSONAS) {
      for (const seed of [1, 2, 3, 4]) {
        const devs = visit(looped(p), 600, seed, 0.1, { visits: 2, memoryCounts: { cereal: 1, biscuit: 1 } }).devs;
        const mems = devs.filter(isMemory);
        expect(new Set(mems.map((m) => m.label)).size).toBe(mems.length);
        for (let i = 1; i < mems.length; i++) expect(mems[i].t).toBeGreaterThan(mems[i - 1].endsAt!);
        for (const rule of ['resonance:table', 'held-silence', 'echo:charger']) expect(devs.filter((d) => d.rule === rule && d.kind !== 'text').length).toBeLessThanOrEqual(1);
        // The held silence at the chair never comes over a memory.
        for (const t of devs.filter((d) => d.rule === 'resonance:table')) for (const m of mems) expect(t.t > m.t && t.t < m.endsAt!).toBe(false);
      }
    }
  });

  it('the new gestures move nothing (reduced motion has nothing to scale) and need no caption', () => {
    const d = new Director({ seed: 5, memoryCounts: { biscuit: 1 }, visits: 2 });
    d.release();
    const cues = drive(d, (t) => (t < 150 ? { x: 2.6, z: 2.6 } : t < 220 ? { x: 0.3, z: 1.2, gazeChair: true } : { x: 3, z: 3 }), 0, 260);
    const ours = cues.filter((c) => /^resonance:/.test(c.rule)).map((c) => c.cue.type);
    expect(ours.length).toBeGreaterThan(0);
    for (const t of ours) expect(['silence', 'lift']).toContain(t);
  });
});

describe('review fixes', () => {
  it('the door is outside the two-new-lines cap: after it, two ordinary memories may still be offered', async () => {
    const { MemoryDirector } = await import('../src/state/MemoryDirector');
    const m = new MemoryDirector();
    m.setAvailable(new Set(['practice', 'a-bag', 'back-seat']));
    const state = (now: number, o = {}) => ({ now, phase: 'contradiction', free: true, visibleFacing: () => false, departing: false, otherMemory: false, facing: 'north', darkEnded: 130, ...o });
    // Another memory first (the door comes only after one).
    m.tapped('happiest-unneeded');
    m.update({ now: 251, visible: (id: string) => id === 'happiest-unneeded', gazeId: null, gazeFor: 0, free: true, otherMemory: false, departing: false });
    m.ended('bedroom', 280, true, true);
    const offered: string[] = [];
    for (let t = 410; t < 900 && offered.length < 3; t += 1) {
      const o = m.offer(state(t));
      if (o) offered.push(o.id);
    }
    expect(offered[0]).toBe('door');
    expect(offered.length).toBe(3);
  });

  it('a held silence let go early is followed by its exhale from then, not from its planned end', async () => {
    const { Pacing } = await import('../src/state/Pacing');
    const p = new Pacing();
    p.note(100, { type: 'silence', depth: 0.92, seconds: 40 }, 'resonance:table');
    expect(p.intenseFree(117)).toBe(false);
    p.release(110);
    expect(p.holding(111)).toBe(false);
    expect(p.intenseFree(115)).toBe(false);
    expect(p.intenseFree(117)).toBe(true);
    // What a voice inside it is owed stays.
    const q = new Pacing();
    q.note(100, { type: 'silence', depth: 0.92, seconds: 40 }, 'resonance:table');
    q.note(105, { type: 'voice', kind: 'line', text: 'x', position: { kind: 'chair' } } as never, 'encounter:x:1');
    q.release(110);
    expect(q.intenseFree(117)).toBe(false);
  });
});

describe("after the room's last music (the woodland's afternoon, seen)", () => {
  /** Music, and anyone humming, in a visit of a visitor standing still facing one wall. */
  const tunes = (withdrawAt: number | null, seed: number) => {
    const d = new Director({ seed });
    d.release();
    const out: TimedCue[] = [];
    for (let t = 0; t < 600; t += 0.1) {
      if (withdrawAt !== null && Math.abs(t - withdrawAt) < 0.05) d.withdrawMusic();
      const cues = d.tick(0.1, { ...base }, 'north');
      if (t >= (withdrawAt ?? 0)) out.push(...cues);
    }
    return out.filter((c) => c.cue.type === 'music' || (c.cue.type === 'voice' && c.cue.kind === 'hum'));
  };
  it('the room plays no music of its own again that visit, and nobody hums', () => {
    let before = 0;
    for (const seed of [1, 2, 3, 4]) {
      before += tunes(null, seed).length;
      expect(tunes(30, seed), `seed ${seed}`).toEqual([]);
    }
    // (A still visitor's visit does have them, otherwise this would prove nothing.)
    expect(before).toBeGreaterThan(0);
  });
});
