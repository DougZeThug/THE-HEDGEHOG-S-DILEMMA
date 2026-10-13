import * as THREE from 'three';
import { Rng } from '../core/rng';
import { makeNoise } from './noise';
import type { Surface } from '../content/types';

/**
 * The room's surfaces, painted once at load. Everything here is meant to be nearly
 * invisible: plaster that was trowelled by hand, a floor that has been walked on, a
 * ceiling slightly cooler than the walls, and the traces of what was here before —
 * writing rubbed out, tape that held something up, a pale patch where something hung,
 * pencil ticks of someone's height, days counted.
 */

// Texel density. Every size below is authored at 200 px/m and scaled by K, so a lower
// density paints the same room, only softer — and a quarter of the pixels to bake at load.
let PX_PER_M = 200;
/**
 * How legible the room's history is. Its marks were drawn so faint (alpha 0.02–0.12) that no
 * render showed them; the review (2026-10-illustrated) asked for them to be found from a metre
 * or two on a phone, the erased "I'm sorry" still a ghost.
 */
const MARKS = 1.6;
let K = 1;
const DENSITY = { low: 100, medium: 200, high: 200 } as const;

/** Set before painting: low-quality devices bake their surfaces at half the resolution. */
export function surfaceDetail(quality: keyof typeof DENSITY): void {
  PX_PER_M = DENSITY[quality];
  K = PX_PER_M / 200;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

export interface SurfaceMaps {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  rough?: THREE.CanvasTexture;
}

function toTex(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Hand-trowelled plaster: broad mottling, faint directional passes, fine tooth. Writes colour and bump. */
function plaster(W: number, H: number, seed: number, tone: [number, number, number], scale: { mottle: number; trowel: number; grain: number }) {
  const [c, g] = canvas(W, H);
  const [bc, bg] = canvas(W, H);
  const img = g.createImageData(W, H);
  const bimg = bg.createImageData(W, H);
  const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2);
  const r = new Rng(seed + 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const m = n1.fbm(x / (260 * K), y / (260 * K), 4) - 0.5; // broad, soft
      const tr = n2.fbm(x / (140 * K), y / (34 * K), 3) - 0.5; // trowel passes, mostly horizontal
      const warm = n3.fbm(x / (500 * K), y / (500 * K), 2) - 0.5;
      const fine = r.next() - 0.5;
      const d = m * scale.mottle + tr * scale.trowel + fine * scale.grain;
      const i = (y * W + x) * 4;
      img.data[i] = tone[0] + d + warm * 3;
      img.data[i + 1] = tone[1] + d + warm * 1.2;
      img.data[i + 2] = tone[2] + d - warm * 2;
      img.data[i + 3] = 255;
      const b = 128 + tr * 70 + m * 30 + fine * 26;
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = b;
      bimg.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  bg.putImageData(bimg, 0, 0);
  return { c, g, bc, bg };
}

/** Soft occlusion where planes meet, baked in. */
function corners(g: CanvasRenderingContext2D, W: number, H: number, edges: { top?: number; bottom?: number; left?: number; right?: number }, rgb = '108,104,98') {
  const band = (x0: number, y0: number, x1: number, y1: number, a: number) => {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, `rgba(${rgb},${a})`);
    grd.addColorStop(0.35, `rgba(${rgb},${a * 0.35})`);
    grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  };
  if (edges.bottom) band(0, H, 0, H - edges.bottom * PX_PER_M, 0.2);
  if (edges.top) band(0, 0, 0, edges.top * PX_PER_M, 0.16);
  if (edges.left) band(0, 0, edges.left * PX_PER_M, 0, 0.13);
  if (edges.right) band(W, 0, W - edges.right * PX_PER_M, 0, 0.13);
}

/** Graphite that was written and rubbed out: a grey ghost, smeared, with eraser passes through it. */
function erasedWriting(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, r: Rng, strength = 1, font = 'Reenie Beanie') {
  const px = size * K;
  const [tc, tg] = canvas(Math.ceil(px * text.length * 0.6 + px), Math.ceil(px * 1.6));
  tg.font = `400 ${px}px "${font}", cursive`;
  tg.fillStyle = 'rgb(62,62,68)';
  tg.textBaseline = 'middle';
  tg.fillText(text, px * 0.3, tc.height / 2);
  g.save();
  g.translate(x, y);
  g.rotate(r.range(-0.04, 0.04));
  g.filter = `blur(${1.4 * K}px)`;
  g.globalAlpha = 0.05 * strength * MARKS;
  g.drawImage(tc, 0, 0);
  g.globalAlpha = 0.025 * strength * MARKS;
  g.drawImage(tc, r.range(2, 6) * K, r.range(-1, 1.5) * K); // smear in the direction of rubbing
  g.filter = `blur(${6 * K}px)`;
  g.globalAlpha = 0.018 * strength * MARKS;
  g.fillStyle = 'rgb(128,128,134)';
  for (let k = 0; k < 3; k++) g.fillRect(r.range(-6 * K, tc.width * 0.5), tc.height * r.range(0.3, 0.5), tc.width * r.range(0.3, 0.6), tc.height * 0.22);
  g.restore();
  g.filter = 'none';
  g.globalAlpha = 1;
}

/** Four small residues of masking tape around a paler rectangle: something hung here, for a long time. */
function removedSheet(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, r: Rng) {
  g.save();
  g.translate(cx, cy);
  g.rotate(r.range(-0.02, 0.02));
  // Cleaner than the wall round it: the paper kept the grime off.
  g.fillStyle = 'rgba(255,255,252,0.09)';
  g.fillRect(-w / 2, -h / 2, w, h);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    if (r.chance(0.15)) continue; // one corner was never taped
    g.save();
    g.translate((sx * w) / 2, (sy * h) / 2);
    g.rotate(sx * sy * r.range(0.5, 0.9));
    g.fillStyle = `rgba(196,176,128,${r.range(0.07, 0.12) * MARKS})`;
    g.fillRect(-13 * K, -4.5 * K, 26 * K, 9 * K);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(-13 * K, -4.5 * K, 26 * K, 2 * K);
    g.restore();
  }
  g.restore();
}

