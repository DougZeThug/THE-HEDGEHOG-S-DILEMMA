/**
 * The people's involuntary life, as pure functions of the memory's own time (docs/memories.md):
 * breathing, blinking, the breeze. Seekable: the same `t` gives the same pose, forward or back,
 * so scrubbing in Studio, pausing, or a hidden tab never desynchronise anything. No tickers, no
 * state, no randomness at run time: irregularity is a deterministic hash of the breath's index.
 *
 * What a person deliberately does (a hand moving, a head inclining) is authored on the timeline
 * (Theatre), not here.
 */

/** A small integer hash to [0, 1). */
export function hash01(n: number, seed: number): number {
  let h = (Math.imul(n | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface BreathProfile {
  /** Mean seconds per breath (a resting adult lying down: 4–5 s). */
  period: number;
  /** ± fraction each breath's length varies. */
  jitter: number;
  /** Fraction of a breath spent breathing in (in is shorter than out). */
  inhale: number;
  /** Fraction spent still at the bottom, before the next. */
  rest: number;
  /** How deep, 0–1, each breath varies around 1 by ± this. */
  depth: number;
  seed: number;
  /**
   * Moments the breath is held off: the breath that would begin within `[at, at + span)` waits
   * `span` seconds longer at the bottom (a missed breath, not a sigh).
   */
  held?: { at: number; span: number }[];
}

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

/**
 * How full the chest is at `t` (0 = rested out, ~1 = a full breath in). Breaths are laid end to
 * end from t = 0, each its own length and depth.
 */
export function breath(t: number, p: BreathProfile): number {
  if (t <= 0) return 0;
  let start = -p.period * hash01(0, p.seed); // already partway through a breath when it begins
  for (let i = 0; i < 100000; i++) {
    const core = p.period * (1 + p.jitter * (2 * hash01(i + 1, p.seed) - 1));
    let len = core;
    // Every so often a longer pause at the bottom (people don't breathe like metronomes).
    if (hash01(i + 101, p.seed) < 0.18) len += p.period * 0.35;
    for (const h of p.held ?? []) if (start + len > h.at && start <= h.at + h.span) len += h.span;
    if (t < start + len) {
      const depth = 1 + p.depth * (2 * hash01(i + 211, p.seed) - 1);
      const x = t - start;
      const tin = core * p.inhale;
      const tout = core * (1 - p.inhale - p.rest);
      if (x < tin) return depth * ease(x / tin);
      if (x < tin + tout) return depth * (1 - ease((x - tin) / tout));
      return 0;
    }
    start += len;
  }
  return 0;
}

/**
 * How closed the eyes are (0 open, 1 shut) at `t`, for blinks authored at `times` (seconds).
 * A blink: ~55 ms down, ~40 ms shut, ~110 ms up (the upswing is the slower one).
 */
export function blink(t: number, times: readonly number[]): number {
  let v = 0;
  for (const b of times) {
    const x = t - b;
    if (x < 0 || x > 0.205) continue;
    const c = x < 0.055 ? ease(x / 0.055) : x < 0.095 ? 1 : 1 - ease((x - 0.095) / 0.11);
    v = Math.max(v, c);
  }
  return v;
}

export interface Gust {
  /** When its front enters the frame on the left (s). */
  at: number;
  /** Seconds to cross the frame. */
  cross: number;
  /** Strength, relative to the still air's 1. */
  strength: number;
}

/**
 * The breeze, read by the painting's shader (and timed with the gust's sound): a steady light
 * air plus authored gusts that cross the clearing left to right. Returns the gust's strength and
 * where its front is (0..1 across the frame; < 0 before, > 1 after).
 */
export function gust(t: number, gusts: readonly Gust[]): { strength: number; front: number } {
  let best = { strength: 0, front: -1 };
  for (const g of gusts) {
    const x = (t - g.at) / g.cross;
    if (x < -0.3 || x > 1.6) continue;
    // Up quickly, down slowly: the air arrives, then the grass settles.
    const env = x < 0 ? 0 : x < 0.25 ? ease(x / 0.25) : 1 - ease((x - 0.25) / 1.35);
    if (env * g.strength > best.strength) best = { strength: env * g.strength, front: x };
  }
  return best;
}
