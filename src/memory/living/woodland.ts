import { TURN_STEPS, TWO_SHOT } from '../defs';
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
  /**
   * The two-shot (scripts/two-shot.py): its frame (stage px: x0, y0 and width; the height is the
   * painting's proportion), locked, by the screen's aspect (width over height: each frame for
   * screens up to `upTo`, and held through a resize as long as it still holds both faces and the
   * hands, `holds`), and the aspects it comes on for at all (outside them, the wide); their
   * eyes' look at `figure:a.eyes` and `figure:b.eyes` 1 (fractions of each opening's radii, along
   * it toward the picture's right, and across it, down); how far their breath goes close (of the
   * wide's); when it is on (memory s: from, to) and when they do something in it (memory s: after
   * giving way it never comes back within half a second of one). The times are the timeline's own
   * (defs.ts TWO_SHOT).
   */
  near?: {
    frames: { upTo: number; frame: [number, number, number]; holds: [number, number] }[];
    aspect: [number, number];
    gaze: [number, number];
    gazeB: [number, number];
    breath: number;
    span: [number, number];
    beats: number[];
  };
}

/**
 * Blinks, by hand (docs/reviews/2026-10-woodland.md): never in a shot's first second, never in the
 * stillness before the cut, never during either look (a blink then reads as a reaction).
 */
const BLINKS = {
  // (The first wide is 10.5–15 s, the second 27–34.5: his in the first, after the gust, settled a
  // second before the cut; his again in the two-shot, before her look (the creative director's
  // beat sheet: "both look up; he blinks once"). His in the two-shot stays: without it his face
  // would move only on cue (the skeptic's review of the evaluations, 2026-10-18). None of hers:
  // from her look to the cut her head is a drawing of her turned to him, and her lids are drawn
  // for the panel's eyes; and in that hold anything on her face becomes a beat ("no need for
  // another gesture": the artist; the skeptic, 2026-10-19).)
  a: [13.4, TWO_SHOT.hisBlink],
  b: [],
};

/** The two-shot's looks, from half a second before her eyes go to him to the cut out. */
const STEADY: [number, number] = [TWO_SHOT.herEyes - 0.5, TWO_SHOT.to];

export const WOODLAND: LivingSpec = {
  breath: {
    // He breathes slower and deeper. Nothing in their breathing answers either look (a held breath
    // would be the most noticeable thing in the shot: the creative director's review, 2026-10-18):
    // from just before her eyes go to him to the cut out, neither takes a long pause (his fell
    // exactly in her look, 18.8–21.3 s, a still chest while she looked at him: the cinematic
    // director's evaluation of the film; tested). Both at rest between breaths at the cut, 34.5 s:
    // the breath each would take just before it waits (his for 0.9 s, hers 2.4 s; tested).
    a: { period: 4.7, jitter: 0.14, inhale: 0.38, rest: 0.16, depth: 0.18, seed: 11, held: [{ at: 33.2, span: 0.9 }], steady: [STEADY] },
    b: { period: 3.9, jitter: 0.18, inhale: 0.42, rest: 0.1, depth: 0.22, seed: 23, held: [{ at: 31.0, span: 2.4 }], steady: [STEADY] },
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
  // (Upright, between his face and her hand: at 0.37 her outer hand came within 5% of a 9:19.5
  // screen's edge: the interaction designer's review, 2026-10-18.)
  cover: { wide: [0.5, 0.5], upright: [0.385, 0.5], ultra: [0.5, 0.5] },
  // Their heads and torsos and their hands between them, locked: both faces and all three hands,
  // the hands well above the frame's foot (the cinematic director's, the interaction designer's
  // and the skeptic's reviews, 2026-10-18). One frame can't hold them on every screen: a narrower
  // one sees less of the width (at 4:3 the 16:9 frame touched his ear, at 1.2 it cut a quarter of
  // his face), a wider one less of the height (at 2.0 it cut her hair, at 2.6 her face and the
  // hands): so a looser frame either side, and outside 1.3–2.45 the wide, as upright screens have
  // (the cinematic director's evaluation of the film, checked through `coverQuad`; tested). His
  // look reaches the corner of each eye (a sidelong look, not a 4-px one); hers leads her head's
  // turn toward him. Their breath close at a little under half the wide's (the rig was made for
  // ~0.5×: the technical artist's review).
  near: {
    // (`holds`: where each still keeps 8 stage px round both faces and the three hands; held past
    // that, the 16:9 frame cut her hair at 2.05 and both their heads at 2.5: QA, 2026-10-18.)
    // (A maximised browser window on most desktop screens is about 2:1: its own frame, their faces
    // about the film's size; with the loosest they were 11% smaller, and faces jumped 20% at each
    // band's edge: the cinematic director's evaluation of the film, 2026-10-18.)
    frames: [
      { upTo: 1.5, frame: [0, -60, 940], holds: [1.26, 2.37] },
      { upTo: 1.9, frame: [50, -10, 790], holds: [1.38, 1.91] },
      { upTo: 2.15, frame: [30, -50, 880], holds: [1.34, 2.16] },
      { upTo: 2.45, frame: [0, -80, 1000], holds: [1.3, 2.5] },
    ],
    aspect: [1.3, 2.45],
    gaze: [0.5, 0.08],
    gazeB: [-0.45, 0.1],
    breath: 0.45,
    span: [TWO_SHOT.from, TWO_SHOT.to],
    // (His blink too: a return never cuts in on a half-shut lid. Her turn whole, its start, its
    // middle and its end, under a second apart: a return never cuts into it, not even at the one
    // instant exactly half a second from both ends.)
    beats: [TWO_SHOT.hisBlink, TWO_SHOT.herEyes, TWO_SHOT.herTurn, TWO_SHOT.herTurn + TURN_STEPS.length / 24, TWO_SHOT.herTurn + TURN_STEPS.length / 12, TWO_SHOT.hisEyes, TWO_SHOT.hisRoll],
  },
};
