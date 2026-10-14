import type { Schema } from './theatre';

/**
 * What the artist can author for a memory in Theatre Studio, and nothing else: every prop has a
 * defined meaning in the renderer (src/world/MemoryWindow.ts) or the room. Undefined knobs
 * become effects, so there are none.
 *
 * window  where the memory sits round its line, how far the light has revealed the graphite and
 *         the colour, how present it is, how much depth it shows, what stays after it.
 * light   the memory's own light: its pool (where it falls, how big, how soft), its colour
 *         temperature and strength, and how much of it spills into the room (the bleed).
 * layer:* each painted layer's strength, its small offset, and its depth in the plaster.
 */
export const WINDOW: Schema[string] = {
  // Its size relative to the line it forms round (1: about as wide as the words), and a nudge
  // from where it sits (its top just above the words), in metres.
  scale: [1, 0.5, 1.5],
  offsetX: [0, -0.6, 0.6],
  offsetY: [0, -0.6, 0.6],
  sketch: [0, 0, 1],
  reveal: [0, 0, 1],
  presence: [1, 0, 1],
  parallax: [1, 0, 1],
  residue: [0, 0, 1],
};

export const LIGHT: Schema[string] = {
  x: [0, -0.6, 0.6],
  y: [0, -0.5, 0.5],
  radius: [0.45, 0.05, 1.2],
  soft: [0.12, 0.01, 0.5],
  warmth: [3000, 1800, 9000],
  intensity: [0, 0, 2],
  roomSpill: [0, 0, 1],
};

export const LAYER: Schema[string] = {
  opacity: [1, 0, 1],
  x: [0, -0.1, 0.1],
  y: [0, -0.1, 0.1],
  depth: [0, 0, 0.06],
};

/** A memory's objects, given its layers' names (back to front). */
export function memorySchema(layers: string[]): Schema {
  const s: Schema = { window: WINDOW, light: LIGHT };
  for (const l of layers) s[`layer:${l}`] = LAYER;
  return s;
}
