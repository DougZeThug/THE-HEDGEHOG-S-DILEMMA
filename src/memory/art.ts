import * as THREE from 'three';
import type { LayerKind } from '../core/memoryLayers';
import type { FigureArt, Eye } from './living/woodlandArt';
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

/** A film's file (the browser's type, `filmType()`), at the quality's suffix. */
export const filmUrl = (base: string, art: string, lm: FilmManifest, suffix: string, type: string): string => `${base}${art}/${lm.film}${suffix}.${type}`;

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

/** A file of a memory's art: its name, and the quality suffix it has (maps, grade and sky have one size only: ''). */
export interface ArtFile {
  file: string;
  suffix: string;
}

/** A webp of a memory's art. */
export const artUrl = (base: string, art: string, f: ArtFile): string => `${base}${art}/${f.file}${f.suffix}.webp`;

/**
 * A living scene's files, by what they are, at `suffix` (the two-shot's only if the art has a
 * wide with faces to turn): the one place that says which have a phone size. `livingFiles` lists
 * them for fetching ahead; the scene loads each by name.
 */
export function livingParts(lm: LivingManifest, suffix: string) {
  const at = (file: string, sfx = suffix): ArtFile => ({ file, suffix: sfx });
  const n = lm.near;
  return {
    plate: at(lm.plate),
    maps: at(lm.maps, ''),
    grade: lm.grade ? at(lm.grade, '') : null,
    after: lm.after ? at(lm.after) : null,
    sky: lm.sky ? at(lm.sky.file, '') : null,
    figures: lm.figures ? at(lm.figures.file) : null,
    lids: lm.figures ? at(lm.figures.lids) : null,
    flowers: lm.flowers ? at(lm.flowers.file) : null,
    cloudsMask: lm.clouds ? at(lm.clouds.mask, '') : null,
    clouds: lm.clouds ? at(lm.clouds.file, '') : null,
    cloudsAfter: lm.clouds ? at(lm.clouds.after, '') : null,
    order: lm.order ? at(lm.order, '') : null,
    heads: lm.figures?.heads ? at(lm.figures.heads.file) : null,
    near: n && lm.figures?.heads ? { atlas: at(n.file), lids: at(n.lids), heads: at(n.heads.file), ground: at(n.ground.file, ''), maps: at(n.maps, '') } : null,
  };
}

/** A living scene's files, to fetch ahead; the two-shot's only for a screen that shows it. */
export function livingFiles(lm: LivingManifest, suffix: string, noNear = false): ArtFile[] {
  const p = livingParts(lm, suffix);
  const near = p.near && !noNear ? [p.near.atlas, p.near.lids, p.near.heads, p.near.ground, p.near.maps] : [];
  return [p.plate, p.maps, p.grade, p.after, p.sky, p.figures, p.lids, p.flowers, p.cloudsMask, p.clouds, p.cloudsAfter, p.order, p.heads, ...near].filter((f): f is ArtFile => !!f);
}
