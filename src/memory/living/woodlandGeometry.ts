import * as THREE from 'three';

/** The painted rig's meshes and its figure sheet's layout (the scene, WoodlandScene.ts, draws them). */

/** The figures' sheet (deformers are fractions of this; figure uv × this = sheet pixels, y up). */
export const SHEET = new THREE.Vector2(1448, 505);

/** An atlas of `n` rows of `px` (with `gutter` between): a row's height and pitch (fractions). */
export function rowsOf(px: number, gutter: number, n: number): THREE.Vector2 {
  const total = n * px + (n - 1) * gutter;
  return new THREE.Vector2(px / total, (px + gutter) / total);
}

/**
 * The puppet's mesh: the body finer where faces and hands are (an eye is ~20 sheet px), her forearm
 * a patch of its own (`part` 1), one draw.
 */
export function puppet(limb: [number, number, number, number], low: boolean): THREE.BufferGeometry {
  const fine = (a: number, b: number, lo: number, hi: number, f: number, c: number) => {
    const out: number[] = [];
    for (let x = a; x < b; ) {
      out.push(x);
      x += x >= lo && x < hi ? f : c;
    }
    out.push(b);
    return out;
  };
  // Sheet px (y down) → figure uv (y up).
  // (Every 4 sheet px across the faces and hands, 12 elsewhere; on the low tier 6 and 18: the
  // phone's painting is smaller on its screen.)
  const [f, c] = low ? [6, 18] : [4, 12];
  const us = fine(0, SHEET.x, 120, 760, f, c).map((x) => x / SHEET.x);
  const vs = fine(0, SHEET.y, 0, 200, f, c).map((y) => 1 - y / SHEET.y);
  const pos: number[] = [];
  const uv: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  const grid = (u: number[], v: number[], k: number) => {
    const base = pos.length / 3;
    for (const y of v) {
      for (const x of u) {
        pos.push(x, y, 0);
        uv.push(x, y);
        part.push(k);
      }
    }
    const n = u.length;
    for (let j = 0; j < v.length - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = base + j * n + i;
        idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
  };
  grid(us, vs, 0);
  const lin = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  grid(lin(limb[0], limb[2], 24), lin(limb[3], limb[1], 24), 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

/**
 * The near flowers: each a strip from its root (below its head, in the grass) up past its head,
 * bent about the root by the shader. Painting uv; `stem` = (how far up, swing px, root x, phase).
 */
export function flowerStrips(heads: [number, number, number][], plate: [number, number]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const stem: number[] = [];
  const idx: number[] = [];
  const px = 1 / plate[0], py = 1 / plate[1];
  heads.forEach(([x, y, r], k) => {
    const rad = r * plate[0] + 4;
    const rootY = y - 70 * py; // the stem goes down into the grass
    const topY = y + rad * py;
    const swing = 6 + 6 * Math.min(1, (r * plate[0]) / 22); // bigger heads (nearer) swing further
    const phase = (k * 2.399) % 6.2831;
    const base = pos.length / 3;
    const rows = 8;
    for (let j = 0; j <= rows; j++) {
      const v = rootY + ((topY - rootY) * j) / rows;
      const up = (v - rootY) / (y - rootY); // 1 at the head's centre
      for (const side of [-1, 1]) {
        const u = x + side * rad * px;
        pos.push(u, v, 0);
        uv.push(u, v);
        stem.push(Math.min(1.2, Math.max(0, up)), swing, x, phase);
      }
    }
    for (let j = 0; j < rows; j++) {
      const a = base + j * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('stem', new THREE.Float32BufferAttribute(stem, 4));
  g.setIndex(idx);
  return g;
}

/**
 * What is in the air: motes (`stem` = kind 0, index, size px). Each a quad round its centre
 * (`position` its corner, ±1; the shader places it).
 */
export function airborne(items: { stem: [number, number, number, number]; home: [number, number] }[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const stem: number[] = [];
  const home: number[] = [];
  const idx: number[] = [];
  items.forEach((it, k) => {
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      pos.push(x, y, 0);
      uv.push((x + 1) / 2, (y + 1) / 2);
      stem.push(...it.stem);
      home.push(...it.home);
    }
    const a = k * 4;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('stem', new THREE.Float32BufferAttribute(stem, 4));
  g.setAttribute('home', new THREE.Float32BufferAttribute(home, 2));
  g.setIndex(idx);
  return g;
}
