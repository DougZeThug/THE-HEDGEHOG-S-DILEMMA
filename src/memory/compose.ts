import { clamp, smoothstep } from '../core/math';
import type { Values } from './types';

/**
 * The one place authored and procedural values meet. Theatre.js writes the authored base (where a
 * layer is, how opaque, how warm the light); GSAP's behaviours write transient envelopes (the
 * emergence, the dissolve, a graceful exit, the curtain's breathing). Each field has one writer;
 * this function composes them deterministically into what is drawn and heard.
 *
 *   opacity   = base × emerge × exit × presence
 *   reveal    = base × (1 − dissolve / 0.7)               (the light recedes, taking the colour)
 *   sketch    = base × (1 − (dissolve − 0.65) / 0.35)     (the drawing stands alone, then sinks)
 *   offsets   = base + envelope offset × motion           (motion 0 under reduced motion)
 *   parallax  = base × parallaxWeight                     (0.25 under reduced motion)
 *   light     = base × emerge × exit × presence
 */
export interface Weights {
  presence: number;
  /** Procedural motion (sway, drift, breathing): 1, or 0 under reduced motion. */
  motion: number;
  parallax: number;
}

export const FULL: Weights = { presence: 1, motion: 1, parallax: 1 };

export function weightsFor(reducedMotion: boolean, gentle: boolean): Weights {
  return { presence: gentle ? 0.6 : 1, motion: reducedMotion ? 0 : 1, parallax: reducedMotion ? 0.25 : 1 };
}

const env1 = (env: Values, k: string, d = 1) => (k in env ? env[k] : d);

/**
 * Compose a frame. `base` keys are `object.prop`; envelope keys are named in behaviours.ts.
 *
 * A living memory (`living`, docs/reviews/2026-10-woodland.md) authors its own withdrawal (the
 * way out, then the colour and the graphite), so the dissolve doesn't take its reveal. Let go
 * early, it leaves in order as the exit envelope falls: the people first, then the way in in
 * reverse, and the wall's painting last, so the room lands back on it:
 *
 *   people   = base × s(0.55, 1, exit)
 *   shot     = the wide (0) as soon as it is let go
 *   immerse  = base × s(0.25, 0.75, exit)      (not × presence: gentle still goes all the way in)
 *   shadow   = the same (the chair's shadow, held by Memory VII, goes home with the way in)
 *   night    = the same (The Drive Home's night)
 *   street   = whole passes only once let go (no streetlight begins or finishes crossing)
 *   lean     = 0 once let go (the light comes to the visitor only after the whole of it)
 *   painting = base × emerge × s(0, 0.35, exit) × presence   (opacity, presence, light)
 */
export function compose(base: Values, env: Values, w: Weights, living = false): Values {
  const emerge = env1(env, 'emerge', 0);
  const dissolve = living ? 0 : env1(env, 'dissolve', 0);
  const exitRaw = env1(env, 'exit');
  const exit = living ? smoothstep(0, 0.35, exitRaw) : exitRaw;
  // The dissolve acts through the light's reveal (below), not as a fade of the whole picture.
  const gate = clamp(emerge * exit * w.presence);
  const out: Values = {};
  for (const k in base) {
    const v = base[k];
    const prop = k.slice(k.lastIndexOf('.') + 1);
    const obj = k.slice(0, k.lastIndexOf('.'));
    switch (prop) {
      case 'opacity':
      case 'presence':
        out[k] = clamp(v * gate);
        break;
      case 'intensity':
      case 'roomSpill':
        out[k] = Math.max(0, v * emerge * exit * w.presence);
        break;
      case 'parallax':
        out[k] = v * w.parallax;
        break;
      case 'immerse':
      case 'approach':
        out[k] = clamp(v * smoothstep(0.25, 0.75, exitRaw));
        break;
      case 'shadow':
      case 'night':
        // (The room's own shadow or night, held by a memory: let go early, it goes home with the way in.)
        out[k] = clamp(v * smoothstep(0.25, 0.75, exitRaw));
        break;
      case 'street':
        // (Streetlights crossing the wall: let go early, none crosses any more.)
        out[k] = exitRaw < 0.999 ? Math.floor(v) : v;
        break;
      case 'lean':
        // (The light comes to the visitor only at the end of the whole of it, never after a let go.)
        out[k] = exitRaw < 0.999 ? 0 : v;
        break;
      case 'people':
        out[k] = clamp(v * smoothstep(0.55, 1, exitRaw));
        break;
      case 'shot':
        // Which shot (0 the wide painting, 1 the two of them close): held keys, never between; let
        // go early, it cuts straight back to the wide (the way out is the wide's).
        out[k] = exitRaw < 0.999 ? 0 : Math.round(v);
        break;
      case 'skew':
        // A hanging thing's sway (the curtain): it is motion, so none under reduced motion.
        out[k] = (v + env1(env, `sway:${obj.replace(/^layer:/, '')}.skew`, 0)) * w.motion;
        break;
      case 'x':
      case 'y':
      case 'rot':
        // A layer's procedural offset (e.g. env `sway:curtain.x`), scaled by motion.
        out[k] = v + env1(env, `sway:${obj.replace(/^layer:/, '')}.${prop}`, 0) * w.motion;
        break;
      default:
        out[k] = v;
    }
  }
  // The window's reveal is authored (the mask's growth); the dissolve takes it back.
  // The arrival in reverse: the colour goes with the light, leaving the drawing alone a moment.
  if ('window.reveal' in base) out['window.reveal'] = clamp(base['window.reveal'] * (1 - clamp(dissolve / 0.7)));
  if ('window.sketch' in base) out['window.sketch'] = clamp(base['window.sketch'] * (1 - clamp((dissolve - 0.65) / 0.35)));
  return out;
}
