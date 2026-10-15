import type { BreathProfile, Gust } from './performance';

/**
 * Five More Minutes (docs/reviews/2026-10-woodland.md): the two people's involuntary life, which
 * is not authored on the timeline but follows from time (their breathing, their blinks, the
 * air). What they do on purpose (a hand, a head) is on the timeline, in Theatre.
 *
 * Seconds are the memory's own (its sequence position while it lives).
 */
export interface LivingSpec {
  breath: { a: BreathProfile; b: BreathProfile };
  /** How much a full breath swells a chest along its short axis (a fraction): about 2 px at the frame's scale. */
  swell: number;
  blinks: { a: number[]; b: number[] };
  gusts: Gust[];
  /** B's hand drawn back from where the sheet draws it (radians at the elbow; `figure:b.hand` 0). */
  handBack: number;
  /** How far A's hand comes toward hers at `figure:a.hand` 1 (sheet pixels, along his forearm). */
  handReach: number;
  /** B's settling back into the grass at `figure:b.settle` 1 (sheet pixels; radians). */
  settle: { move: [number, number]; turn: number };
  /** Her shoulder's small lift at `figure:b.shoulder` 1 (sheet pixels). */
  shoulder: [number, number];
  /** The painting u (and v) kept at the screen's centre when it covers the view. */
  cover: { wide: [number, number]; upright: [number, number]; ultra: [number, number] };
}

export const WOODLAND: LivingSpec = {
  breath: {
    // He breathes slower and deeper; his breath is missed when their hands touch (20 s).
    a: { period: 4.7, jitter: 0.14, inhale: 0.38, rest: 0.16, depth: 0.18, seed: 11, held: [{ at: 20.0, span: 1.6 }] },
    b: { period: 3.9, jitter: 0.18, inhale: 0.42, rest: 0.1, depth: 0.22, seed: 23 },
  },
  swell: 0.035,
  // Two for him, one for her, by hand, never on the beats (and none near the cut: it falls on stillness).
  blinks: { a: [12.2, 23.0], b: [25.6] },
  // One gust, heard first (its sound leads by 0.4 s), crossing left to right.
  gusts: [{ at: 13.0, cross: 1.8, strength: 1 }],
  handBack: 0.075,
  handReach: 7,
  settle: { move: [1.5, -3], turn: -0.008 },
  shoulder: [0, 3],
  cover: { wide: [0.5, 0.5], upright: [0.37, 0.5], ultra: [0.5, 0.5] },
};
