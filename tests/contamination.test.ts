import { describe, it, expect } from 'vitest';
import { simulate, scripts } from './sim';
import { Director } from '../src/state/Director';
import { PHRASE_BY_ID, PHRASES } from '../src/content/phrases';
import { belonging } from '../src/content/walls';
import type { Cue, TimedCue } from '../src/state/cues';
import type { VisitorInput } from '../src/state/VisitorModel';

type Write = Extract<Cue, { type: 'write' }>;
const strays = (cues: TimedCue[]) => cues.filter((c) => c.rule === 'stray' || c.rule === 'stray-held');
const wallOf = (w: Write) => w.surface ?? PHRASE_BY_ID.get(w.beside!)!.surface;

describe('the walls are not neatly partitioned', () => {
  it('some lines begin out of place', () => {
    expect(PHRASE_BY_ID.get('laugh-breathe')).toMatchObject({ surface: 'west', tier: 'arrival' }); // joy among the shame
    expect(PHRASE_BY_ID.get('arm-dead')).toMatchObject({ surface: 'south', tier: 'arrival' }); // the most intimate line, on the empty wall
    expect(PHRASE_BY_ID.get('meant-some')!.surface).toBe('east');
    expect(PHRASE_BY_ID.get('jumper')!.surface).toBe('north');
    // Each wall still has a dominant character.
    for (const wall of ['north', 'east', 'west'] as const) {
      const own = PHRASES.filter((p) => p.surface === wall);
      const mean = (w: typeof wall) => own.reduce((s, p) => s + belonging(p, w), 0) / own.length;
      for (const other of ['north', 'east', 'west'] as const) if (other !== wall) expect(mean(wall)).toBeGreaterThan(mean(other));
    }
  });

  it('material migrates gradually, onto walls where it does not belong, beside what does', () => {
    for (const seed of [3, 7, 11]) {
      const { d, cues } = simulate(scripts.wanderer, 700, seed);
      const s = strays(cues).filter((c) => c.rule === 'stray');
      expect(s.length).toBeGreaterThanOrEqual(4);
      expect(s[0].t).toBeGreaterThanOrEqual(130);
      expect(d.strays.size).toBeLessThanOrEqual(7);
      const anchors = new Set<string>();
      for (const c of s) {
        const w = c.cue as Write;
        const src = PHRASE_BY_ID.get(w.source!)!;
        const anchor = PHRASE_BY_ID.get(w.beside!)!;
        const wall = wallOf(w) as 'north' | 'east' | 'west';
        expect(src.surface).not.toBe(wall);
        expect(['floor', 'ceiling']).not.toContain(src.surface);
        expect(belonging(src, wall)).toBeLessThan(belonging(anchor, wall));
        expect(anchors.has(anchor.id)).toBe(false);
        anchors.add(anchor.id);
        expect(w.text).toBe(src.text); // the words are unchanged; only their company is new
      }
    }
  });

  it('is not the same contamination every visit', () => {
    const sets = [3, 7, 11].map((seed) => strays(simulate(scripts.wanderer, 700, seed).cues).map((c) => (c.cue as Write).source).join(','));
    expect(new Set(sets).size).toBe(3);
  });

  it('nothing migrates during arrival, and only a little while settling in', () => {
    const { d, cues } = simulate(scripts.still, 200, 5);
    if (d.phase === 'familiar') expect(strays(cues).length).toBeLessThanOrEqual(2);
    expect(strays(cues).every((c) => c.t >= 130)).toBe(true);
  });

  it('late in the visit, the line held longest is written on the empty wall behind', () => {
    const d = new Director({ seed: 4, situations: ['residue'] });
    const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
    const cues: TimedCue[] = [];
    for (let t = 0; t < 25; t += 0.1) cues.push(...d.tick(0.1, { ...base, x: 2.2, z: 0, gazePhraseId: 'good-day' }, 'east'));
    for (let t = 0; t < 700; t += 0.1) cues.push(...d.tick(0.1, { ...base, x: Math.sin(t * 0.05) * 2, z: Math.cos(t * 0.05) * 2, yaw: t * 0.05 }, 'north'));
    const held = cues.find((c) => c.rule === 'stray-held');
    expect(held).toBeTruthy();
    expect((held!.cue as Write).source).toBe('good-day');
    expect((held!.cue as Write).surface).toBe('south');
  });

  it('the held line still reaches the empty wall if the visitor happened to be facing it when the time came', () => {
    const d = new Director({ seed: 4, situations: ['residue'] });
    const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
    const cues: TimedCue[] = [];
    for (let t = 0; t < 25; t += 0.1) cues.push(...d.tick(0.1, { ...base, x: 2.2, z: 0, gazePhraseId: 'good-day' }, 'east'));
    // Wander, but face the south wall right through the transformation.
    for (let t = 0; t < 650 || d.phase !== 'transform'; t += 0.1) cues.push(...d.tick(0.1, { ...base, x: Math.sin(t * 0.05) * 2, z: Math.cos(t * 0.05) * 2 }, 'south'));
    for (let t = 0; t < 120; t += 0.1) cues.push(...d.tick(0.1, { ...base, x: 0.3, z: 1 }, 'south'));
    expect(cues.some((c) => c.rule === 'stray-held')).toBe(false);
    for (let t = 0; t < 120; t += 0.1) cues.push(...d.tick(0.1, { ...base, x: 0.3, z: 1 }, 'north'));
    const held = cues.find((c) => c.rule === 'stray-held');
    expect(held && (held.cue as Write).source).toBe('good-day');
  });
});
