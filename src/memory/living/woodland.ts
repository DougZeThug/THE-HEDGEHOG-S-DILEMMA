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
  /** When the painting is alive (s: the middle of `scene.life`'s rise; the sky drifts from then). */
  alive: number;
  /** What is in the air: how many motes (seen only in the sun). */
  air: { motes: number };
  /** The painting u (and v) kept at the screen's centre when it covers the view. */
  cover: { wide: [number, number]; upright: [number, number]; ultra: [number, number] };
}

/**
 * Blinks, by hand (docs/reviews/2026-10-woodland.md): in the wides only (the close-ups are their
 * own drawings), never in the stillness before the cut.
 */
const BLINKS = {
  // (The first wide is 10.5–15 s, the second 27–34.5: his in the first, after the gust, settled a
  // second before the cut to him; hers in the second, before its stillness. The first wide holds
  // a gust, a leaf and her foot already: QA, 2026-10-17.)
  a: [13.4],
  b: [31.6],
};

export const WOODLAND: LivingSpec = {
  breath: {
    // He breathes slower and deeper; a breath of his is missed while she looks at him (20 s).
    // (Both at rest between breaths at the cut, 34.5 s: his breath waits through the close-up of
    // their hands (24.6), hers as she settles in the second wide (27.3); tested.)
    a: { period: 4.7, jitter: 0.14, inhale: 0.38, rest: 0.16, depth: 0.18, seed: 11, held: [{ at: 20.0, span: 1.6 }, { at: 24.6, span: 2.7 }] },
    b: { period: 3.9, jitter: 0.18, inhale: 0.42, rest: 0.1, depth: 0.22, seed: 23, held: [{ at: 27.3, span: 2.8 }] },
  },
  chest: { a: { swell: 0.07, rise: 6 }, b: { swell: 0.09, rise: 6 } },
  headLift: 1.6,
  blinks: BLINKS,
  // One, as punctuation, quick across the clearing (heard as it is seen), in the first wide,
  // settled before the cut to him. None in the second wide: it is the longest and the stillest
  // shot, and the dusk cut's stillness is its own; none over the empty grass after the cut,
  // which it marked after the fact, pointing at the absence (the skeptic's third review, the
  // creative director's; the evening's breeze keeps the air alive). (Cinematic review,
  // 2026-10-17: gusts were seen 1–3 s after they were heard; it crosses in 0.8 s so that, the
  // canopy's slow sway and all, it has settled 0.8 s before the cut to him: QA.)
  gusts: [{ at: 11.5, cross: 0.8, strength: 1 }],
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
  // Motes only in the light (at most ~30 seen at once). (No seed: a bright star gliding across
  // the wood, a sparkle reads as magic; no falling leaf: a 5×10 px sprite sliding down the trunk:
  // the skeptic's second and third reviews, the cinematic director's, 2026-10-17 and 18.)
  air: { motes: 40 },
  alive: 6.25,
  settle: { move: [1.5, -3], turn: -0.008 },
  shoulder: [0, 3],
  cover: { wide: [0.5, 0.5], upright: [0.37, 0.5], ultra: [0.5, 0.5] },
};
