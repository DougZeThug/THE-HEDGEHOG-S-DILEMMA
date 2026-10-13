import * as THREE from 'three';
import { makeNoise } from './noise';
import { Rng } from '../core/rng';

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

export function woodMaps(seed = 7): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
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
  const light = [128, 84, 48], dark = [86, 52, 28], deep = [50, 30, 16];
  // The seat occupies canvas rows 0..seatH (v from 1 down to SEAT_V0; the canvas is flipped).
  const seatH = Math.round(H * (1 - SEAT_V0));
  const seatW = Math.round(W * 0.8);
  for (let y = 0; y < H; y++) {
    const inSeat = y < seatH;
    // The seat: two boards, the joint across the middle of its depth; the back board's grain
    // starts elsewhere in the log and is a shade lighter.
    const board = inSeat ? (y < seatH * 0.52 ? 0 : 1) : -1;
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
      let t = inSeat && x < seatW ? 0.3 + 0.16 * late + 0.42 * (figure - 0.5) : 0.32 + 0.34 * late + 0.35 * (figure - 0.5);
      // Pores: short dark dashes along the grain.
      const p = pore.next();
      if (p > 0.992) t += 0.3;
      let shade = 1;
      let rough = 0.5 + 0.14 * late + 0.08 * (figure - 0.5) + (p > 0.992 ? 0.2 : 0);
      if (inSeat && x < seatW) {
        // Sat on and handled for years: the seat's top is paler, honey rather than walnut.
        shade *= board === 1 ? 1.27 : 1.2;
        // The glue line, faint.
        const joint = Math.abs(y - seatH * 0.52);
        if (joint < 1.5) shade *= 0.8;
        // Edges darker and rougher: dust and old finish where nobody sits or holds.
        const ex = Math.min(x, seatW - x) / seatW, ey = Math.min(y, seatH - y) / seatH;
        const edge = 1 - Math.min(1, Math.min(ex / 0.12, ey / 0.16));
        shade *= 1 - 0.25 * edge;
        rough += 0.12 * edge;
      }
      t = Math.min(1, Math.max(0, t));
      const a = t < 0.6 ? t / 0.6 : 1;
      const b = t < 0.6 ? 0 : (t - 0.6) / 0.4;
      const i = (y * W + x) * 4;
      // The seat's top has gone amber (oil and years), the legs stay the darker, redder walnut.
      const amber = inSeat && x < seatW ? [1, 1.1, 1.12] : [1, 1, 1];
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
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const rough = new THREE.CanvasTexture(rc);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  return { map, rough };
}
