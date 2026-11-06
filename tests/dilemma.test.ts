import { describe, it, expect } from 'vitest';
import { VisitorModel, type VisitorInput } from '../src/state/VisitorModel';
import { Director } from '../src/state/Director';
import { OPENING_WRITTEN, OPENING_SPOKEN, OPENING_UNFINISHED } from '../src/state/OpeningScore';
import type { TimedCue } from '../src/state/cues';

/**
 * Coming to the chair (docs/reviews/2026-11-core-loop.md): what the room can tell about how
 * someone came near, and how it answers.
 */
const DT = 0.1;
const input = (x: number, z: number, o: Partial<VisitorInput> = {}): VisitorInput => ({
  x, z, yaw: Math.atan2(x, z), pitch: -0.3, gazePhraseId: null, gazeChair: true, nearSurface: null, kneeling: false, ...o,
});

/** Walk a body along straight legs at given speeds, then hold; returns the inputs per tick. */
function path(legs: { to: [number, number]; speed: number; hold?: number }[], from: [number, number] = [0, 2.85]): VisitorInput[] {
  const out: VisitorInput[] = [];
  let [x, z] = from;
  for (const leg of legs) {
    const dx = leg.to[0] - x, dz = leg.to[1] - z;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(len / (leg.speed * DT)));
    for (let i = 1; i <= n; i++) out.push(input(x + (dx * i) / n, z + (dz * i) / n));
    [x, z] = leg.to;
    for (let t = 0; t < (leg.hold ?? 0); t += DT) out.push(input(x, z));
  }
  return out;
}

function run(m: VisitorModel, inputs: VisitorInput[]) {
  for (const i of inputs) m.update(DT, i);
  return m;
}

describe('how someone came near', () => {
  it('walking straight at it and stopping by it is an abrupt arrival', () => {
    const m = run(new VisitorModel(), path([{ to: [0, 0.8], speed: 1.05, hold: 2 }]));
    expect(m.approaches).toHaveLength(1);
    expect(m.approaches[0]).toMatchObject({ manner: 'abrupt', confirmed: true });
  });

  it('a stop on the way in, then slowly, is gentle; so is walking to it (F, a tap)', () => {
    const paused = run(new VisitorModel(), path([{ to: [0, 1.9], speed: 1.05, hold: 1.5 }, { to: [0, 0.8], speed: 0.47, hold: 2 }]));
    expect(paused.approaches[0]).toMatchObject({ manner: 'gentle', confirmed: true });
    const walked = run(new VisitorModel(), path([{ to: [0, 0.8], speed: 0.55, hold: 2 }]));
    expect(walked.approaches[0]).toMatchObject({ manner: 'gentle', confirmed: true });
  });

  it('walking past the chair is not coming to it: no withdrawal, no hesitation', () => {
    const m = new VisitorModel();
    m.distinguishPasses = true;
    // Across the room, 0.9 m from the chair, without stopping.
    run(m, path([{ to: [-2.4, 0.9], speed: 1.05 }, { to: [2.4, 0.9], speed: 1.05 }, { to: [2.4, 2.6], speed: 1.05, hold: 1 }], [-2.4, 2.6]));
    expect(m.approaches.length).toBeGreaterThan(0);
    expect(m.approaches.every((a) => a.manner === 'pass' && !a.confirmed)).toBe(true);
    expect(m.comings).toHaveLength(0);
    expect(m.hesitations).toBe(0);
    expect(m.lastWithdrawAt).toBe(-Infinity);
  });

  it('coming close and going away again is still a hesitation', () => {
    const m = new VisitorModel();
    m.distinguishPasses = true;
    run(m, path([{ to: [0, 0.9], speed: 1.05, hold: 2 }, { to: [0, 2.6], speed: 1.05, hold: 1 }]));
    expect(m.comings).toHaveLength(1);
    expect(m.hesitations).toBe(1);
    expect(m.lastWithdrawAt).toBeGreaterThan(0);
  });

  it("on a touch screen a fast walk is never a rush (a thumb's push saturates)", () => {
    const m = new VisitorModel();
    m.touchScreen = true;
    run(m, path([{ to: [0, 0.8], speed: 1.05, hold: 2 }]));
    expect(m.approaches[0].manner).toBe('neutral');
  });

  it('backing in is not an approach', () => {
    const m = new VisitorModel();
    // Facing away from the chair (south) while walking backwards to it.
    run(m, path([{ to: [0, 0.8], speed: 0.8, hold: 2 }]).map((i) => ({ ...i, yaw: Math.PI + i.yaw, gazeChair: false })));
    expect(m.approaches[0].manner).toBe('pass');
  });
});

