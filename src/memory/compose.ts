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
  /** Overall presence: 1, or 0.6 under gentle intensity. */
  presence: number;
  /** Procedural motion (sway, drift, breathing): 1, or 0 under reduced motion. */
  motion: number;
  /** Parallax strength: 1, or 0.25 under reduced motion. */
  parallax: number;
}

export const FULL: Weights = { presence: 1, motion: 1, parallax: 1 };

export function weightsFor(reducedMotion: boolean, gentle: boolean): Weights {
  return { presence: gentle ? 0.6 : 1, motion: reducedMotion ? 0 : 1, parallax: reducedMotion ? 0.25 : 1 };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const env1 = (env: Values, k: string, d = 1) => (k in env ? env[k] : d);

const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/**
 * Compose a frame. `base` keys are `object.prop`; envelope keys are named in behaviours.ts.
 *
 * A living memory (`living`, docs/reviews/2026-10-woodland.md) authors its own withdrawal (the
 * way out, then the colour and the graphite), so the dissolve doesn't take its reveal. Let go
 * early, it leaves in order as the exit envelope falls: the people first, then the way in in
 * reverse, and the wall's painting last, so the room lands back on it:
 *
 *   people   = base × s(0.55, 1, exit)
 *   immerse  = base × s(0.25, 0.75, exit)      (not × presence: gentle still goes all the way in)
 *   painting = base × emerge × s(0, 0.35, exit) × presence   (opacity, presence, light)
 */
export function compose(base: Values, env: Values, w: Weights, living = false): Values {
  const emerge = env1(env, 'emerge', 0);
  const dissolve = living ? 0 : env1(env, 'dissolve', 0);
  const exitRaw = env1(env, 'exit');
  const exit = living ? smooth(0, 0.35, exitRaw) : exitRaw;
  // The dissolve acts through the light's reveal (below), not as a fade of the whole picture.
  const gate = clamp01(emerge * exit * w.presence);
  const out: Values = {};
  for (const k in base) {
    const v = base[k];
    const prop = k.slice(k.lastIndexOf('.') + 1);
    const obj = k.slice(0, k.lastIndexOf('.'));
    switch (prop) {
      case 'opacity':
      case 'presence':
        out[k] = clamp01(v * gate);
        break;
      case 'intensity':
      case 'roomSpill':
        out[k] = Math.max(0, v * emerge * exit * w.presence);
        break;
      case 'parallax':
        out[k] = v * w.parallax;
        break;
      case 'immerse':
        out[k] = clamp01(v * smooth(0.25, 0.75, exitRaw));
        break;
      case 'people':
        out[k] = clamp01(v * smooth(0.55, 1, exitRaw));
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
  if ('window.reveal' in base) out['window.reveal'] = clamp01(base['window.reveal'] * (1 - clamp01(dissolve / 0.7)));
  if ('window.sketch' in base) out['window.sketch'] = clamp01(base['window.sketch'] * (1 - clamp01((dissolve - 0.65) / 0.35)));
  return out;
}