/** Pencil ticks at a child's height, with initials, mostly rubbed away. */
function heightMarks(g: CanvasRenderingContext2D, x: number, floorY: number, r: Rng) {
  g.save();
  g.filter = `blur(${0.6 * K}px)`;
  for (const [h, label] of [[0.82, 'J'], [0.94, ''], [1.03, 'J'], [1.16, '']] as const) {
    const y = floorY - h * PX_PER_M;
    g.globalAlpha = r.range(0.07, 0.12) * MARKS;
    g.strokeStyle = 'rgb(60,60,66)';
    g.lineWidth = 1.2 * K;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + r.range(16, 24) * K, y + r.range(-1, 1) * K);
    g.stroke();
    if (label) {
      g.font = `400 ${14 * K}px "Reenie Beanie", cursive`;
      g.fillStyle = 'rgb(60,60,66)';
      g.fillText(label, x + 28 * K, y + 4 * K);
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

/** Days counted, in groups of five, very small and very faint. */
function tally(g: CanvasRenderingContext2D, x: number, y: number, groups: number, r: Rng) {
  g.save();
  g.strokeStyle = 'rgb(66,66,72)';
  g.lineWidth = K;
  g.globalAlpha = 0.11 * MARKS;
  g.filter = `blur(${0.4 * K}px)`;
  for (let k = 0; k < groups; k++) {
    const gx = x + k * 20 * K;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(gx + i * 3.5 * K, y + r.range(-1, 1) * K);
      g.lineTo(gx + (i * 3.5 + r.range(-0.8, 0.8)) * K, y + 13 * K);
      g.stroke();
    }
    if (k < groups - 1 || r.chance(0.5)) {
      g.beginPath();
      g.moveTo(gx - 2 * K, y + 10 * K);
      g.lineTo(gx + 14 * K, y + 2 * K);
      g.stroke();
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

/** Graphite dust settled along the top of the skirting under the busiest writing: years of it. */
function graphiteDust(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, r: Rng) {
  g.save();
  g.filter = `blur(${2 * K}px)`;
  for (let x = x0; x < x1; x += 6 * K) {
    g.fillStyle = `rgba(70,70,76,${r.range(0.02, 0.07)})`;
    g.fillRect(x, y - r.range(4, 14) * K, r.range(6, 18) * K, r.range(4, 14) * K);
  }
  g.restore();
  g.filter = 'none';
}

/** Scuffs along the skirting: shoes, a chair back, a bag set down. */
function baseScuffs(g: CanvasRenderingContext2D, W: number, H: number, r: Rng, n: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(80,78,74,${r.range(0.03, 0.08)})`;
    g.save();
    g.translate(r.range(0, W), H - r.range(18, 60) * K);
    g.rotate(r.range(-0.3, 0.3));
    g.fillRect(0, 0, r.range(6, 34) * K, r.range(1, 2.5) * K);
    g.restore();
  }
}

export function wallMaps(surface: Surface, seed: number, wM: number, hM: number): SurfaceMaps {
  const W = Math.round(wM * PX_PER_M), H = Math.round(hM * PX_PER_M);
  const tone: Record<string, [number, number, number]> = {
    north: [237, 234, 228],
    east: [238, 234, 227],
    west: [234, 232, 228],
    south: [236, 234, 229],
  };
  const { c, g, bc } = plaster(W, H, seed, tone[surface] ?? [236, 234, 228], { mottle: 7, trowel: 4.5, grain: 3 });
  const r = new Rng(seed + 11);
  const floorY = H;
  const mx = (u: number) => u * PX_PER_M;
  const my = (v: number) => H - v * PX_PER_M;

  // The history each wall carries.
  if (surface === 'north') {
    // Behind the chair, in the space that is kept empty: something was written, and rubbed out.
    erasedWriting(g, "I'm sorry", mx(2.75), my(1.75), 44, r, 1.2);
    erasedWriting(g, 'you', mx(3.35), my(1.35), 36, r, 0.8);
    removedSheet(g, mx(5.2), my(2.15), 0.42 * PX_PER_M, 0.3 * PX_PER_M, r);
    graphiteDust(g, mx(1.0), mx(3.2), my(0.09), r);
  } else if (surface === 'east') {
    heightMarks(g, mx(0.35), floorY, r);
    removedSheet(g, mx(3.6), my(2.4), 0.3 * PX_PER_M, 0.22 * PX_PER_M, r);
    erasedWriting(g, 'always', mx(4.9), my(0.7), 30, r, 0.8);
  } else if (surface === 'west') {
    erasedWriting(g, 'why did you', mx(1.0), my(1.15), 34, r, 1);
    erasedWriting(g, 'it was me', mx(4.2), my(2.55), 30, r, 0.9);
    // A word scribbled out hard, then erased anyway.
    g.save();
    g.globalAlpha = 0.06 * MARKS;
    g.strokeStyle = 'rgb(60,60,66)';
    g.filter = `blur(${K}px)`;
    g.lineWidth = 2 * K;
    g.beginPath();
    const sx = mx(2.4), sy = my(0.62);
    g.moveTo(sx, sy);
    for (let k = 0; k < 14; k++) g.lineTo(sx + (k * 5 + r.range(-2, 2)) * K, sy + ((k % 2 ? -9 : 9) + r.range(-2, 2)) * K);
    g.stroke();
    g.restore();
    g.filter = 'none';
  } else if (surface === 'south') {
    tally(g, mx(5.55), my(0.42), 6, r);
    removedSheet(g, mx(3.2), my(1.55), 0.55 * PX_PER_M, 0.4 * PX_PER_M, r);
  }

  baseScuffs(g, W, H, r, 22);
  corners(g, W, H, { bottom: 0.55, top: 0.45, left: 0.45, right: 0.45 });
  const map = toTex(c, true);
  const bump = toTex(bc, false);
  return { map, bump };
}

/**
 * The floor: matte, warm grey-white, gently uneven; smoother along the way people walk
 * in; scuffed in arcs around the chair; and, a little to one side, the faint marks of
 * where the chair used to stand.
 */
export function floorMaps(seed: number, wM: number, dM: number): SurfaceMaps {
  const W = Math.round(wM * PX_PER_M), H = Math.round(dM * PX_PER_M);
  const { c, g, bc } = plaster(W, H, seed, [221, 217, 209], { mottle: 9, trowel: 2, grain: 4 });
  const r = new Rng(seed + 5);
  const n = makeNoise(seed + 9);
  const cx = W / 2, cy = H / 2;

  // Roughness: matte, with a smoother path worn from the south side to the chair.
  const [rc, rg] = canvas(W, H);
  const rimg = rg.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const along = y > cy ? 1 : Math.max(0, 1 - (cy - y) / (0.4 * PX_PER_M));
      const across = Math.exp(-(((x - cx) / (0.55 * PX_PER_M)) ** 2));
      const path = along * across * (0.6 + 0.4 * n.fbm(x / (60 * K), y / (60 * K), 2));
      const ring = Math.exp(-(((Math.hypot(x - cx, y - cy) - 0.42 * PX_PER_M) / (0.22 * PX_PER_M)) ** 2));
      const rough = 0.9 - 0.16 * path - 0.1 * ring + (n.fbm(x / (30 * K), y / (30 * K), 2) - 0.5) * 0.06;
      const i = (y * W + x) * 4;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.round(rough * 255);
      rimg.data[i + 3] = 255;
    }
  rg.putImageData(rimg, 0, 0);

  // The path itself is a touch paler, polished by feet.
  const path = g.createLinearGradient(0, H, 0, cy);
  path.addColorStop(0, 'rgba(255,255,250,0.035)');
  path.addColorStop(1, 'rgba(255,255,250,0.0)');
  g.save();
  g.beginPath();
  g.ellipse(cx, (cy + H) / 2, 0.5 * PX_PER_M, (H - cy) / 2, 0, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = path;
  g.fillRect(0, 0, W, H);
  g.restore();

  // Arcs where the chair has been dragged and turned, again and again.
  for (let i = 0; i < 70; i++) {
    const a = r.range(0, Math.PI * 2), d = r.range(0.2, 0.55) * PX_PER_M;
    g.strokeStyle = `rgba(96,90,82,${r.range(0.025, 0.07)})`;
    g.lineWidth = r.range(0.6, 1.6) * K;
    g.beginPath();
    g.arc(cx, cy, d, a, a + r.range(0.04, 0.22));
    g.stroke();
  }
  // Where it used to stand: four small pressed marks and a cleaner square, a little to the side.
  const ox = cx + 0.34 * PX_PER_M, oy = cy - 0.22 * PX_PER_M;
  g.save();
  g.translate(ox, oy);
  g.rotate(-0.12);
  g.fillStyle = 'rgba(255,255,250,0.035)';
  g.fillRect(-0.17 * PX_PER_M, -0.155 * PX_PER_M, 0.34 * PX_PER_M, 0.31 * PX_PER_M);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.fillStyle = 'rgba(88,82,74,0.09)';
    g.beginPath();
    g.arc(sx * 0.155 * PX_PER_M, sy * 0.14 * PX_PER_M, 2.6 * K, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // Heel marks, sparse, mostly along the path.
  for (let i = 0; i < 26; i++) {
    const y = r.range(cy, H - 10 * K), x = cx + r.range(-0.6, 0.6) * PX_PER_M;
    g.save();
    g.translate(x, y);
    g.rotate(r.range(0, Math.PI));
    g.fillStyle = `rgba(70,66,62,${r.range(0.03, 0.08)})`;
    g.fillRect(0, 0, r.range(4, 16) * K, r.range(0.8, 1.8) * K);
    g.restore();
  }
  // The floor darkens toward the walls.
  const vg = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.18, cx, cy, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(98,92,84,0.2)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  corners(g, W, H, { top: 0.3, bottom: 0.3, left: 0.3, right: 0.3 }, '96,92,86');

  return { map: toTex(c, true), bump: toTex(bc, false), rough: toTex(rc, false) };
}

/** The ceiling: a slightly cooler white, nearly featureless, with the faintest board joints. */
export function ceilingMaps(seed: number, wM: number, dM: number): SurfaceMaps {
  const W = Math.round(wM * PX_PER_M), H = Math.round(dM * PX_PER_M);
  const { c, g, bc } = plaster(W, H, seed, [229, 232, 235], { mottle: 4, trowel: 1.5, grain: 2 });
  for (let x = 1.2 * PX_PER_M; x < W; x += 1.2 * PX_PER_M) {
    g.fillStyle = 'rgba(120,124,130,0.06)';
    g.fillRect(x, 0, Math.max(1, K), H);
  }
  // Light spilling from the frosted panel onto the ceiling around it.
  const px = W / 2 + 0.1 * PX_PER_M, pz = H / 2 + 0.95 * PX_PER_M;
  const spill = g.createRadialGradient(px, pz, 0.4 * PX_PER_M, px, pz, 2.2 * PX_PER_M);
  spill.addColorStop(0, 'rgba(255,253,248,0.22)');
  spill.addColorStop(1, 'rgba(255,253,248,0)');
  g.fillStyle = spill;
  g.fillRect(0, 0, W, H);
  corners(g, W, H, { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }, '104,108,114');
  return { map: toTex(c, true), bump: toTex(bc, false) };
}
