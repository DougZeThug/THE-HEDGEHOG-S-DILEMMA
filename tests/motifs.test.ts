import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Director } from '../src/state/Director';
import { Lighting } from '../src/world/Lighting';
import type { VisitorInput } from '../src/state/VisitorModel';
import type { Environment } from '../src/state/Director';
import type { TimedCue } from '../src/state/cues';

// Standing back from the chair (about 2.6 m) and looking at it.
const apart: VisitorInput = { x: 0.1, z: 2.6, yaw: 0, pitch: -0.1, gazePhraseId: null, gazeChair: true, nearSurface: null, kneeling: false };
const run = (d: Director, seconds: number, input: (t: number) => VisitorInput) => {
  const out: TimedCue[] = [];
  for (let t = 0; t < seconds; t += 0.1) out.push(...d.tick(0.1, input(t), 'north'));
  return out;
};

describe('writing in the air', () => {
  it('happens once a visit, after the first minute, to someone keeping their distance and looking at the chair', () => {
    for (const seed of [3, 11, 27]) {
      const d = new Director({ seed });
      d.release({ written: ['stay'], spoken: ['crumbs'] });
      const cues = run(d, 240, () => apart);
      const air = cues.filter((c) => c.cue.type === 'air');
      expect(air.length, `seed ${seed}`).toBe(1);
      expect(air[0].t).toBeGreaterThanOrEqual(60);
      expect(air[0].cue).toMatchObject({ phraseId: 'closer' });
    }
  });

  it('never while "I wanted you to" is unfinished: it would answer it', () => {
    const d = new Director({ seed: 3 });
    d.release({ written: ['stay'], spoken: ['crumbs'], unfinished: ['stay'] });
    // Looking at the chair, never at the line, so the line is not finished by looking.
    const cues = run(d, 240, () => apart);
    expect(cues.some((c) => c.cue.type === 'air')).toBe(false);
  });

  it('not for someone standing close', () => {
    const d = new Director({ seed: 3 });
    d.release({ written: ['stay'], spoken: ['crumbs'] });
    const cues = run(d, 240, () => ({ ...apart, z: 1.4 }));
    expect(cues.some((c) => c.cue.type === 'air')).toBe(false);
  });
});

describe('light as a motif', () => {
  const env = { lightIntensity: 1, lightWarmth: 0, shadowDrift: 0, chairGlow: 0.2 } as unknown as Environment;
  it('the room goes back to the chair alone, slowly, and returns', () => {
    const l = new Lighting('low');
    const chair = new THREE.Vector3();
    l.dimToChair(0.25, 11, 0);
    const at: number[] = [];
    for (let t = 0; t <= 12; t += 0.05) {
      l.update(0.05, env, t, chair);
      at.push(l.roomLight);
    }
    const level = (t: number) => at[Math.round(t / 0.05)];
    // Not a switch: a third of the way down after a second.
    expect(level(1)).toBeGreaterThan(0.6);
    expect(level(5)).toBeCloseTo(0.25, 2);
    expect(level(11.5)).toBe(1);
    // Down and back once.
    let turns = 0;
    for (let i = 2; i < at.length; i++) if (Math.sign(at[i] - at[i - 1]) * Math.sign(at[i - 1] - at[i - 2]) < 0) turns++;
    expect(turns).toBeLessThanOrEqual(1);
  });

  it('the long held silence and the turn to the last phase take the light back to the chair', () => {
    // Every silence that dims comes from one of those two moments, and every such moment dims.
    const d = new Director({ seed: 5 });
    d.release({ written: ['stay'], spoken: ['crumbs'] });
    const cues = run(d, 900, (t) => ({ ...apart, z: 1.2 + Math.abs(Math.sin(t * 0.05)) * 1.4, gazeChair: t % 40 < 25, yaw: Math.sin(t * 0.1) }));
    expect(cues.some((c) => c.rule === 'held-silence')).toBe(true);
    for (const c of cues) {
      if ((c.rule === 'held-silence' || c.rule === 'phase-transform') && c.cue.type === 'silence') expect(c.cue.dim).toBe(0.25);
      if (c.cue.type === 'silence' && c.cue.dim !== undefined) expect(['held-silence', 'phase-transform']).toContain(c.rule);
    }
  });
});
