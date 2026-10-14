import type { Values } from './types';

/**
 * The one place authored and procedural values meet. Theatre.js writes the authored base (where a
 * layer is, how opaque, how warm the light); GSAP's behaviours write transient envelopes (the
 * emergence, the dissolve, a graceful exit, the curtain's breathing). Each field has one writer;
 * this function composes them deterministically into what is drawn and heard.
 *
 *   opacity   = base × emerge × exit × presence
 *   reveal    = base × (1 − dissolve)                     (the light recedes, taking the colour)
 *   sketch    = base × (1 − dissolve in its second half)  (the graphite is the last to sink)
 *   offsets   = base + envelope offset × motion           (motion 0 under reduced motion)
 *   parallax  = base × parallaxWeight                     (0.25 under reduced motion)
 *   light     = base × emerge × exit × presence
 *   residue   = base × residue envelope
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

/** Compose a frame. `base` keys are `object.prop`; envelope keys are named in behaviours.ts. */
export function compose(base: Values, env: Values, w: Weights): Values {
  const emerge = env1(env, 'emerge', 0);
  const dissolve = env1(env, 'dissolve', 0);
  const exit = env1(env, 'exit');
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
      case 'residue':
        out[k] = clamp01(v * env1(env, 'residue', 0));
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
  if ('window.reveal' in base) out['window.reveal'] = clamp01(base['window.reveal'] * (1 - dissolve));
  if ('window.sketch' in base) out['window.sketch'] = clamp01(base['window.sketch'] * (1 - clamp01(dissolve * 2 - 1)));
  return out;
}
