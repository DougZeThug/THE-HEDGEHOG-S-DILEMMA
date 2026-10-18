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
  // The room's writing under the painting held washed (with the pencil: src/world/living/wash.ts).
  wash: [0, 0, 1],
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
  x: [0, -0.3, 0.3],
  y: [0, -0.3, 0.3],
  // How far a hanging layer's foot swings (its top stays on its rod), metres.
  skew: [0, -0.06, 0.06],
  depth: [0, 0, 0.06],
};

/**
 * A living memory's scene (src/memory/living/, docs/reviews/2026-10-woodland.md):
 *   life     0 still as a painting, 1 alive (the grass, the breathing)
 *   approach the way in as one move, 0..1 (key it straight: it is shaped in Inside.ts): until
 *            they are taken in only their body drifts toward the wall, their look their own
 *   immerse  0 on the wall, 1 entered: the painting spreads over the plaster, the visitor is
 *            carried to it, and it becomes all there is
 *   breeze   the air: 1 the afternoon's, 0 still
 *   dusk     0 afternoon, 1 the evening's colour and sky
 *   colour   the people: 1 painted, 0 a drawing
 *   people   the people: 1 there, 0 gone
 *   after    0 the afternoon, 1 the same place later, its own painting (a cut: held keys, never
 *            in between: below one half it is the afternoon)
 *   shot     0 the wide painting, 1 the two of them close (scripts/two-shot.py): held keys, so
 *            every change is a cut
 */
export const SCENE: Schema[string] = {
  life: [1, 0, 1],
  immerse: [0, 0, 1],
  breeze: [1, 0, 1],
  dusk: [0, 0, 1],
  colour: [1, 0, 1],
  people: [1, 0, 1],
  after: [0, 0, 1],
  shot: [0, 0, 1],
  approach: [0, 0, 1],
};

/**
 * A person in a living memory. What they do on purpose (their involuntary life, breathing and
 * blinking, follows from time: src/memory/living/performance.ts):
 *   head      radians at the neck (a few degrees at most: a flat drawing can't turn far)
 *   look      the face turning (−1 toward the left of the picture .. 1 toward the right): the
 *             features slide within the head, the far side narrows (a turn, not a rotation)
 *   eyes      where the eyes look (−1 left .. 1 right; they lead the head by a drawing)
 *   hand      A: 0 resting, 1 moved toward hers; B: 0 drawn back, 1 where the sheet draws it
 *   fingers   A: his fingers flexing in the grass; B: her fingers lifting off her stomach (0..1)
 *   foot      B: her crossed foot rocking (0 still .. 1 rocking as she does)
 *   shoulder  B: her shoulder easing (0..1)
 *   settle    B: settling back into the grass (0..1)
 *   breath    how deep they breathe (1 as they do)
 *   cel       B: her head as the panel has it (0), or as the artist redrew it, turned to him (1:
 *             scripts/two-shot.py), in either shot: held keys, every change a cut
 */
export const FIGURE: Schema[string] = {
  head: [0, -0.06, 0.06],
  look: [0, -1, 1],
  eyes: [0, -1, 1],
  hand: [0, 0, 1],
  fingers: [0, 0, 1],
  foot: [0, 0, 1],
  shoulder: [0, 0, 1],
  settle: [0, 0, 1],
  breath: [1, 0, 1.5],
  cel: [0, 0, 1],
};

/** A memory's objects, given its layers' names (back to front), and the scene if it lives. */
export function memorySchema(layers: string[], living = false): Schema {
  const s: Schema = { window: WINDOW, light: LIGHT };
  for (const l of layers) s[`layer:${l}`] = LAYER;
  if (living) {
    s.scene = SCENE;
    s['figure:a'] = FIGURE;
    s['figure:b'] = FIGURE;
  }
  return s;
}
