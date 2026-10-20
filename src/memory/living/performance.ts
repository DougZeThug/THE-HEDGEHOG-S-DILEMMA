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
  /**
   * Spans in which no breath takes its longer pause (a chest still for 2 s while one of them looks
   * at the other reads as a held breath): a breath whose pause would fall in one breathes on.
   */
  steady?: [number, number][];
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
    const pause = p.period * 0.35;
    if (hash01(i + 101, p.seed) < 0.18 && !(p.steady ?? []).some(([a, b]) => start + core < b && start + core + pause > a)) len += pause;
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

/**
 * The air as a force, at painting `x` (0 left .. 1 right): the steady breeze (a few slow sines at
 * incommensurate rates, travelling left to right) plus the gusts, each arriving at `x` as its front
 * crosses. Signed: positive bends things to the right (the gusts come from the left).
 */
export interface Breeze {
  /** Hz, relative strength, phase (radians), and how far it travels across the frame per second (frames). */
  waves: { f: number; a: number; p: number }[];
  /** The breeze's lean (its mean force: things lean a little right, as the painting's grass does). */
  lean: number;
}

export const BREEZE: Breeze = {
  waves: [
    { f: 0.11, a: 0.45, p: 0.7 },
    { f: 0.23, a: 0.35, p: 2.1 },
    { f: 0.41, a: 0.2, p: 4.4 },
    // (The flutter: what makes it air and not a tide.)
    { f: 0.73, a: 0.16, p: 1.3 },
  ],
  lean: 0.15,
};

/** The canopy as a spring (Hz, damping): slower than the grass, as big trees sway. What is heard
 *  of a gust follows it (`gustSway`). */
export const CANOPY = [0.45, 0.6] as const;

/** A gust's envelope (in crossings, as `gust`'s), in straight pieces. */
const KNOTS: [number, number][] = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1]
  .map((u): [number, number] => [0.25 * u, ease(u)])
  .concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i): [number, number] => [0.25 + 1.35 * (i / 10), 1 - ease(i / 10)]));

/** Seconds a gust's front takes from the left edge to `x`. */
const arrive = (g: Gust, x: number) => g.at + x * g.cross;

/** The air's force at `t`, at `x`, scaled by `still` (0..1: the breeze can die down). */
export function windForce(t: number, x: number, gusts: readonly Gust[], still = 1, b: Breeze = BREEZE): number {
  let f = b.lean;
  for (const w of b.waves) f += w.a * Math.sin(2 * Math.PI * w.f * (t - x * 2.2) + w.p);
  f *= still;
  for (const g of gusts) f += gust(t - x * g.cross, [g]).strength * 1.6;
  return f;
}

/**
 * How something on a spring answers that air (a stem, a lock of hair, a shirt's hem): natural
 * frequency `hz`, damping ratio `zeta` (0.2 springy .. 0.9 heavy), at `x`. Closed form (each of the
 * breeze's sines answered with its own gain and lag, each gust as a few steps up and down answered
 * by the spring's step response), so it is the same at `t` however `t` was reached: seekable, like
 * everything else here. Returns the deflection in units of the force (1 = bent as far as a steady
 * force of 1 would hold it).
 */
