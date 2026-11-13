import * as THREE from 'three';
import { approach, clamp, smoothstep } from '../core/math';
import type { Environment } from '../core/environment';
import { HANDS } from './textures';
import { faintOpacity, handAt, recedeStep, wallClock } from './writePlan';
import type { TextItem } from './WallText';

/** What one frame of the room's writing knows: the camera, the clock, the gaze, the light. */
export interface TextStepContext {
  dt: number;
  /** The camera's position and facing, and a scratch vector for the line to an item. */
  pos: THREE.Vector3;
  fwd: THREE.Vector3;
  to: THREE.Vector3;
  env: Environment;
  gazeId: string | null;
  gazeFor: number;
  /** How much faint writing is strengthened (see `WallText.faintBoost`). */
  faintBoost: number;
}

/**
 * One piece of visible writing, one frame: how legible it is from here, whether it shies, how the
 * gaze and a touch mark it, how it recedes as you come close, and so the uniforms its shader reads.
 */
export function stepItem(it: TextItem, c: TextStepContext): void {
  const { dt, pos, fwd, to, env, gazeId, gazeFor } = c;
  to.copy(it.centre).sub(pos);
  const dist = to.length();
  // Distance legibility: small and faint writing needs you to come close.
  let legible = 1;
  if (it.phrase?.tier === 'near') legible = smoothstep(2.8, 1.1, dist);
  else if (it.size === 'xs') legible = 0.35 + 0.65 * smoothstep(5.5, 2.2, dist);
  else if (it.hand === 'faint') legible = 0.45 + 0.55 * smoothstep(6, 2.5, dist);
  // Drawings are found rather than displayed: barely there from across the room.
  if (it.purpose === 'drawing') legible = 0.5 + 0.5 * smoothstep(5.5, 1.6, dist);
  // Shy writing withdraws from a direct look.
  if (it.phrase?.shy) {
    const ang = fwd.angleTo(to);
    const target = ang < 0.16 && dist < 6 ? 0.06 : 1;
    it.shy = approach(it.shy, target, dt, target < it.shy ? 0.7 : 2.2);
  }
  const gazed = gazeId === it.key;
  it.emphasis = approach(it.emphasis, gazed ? clamp((gazeFor - 0.8) / 3) * 0.7 : 0, dt, gazed ? 1.2 : 3);
  if (it.pressed) it.pressed = it.pressed < 0.01 ? 0 : approach(it.pressed, 0, dt, 0.8);
  // A touch leaves a little of itself on the words, fading over minutes (the hand's, not the eye's).
  if (it.handled) it.handled = it.handled < 0.005 ? 0 : approach(it.handled, 0, dt, 240);
  // Receding: the closer, the less of it (and a look doesn't bring it back); stepping back
  // returns it, more slowly than it went.
  let recede = 0;
  if (it.recede) {
    it.recede = recedeStep(it.recede, dist, dt);
    recede = it.recede.k;
    it.emphasis *= 1 - recede;
  }
  if (it.gap) {
    const g = it.gap;
    g.gone = g.target > g.gone ? Math.min(g.target, g.gone + g.rate * dt) : Math.max(g.target, g.gone - g.rate * dt);
    it.uniforms.uGap.value.set(g.lo, g.hi, g.gone);
  }
  const base = faintOpacity(HANDS[it.hand].opacity * (it.strength ?? 1) * (1 - (it.wash ?? 0)), it.placement.surface, c.faintBoost);
  if (it.plan) {
    const h = handAt(it.plan, wallClock());
    it.uniforms.uWrite.value = h / Math.max(1e-3, it.duration);
    // Done: the writing simply exists (an unfinished sentence keeps its plan, to be finished).
    if (h >= it.duration) {
      it.plan = null;
      it.uniforms.uWrite.value = 2;
    }
  }
  it.uniforms.uReveal.value = it.vis * (1 - 0.55 * recede);
  it.uniforms.uOpacity.value = clamp(base * legible * Math.min(it.shy, 1 - 0.5 * recede) * env.textContrast * (1 + it.emphasis * 0.3), 0, 1);
  it.uniforms.uEmphasis.value = Math.min(1, Math.max(it.emphasis, it.handled ?? 0) + (it.pressed ?? 0) * 0.35);
}
