/**
 * Detail from real material scans (CC0, Poly Haven; `public/textures/scan`, made by
 * `scripts/scan-detail.py`). The room's colour, warmth and marks stay its own: a scan gives only
 * what a code-painted canvas can't hold, the fine structure of plaster, concrete and wood.
 *
 * Loaded once before the room is baked. If a file fails to load (offline, blocked), that surface
 * is simply baked as before.
 */

/** A scan's high-passed luminance as z-scores (mean 0, sd 1), tiling. */
export interface Detail {
  w: number;
  h: number;
  /** The scan's real width (m). */
  metres: number;
  z: Float32Array;
}
/** A tiling tangent-space normal map (OpenGL convention), RGBA bytes. */
export interface NormalTile {
  w: number;
  h: number;
  metres: number;
  rgba: Uint8ClampedArray;
}

const BASE = './textures/scan/';
const SIZES = { plaster: 1.0, concrete: 3.0, 'wood-grain': 0.6, 'wood-seat': 0.55 } as const;
type Name = keyof typeof SIZES;

const details: Partial<Record<Name | 'concrete-rough', Detail>> = {};
const normals: Partial<Record<Name, NormalTile>> = {};
/** Once the room is baked, anything still arriving is dropped (and what was used is released). */
let closed = false;

async function pixels(url: string): Promise<ImageData | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  } catch {
    return null;
  }
}

/** Load the scans. Never throws. */
export async function loadScans(): Promise<void> {
  const jobs: Promise<void>[] = [];
  const detail = (key: Name | 'concrete-rough', file: string, metres: number) =>
    jobs.push(
      pixels(BASE + file).then((d) => {
        if (!d || closed) return;
        const z = new Float32Array(d.width * d.height);
        for (let i = 0; i < z.length; i++) z[i] = (d.data[i * 4] - 128) / 40;
        details[key] = { w: d.width, h: d.height, metres, z };
      }),
    );
  for (const n of Object.keys(SIZES) as Name[]) detail(n, `${n}-detail.jpg`, SIZES[n]);
  detail('concrete-rough', 'concrete-rough.jpg', SIZES.concrete);
  // Only the chair's wood takes a normal map (the room's fine relief goes into its bump bake); at
  // the chair's size on screen 512 px holds all of it.
  for (const n of ['wood-grain', 'wood-seat'] as const)
    jobs.push(
      pixels(BASE + `${n}-normal.jpg`).then((d) => {
        if (d && !closed) normals[n] = { w: d.width, h: d.height, metres: SIZES[n], rgba: d.data };
      }),
    );
  await Promise.all(jobs);
}

/** The room and the chair are baked: let the decoded scans go, and drop any still arriving. */
export function releaseScans(): void {
  closed = true;
  for (const k of Object.keys(details) as (keyof typeof details)[]) delete details[k];
  for (const k of Object.keys(normals) as (keyof typeof normals)[]) delete normals[k];
}

export function scanDetail(name: Name | 'concrete-rough'): Detail | null {
  return details[name] ?? null;
}
export function scanNormal(name: 'wood-grain' | 'wood-seat'): NormalTile | null {
  return normals[name] ?? null;
}

/** The detail at a point given in metres (it tiles), bilinear. */
export function sampleDetail(d: Detail, xm: number, ym: number): number {
  const fx = ((((xm / d.metres) * d.w) % d.w) + d.w) % d.w;
  const fy = ((((ym / d.metres) * d.h) % d.h) + d.h) % d.h;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = (x0 + 1) % d.w, y1 = (y0 + 1) % d.h;
  const tx = fx - x0, ty = fy - y0;
  const a = d.z[y0 * d.w + x0], b = d.z[y0 * d.w + x1], c = d.z[y1 * d.w + x0], e = d.z[y1 * d.w + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
}
