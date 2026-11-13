import * as THREE from 'three';
import type { LayerKind } from '../world/MemoryWindow';
import type { FigureArt, Eye } from './living/WoodlandScene';
import type { LivingSpec } from './living/woodland';
import { fetchBlob } from './fetched';

/** A memory's art manifest (public/memories/<art>/manifest.json), and the loaders that read it. */

export interface Pane {
  x: number;
  y: number;
  w: number;
  h: number;
  transom: number;
  mullion: number;
}

export interface ArtManifest {
  size: [number, number];
  band?: number | null;
  pane?: Pane | null;
  register?: { x: number; y: number; h: number } | null;
  variants: Record<string, { name: string; kind: LayerKind; file: string; source: string }[]>;
  /** A living memory: the part of the painting the wall shows first (painting uv), and its plate's pixels. */
  crop?: [number, number, number, number];
  plate?: [number, number];
  living?: Record<string, LivingManifest | FilmManifest | null>;
}

/**
 * A film as a living memory (FilmScene): `<film><@low>.webm` (VP9) and `.mp4` (H.264), silent (its
 * sound is a cue), the frames it holds, and the order its wall's fibres and colour come in.
 */
export interface FilmManifest {
  kind: 'film';
  film: string;
  fps: number;
  frames: number;
  order?: string | null;
  immerse: boolean;
  /**
   * Its edge when carried out of the wall: torn (felt, "Almost": the default), soft (a sheet
   * rubbed) or shade (Memory VII: no raggedness at all, a wide fall, as a shadow's edge).
   */
  edge?: 'torn' | 'soft' | 'shade';
  /** Its soft edge on the wall (m), if wider than the usual brush (Memory VII's shade: 0.5). */
  feather?: number;
}

export const isFilm = (m: LivingManifest | FilmManifest | null | undefined): m is FilmManifest => !!m && (m as FilmManifest).kind === 'film';
/** How long the film's bytes may take to come (ms; most are fetched ahead, when its line is armed). */
export const FILM_FETCH_MS = 8000;

export interface LivingManifest {
  plate: string;
  maps: string;
  grade: string | null;
  /** The same composition later, nobody there (the cut). */
  after?: string | null;
  sky: { file: string; box: [number, number, number, number] } | null;
  /** The people (and her head turned to him at their size: scripts/two-shot.py, with the two-shot). */
  figures: (Omit<FigureArt, 'texture' | 'lids'> & { file: string; lids: string; heads?: { file: string; box: [number, number, number, number]; at: number[]; cells: number; grid: [number, number, number, number] } }) | null;
  /** The near flowers' heads and where they are (painting uv). */
  flowers?: { file: string; heads: [number, number, number][] } | null;
  /** The sky in the gap, drifting: where it shows, the afternoon's and the evening's layers (one size). */
  clouds?: { mask: string; file: string; after: string; box: [number, number, number, number]; pad: number } | null;
  /** When each pencil line is drawn and the colour comes (scripts/stroke-order.py), one size. */
  order?: string | null;
  /**
   * The two-shot (scripts/two-shot.py): the two of them close, the character sheet's own panel (an
   * atlas: the body, her forearm, as far across as `reach`), their lids (over `lidBox`), her turn
   * (cells: scripts/her-turn.py), the ground round them, out of focus, and their eyes (opening,
   * iris, white: `Eye`).
   */
  near?: {
    file: string;
    lids: string;
    pixels: [number, number];
    gutter: number;
    reach: number;
    lidBox: [number, number, number, number];
    heads: { file: string; box: [number, number, number, number]; takes: string[]; at: number[]; cells: number; grid: [number, number, number, number] };
    ground: { file: string; box: [number, number, number, number] };
    /** Where their bed's grass moves in the air (a map, R; one size). */
    maps: string;
    eyes: { a: Eye[]; b: Eye[] };
  } | null;
  immerse: boolean;
}

/**
 * `living`: drawn about 1:1 into a living scene's target (no mipmaps); `data`: numbers, not
 * colour (decoded straight, never premultiplied: a map's alpha is a channel of its own).
 */