export function windResponse(t: number, x: number, hz: number, zeta: number, gusts: readonly Gust[], still = 1, b: Breeze = BREEZE): number {
  const wn = 2 * Math.PI * hz;
  let y = b.lean * still;
  for (const w of b.waves) {
    const r = w.f / hz;
    const gain = 1 / Math.hypot(1 - r * r, 2 * zeta * r);
    const lag = Math.atan2(2 * zeta * r, 1 - r * r);
    y += still * w.a * gain * Math.sin(2 * Math.PI * w.f * (t - x * 2.2) + w.p - lag);
  }
  const wd = wn * Math.sqrt(Math.max(1e-4, 1 - zeta * zeta));
  // The spring's answer to a unit ramp of force begun τ ago (exact).
  const ramp = (tau: number) =>
    tau <= 0 ? 0 : tau - (2 * zeta) / wn + Math.exp(-zeta * wn * tau) * (((2 * zeta) / wn) * Math.cos(wd * tau) + ((2 * zeta * zeta - 1) / wd) * Math.sin(wd * tau));
  for (const g of gusts) {
    const tau = t - arrive(g, x);
    if (tau <= 0 || tau > g.cross * 1.6 + 10 / (zeta * wn)) continue;
    // The gust's force (`gust`'s envelope) as straight pieces through its curve; the answer to
    // each change of slope is a ramp's.
    const s = g.strength * 1.6;
    let prev = 0;
    for (let i = 0; i < KNOTS.length - 1; i++) {
      const [u0, f0] = KNOTS[i], [u1, f1] = KNOTS[i + 1];
      const slope = (s * (f1 - f0)) / ((u1 - u0) * g.cross);
      y += (slope - prev) * ramp(tau - u0 * g.cross);
      prev = slope;
    }
    y -= prev * ramp(tau - 1.6 * g.cross);
  }
  return y;
}

/** How far a full gust (strength 1, a second to cross) bends the canopy at its most. */
const SWAY_PEAK = (() => {
  let m = 0;
  for (let t = 0; t < 8; t += 0.01) m = Math.max(m, windResponse(t, 0, CANOPY[0], CANOPY[1], [{ at: 0, cross: 1, strength: 1 }], 0));
  return m;
})();

/**
 * The gusts as the leaves over painting `x` answer them (the canopy's spring): how far the gusts
 * alone bend them, as a share of how far a full gust does at its most; and where the front of the
 * one bending them most is across the frame (0 left .. 1 right). What is heard of a gust follows
 * this (src/memory/synthWoods.ts), so the sound swells and settles with what is seen to move
 * (the skeptic's second review, 2026-10-17).
 */
export function gustSway(t: number, x: number, gusts: readonly Gust[]): { strength: number; front: number } {
  let best = { strength: 0, front: -1 };
  for (const g of gusts) {
    // (`still` 0: the gust's part of the answer alone, without the breeze's.)
    const s = Math.max(0, windResponse(t, x, CANOPY[0], CANOPY[1], [g], 0)) / SWAY_PEAK;
    if (s > best.strength) best = { strength: s, front: (t - g.at) / g.cross };
  }
  return best;
}

/**
 * Where the air has carried something light by `t` (a mote, a seed), in frames of drift: the
 * integral of the breeze (closed form) plus each gust's push. Horizontal only; the caller adds its
 * own fall and wander.
 */
export function windDrift(t: number, x: number, gusts: readonly Gust[], b: Breeze = BREEZE): number {
  let d = b.lean * t;
  for (const w of b.waves) {
    const om = 2 * Math.PI * w.f;
    d += (w.a / om) * (Math.cos(w.p - om * x * 2.2) - Math.cos(om * (t - x * 2.2) + w.p));
  }
  for (const g of gusts) {
    const tau = t - arrive(g, x);
    if (tau <= 0) continue;
    // The area under its envelope so far (in crossings): up over a quarter, down over 1.35.
    const u = tau / g.cross;
    const area = (span: number, v: number) => (span * (v - Math.sin(Math.PI * v) / Math.PI)) / 2; // ∫ ease over v of span
    const up = 0.25, down = 1.35;
    const a = u < up ? area(up, u / up) : area(up, 1) + (u < up + down ? down * Math.min(1, (u - up) / down) - area(down, Math.min(1, (u - up) / down)) : down - area(down, 1));
    d += g.strength * 1.6 * g.cross * a;
  }
  return d;
}

/**
 * How closed the eyes are, drawn as an animator draws a blink on twos: open, half, shut, half,
 * open. Returns 0, 0.5 or 1 (the half lid and the shut lid are their own drawings).
 */
export function blinkDrawing(t: number, times: readonly number[]): 0 | 0.5 | 1 {
  for (const b of times) {
    const x = t - b;
    if (x < 0 || x >= 0.25) continue;
    // Each drawing held two frames (1/12 s): half, shut, half.
    return x < 1 / 12 ? 0.5 : x < 2 / 12 ? 1 : 0.5;
  }
  return 0;
}
