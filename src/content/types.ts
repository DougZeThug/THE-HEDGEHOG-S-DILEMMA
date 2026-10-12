export const DIMENSIONS = [
  'isolation',
  'connection',
  'fear',
  'happiness',
  'grief',
  'shame',
  'nostalgia',
  'affection',
  'anger',
  'uncertainty',
  'forgiveness',
  'desire',
  'relief',
  'self',
  'misunderstanding',
  'contradiction',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type DimVector = Partial<Record<Dimension, number>>;

export type Surface = 'north' | 'east' | 'south' | 'west' | 'floor' | 'ceiling';
export type Hand = 'pencil' | 'pen' | 'marker' | 'typed' | 'child' | 'faint' | 'crayon' | 'cyan' | 'visitor';
export type Size = 'xs' | 's' | 'm' | 'l' | 'xl';
export type Kind = 'word' | 'fragment' | 'question' | 'statement' | 'passage';

/**
 * When a phrase may surface.
 *  arrival        written on the walls from the first moment
 *  familiar       may surface once the visitor has settled in
 *  contradiction  may surface once the room starts contradicting itself
 *  transform      only late, once the room has been shaped by the visit
 *  still          only surfaces while the visitor is completely still; dissolves on movement
 *  near           tiny writing, written from the start, only legible up close
 *  annotation     never placed on its own; only appears written beside another phrase
 */
export type Tier = 'arrival' | 'familiar' | 'contradiction' | 'transform' | 'still' | 'near' | 'annotation';

export type VoiceStyle = 'whisper' | 'tender' | 'flat' | 'distant' | 'child';

export interface Phrase {
  id: string;
  text: string;
  kind: Kind;
  dims: DimVector;
  surface: Surface;
  tier: Tier;
  hand: Hand;
  size: Size;
  /** Authored anchor: u (0..1 across the surface, left→right as seen from inside), v (height in metres, or depth fraction on floor/ceiling). */
  at?: [number, number];
  /** Can be voiced, and in which manner by default. */
  voice?: VoiceStyle;
  /** Fades when looked at directly; legible only in peripheral vision. */
  shy?: boolean;
  echoes?: string[];
  contradicts?: string[];
  keywords?: string[];
}

export const PHASES = ['arrival', 'familiar', 'contradiction', 'transform'] as const;
export type Phase = (typeof PHASES)[number];
