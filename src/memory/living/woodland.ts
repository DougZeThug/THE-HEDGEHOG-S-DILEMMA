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
  /** A full breath: the chest's swell along its short axis (a fraction) and its rise (sheet px; ~0.5 screen px each). */
  chest: { a: { swell: number; rise: number }; b: { swell: number; rise: number } };
  /** How far a full breath lifts the head (sheet px). */
  headLift: number;
  /** Blinks (seconds), drawn on twos: half, shut, half. */
  blinks: { a: number[]; b: number[] };
  gusts: Gust[];
  /** Her forearm drawn back at `figure:b.hand` 0: slid along itself (sheet px), turned (radians). */
  reach: { slide: number; turn: number };
  /** His forearm's direction (unit, sheet px, y up) and how far his hand comes along it at `figure:a.hand` 1. */
  forearmA: [number, number];
  handReach: number;
  /** His hand's twitch at the wrist at `figure:a.fingers` 1 (radians). */
  twitch: number;
  /** Her resting hand lifting off her stomach at `figure:b.fingers` 1 (sheet px). */
  palm: [number, number];
  /** Her crossed foot rocking at `figure:b.foot` 1: how often (Hz), how far (radians at the ankle). */
  foot: { hz: number; turn: number };
  /** A full look (`figure:*.look` ±1): the head's roll at the neck (radians), the features' slide (sheet px). */
  roll: number;
  face: number;
  /** The irises' travel at `figure:*.eyes` ±1 (sheet px). */
  iris: number;
  /** The hair's loose ends: how far (sheet px, x and y, per unit of wind) and their spring. */
  hair: Record<string, { amp: [number, number]; hz: number; zeta: number }>;
  /** B's settling back into the grass at `figure:b.settle` 1 (sheet pixels; radians). */
  settle: { move: [number, number]; turn: number };
  /** Her shoulder's small lift at `figure:b.shoulder` 1 (sheet pixels). */
  shoulder: [number, number];
  /** What is in the air: how many motes, when each seed starts across, when each leaf falls (s). */
  air: { motes: number; seeds: number[]; leaves: number[] };
  /** The painting u (and v) kept at the screen's centre when it covers the view. */
  cover: { wide: [number, number]; upright: [number, number]; ultra: [number, number] };
}

/** Blinks, by hand (docs/reviews/2026-10-woodland.md): none across the reach, none near the cut. */
const BLINKS = {
  a: [9.8, 11.6, 13.0, 14.5, 23.2, 27.4, 27.72, 29.0],
  b: [10.4, 13.4, 21.9, 25.6, 28.4],
};

export const WOODLAND: LivingSpec = {
  breath: {
    // He breathes slower and deeper; his breath is missed when their hands touch (20 s).
    a: { period: 4.7, jitter: 0.14, inhale: 0.38, rest: 0.16, depth: 0.18, seed: 11, held: [{ at: 20.0, span: 1.6 }] },
    b: { period: 3.9, jitter: 0.18, inhale: 0.42, rest: 0.1, depth: 0.22, seed: 23 },
  },
  chest: { a: { swell: 0.07, rise: 6 }, b: { swell: 0.09, rise: 6 } },
  headLift: 1.6,
  blinks: BLINKS,
  // Three, as punctuation (heard 0.4 s before they're seen): one in the afternoon's play, one
  // after the touch, one over the empty grass where they lay.
  gusts: [
    { at: 13.0, cross: 1.6, strength: 1 },
    { at: 26.8, cross: 1.6, strength: 0.7 },
    { at: 33.4, cross: 2.2, strength: 0.5 },
  ],
  reach: { slide: 18, turn: 0.05 },
  forearmA: [0.881, -0.473],
  handReach: 9,
  twitch: 0.07,
  palm: [-1, 2.5],
  foot: { hz: 0.8, turn: 0.07 },
  roll: 0.12,
  face: 3,
  iris: 3,
  hair: {
    hairA1: { amp: [3, 0.8], hz: 1.3, zeta: 0.35 },
    hairA2: { amp: [2.2, 1], hz: 1.0, zeta: 0.4 },
    hairA3: { amp: [2.5, 0.6], hz: 1.5, zeta: 0.35 },
    hairB1: { amp: [2.4, 0.6], hz: 0.9, zeta: 0.45 },
    hairB2: { amp: [2, 0.5], hz: 1.1, zeta: 0.45 },
    hairB3: { amp: [2.6, 0.8], hz: 1.6, zeta: 0.3 },
  },
  // Motes only in the light (at most ~30 seen at once); two seeds; one leaf in each afternoon gust.
  air: { motes: 40, seeds: [11.3, 26.0], leaves: [12.9, 27.2] },
  settle: { move: [1.5, -3], turn: -0.008 },
  shoulder: [0, 3],
  cover: { wide: [0.5, 0.5], upright: [0.37, 0.5], ultra: [0.5, 0.5] },
};
