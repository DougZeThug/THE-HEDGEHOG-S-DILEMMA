import { describe, it, expect } from 'vitest';
import { PERSONAS, explorer, phone, stillVisitor, reader } from './playtest/personas';
import { visit, windowStats, meaningful } from './playtest/measure';
import { Director } from '../src/state/Director';
import { Pacing } from '../src/state/Pacing';
import type { VisitorInput } from '../src/state/VisitorModel';

const SEEDS = [1, 2, 3, 4];
const runs = new Map(PERSONAS.map((p) => [p.id, SEEDS.map((s) => visit(p, 320, s))]));
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];

describe('pacing: the room is alive from the start, for every kind of visitor', () => {
  it('something meaningful happens within the first ten seconds of every visit', () => {
    for (const [, rs] of runs) for (const r of rs) expect(r.devs.filter(meaningful)[0].t).toBeLessThanOrEqual(10);
  });

  it('the room answers what the visitor does within the first half-minute', () => {
    for (const [id, rs] of runs) expect(median(rs.map((r) => windowStats(r, 30).firstResponse ?? 99)), id).toBeLessThanOrEqual(30);
  });

  it('recorded voices are heard within the first minute and a half', () => {
    for (const [id, rs] of runs) expect(median(rs.map((r) => windowStats(r, 90).recordedVoices)), id).toBeGreaterThanOrEqual(1);
  });

  it('no long dead stretches: nothing seen or heard for longer than feels chosen', () => {
    // Counting only what the visitor could perceive; a deliberately held silence is not a gap.
    for (const [id, rs] of runs) {
      expect(median(rs.map((r) => windowStats(r, 90).longestSeenGap)), id).toBeLessThanOrEqual(25);
      expect(median(rs.map((r) => windowStats(r, 180).longestSeenGap)), id).toBeLessThanOrEqual(35);
    }
  });

  it('audible events do not trample each other', () => {
    for (const [id, rs] of runs) expect(median(rs.map((r) => windowStats(r, 180).overlaps)), id).toBe(0);
  });

  it('but it is not constant stimulation: on average no more than one development every seven seconds', () => {
    // Everything counted — writing, voices, sounds, music, light — not just text.
    for (const [id, rs] of runs) expect(median(rs.map((r) => windowStats(r, 180).perMinute)), id).toBeLessThanOrEqual(60 / 7);
  });
});

describe('pacing: phases open through engagement, not timers', () => {
  const at = (id: string, phase: string) => median(runs.get(id)!.map((r) => r.phases.find((p) => p.phase === phase)?.t ?? 999));
  it('an engaged visitor reaches contradiction around the first minute and transformation in two to four', () => {
    for (const id of ['explorer', 'reader', 'phone', 'chair']) {
      expect(at(id, 'contradiction'), id).toBeLessThanOrEqual(75);
      expect(at(id, 'transform'), id).toBeGreaterThanOrEqual(110);
      expect(at(id, 'transform'), id).toBeLessThanOrEqual(240);
    }
  });

  it('a visitor who barely moves still sees the room change, later', () => {
    expect(at('still', 'contradiction')).toBeLessThanOrEqual(121);
    expect(at('still', 'transform')).toBeLessThanOrEqual(301);
    expect(at('still', 'contradiction')).toBeGreaterThan(at('reader', 'contradiction'));
  });

  it('depth decides, not the clock: visitors who engage differently arrive at different times', () => {
    const times = ['explorer', 'reader', 'phone', 'chair'].map((id) => at(id, 'transform'));
    expect(new Set(times).size).toBeGreaterThanOrEqual(3);
    // Attending to the writing counts for more than walking about.
    expect(at('reader', 'contradiction')).toBeLessThan(at('explorer', 'contradiction'));
  });

  it('stillness is not the key: a visitor who never stops still goes deep', () => {
    expect(at('explorer', 'contradiction')).toBeLessThanOrEqual(75);
    const ex = runs.get('explorer')![0];
    expect(ex.devs.some((d) => d.rule.startsWith('still'))).toBe(false);
    expect(median(runs.get('explorer')!.map((r) => windowStats(r, 90).voices))).toBeGreaterThanOrEqual(1);
  });
});

describe('engagement: many kinds of attention are recognised', () => {
  it('touching writing is reading it, at once', () => {
    const r = visit(phone, 30, 1);
    expect(r.recognised[30].taps).toBeGreaterThanOrEqual(2);
    expect(r.director.engagement.count('tap')).toBeGreaterThanOrEqual(2);
    expect(r.director.visitor.read.has('happy-then')).toBe(true);
  });

  it('looking away and coming back to a line is a new meeting', () => {
    const r = visit(reader, 120, 1);
    expect(r.director.engagement.count('return')).toBeGreaterThanOrEqual(1);
  });

  it('looking around, crossing the room and pausing are each noticed', () => {
    const e = visit(explorer, 120, 1).director.engagement;
    expect(e.count('sweep')).toBeGreaterThanOrEqual(1);
    expect(e.count('cross')).toBeGreaterThanOrEqual(2);
    expect(visit(stillVisitor, 120, 1).director.engagement.count('pause')).toBeGreaterThanOrEqual(1);
  });

  it('touch on the chair counts, and coming close is answered at once', () => {
    const d = new Director({ seed: 2, situations: ['residue'] });
    const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: true, nearSurface: null, kneeling: false };
    expect(d.tapped({ chair: true })).toBe(true);
    const cues = [];
    for (let t = 0; t < 12; t += 0.1) cues.push(...d.tick(0.1, { ...base, z: Math.max(0.8, 2.4 - t) }, 'north'));
    expect(cues.some((c) => c.rule === 'first-approach')).toBe(true);
    expect(d.engagement.count('tap-chair')).toBe(1);
  });
});

describe('rhythm', () => {
  it('tells chosen quiet from waiting, and holds quiet after something strong', () => {
    const p = new Pacing();
    expect(p.rhythm(3, 'arrival', 0)).toBe('arrival');
    p.note(10, { type: 'voice', kind: 'tender', text: 'x', caption: 'x', position: { kind: 'chair' }, gain: 0.5 }, 'test');
    // After a voice, a long held quiet.
    expect(p.rhythm(25, 'familiar', 0.3)).toBe('recovery');
    expect(p.intenseFree(25)).toBe(false);
    // Someone who is doing things is answered sooner than someone who isn't — who is never "kept waiting".
    expect(p.rhythm(30.5, 'familiar', 0.3)).toBe('stalled');
    expect(p.rhythm(30.5, 'familiar', 0.05)).toBe('quiet');
    expect(p.rhythm(200, 'familiar', 0)).toBe('quiet');
    // A dip in the room tone is a gesture, but does not end a stall by itself.
    p.note(40, { type: 'silence', depth: 0.3, seconds: 3 }, 'tap');
    expect(p.sinceDev(40)).toBe(30);
  });

  it('the room does not repeat itself: the same kind of answer is not given twice running', () => {
    for (const [, rs] of runs)
      for (const r of rs) {
        const resp = r.devs.filter((d) => d.rule.startsWith('respond-sound'));
        for (let i = 1; i < resp.length; i++) expect(resp[i].t - resp[i - 1].t).toBeGreaterThanOrEqual(25);
      }
  });
});
