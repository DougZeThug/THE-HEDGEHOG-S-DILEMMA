import type * as THREE from 'three';

/** The woodland's drawn art, as the scene is handed it (src/memory/preparePainting.ts loads it). */

/** One of the puppet's deformers (figure uv, y up; src/memory/living/woodland.ts drives them). */
interface Deformer {
  name: string;
  c: [number, number];
  r: [number, number];
  angle: number;
  edge: number;
  pivot: [number, number];
  part: 'body' | 'limb';
}

export interface FigureArt {
  /** An atlas: the body, then her forearm (rows of `pixels`, `gutter` apart). */
  texture: THREE.Texture;
  /** An atlas: their lids shut, half, and her sleeve. */
  lids: THREE.Texture;
  /** Where they lie on the painting: x0, y0, w, h (painting uv, y up). */
  place: [number, number, number, number];
  pixels: [number, number];
  gutter: number;
  split: number;
  deformers: Deformer[];
  /** Her forearm's extent (figure uv: u0, v0, u1, v1) and the way back along it (a unit vector, sheet px). */
  limb: { box: [number, number, number, number]; axis: [number, number] };
}

/** Her turn (cells: its drawings, then the region they are laid in by), where its cells lie on the panel (sheet px, y down: x0, y0, w, h), each drawing's `figure:b.turn` (how far through her turn's drawings: 0 the panel's head .. 1 the last), how many cells, and how they are laid out (columns, rows; each cell's inset in its frame, a fraction of its pitch across and up). */
export interface HeadCels {
  texture: THREE.Texture;
  box: [number, number, number, number];
  at: number[];
  cells: number;
  grid: [number, number, number, number];
}

/**
 * Which of her heads to show for how far through her turn's drawings she is (`figure:b.turn`): 0 the
 * panel's own, i + 1 the drawing at `at[i]`; the nearest, a tie going to the one further on.
 */
export function headFor(turn: number, at: readonly number[]): number {
  let cel = 0, best = Math.abs(turn);
  at.forEach((a, i) => {
    const d = Math.abs(turn - a);
    if (d < best - 1e-9 || (d <= best + 1e-9 && a > (cel ? at[cel - 1] : 0))) {
      cel = i + 1;
      best = d;
    }
  });
  return cel;
}

/**
 * An eye (sheet px, y down): its opening (centre, radii, angle: positive turns its outer end down),
 * its iris (centre, radius), its white (rgb).
 */
export type Eye = [number, number, number, number, number, number, number, number, number, number, number];

/**
 * The two-shot (scripts/two-shot.py): the two of them close. The same puppet as the wide (the wide's
 * people are this panel at 0.8, its deformers in the panel's pixels), drawn from the panel at its
 * own size, over the ground round them, out of focus; her turn (scripts/her-turn.py), in either
 * shot.
 */
export interface NearArt {
  /** An atlas: the body, her forearm (rows of `pixels`, `gutter` apart), as far across the panel as `reach` (sheet px). */
  texture: THREE.Texture;
  /** Their lids shut, half, and her sleeve (rows), at this size, over `lidBox` (sheet px, y down: x0, y0, w, h). */
  lids: THREE.Texture;
  /** Her turn, at this size. */
  heads: HeadCels;
  /** The ground round them, out of focus. */
  ground: THREE.Texture;
  /** Where their bed's grass moves in the air (R, over the atlas's reach). */
  maps: THREE.Texture;
  pixels: [number, number];
  gutter: number;
  reach: number;
  lidBox: [number, number, number, number];
  /** Where the ground lies (stage px, y down: x0, y0, w, h). */
  groundBox: [number, number, number, number];
  /** Their eyes: his two, then hers. */
  eyes: Eye[];
}

export interface LivingArt {
  plate: THREE.Texture;
  /** The near flowers' heads (cut from the plate) and where they are (painting uv: x, y, radius as a fraction of the width). */
  flowers: { texture: THREE.Texture; heads: [number, number, number][] } | null;
  /** The sky in the canopy's gap, drifting: where it shows, the afternoon's and the evening's, their box and left margin. */
  clouds: { mask: THREE.Texture; day: THREE.Texture; after: THREE.Texture; box: [number, number, number, number]; pad: number } | null;
  maps: THREE.Texture;
  grade: THREE.Texture | null;
  /** The same composition later, nobody there (the cut, `scene.after`). */
  after: THREE.Texture | null;
  sky: { texture: THREE.Texture; box: [number, number, number, number] } | null;
  figures: FigureArt | null;
  /** Her head turned to him, at the wide's size (her look, in the wide), if it could be had. */
  heads?: HeadCels | null;
  /** The two-shot, if it could be had and her look in the wide too (else its shot is the wide). */
  near?: NearArt | null;
  /** The plate's pixels. */
  size: [number, number];
}
