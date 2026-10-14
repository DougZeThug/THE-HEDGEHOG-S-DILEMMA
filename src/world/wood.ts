import * as THREE from 'three';
import { makeNoise } from './noise';
import { Rng } from '../core/rng';
import { scanDetail, scanNormal, sampleDetail, type NormalTile } from './scans';

/**
 * Wood for a small hand-made chair: oiled walnut, long grain that wanders, the occasional
 * ring figure, open pores. The grain runs along the texture's U axis, so parts are UV-mapped
 * with their length along U.
 *
 * The figure is broad enough to survive at room distance (a chair 3 m away is a few hundred
 * pixels tall; fine grain mips away to a flat colour). The top half of the texture (v 0.5–1)
 * is the seat's own: two boards glued side by side, one a shade lighter, the joint a faint
 * line, the edges darker where hands and years have not polished them.
 */
export const SEAT_V0 = 0.5;

/**
 * Where an atlas pixel is on the wood, in metres: the legs' half runs 2.2 units of u per metre
 * along the grain and 2.2 of v per metre round the bar (Chair.squareBar); the seat's quarter is
 * the seat's top, about 0.375 m by 0.35 m.
 */
function atlasMetres(x: number, y: number, W: number, H: number, seatH: number, seatW: number): { seat: boolean; a: number; b: number } {
  if (y < seatH && x < seatW) return { seat: true, a: (x / seatW) * 0.375, b: (y / seatH) * 0.35 };
  return { seat: false, a: x / W / 2.2, b: (1 - y / H) / 2.2 };
}

/** A tile's pixel at metres (it tiles), nearest. */
function tileAt(t: NormalTile, xm: number, ym: number, out: number[]): number[] {
  const x = ((Math.floor((xm / t.metres) * t.w) % t.w) + t.w) % t.w;
  const y = ((Math.floor((ym / t.metres) * t.h) % t.h) + t.h) % t.h;
  const i = (y * t.w + x) * 4;
  out[0] = t.rgba[i];
  out[1] = t.rgba[i + 1];
  out[2] = t.rgba[i + 2];
  return out;
}

