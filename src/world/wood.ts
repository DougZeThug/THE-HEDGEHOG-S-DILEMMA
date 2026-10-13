import * as THREE from 'three';
import { makeNoise } from './noise';
import { Rng } from '../core/rng';

/**
 * Wood for a small hand-made chair: oiled cherry/walnut tones, long grain that wanders,
 * the occasional ring figure, open pores. The grain runs along the texture's U axis, so
 * parts are UV-mapped with their length along U.
 */
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
  const light = [138, 102, 74], dark = [98, 68, 46], deep = [66, 45, 31];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Distance across the grain, wandering slowly along it.
      // Long, calm grain: lines run along U and only drift slowly.
      const w = warp.fbm(x / 1400, y / 260, 3) * 2.6 + warp.fbm(x / 90, y / 40, 2) * 0.12;
      const across = y / 15 + w;
      const ring = 0.5 + 0.5 * Math.sin(across * Math.PI * 2);
      const late = Math.pow(ring, 3.2); // dense latewood lines
      const figure = fig.fbm(x / 160, y / 140, 3);
      let t = 0.3 + 0.32 * late + 0.22 * (figure - 0.5);
      // Pores: short dark dashes along the grain.
      const p = pore.next();
      if (p > 0.992) t += 0.35;
      t = Math.min(1, Math.max(0, t));
      const a = t < 0.6 ? t / 0.6 : 1;
      const b = t < 0.6 ? 0 : (t - 0.6) / 0.4;
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) img.data[i + k] = light[k] + (dark[k] - light[k]) * a + (deep[k] - dark[k]) * b;
      img.data[i + 3] = 255;
      const rough = 0.48 + 0.14 * late + 0.08 * (figure - 0.5) + (p > 0.992 ? 0.2 : 0);
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.round(rough * 255);
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
