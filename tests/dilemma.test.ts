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

describe('coming to the chair, or only passing it', () => {
  it('walking to it and stopping by it is coming to it, however fast', () => {
    for (const speed of [1.05, 0.47]) {
      const m = run(new VisitorModel(), path([{ to: [0, 0.8], speed, hold: 2 }]));
      expect(m.approaches).toHaveLength(1);
      expect(m.approaches[0]).toMatchObject({ confirmed: true, pass: false });
    }
  });

  it('walking past the chair is not coming to it: no withdrawal, no hesitation', () => {
    const m = new VisitorModel();
    // Across the room, 0.9 m from the chair, without stopping.
    run(m, path([{ to: [-2.4, 0.9], speed: 1.05 }, { to: [2.4, 0.9], speed: 1.05 }, { to: [2.4, 2.6], speed: 1.05, hold: 1 }], [-2.4, 2.6]));
    expect(m.approaches.length).toBeGreaterThan(0);
    expect(m.approaches.every((a) => a.pass && !a.confirmed)).toBe(true);
    expect(m.comings).toHaveLength(0);
    expect(m.hesitations).toBe(0);
    expect(m.lastWithdrawAt).toBe(-Infinity);
  });

  it('coming close and going away again is still a hesitation', () => {
    const m = new VisitorModel();
    run(m, path([{ to: [0, 0.9], speed: 1.05, hold: 2 }, { to: [0, 2.6], speed: 1.05, hold: 1 }]));
    expect(m.comings).toHaveLength(1);
    expect(m.hesitations).toBe(1);
    expect(m.lastWithdrawAt).toBeGreaterThan(0);
  });

  it('coming straight at it and straight back out, without stopping, is coming to it: the hesitation itself', () => {
    const m = run(new VisitorModel(), path([{ to: [0, 0.8], speed: 0.5 }, { to: [0, 2.7], speed: 0.6, hold: 1 }]));
    expect(m.comings).toHaveLength(1);
    expect(m.hesitations).toBe(1);
  });

  it('walking to stand right beside it, at an angle, and staying is coming to it (QA)', () => {
    const m = run(new VisitorModel(), path([{ to: [0.55, 0.15], speed: 1.05, hold: 10 }]));
    expect(m.comings).toHaveLength(1);
  });

  it('backing in is not coming to it', () => {
    const m = new VisitorModel();
    run(m, path([{ to: [0, 0.8], speed: 0.8, hold: 2 }]).map((i) => ({ ...i, yaw: Math.PI + i.yaw, gazeChair: false })));
    expect(m.approaches[0].pass).toBe(true);
    expect(m.comings).toHaveLength(0);
  });
});

/** A visit from the hand-off, walking these paths. */
function visit(inputs: VisitorInput[]): TimedCue[] {
  const d = new Director({ seed: 3 });
  d.release({ written: OPENING_WRITTEN, spoken: OPENING_SPOKEN, unfinished: OPENING_UNFINISHED });
  const out: TimedCue[] = [];
  for (const i of inputs) out.push(...d.tick(DT, i, 'north'));
  return out;
}

const away = (hold = 25): { to: [number, number]; speed: number; hold?: number } => ({ to: [0, 2.6], speed: 1.05, hold });
const rush = (hold = 4): { to: [number, number]; speed: number; hold?: number } => ({ to: [0, 0.8], speed: 1.05, hold });
const gently = (hold = 4): { to: [number, number]; speed: number; hold?: number }[] => [{ to: [0, 1.9], speed: 1.05, hold: 1.5 }, { to: [0, 0.8], speed: 0.47, hold }];

