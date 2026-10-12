import type { DimVector, Dimension, Phrase, Surface } from './types';

/**
 * Each wall has a dominant character — not a category. North holds the dilemma itself,
 * east the ordinary warm past, west being misread, south very little. Writing that does
 * not belong to a wall's character is how the walls contaminate each other.
 */
export const WALL_CHARACTER: Record<'north' | 'east' | 'west' | 'south', DimVector> = {
  north: { desire: 1, fear: 0.9, affection: 0.7, contradiction: 0.8, isolation: 0.5 },
  east: { happiness: 1, nostalgia: 1, affection: 0.6, relief: 0.4, connection: 0.5 },
  west: { shame: 1, anger: 0.9, misunderstanding: 1, uncertainty: 0.6, forgiveness: 0.4 },
  south: { isolation: 0.8, relief: 0.7, self: 0.6 },
};

/** How much a phrase belongs to a wall's character, 0..1. */
export function belonging(p: Phrase, wall: keyof typeof WALL_CHARACTER): number {
  const c = WALL_CHARACTER[wall];
  let dot = 0, pw = 0, cw = 0;
  for (const [k, v] of Object.entries(p.dims) as [Dimension, number][]) {
    dot += v * (c[k] ?? 0);
    pw += v * v;
  }
  for (const v of Object.values(c)) cw += (v ?? 0) * (v ?? 0);
  return pw && cw ? dot / Math.sqrt(pw * cw) : 0;
}

export const CHARACTER_WALLS = ['north', 'east', 'west', 'south'] as const satisfies readonly Surface[];
