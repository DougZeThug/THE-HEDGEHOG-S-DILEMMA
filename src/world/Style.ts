/**
 * The room's look, as one set of numbers between how it was ("original") and the artist's
 * reference ("reference"): a frame where the wall you read is the brightest vertical surface,
 * the corners and the ceiling fall away, a soft pool holds the chair, and the light is cream
 * rather than grey. (docs/reviews/2026-10-illustrated.md.)
 *
 * Everything here is a light level, a light colour or a grade value: the presets change
 * uniforms only, so moving between them never compiles a shader. What the reviews decided
 * should simply be better (the chair's wood, its contact with the floor, softer seams, the
 * room's marks) is not a preset: it is the room.
 *
 * Warmth lives in the light, never in the plaster or the grade: when the visitor comes close
 * the Director cools the light, and a warm wall or a warm grade would quietly undo that.
 */
import * as THREE from 'three';

export interface Look {
  /** Hemisphere fill (sky/ground bounce), as a multiple of the original. */
  fill: number;
  /** The frosted panel's soft area light (what lights the walls), multiple. */
  area: number;
  /** The shadow-casting key on the chair, multiple. */
  key: number;
  /** The key's cone, multiple. */
  cone: number;
  /** The warm glow at the chair, multiple. */
  glow: number;
  /** The light's own colour: 0 the original near-white, 1 cream. */
  warmth: number;
  /** The ceiling's stand-in bounce, multiple (its colour warms with `warmth`). */
  ceiling: number;
  /** Tone-mapping exposure. */
  exposure: number;
  /** Vignette (radial; the Director's darkness still deepens it). */
  vignette: number;
  /** Film grain (moving); the still one-step dither stays regardless. */
  grain: number;
  /** The plaster's relief (bump), multiple. */
  texture: number;
  /** The chair's contact with the floor: 0 none, 1 full. */
  contact: number;
  /** The chair's shadow: blur, multiple. */
  shadowSoft: number;
}

export const LOOKS = {
  original: { fill: 1, area: 1, key: 1, cone: 1, glow: 1, warmth: 0, ceiling: 1, exposure: 1.05, vignette: 0.32, grain: 0.032, texture: 1, contact: 0, shadowSoft: 1.8 },
  reference: { fill: 0.7, area: 3.2, key: 1.1, cone: 0.9, glow: 0.5, warmth: 1, ceiling: 0.9, exposure: 1.15, vignette: 0.15, grain: 0, texture: 1.15, contact: 1, shadowSoft: 1 },
} satisfies Record<string, Look>;

export type LookName = 'original' | 'subtle' | 'reference';
export const LOOK_NAMES: LookName[] = ['original', 'subtle', 'reference'];

/** A named look: subtle is halfway. */
export function lookFor(name: LookName): Look {
  const t = name === 'original' ? 0 : name === 'subtle' ? 0.5 : 1;
  const a = LOOKS.original, b = LOOKS.reference;
  const out = {} as Look;
  for (const k of Object.keys(a) as (keyof Look)[]) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export function parseLook(s: string | null): LookName {
  return s === 'original' || s === 'subtle' || s === 'reference' ? s : 'reference';
}

/** The light's colour at rest, from near-white to cream (the Director's warm and cool are its ends). */
const NEUTRAL_0 = new THREE.Color('#fff8ee');
const NEUTRAL_1 = new THREE.Color('#fff1de');
export const neutralFor = (warmth: number, out = new THREE.Color()) => out.copy(NEUTRAL_0).lerp(NEUTRAL_1, warmth);

/** The ceiling's stand-in bounce: cool grey before, a warm grey after. */
const CEIL_0 = new THREE.Color(0x23262a);
const CEIL_1 = new THREE.Color(0x26221e);
export const ceilingFor = (warmth: number, out = new THREE.Color()) => out.copy(CEIL_0).lerp(CEIL_1, warmth);

/** The panel's glass: white before, a warm cream after (still the brightest thing in the room). */
const PANEL_0 = new THREE.Color(0xffffff);
const PANEL_1 = new THREE.Color('#fff4e2');
export const panelFor = (warmth: number, out = new THREE.Color()) => out.copy(PANEL_0).lerp(PANEL_1, warmth);
