import * as THREE from 'three';
import { Rng } from '../core/rng';
import { canvas } from './canvas';
import { makeNoise } from './noise';
import { QUALITY, type Quality } from './quality';
import { sampleDetail, type Detail } from './scans';

/** What every surface bake shares: the texel scale, plaster, soft corners, fine specks and scuffs. */

/** Every size in the bakers is authored at this density and scaled by `k`. */
const AUTHORED_PX_PER_M = 200;

/**
 * The texel density a surface is baked at: `ppm` pixels to the metre, `k` its scale on the authored
 * sizes. A lower density paints the same room, only softer, and a quarter of the pixels at load.
 */
export interface Texels {
  ppm: number;
  k: number;
}

export function texelsFor(quality: Quality): Texels {
  const ppm = QUALITY[quality].texelsPerM;
  return { ppm, k: ppm / AUTHORED_PX_PER_M };
}

/**
 * How strongly each surface takes its scan (colour: relative per sd; bump: bake levels per sd),
 * set by measuring band-pass contrast against the artist's reference at matched pixel density.
 */
export const SCAN_AMP = {
  wall: { colour: 0.025, bump: 10 },
  // The side walls, lit raking from the panel, show their plaster most in the reference.
  sideWall: { colour: 0.035, bump: 12 },
  floor: { colour: 0.03, bump: 8 },
  ceiling: { colour: 0.026, bump: 8 },
};

export interface SurfaceMaps {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  rough?: THREE.CanvasTexture;
}