export function woodMaps(seed = 7): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture; normal: THREE.CanvasTexture | null } {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const rc = document.createElement('canvas');
  rc.width = W;
  rc.height = H;
  const rg = rc.getContext('2d')!;
  const img = g.createImageData(W, H);
  const rimg = rg.createImageData(W, H);
  const warp = makeNoise(seed), fig = makeNoise(seed + 1), pore = new Rng(seed + 2);
  const light = [176, 140, 114], dark = [122, 93, 73], deep = [62, 45, 33];
  // Real wood's fine structure (scans.ts): the members' straight grain, the seat's worn board.
  // The members' scan has its grain running down the image, so it is turned to run along U.
  const grainScan = scanDetail('wood-grain'), seatScan = scanDetail('wood-seat');
  // The seat occupies canvas rows 0..seatH (v from 1 down to SEAT_V0; the canvas is flipped).
  const seatH = Math.round(H * (1 - SEAT_V0));
  const seatW = Math.round(W * 0.8);
  for (let y = 0; y < H; y++) {
    const inSeat = y < seatH;
    // The seat: two boards, the joint across the middle of its depth; the back board's grain
    // starts elsewhere in the log and is a shade lighter.
    const board = inSeat ? (y < seatH * 0.55 ? 0 : 1) : -1;
    for (let x = 0; x < W; x++) {
      // Long, calm grain: lines run along U and only drift slowly.
      const yy = y + (board === 1 ? 157 : 0);
      const w = warp.fbm(x / 1400, yy / 260, 3) * 2.6 + warp.fbm(x / 90, yy / 40, 2) * 0.12;
      // Rings at uneven spacing (fast and slow years), not a regular stripe.
      const across = (yy + 26 * fig.fbm(x / 700, yy / 70, 2)) / 40 + w;
      const ring = 0.5 + 0.5 * Math.sin(across * Math.PI * 2);
      const late = Math.pow(ring, 2.6); // latewood lines
      const figure = fig.fbm(x / 160, yy / 140, 3);
      // The seat is wide, flat-sawn board: broad figure, quieter latewood (a regular stripe
      // across it read as corduroy). Turned and bent parts keep the strong rings.
      let t = inSeat && x < seatW ? 0.3 + 0.3 * late + 0.5 * (figure - 0.5) : 0.32 + 0.34 * late + 0.35 * (figure - 0.5);
      // Pores: short dark dashes along the grain.
      const p = pore.next();
      if (p > 0.992) t += 0.3;
      let shade = 1;
      let rough = 0.5 + 0.14 * late + 0.08 * (figure - 0.5) + (p > 0.992 ? 0.2 : 0);
      if (inSeat && x < seatW) {
        // Sat on and handled for years: the seat's top is paler, honey rather than walnut.
        shade *= board === 1 ? 0.74 : 0.7;
        // The glue line, faint.
        const joint = Math.abs(y - seatH * 0.55);
        if (joint < 2) shade *= 0.7;
        // Edges darker and rougher: dust and old finish where nobody sits or holds.
        const ex = Math.min(x, seatW - x) / seatW, ey = Math.min(y, seatH - y) / seatH;
        const edge = 1 - Math.min(1, Math.min(ex / 0.12, ey / 0.16));
        shade *= 1 - 0.2 * edge;
        // Polished where people sat: smoother at the middle, so the key leaves a sheen there.
        rough += 0.12 * edge - 0.12 * (1 - edge);
      }
      t = Math.min(1, Math.max(0, t));
      const a = t < 0.6 ? t / 0.6 : 1;
      const b = t < 0.6 ? 0 : (t - 0.6) / 0.4;
      const i = (y * W + x) * 4;
      const at = atlasMetres(x, y, W, H, seatH, seatW);
      const sz = at.seat ? (seatScan ? 0.24 * sampleDetail(seatScan, at.a, at.b) : 0) : grainScan ? 0.08 * sampleDetail(grainScan, -at.b, -at.a) : 0;
      shade *= 1 + sz;
      // The seat's top has gone amber (oil and years), the legs stay the darker, redder walnut.
      const amber = inSeat && x < seatW ? [1, 1.06, 1.06] : [1, 1, 1];
      for (let k = 0; k < 3; k++) img.data[i + k] = (light[k] + (dark[k] - light[k]) * a + (deep[k] - dark[k]) * b) * shade * amber[k];
      img.data[i + 3] = 255;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.round(Math.min(1, rough) * 255);
      rimg.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  rg.putImageData(rimg, 0, 0);
  // Stretch pores along the grain.
  g.globalAlpha = 0.35;
  g.drawImage(c, 2, 0);
  g.drawImage(c, -2, 0);
  g.globalAlpha = 1;
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  // Along the grain it repeats; across it, never (the legs' rows must not wrap into the seat's).
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 8;
  const rough = new THREE.CanvasTexture(rc);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  return { map, rough, normal: woodNormal(W, H, seatH, seatW) };
}

/**
 * The scans' relief, laid out as the atlas is. The members' scan is turned a quarter (its grain
 * runs down the image): its up becomes +u, its left +v, and its normals turn with it.
 */
function woodNormal(W: number, H: number, seatH: number, seatW: number): THREE.CanvasTexture | null {
  const grain = scanNormal('wood-grain'), seat = scanNormal('wood-seat');
  if (!grain || !seat) return null;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const px = [0, 0, 0];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const at = atlasMetres(x, y, W, H, seatH, seatW);
      const i = (y * W + x) * 4;
      if (at.seat) {
        tileAt(seat, at.a, at.b, px);
        img.data[i] = px[0];
        img.data[i + 1] = px[1];
      } else {
        // Image column = -v (left), image row = -u (up).
        tileAt(grain, -at.b, -at.a, px);
        img.data[i] = px[1];
        img.data[i + 1] = 255 - px[0];
      }
      img.data[i + 2] = px[2];
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}