export async function loadLayer(url: string, o: { living?: boolean; data?: boolean } = {}): Promise<{ texture: THREE.Texture; bitmap: ImageBitmap }> {
  const blob = await fetchBlob(url);
  // ImageBitmaps ignore the texture's flipY and premultiply flags: ask for both when decoding.
  // Premultiplied, so transparent edges never filter to a dark fringe.
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: o.data ? 'none' : 'premultiply', colorSpaceConversion: 'none' });
  const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace; // composited in sRGB in the shader, as painted
  if (o.living) {
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    // The tiling noise samples at its edges; the painting's own maps clamp.
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  } else {
    texture.anisotropy = 4; // walls are seen obliquely
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
  }
  texture.needsUpdate = true;
  return { texture, bitmap };
}

/**
 * When the colour reaches each part of the painting (its order map's g, 0..1), read once and
 * coarsely: for the room's writing under it (src/app/livingMemory.ts). Painting uv, y up.
 */
export function colourTimes(bitmap: ImageBitmap): ((u: number, v: number) => number) | null {
  const w = 96, h = 54;
  try {
    // (An offscreen canvas where there is one with a 2D context, else a page canvas.)
    const off = typeof OffscreenCanvas !== 'undefined' ? (new OffscreenCanvas(w, h).getContext('2d') as OffscreenCanvasRenderingContext2D | null) : null;
    const x = off ?? Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
    if (!x) {
      console.warn('living memory: no 2D canvas to read its order map; the writing under it stays');
      return null;
    }
    x.drawImage(bitmap, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = d[i * 4 + 1] / 255;
    // (Decoded upside down, as the textures are: its first row is the painting's foot.)
    const at = (k: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(k * n)));
    return (u, v) => g[at(v, h) * w + at(u, w)];
  } catch (e) {
    console.warn('living memory: its order map could not be read; the writing under it stays', e);
    return null;
  }
}

export async function manifestOf(base: string, art: string): Promise<ArtManifest> {
  return JSON.parse(await (await fetchBlob(`${base}${art}/manifest.json`)).text()) as ArtManifest;
}

/**
 * Whether the screen can show the two-shot (the spec's aspects, framed by band: narrower than 1.3
 * no frame holds his face, wider than 2.45 none holds hers and the hands, and upright a 16:9 one
 * would hold one face): elsewhere its shot is the wide, and its art isn't loaded (about 24 MB on a
 * desktop).
 */
export function framesNear(host: { screen?: { width: number; height: number } }, spec: LivingSpec): boolean {
  if (!host.screen || !spec.near) return true;
  const a = host.screen.width / host.screen.height;
  return a >= spec.near.aspect[0] && a <= spec.near.aspect[1];
}

/** A living scene's files (maps, grade and sky have one size only); the two-shot's only for a screen that shows it. */
export function livingFiles(lm: LivingManifest, suffix: string, noNear = false): { file: string; suffix: string }[] {
  const out = [{ file: lm.plate, suffix }, { file: lm.maps, suffix: '' }];
  if (lm.grade) out.push({ file: lm.grade, suffix: '' });
  if (lm.after) out.push({ file: lm.after, suffix });
  if (lm.sky) out.push({ file: lm.sky.file, suffix: '' });
  if (lm.figures) out.push({ file: lm.figures.file, suffix }, { file: lm.figures.lids, suffix });
  if (lm.flowers) out.push({ file: lm.flowers.file, suffix });
  if (lm.clouds) out.push({ file: lm.clouds.mask, suffix: '' }, { file: lm.clouds.file, suffix: '' }, { file: lm.clouds.after, suffix: '' });
  if (lm.order) out.push({ file: lm.order, suffix: '' });
  if (lm.figures?.heads) out.push({ file: lm.figures.heads.file, suffix });
  if (lm.near && lm.figures?.heads && !noNear) out.push({ file: lm.near.file, suffix }, { file: lm.near.lids, suffix }, { file: lm.near.heads.file, suffix }, { file: lm.near.ground.file, suffix: '' }, { file: lm.near.maps, suffix: '' });
  return out;
}