export function toTex(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Hand-trowelled plaster: broad mottling, faint directional passes, fine tooth. Writes colour and
 * bump. With a scan (scans.ts), its fine structure is folded in: the colour multiplied by
 * 1 + colour·z, the relief raised by bump·z (z the scan's high-passed luminance, in sd).
 */
export function plaster(t: Texels, W: number, H: number, seed: number, tone: [number, number, number], scale: { mottle: number; trowel: number; grain: number; blotch?: number; tooth?: number }, scan?: { detail: Detail | null; colour: number; bump: number }) {
  const [c, g] = canvas(W, H, true);
  const [bc, bg] = canvas(W, H, true);
  const img = g.createImageData(W, H);
  const bimg = bg.createImageData(W, H);
  const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2), n4 = makeNoise(seed + 4);
  const blotch = scale.blotch ?? 0;
  const r = new Rng(seed + 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const m = n1.fbm(x / (260 * t.k), y / (260 * t.k), 4) - 0.5; // broad, soft
      const tr = n2.fbm(x / (140 * t.k), y / (34 * t.k), 3) - 0.5; // trowel passes, mostly horizontal
      const warm = n3.fbm(x / (500 * t.k), y / (500 * t.k), 2) - 0.5;
      const fine = r.next() - 0.5;
      // Cloudy patches a hand's breadth to an arm's across, and here and there a darker cloud:
      // plaster that has been patched, painted over and lived beside, never quite even.
      let cloud = 0;
      if (blotch) {
        // Broad and gentle (dark clouds at the scale of a stain read as damp), and a mid-scale
        // tooth of a few centimetres: what makes plaster read as plaster from across a room.
        const b = n4.fbm(x / (110 * t.k), y / (110 * t.k), 4) - 0.5;
        const tooth = n4.fbm(x / (12 * t.k) + 41, y / (12 * t.k) + 7, 2) - 0.5;
        cloud = b * blotch + tooth * (scale.tooth ?? 5);
      }
      const d = m * scale.mottle + tr * scale.trowel + fine * scale.grain + cloud;
      // On low quality (half the texels) only half of it: finer than the bake can hold, the scan
      // would turn to noise competing with the writing.
      const sz = scan?.detail ? t.k * sampleDetail(scan.detail, x / t.ppm, y / t.ppm) : 0;
      const sc = 1 + (scan?.colour ?? 0) * sz;
      const i = (y * W + x) * 4;
      img.data[i] = (tone[0] + d + warm * 3) * sc;
      img.data[i + 1] = (tone[1] + d + warm * 1.2) * sc;
      img.data[i + 2] = (tone[2] + d - warm * 2) * sc;
      img.data[i + 3] = 255;
      const b = 128 + tr * 70 + m * 30 + fine * 26 + (scan?.bump ?? 0) * sz;
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = b;
      bimg.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  bg.putImageData(bimg, 0, 0);
  return { c, g, bc, bg };
}

/** Soft occlusion where planes meet, baked in. */
export function corners(t: Texels, g: CanvasRenderingContext2D, W: number, H: number, edges: { top?: number; bottom?: number; left?: number; right?: number }, rgb = '108,104,98') {
  const band = (x0: number, y0: number, x1: number, y1: number, a: number) => {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, `rgba(${rgb},${a})`);
    grd.addColorStop(0.35, `rgba(${rgb},${a * 0.35})`);
    grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  };
  if (edges.bottom) band(0, H, 0, H - edges.bottom * t.ppm, 0.2);
  if (edges.top) band(0, 0, 0, edges.top * t.ppm, edges.top < 0.2 ? 0.1 : 0.16);
  if (edges.left) band(0, 0, edges.left * t.ppm, 0, 0.2);
  if (edges.right) band(W, 0, W - edges.right * t.ppm, 0, 0.2);
}


/**
 * What makes a surface read as a surface up close: specks and pits (per m²), and hairline
 * scratches, a few centimetres long; dark (and some light, `light` of them) in colour, and
 * pressed into the relief.
 */
export function fineDetail(t: Texels, g: CanvasRenderingContext2D, bg: CanvasRenderingContext2D, W: number, H: number, r: Rng, o: { specks: number; pits: number; scratches: number; light?: number }) {
  const area = (W / t.ppm) * (H / t.ppm);
  for (let i = 0, n = Math.round(o.specks * area); i < n; i++) {
    const x = r.range(0, W), y = r.range(0, H), rad = r.range(0.5, 1.4) * t.k;
    const lightSpeck = r.chance(o.light ?? 0.15);
    g.fillStyle = lightSpeck ? `rgba(255,252,246,${r.range(0.06, 0.14)})` : `rgba(78,74,68,${r.range(0.04, 0.11)})`;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0, n = Math.round(o.pits * area); i < n; i++) {
    const x = r.range(0, W), y = r.range(0, H), rad = r.range(0.8, 2) * t.k;
    g.fillStyle = `rgba(96,92,86,${r.range(0.04, 0.09)})`;
    bg.fillStyle = `rgba(60,60,60,${r.range(0.25, 0.45)})`;
    for (const c of [g, bg]) {
      c.beginPath();
      c.arc(x, y, rad, 0, Math.PI * 2);
      c.fill();
    }
  }
  g.lineCap = bg.lineCap = 'round';
  for (let i = 0, n = Math.round(o.scratches * area); i < n; i++) {
    const x = r.range(0, W), y = r.range(0, H), len = r.range(1, 6) * t.ppm * 0.01, a = r.range(0, Math.PI);
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    g.strokeStyle = `rgba(86,82,76,${r.range(0.05, 0.12)})`;
    g.lineWidth = 0.6 * t.k;
    bg.strokeStyle = 'rgba(70,70,70,0.5)';
    bg.lineWidth = 0.6 * t.k;
    for (const c of [g, bg]) {
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo((x + x1) / 2 + r.range(-2, 2) * t.k, (y + y1) / 2 + r.range(-2, 2) * t.k, x1, y1);
      c.stroke();
    }
  }
}

/** Scuffs along the skirting: shoes, a chair back, a bag set down. */
export function baseScuffs(t: Texels, g: CanvasRenderingContext2D, W: number, H: number, r: Rng, n: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(80,78,74,${r.range(0.03, 0.08)})`;
    g.save();
    g.translate(r.range(0, W), H - r.range(18, 60) * t.k);
    g.rotate(r.range(-0.3, 0.3));
    g.fillRect(0, 0, r.range(6, 34) * t.k, r.range(1, 2.5) * t.k);
    g.restore();
  }
}