describe('coming back to the chair', () => {
  const start = { to: [0, 2.85] as [number, number], speed: 1, hold: 3 };

  it('the first time, it is met as it always was: the quiet, no recoil', () => {
    const cues = visit(path([start, rush()]));
    expect(cues.some((c) => c.rule === 'first-approach' && c.cue.type === 'silence')).toBe(true);
    expect(cues.some((c) => c.cue.type === 'flinch')).toBe(false);
  });

  it('coming back after a stay makes it recoil, at once; the second time only the chair; then never', () => {
    const legs = [rush(7), away(), rush(7), away(), rush(7), away(), rush(7), away()];
    const cues = visit(path([start, ...legs]));
    const recoils = cues.filter((c) => c.cue.type === 'flinch');
    expect(recoils.map((c) => (c.cue.type === 'flinch' ? [c.cue.amount, !!c.cue.chair] : null))).toEqual([[1, false], [0.6, true]]);
    expect(recoils.every((c) => c.rule === 'return-recoil')).toBe(true);
  });

  it('a first visit too short to be a stay (under 6 s) is not left: no recoil on coming back', () => {
    const cues = visit(path([start, rush(3), away(), rush(7)]));
    expect(cues.some((c) => c.cue.type === 'flinch')).toBe(false);
  });

  it('however they come back: slowly is a return too', () => {
    const cues = visit(path([start, rush(7), away(), ...gently()]));
    expect(cues.filter((c) => c.cue.type === 'flinch')).toHaveLength(1);
  });

  it('a step back and in again is not a return', () => {
    const cues = visit(path([start, rush(), { to: [0, 2.3], speed: 1.05 }, rush()]));
    expect(cues.some((c) => c.cue.type === 'flinch')).toBe(false);
  });

  it('walking past the chair is never answered as coming to it', () => {
    const cues = visit(path([{ to: [-2.4, 0.9], speed: 1.05 }, { to: [2.4, 0.9], speed: 1.05 }, { to: [2.4, -2.4], speed: 1.05, hold: 10 }], [-2.4, 2.6]));
    expect(cues.some((c) => c.rule === 'first-approach' || c.rule === 'return-recoil')).toBe(false);
  });

});

