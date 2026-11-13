import { clamp, smoothstep } from '../../core/math';
import type { Phase } from '../../content/types';
import type { FieldValues } from '../EmotionalField';
import type { Memory } from '../Memory';
import { lateness } from '../Phase';
import type { Environment } from '../../core/environment';

export interface EnvironmentInput {
  field: FieldValues;
  strength: Memory['strength'];
  phase: Phase;
  kneeling: boolean;
  deepStillFor: number;
  departing: boolean;
  /** The room scale of the last tick (the reverb follows it), if there was one. */
  previousRoomScale?: number;
}

export function computeEnvironment({ field: f, strength: m, phase, kneeling, deepStillFor, departing, previousRoomScale }: EnvironmentInput): Environment {
  const late = lateness(phase);
  const extreme = smoothstep(0.6, 0.95, f.exposure * 0.6 + f.tension * 0.6);
  return {
    lightIntensity: clamp(0.95 + 0.16 * f.exposure - 0.12 * f.hush - 0.1 * f.solitude * (1 - f.relief) + 0.05 * f.warmth, 0.55, 1.25),
    lightWarmth: clamp(0.65 * f.warmth + 0.45 * f.reminiscence - 0.55 * f.exposure - 0.3 * f.solitude * (1 - f.reminiscence) + 0.2 * f.relief, -1, 1),
    shadowDrift: 0.42 * f.dissonance + 0.5 * m.hesitation + 0.15 * late,
    roomScale: Math.max(1, 1 + 0.13 * f.solitude * (0.4 + late) + 0.07 * (kneeling ? 1 : 0) + 0.04 * f.hush - 0.04 * f.exposure * late),
    darkness: clamp(0.35 * extreme + 0.18 * smoothstep(40, 120, deepStillFor) + (departing ? 1 : 0)),
    textContrast: clamp(1 + 0.35 * f.hush - 0.2 * f.tension + 0.1 * f.reminiscence, 0.7, 1.4),
    chairGlow: clamp(0.15 + 0.6 * f.warmth * (1 - f.exposure) + 0.25 * m.closeness),
    saturation: clamp(0.85 + 0.2 * f.warmth + 0.15 * f.reminiscence - 0.3 * f.exposure - 0.2 * f.solitude, 0.45, 1.15),
    hum: clamp(1 - 0.75 * f.hush + 0.2 * f.exposure),
    vent: clamp(0.9 - 0.85 * f.hush),
    outside: clamp(0.25 + 0.5 * f.solitude * (1 - f.hush) + 0.2 * f.relief),
    drone: clamp(0.18 + 0.35 * f.dissonance + 0.3 * f.exposure + 0.2 * f.reminiscence - 0.25 * f.hush),
    droneBrightness: clamp(0.3 + 0.4 * f.warmth - 0.2 * f.solitude + 0.3 * f.tension),
    reverb: clamp(0.35 + 0.4 * (previousRoomScale !== undefined ? previousRoomScale - 1 : 0) * 4 + 0.2 * f.solitude + 0.15 * (kneeling ? 1 : 0)),
  };
}