/** A visit from the hand-off, walking these paths, with experiments on. */
function visit(experiments: string[], inputs: VisitorInput[], o: { touch?: boolean; seed?: number } = {}): TimedCue[] {
  const d = new Director({ seed: o.seed ?? 3, experiments, touch: o.touch });
  d.release({ written: OPENING_WRITTEN, spoken: OPENING_SPOKEN, unfinished: OPENING_UNFINISHED });
  const out: TimedCue[] = [];
  for (const i of inputs) out.push(...d.tick(DT, i, 'north'));
  return out;
}

const away = (hold = 25): { to: [number, number]; speed: number; hold?: number } => ({ to: [0, 2.6], speed: 1.05, hold });
const rush = (hold = 4): { to: [number, number]; speed: number; hold?: number } => ({ to: [0, 0.8], speed: 1.05, hold });
const gently = (hold = 4): { to: [number, number]; speed: number; hold?: number }[] => [{ to: [0, 1.9], speed: 1.05, hold: 1.5 }, { to: [0, 0.8], speed: 0.47, hold }];

describe('how the room answers coming near', () => {
  const EXP = ['passes', 'approachManner'];

  it('the first arrival is never graded: rushed or gentle, the room goes quiet and warms slowly', () => {
    for (const legs of [[rush()], gently()]) {
      const cues = visit(EXP, path([{ to: [0, 2.85], speed: 1, hold: 3 }, ...legs]));
      const first = cues.filter((c) => c.rule === 'first-approach');
      expect(first.some((c) => c.cue.type === 'silence')).toBe(true);
      expect(first.some((c) => c.cue.type === 'flash' && c.cue.kind === 'warm')).toBe(true);
      expect(cues.some((c) => c.cue.type === 'flinch')).toBe(false);
    }
  });

  it('rushing at it again makes it recoil, at once, twice at most, less the second time', () => {
    const legs = [rush(), away(), rush(), away(), rush(), away(), rush(), away()];
    const cues = visit(EXP, path([{ to: [0, 2.85], speed: 1, hold: 3 }, ...legs]));
    const flinches = cues.filter((c) => c.cue.type === 'flinch');
    expect(flinches.map((c) => (c.cue.type === 'flinch' ? c.cue.amount : 0))).toEqual([1, 0.86]);
    expect(flinches.every((c) => c.rule === 'approach-flinch')).toBe(true);
  });

  it('a phone visitor is never flinched at', () => {
    const legs = [rush(), away(), rush(), away(), rush()];
    const cues = visit(EXP, path([{ to: [0, 2.85], speed: 1, hold: 3 }, ...legs]), { touch: true });
    expect(cues.some((c) => c.cue.type === 'flinch')).toBe(false);
  });

  it('walking past the chair is never answered as coming to it', () => {
    const cues = visit(EXP, path([{ to: [-2.4, 0.9], speed: 1.05 }, { to: [2.4, 0.9], speed: 1.05 }, { to: [2.4, -2.4], speed: 1.05, hold: 10 }], [-2.4, 2.6]));
    expect(cues.some((c) => c.rule === 'first-approach' || c.rule.startsWith('approach-'))).toBe(false);
  });

  it('without the experiment the room answers as it did', () => {
    const cues = visit([], path([{ to: [0, 2.85], speed: 1, hold: 3 }, rush(), away(), rush()]));
    expect(cues.some((c) => c.cue.type === 'flinch' || c.rule.startsWith('approach-'))).toBe(false);
    expect(cues.some((c) => c.rule === 'first-approach' && c.cue.type === 'silence')).toBe(true);
  });
});
