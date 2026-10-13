import type { Hand, Surface } from './types';

/**
 * Small drawings left on the walls: traces, not illustrations. Most were there before the
 * visitor; one is drawn while they look. None explains a line beside it. (The brief:
 * docs/brief-wall-drawings.md; the review that cut the first set from eleven to eight, most
 * of them captions: docs/reviews/2026-10-wall-drawings.md.)
 *
 * Positions are in metres on the wall, as the visitor sees it: `u` from the wall's left
 * edge, `v` up from the floor. North, the wall the visit opens on, is left alone.
 */
export type DrawingStyle =
  /** Faint graphite, a shaky line, a little smudged. */
  | 'doodle'
  /** A child's: awkward, pressed hard, then partly rubbed. */
  | 'child'
  /** Half-erased: soft, low, mostly gone. */
  | 'ghost'
  /** A more confident casual line. */
  | 'firm';

export type Shape = 'two-cups' | 'sun' | 'noughts' | 'pen-test' | 'sheet-doodle' | 'chair' | 'door' | 'eye';

export interface DrawingDef {
  id: string;
  shape: Shape;
  style: DrawingStyle;
  /** Whose ink: the hand's colour and its usual strength. */
  hand: Hand;
  /** How much of the hand's strength (0–1). */
  strength: number;
  surface: Exclude<Surface, 'floor' | 'ceiling'>;
  /** Width and height in metres. */
  size: [number, number];
  /** Centre, in metres; or beside a phrase, where the layout finds room. */
  at?: [number, number];
  beside?: string;
  /** There from the start, or drawn while a line is looked at for `gaze` seconds. */
  when: 'start' | { seen: string; gaze: number };
  /** Rubbed: a fraction of the marks gone (0–1), in patches. */
  rubbed?: number;
  /** Square to the wall (it lines up with something there: the skirting, a sheet's edge). */
  upright?: boolean;
  /** One stroke of an eraser across it, from and to (fractions of the box), its width a fraction of the box. */
  swipe?: { from: [number, number]; to: [number, number]; width: number };
}

export const DRAWINGS: readonly DrawingDef[] = [
  // A child's sun, at a child's reach, beside the pencil ticks of someone's height ("J").
  // Someone began to clean it off with one swipe toward the lowest tick, and stopped.
  { id: 'sun-height', shape: 'sun', style: 'child', hand: 'child', strength: 0.8, surface: 'east', size: [0.13, 0.13], at: [0.66, 0.92], when: 'start', swipe: { from: [1.05, 0.05], to: [-0.1, 0.95], width: 0.38 } },
  // Doodles that once ran on to a sheet of paper pinned here, cut dead along two of its edges
  // (the sheet's own pale rectangle is in the plaster, src/world/surfaces.ts: east, centre 3.6, 2.4).
  { id: 'sheet-doodle', shape: 'sheet-doodle', style: 'doodle', hand: 'pencil', strength: 0.65, surface: 'east', size: [0.3, 0.26], at: [3.42, 2.303], when: 'start', upright: true },
  // A game of noughts and crosses nobody finished.
  { id: 'noughts', shape: 'noughts', style: 'doodle', hand: 'pencil', strength: 0.7, surface: 'west', size: [0.15, 0.15], at: [3.7, 0.74], when: 'start' },
  // Someone drew round the chair once, side on, at its own size, when it stood against this
  // wall. Mostly rubbed out; just made out from where the chair stands now.
  { id: 'ghost-chair', shape: 'chair', style: 'ghost', hand: 'faint', strength: 0.7, surface: 'west', size: [0.42, 0.82], at: [0.62, 0.515], when: 'start', rubbed: 0.35, upright: true },
  // An eye in the margin, its iris rubbed away: nothing looking out of it.
  { id: 'ghost-eye', shape: 'eye', style: 'ghost', hand: 'child', strength: 0.65, surface: 'west', size: [0.09, 0.05], at: [1.55, 0.38], when: 'start', rubbed: 0.2 },
  // Someone getting a biro to work, low down: a spiral, a scribble.
  { id: 'pen-test', shape: 'pen-test', style: 'firm', hand: 'pen', strength: 0.55, surface: 'south', size: [0.12, 0.06], at: [4.6, 0.36], when: 'start' },
  // A door, slightly open, drawn twice over.
  { id: 'ghost-door', shape: 'door', style: 'ghost', hand: 'faint', strength: 0.6, surface: 'south', size: [0.17, 0.3], at: [0.82, 1.12], when: 'start', rubbed: 0.3 },
  // The only one drawn while the visitor watches: two cups, and the second never finished.
  { id: 'cups', shape: 'two-cups', style: 'firm', hand: 'pencil', strength: 0.8, surface: 'east', size: [0.22, 0.12], beside: 'two-cups', when: { seen: 'two-cups', gaze: 3 } },
];

export const DRAWING_BY_ID = new Map(DRAWINGS.map((d) => [d.id, d]));
export const STATIC_DRAWINGS = DRAWINGS.filter((d) => d.when === 'start');
