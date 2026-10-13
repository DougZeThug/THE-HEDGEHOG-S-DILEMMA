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

export type Shape = 'two-cups' | 'sun' | 'noughts' | 'cat' | 'sheet-doodle' | 'chair' | 'door' | 'eye';

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
  /** Rubbed: a fraction of the marks gone (0–1). */
  rubbed?: number;
}

export const DRAWINGS: readonly DrawingDef[] = [
  // A child's sun, at a child's reach, beside the pencil ticks of someone's height ("J").
  // Rubbed half away since: someone tried to clean the wall, and stopped.
  { id: 'sun-height', shape: 'sun', style: 'child', hand: 'child', strength: 0.8, surface: 'east', size: [0.13, 0.13], at: [0.66, 0.92], when: 'start', rubbed: 0.45 },
  // Doodles that once ran on to whatever hung here, and now stop at a pale rectangle.
  { id: 'sheet-doodle', shape: 'sheet-doodle', style: 'doodle', hand: 'pencil', strength: 0.65, surface: 'east', size: [0.2, 0.12], at: [3.33, 2.38], when: 'start' },
  // A game of noughts and crosses nobody finished.
  { id: 'noughts', shape: 'noughts', style: 'doodle', hand: 'pencil', strength: 0.7, surface: 'west', size: [0.15, 0.15], at: [3.7, 0.74], when: 'start' },
  // Someone drew round the chair once, at its own size, low on the wall. Almost all rubbed out.
  { id: 'ghost-chair', shape: 'chair', style: 'ghost', hand: 'faint', strength: 0.55, surface: 'west', size: [0.42, 0.82], at: [0.62, 0.515], when: 'start', rubbed: 0.5 },
  // An eye in the margin, small, half gone.
  { id: 'ghost-eye', shape: 'eye', style: 'ghost', hand: 'child', strength: 0.5, surface: 'west', size: [0.09, 0.05], at: [1.55, 0.38], when: 'start', rubbed: 0.35 },
  // A cat, very low: found by someone kneeling, or not at all.
  { id: 'cat', shape: 'cat', style: 'doodle', hand: 'pencil', strength: 0.7, surface: 'south', size: [0.14, 0.12], at: [1.35, 0.3], when: 'start' },
  // A door, slightly open, drawn twice over.
  { id: 'ghost-door', shape: 'door', style: 'ghost', hand: 'faint', strength: 0.6, surface: 'south', size: [0.17, 0.3], at: [0.82, 1.12], when: 'start', rubbed: 0.3 },
  // The only one drawn while the visitor watches: two cups, and the second never finished.
  { id: 'cups', shape: 'two-cups', style: 'firm', hand: 'pencil', strength: 0.8, surface: 'east', size: [0.22, 0.12], beside: 'two-cups', when: { seen: 'two-cups', gaze: 3 } },
];

export const DRAWING_BY_ID = new Map(DRAWINGS.map((d) => [d.id, d]));
export const STATIC_DRAWINGS = DRAWINGS.filter((d) => d.when === 'start');
