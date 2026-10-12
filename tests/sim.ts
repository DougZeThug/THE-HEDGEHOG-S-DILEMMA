import { Director } from '../src/state/Director';
import type { VisitorInput } from '../src/state/VisitorModel';
import type { Surface } from '../src/content/types';
import type { TimedCue } from '../src/state/cues';

export type Script = (t: number) => Partial<VisitorInput> & { facing?: Surface };

export function simulate(script: Script, seconds: number, seed = 7, dt = 0.1, d = new Director({ seed })) {
  const cues: TimedCue[] = [];
  const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
  for (let t = 0; t < seconds; t += dt) {
    const s = script(t);
    const inp = { ...base, ...s };
    cues.push(...d.tick(dt, inp, s.facing ?? 'north'));
  }
  return { d, cues };
}

export const scripts: Record<string, Script> = {
  still: () => ({ x: 0, z: 2.4 }),
  hesitant: (t) => {
    // walk in to 0.8 m, retreat to 2.6 m, period 24 s
    const ph = (t % 24) / 24;
    const z = ph < 0.5 ? 2.6 - ph * 2 * 1.8 : 0.8 + (ph - 0.5) * 2 * 1.8;
    return { x: 0, z, yaw: t * 0.01 };
  },
  close: (t) => {
    const z = Math.max(0.7, 2.4 - t * 0.5);
    return { x: 0, z, gazeChair: t > 5 };
  },
  wanderer: (t) => {
    const a = t * 0.08;
    const surfaces: Surface[] = ['north', 'east', 'south', 'west'];
    const facing = surfaces[Math.floor(((a / (Math.PI * 2)) * 4) % 4)];
    return { x: Math.sin(a) * 2.6, z: Math.cos(a) * 2.6, yaw: a, facing, nearSurface: facing };
  },
  warmDweller: (t) => {
    if (t < 60) return { x: 1.8, z: 0.4, facing: 'east', nearSurface: 'east', gazePhraseId: ['happy-then', 'good-day', 'laugh', 'w-warm'][Math.floor(t / 15)] };
    return { x: -2.5, z: 2.5, facing: 'west' };
  },
};

export function rules(cues: TimedCue[]): Set<string> {
  return new Set(cues.map((c) => c.rule));
}
