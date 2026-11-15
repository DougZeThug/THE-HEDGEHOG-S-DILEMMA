import * as THREE from 'three';
import type { Lighting } from '../../src/world/Lighting';
import type { Environment } from '../../src/core/environment';

/** The few Environment fields the lighting reads: the room as it is when nothing is happening. */
export const CALM_ENV = { lightIntensity: 1, lightWarmth: 0, shadowDrift: 0, chairGlow: 0.2 } as unknown as Environment;

/** Steps the lighting `seconds` on from `from`, at `fps`, with the chair at `chair` (the origin). */
export function runLighting(l: Lighting, seconds: number, from = 0, fps = 30, chair = new THREE.Vector3(), env: Environment = CALM_ENV): void {
  for (let i = 0; i < seconds * fps; i++) l.update(1 / fps, env, from + i / fps, chair, 0);
}