describe('the way out', () => {
  /** A visit already in its contradiction, standing at the south wall facing the way out. */
  function atTheDoor() {
    const d = new Director({ seed: 5 });
    d.release({ written: OPENING_WRITTEN, spoken: OPENING_SPOKEN, unfinished: OPENING_UNFINISHED });
    const here = input(0.3, 2.3, { yaw: Math.PI, gazeChair: false, gazePhraseId: null });
    const cues: TimedCue[] = [];
    // Reading elsewhere until the visit has turned, the line is on its wall, and the room isn't
    // holding still (the long held silence, a memory's aftermath: the way out waits for them).
    for (let t = 0; t < 600 && !(d.visible.has(Director.EXIT) && t > 200 && !d.pacing.holding(d.now) && !d.aftermath() && !d.scenes.active); t += DT)
      cues.push(...d.tick(DT, input(1.6, 0.3, { yaw: -Math.PI / 2, gazeChair: false }), 'east'));
    // (If the visit never got there, the tests below would run in an unknown room: fail here instead.)
    expect(d.visible.has(Director.EXIT)).toBe(true);
    expect(d.pacing.holding(d.now) || d.aftermath() || !!d.scenes.active).toBe(false);
    return { d, here, cues };
  }
  const still = (d: Director, i: VisitorInput, seconds: number, facing: 'south' | 'north' = 'south') => {
    const out: TimedCue[] = [];
    for (let t = 0; t < seconds; t += DT) out.push(...d.tick(DT, i, facing));
    return out;
  };

  it('touched, the room starts letting them go; walking on, toward the wall, they have gone', () => {
    const { d, here } = atTheDoor();
    expect(d.visible.has(Director.EXIT)).toBe(true);
    still(d, here, 2);
    d.tapped({ phraseId: Director.EXIT });
    const cues = still(d, here, 4);
    expect(cues.some((c) => c.rule === 'leaving' && c.cue.type === 'silence' && c.cue.dim !== undefined)).toBe(true);
    expect(cues.some((c) => c.cue.type === 'leave')).toBe(false);
    // (What the room tells the App, so a touch then turns them to the words but never walks them on.)
    expect(d.lettingGo).toBe(true);
    // Walking on (facing south, z grows toward the wall they came in by).
    const on: TimedCue[] = [];
    for (let t = 0; t < 1; t += DT) on.push(...d.tick(DT, { ...here, z: here.z + 0.4 * t }, 'south'));
    expect(on.some((c) => c.cue.type === 'leave')).toBe(true);
    expect(d.departureLine()).toBe('The chair, from the door.');
  });

  it('walking on at once, as the room begins to let them go, is going too (Codex review, PR #56)', () => {
    const { d, here } = atTheDoor();
    still(d, here, 2);
    d.tapped({ phraseId: Director.EXIT });
    // Stand until the room begins, then walk on straight away at a walking pace.
    const cues: TimedCue[] = [];
    for (let t = 0; t < 10 && !cues.some((c) => c.rule === 'leaving'); t += DT) cues.push(...d.tick(DT, here, 'south'));
    expect(cues.some((c) => c.rule === 'leaving')).toBe(true);
    const on: TimedCue[] = [];
    for (let t = 0; t < 1; t += DT) on.push(...d.tick(DT, { ...here, z: here.z + 1.05 * t }, 'south'));
    expect(on.some((c) => c.cue.type === 'leave')).toBe(true);
    expect(on.some((c) => c.rule === 'leaving-kept')).toBe(false);
  });

  it('the way out is never culled from its wall once it is the way out (Codex review, PR #56)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const d = new Director({ seed });
      d.release({ written: OPENING_WRITTEN, spoken: OPENING_SPOKEN, unfinished: OPENING_UNFINISHED });
      const cues: TimedCue[] = [];
      for (let t = 0; t < 900; t += DT) cues.push(...d.tick(DT, input(1.6, 0.3, { yaw: -Math.PI / 2, gazeChair: false }), 'east'));
      expect(cues.some((c) => c.rule === 'cull' && c.cue.type === 'hide' && c.cue.phraseId === Director.EXIT), `seed ${seed}`).toBe(false);
      expect(d.visible.has(Director.EXIT), `seed ${seed}`).toBe(true);
    }
  });

  it('touching the words again does nothing: the explorer\'s reflex never ends the visit', () => {
    const { d, here } = atTheDoor();
    still(d, here, 2);
    d.tapped({ phraseId: Director.EXIT });
    still(d, here, 4);
    d.tapped({ phraseId: Director.EXIT });
    d.tapped({ phraseId: Director.EXIT });
    const cues = still(d, here, 20);
    expect(cues.some((c) => c.cue.type === 'leave')).toBe(false);
    expect(cues.some((c) => c.rule === 'leaving-kept')).toBe(true);
  });

  it('while it lets them go, the chair creaks behind them, once', () => {
    const { d, here } = atTheDoor();
    still(d, here, 2);
    d.tapped({ phraseId: Director.EXIT });
    const cues = still(d, here, 20);
    expect(cues.filter((c) => c.rule === 'leaving-creak' && c.cue.type === 'sound')).toHaveLength(1);
  });

  it('a turn keeps them: the room comes back, and it is not offered again at once', () => {
    const { d, here } = atTheDoor();
    still(d, here, 2);
    d.tapped({ phraseId: Director.EXIT });
    still(d, here, 3);
    const back = still(d, { ...here, yaw: 0, gazeChair: true }, 12, 'north');
    expect(back.some((c) => c.cue.type === 'leave')).toBe(false);
    expect(back.some((c) => c.rule === 'leaving-kept' && c.cue.type === 'lift')).toBe(true);
    still(d, here, 2);
    // (Not again at once: half a minute.)
    d.tapped({ phraseId: Director.EXIT });
    expect(still(d, here, 12).some((c) => c.rule === 'leaving')).toBe(false);
  });

  it('a step back on the diagonal keeps them at once; walking on a little off straight still goes (cubic, PR #56)', () => {
    const diag = atTheDoor();
    still(diag.d, diag.here, 2);
    diag.d.tapped({ phraseId: Director.EXIT });
    still(diag.d, diag.here, 3);
    // 0.2 m aside and 0.2 m back: neither alone a step, together 0.28 m away from going.
    const step: TimedCue[] = [];
    for (let t = 0; t < 0.5; t += DT) step.push(...diag.d.tick(DT, { ...diag.here, x: diag.here.x + 0.4 * t, z: diag.here.z - 0.4 * t }, 'south'));
    const after = [...step, ...still(diag.d, { ...diag.here, x: diag.here.x + 0.2, z: diag.here.z - 0.2 }, 3)];
    expect(after.some((c) => c.rule === 'leaving-kept' && c.cue.type === 'lift')).toBe(true);
    expect(after.some((c) => c.cue.type === 'leave')).toBe(false);
    // Walking on 30° off straight, at a walking pace: gone.
    const on = atTheDoor();
    still(on.d, on.here, 2);
    on.d.tapped({ phraseId: Director.EXIT });
    still(on.d, on.here, 3);
    const walk: TimedCue[] = [];
    for (let t = 0; t < 1; t += DT) walk.push(...on.d.tick(DT, { ...on.here, x: on.here.x + 0.5 * t, z: on.here.z + 0.866 * t }, 'south'));
    expect(walk.some((c) => c.cue.type === 'leave')).toBe(true);
  });

  it('not before the visit has turned; and touching other words never begins it', () => {
    const d = new Director({ seed: 5 });
    d.release({ written: OPENING_WRITTEN, spoken: OPENING_SPOKEN, unfinished: OPENING_UNFINISHED });
    const here = input(0.3, 2.3, { yaw: Math.PI, gazeChair: false });
    still(d, here, 5);
    d.tapped({ phraseId: Director.EXIT });
    expect(still(d, here, 12).some((c) => c.rule === 'leaving')).toBe(false);
    const late = atTheDoor();
    still(late.d, late.here, 2);
    late.d.tapped({ phraseId: 'arm-dead' });
    expect(still(late.d, late.here, 12).some((c) => c.rule === 'leaving')).toBe(false);
  });
});
