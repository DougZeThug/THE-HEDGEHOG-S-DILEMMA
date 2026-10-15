/**
 * Resonance, absence, aftermath and return (docs/reviews/2026-10-emotional-depth.md). These check
 * that the mechanisms behave as decided; whether any of it is felt is for visitors to say.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Director, returnYaw } from '../src/state/Director';
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
/** What the room does of its own accord (as the Director spaces it). */
const ROOM_OWN = /^(drift|accumulate$|stray|resurface|recontext|music$|distant-life|chair-nudge|voice$|return$|phase-|air$|draw$|link$|memory$|sit:(?!residue|listening))/;

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

  it('in every persona’s visit, the room’s own events are at least 2.5 s apart', () => {
    for (const p of PERSONAS) {
      for (const seed of [1, 4]) {
        const own = visit(looped(p), 600, seed).devs.filter((d) => ROOM_OWN.test(d.rule));
        for (let i = 1; i < own.length; i++) {
          // (One event's several cues — a phase's silence and its line — share a rule and a moment.)
          if (own[i].rule === own[i - 1].rule && own[i].t === own[i - 1].t) continue;
          expect(own[i].t - own[i - 1].t, `${p.id}:${seed} ${own[i - 1].rule} → ${own[i].rule} at ${own[i].t}`).toBeGreaterThanOrEqual(2.4);
        }
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
    expect(after.find((c) => c.rule === 'resonance:table-lift')!.cue).toEqual({ type: 'lift', seconds: 4 });
    const later = drive(d, sitter, at + 30, 300);
    expect(later.some((c) => c.rule === 'resonance:table' || c.rule === 'held-silence')).toBe(false);
  });

  it('someone who never comes near the chair is not followed: after 300 s the ordinary one may come', () => {
    const d = new Director({ seed: 5, memoryCounts: { biscuit: 1 }, visits: 2 });
    d.release();
    const cues = drive(d, () => ({ x: 2.6, z: 2.6, facing: 'east' as Surface }), 0, 420);
    expect(cues.some((c) => c.rule === 'resonance:table')).toBe(false);
    const held = cues.filter((c) => c.rule === 'held-silence');
    for (const h of held) expect(h.t).toBeGreaterThanOrEqual(300);
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
  it('the five personas are told apart by what they did, not by chance', () => {
    const kinds = Object.fromEntries(PERSONAS.map((p) => [p.id, visit(looped(p), 600, 1).director.leaving()]));
    expect(kinds.still).toBe('apart');
    expect(kinds.chair).toBe('close');
    // The explorer and the reader pass the chair without stopping by it: nothing in particular.
    expect(kinds.explorer).toBe(null);
    expect(kinds.reader).toBe(null);
    expect(kinds.phone).not.toBe('retreat');
  });

  it('a retreat is stopping, looking at the chair and going within seconds; walking past is not', () => {
    const retreat = simulate((t) => (t < 10 ? { x: 0, z: 2.6 } : t < 16 ? { x: 0, z: 0.9, gazeChair: true } : { x: 0, z: 3 }), 40).d;
    expect(retreat.leaving()).toBe('retreat');
    const past = simulate((t) => ({ x: -3 + t * 0.4, z: 0.6 }), 16).d;
    expect(past.leaving()).not.toBe('retreat');
    const knelt = simulate((t) => ({ x: 0, z: 0.8, kneeling: t > 5 && t < 15 }), 30).d;
    expect(knelt.leaving()).toBe('close');
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
    writeTrace('retreat');
    expect(store.get('hh.trace.v1')).toBe(JSON.stringify({ v: 1, leaving: 'retreat' }));
    expect(readTrace()).toBe('retreat');
    // Anything else (an older version, a hand-edited value) is ignored.
    store.set('hh.trace.v1', JSON.stringify({ v: 2, leaving: 'close' }));
    expect(readTrace()).toBe(null);
    store.set('hh.trace.v1', '{not json');
    expect(readTrace()).toBe(null);
    store.set('hh.trace.v1', JSON.stringify({ v: 1, leaving: 'I wrote this' }));
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

  it('the chair on return: turned away after closeness, facing them after a retreat, as it was otherwise', () => {
    expect(returnYaw('close', 0.22)).toBeCloseTo(1.12, 5);
    expect(returnYaw('retreat', 0.22)).toBe(0);
    expect(returnYaw('apart', 0.22)).toBe(null);
    expect(returnYaw(null, 0.22)).toBe(null);
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
    const cues = drive(d, (t) => (t < 150 ? { x: 2.6, z: 2.6 } : t < 220 ? { x: 0.3, z: 1.2 } : { x: 3, z: 3 }), 0, 260);
    const ours = cues.filter((c) => /^resonance:/.test(c.rule)).map((c) => c.cue.type);
    expect(ours.length).toBeGreaterThan(0);
    for (const t of ours) expect(['silence', 'lift']).toContain(t);
  });
});
