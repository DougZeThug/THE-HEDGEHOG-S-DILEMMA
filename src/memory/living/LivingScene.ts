import * as THREE from 'three';
import { DEFORMERS, livingCamera, livingMaterials, livingTarget, type LivingMaterials } from '../../world/living/materials';
import { CANOPY, blinkDrawing, breath, hash01, windDrift, windResponse } from './performance';
import type { LivingSpec } from './woodland';
import type { Values } from '../types';

/**
 * A living memory's scene (docs/reviews/2026-10-woodland.md): the painting and the people,
 * drawn into one render target that the wall's window and the immersion both show. Owned by
 * the memory while it plays; it has no clock of its own: the App hands it the memory's time and
 * composed values each frame, and it draws only when something it shows has changed.
 *
 * Time inside the painting moves on twos (12 drawings a second, as hand-drawn animation does):
 * the sway, the breathing, the blinks and the gestures. The view (what part of the painting is
 * on the screen) moves at the screen's rate.
 */

/** One of the puppet's deformers (figure uv, y up; src/memory/living/woodland.ts drives them). */
export interface Deformer {
  name: string;
  c: [number, number];
  r: [number, number];
  angle: number;
  edge: number;
  pivot: [number, number];
  part: 'body' | 'limb';
}

export interface FigureArt {
  /** An atlas: the body, then her forearm (rows of `pixels`, `gutter` apart). */
  texture: THREE.Texture;
  /** An atlas: their lids shut, half, and her sleeve. */
  lids: THREE.Texture;
  /** Where they lie on the painting: x0, y0, w, h (painting uv, y up). */
  place: [number, number, number, number];
  pixels: [number, number];
  gutter: number;
  split: number;
  deformers: Deformer[];
  /** Her forearm's extent (figure uv: u0, v0, u1, v1) and the way back along it (a unit vector, sheet px). */
  limb: { box: [number, number, number, number]; axis: [number, number] };
}

/** Her head as the artist redrew it (cells: the drawing, then the region it is laid in by), where its cells lie on the panel (sheet px, y down: x0, y0, w, h), and how many cells. */
export interface HeadCels {
  texture: THREE.Texture;
  box: [number, number, number, number];
  cells: number;
}

/**
 * An eye (sheet px, y down): its opening (centre, radii, angle: positive turns its outer end down),
 * its iris (centre, radius), its white (rgb).
 */
export type Eye = [number, number, number, number, number, number, number, number, number, number, number];

/**
 * The two-shot (scripts/two-shot.py): the two of them close. The same puppet as the wide (the wide's
 * people are this panel at 0.8, its deformers in the panel's pixels), drawn from the panel at its
 * own size, over the ground round them, out of focus; her head as the artist redrew it, in either
 * shot.
 */
export interface NearArt {
  /** An atlas: the body, her forearm (rows of `pixels`, `gutter` apart), as far across the panel as `reach` (sheet px). */
  texture: THREE.Texture;
  /** Their lids shut, half, and her sleeve (rows), at this size, over `lidBox` (sheet px, y down: x0, y0, w, h). */
  lids: THREE.Texture;
  /** Her head turned to him, at this size. */
  heads: HeadCels;
  /** The ground round them, out of focus. */
  ground: THREE.Texture;
  /** Where their bed's grass moves in the air (R, over the atlas's reach). */
  maps: THREE.Texture;
  pixels: [number, number];
  gutter: number;
  reach: number;
  lidBox: [number, number, number, number];
  /** Where the ground lies (stage px, y down: x0, y0, w, h). */
  groundBox: [number, number, number, number];
  /** Their eyes: his two, then hers. */
  eyes: Eye[];
}

export interface LivingArt {
  plate: THREE.Texture;
  /** The near flowers' heads (cut from the plate) and where they are (painting uv: x, y, radius as a fraction of the width). */
  flowers: { texture: THREE.Texture; heads: [number, number, number][] } | null;
  /** The sky in the canopy's gap, drifting: where it shows, the afternoon's and the evening's, their box and left margin. */
  clouds: { mask: THREE.Texture; day: THREE.Texture; after: THREE.Texture; box: [number, number, number, number]; pad: number } | null;
  maps: THREE.Texture;
  grade: THREE.Texture | null;
  /** The same composition later, nobody there (the cut, `scene.after`). */
  after: THREE.Texture | null;
  sky: { texture: THREE.Texture; box: [number, number, number, number] } | null;
  figures: FigureArt | null;
  /** Her head turned to him, at the wide's size (her look, in the wide), if it could be had. */
  heads?: HeadCels | null;
  /** The two-shot, if it could be had and her look in the wide too (else its shot is the wide). */
  near?: NearArt | null;
  /** The plate's pixels. */
  size: [number, number];
}

/** The figures' sheet (deformers are fractions of this; figure uv × this = sheet pixels, y up). */
const SHEET = new THREE.Vector2(1448, 505);

/** An atlas of `n` rows of `px` (with `gutter` between): a row's height and pitch (fractions). */
function rowsOf(px: number, gutter: number, n: number): THREE.Vector2 {
  const total = n * px + (n - 1) * gutter;
  return new THREE.Vector2(px / total, (px + gutter) / total);
}
const FPS = 12;
/** A turn (radians) that gives the close shot way to the wide, and one under which it may come back (after RETURN s). */
const GIVE_WAY = 0.244;
const SETTLE = 0.105;
const RETURN = 1.2;
/** A screen's aspect when none is given (16:9). */
const WIDE = 16 / 9;

/**
 * The puppet's mesh: the body finer where faces and hands are (an eye is ~20 sheet px), her forearm
 * a patch of its own (`part` 1), one draw.
 */
function puppet(limb: [number, number, number, number], low: boolean): THREE.BufferGeometry {
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
    for (const y of v) for (const x of u) pos.push(x, y, 0), uv.push(x, y), part.push(k);
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
function flowerStrips(heads: [number, number, number][], plate: [number, number]): THREE.BufferGeometry {
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
function airborne(items: { stem: [number, number, number, number]; home: [number, number] }[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const stem: number[] = [];
  const home: number[] = [];
  const idx: number[] = [];
  items.forEach((it, k) => {
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pos.push(x, y, 0), uv.push((x + 1) / 2, (y + 1) / 2), stem.push(...it.stem), home.push(...it.home);
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

/** The kinds of things the air moves, as springs (Hz, damping): see `windResponse`. */
// (The canopy slower than the grass, as big trees sway; what is heard of a gust follows it:
// src/memory/synthWoods.ts. The skeptic's second review, 2026-10-17.)
const SPRINGS = { grass: [0.7, 0.5], flower: [1.2, 0.3], leaves: CANOPY } as const;
/** How fast the sky drifts (plate px a second): the afternoon's, the evening's. */
const DRIFT = { day: 2, after: 1.4 };

export class LivingScene {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = livingCamera();
  private readonly m: LivingMaterials;
  private readonly quad: THREE.PlaneGeometry;
  private readonly grid: THREE.BufferGeometry | null;
  private readonly people: THREE.Mesh | null;
  private readonly strips: THREE.BufferGeometry | null = null;
  private readonly air: THREE.BufferGeometry;
  /** The ground round them in the two-shot. */
  private readonly frame: THREE.Mesh;
  private readonly wide: THREE.Object3D[] = [];
  /** The shot shown now (0: the wide, 1: the two-shot), the one the timeline asks for, and whether it gave way. */
  private shot = 0;
  private asked = 0;
  private gaveWay = false;
  /** The two-shot's frame while it is on (chosen as it came on). */
  private band: [number, number, number] | null = null;
  /** Since when (room s) they have faced the two-shot again after it gave way (−1: not settled), and the drawing and time it was last chosen at. */
  private settled = -1;
  private lastDrawing = -1;
  private lastT = -1;
  private drawnAt = -1;
  private readonly lastView = new THREE.Vector4(-1, -1, -1, -1);
  private readonly lastParallax = new THREE.Vector2(9, 9);
  /** What is there (people, the cut): a change is drawn on its own frame, not the next drawing. */
  private lastState = '';
  private disposed = false;
  private readonly wind = Array.from({ length: 16 }, () => new THREE.Vector4());
  private readonly drift: number[] = new Array(16).fill(0);
  /** The part of the painting drawn now (x0, y0, w, h in painting uv). */
  readonly view = new THREE.Vector4(0, 0, 1, 1);
  /** The two-shot is drawn now (its art on the people and the frame), or the wide. */
  private near = false;
  /** The ground's grass, out of focus, barely stirs (a map of one texel: the air moves what is near and sharp). */
  private readonly stir: THREE.DataTexture;

  constructor(
    private readonly art: LivingArt,
    private readonly spec: LivingSpec,
    o: { width: number; height: number; noise: THREE.Texture; reduced: boolean; low?: boolean },
  ) {
    this.m = livingMaterials(o.noise);
    this.target = livingTarget(o.width, o.height);
    this.quad = new THREE.PlaneGeometry(1, 1);
    this.quad.translate(0.5, 0.5, 0);
    const pu = this.m.plate.uniforms;
    pu.uPlate.value = art.plate;
    pu.uAfterPlate.value = art.after ?? art.plate;
    pu.uMaps.value = art.maps;
    pu.uGrade.value = art.grade ?? this.m.empty;
    pu.uSky.value = art.sky?.texture ?? this.m.empty;
    (pu.uSkyBox.value as THREE.Vector4).set(...(art.sky?.box ?? [0, 0, 0, 0]));
    (pu.uPx.value as THREE.Vector2).set(1 / art.size[0], 1 / art.size[1]);
    pu.uMotion.value = o.reduced ? 0.25 : 1;
    const plate = new THREE.Mesh(this.quad, this.m.plate);
    plate.frustumCulled = false;
    this.scene.add(plate);
    this.wide.push(plate);
    // The two-shot's ground (placed by the shot's frame; under them).
    this.frame = new THREE.Mesh(this.quad, this.m.frame);
    this.frame.frustumCulled = false;
    this.frame.renderOrder = 0;
    this.frame.visible = false;
    this.scene.add(this.frame);
    const cl = art.clouds;
    pu.uSkyMask.value = cl?.mask ?? this.m.empty;
    pu.uClouds.value = cl?.day ?? this.m.empty;
    pu.uCloudsAfter.value = cl?.after ?? this.m.empty;
    (pu.uCloudBox.value as THREE.Vector4).set(...(cl?.box ?? [0, 0, 0, 0]));
    (pu.uCloud.value as THREE.Vector2).set(cl?.pad ?? 0, 0);
    // What is in the air (as authored in the spec): motes. (No seed, no falling leaf: drawn by the
    // engine, they read as a sparkle and as a sprite: the directors' and the skeptic's reviews.)
    // (Where each starts is hashed here, not on the GPU, so every device agrees.)
    const items: { stem: [number, number, number, number]; home: [number, number] }[] = [];
    const h = (n: number, k: number) => hash01(n, 7919 + k);
    for (let i = 0; i < spec.air.motes; i++) items.push({ stem: [0, i, 3 + (i % 3) * 1.2, 0], home: [h(i, 0), 0.36 + 0.48 * h(i, 1)] });
    this.air = airborne(items);
    const airMesh = new THREE.Mesh(this.air, this.m.air);
    airMesh.frustumCulled = false;
    airMesh.renderOrder = 3;
    this.scene.add(airMesh);
    this.wide.push(airMesh);
    const au = this.m.air.uniforms;
    au.uPlate.value = art.plate;
    au.uMaps.value = art.maps;
    au.uAfterPlate.value = art.after ?? art.plate;
    (au.uPx.value as THREE.Vector2).set(1 / art.size[0], 1 / art.size[1]);
    au.uCount.value = o.reduced ? Math.round(spec.air.motes / 3) : spec.air.motes;
    if (art.flowers) {
      this.strips = flowerStrips(art.flowers.heads, art.size);
      const fl = new THREE.Mesh(this.strips, this.m.flowers);
      fl.frustumCulled = false;
      fl.renderOrder = 2;
      this.scene.add(fl);
      this.wide.push(fl);
      const fu = this.m.flowers.uniforms;
      fu.uFlowers.value = art.flowers.texture;
      (fu.uPx.value as THREE.Vector2).set(1 / art.size[0], 1 / art.size[1]);
    }
    this.reduced = o.reduced;
    this.stir = new THREE.DataTexture(new Uint8Array([25, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    this.stir.needsUpdate = true;
    const f = art.figures;
    if (f) {
      this.grid = puppet(f.limb.box, !!o.low);
      this.people = new THREE.Mesh(this.grid, this.m.people);
      this.people.frustumCulled = false;
      this.people.renderOrder = 1;
      this.scene.add(this.people);
      this.wide.push(this.people);
      const u = this.m.people.uniforms;
      u.uFigures.value = f.texture;
      u.uLids.value = f.lids;
      u.uGrade.value = art.grade ?? this.m.empty;
      u.uMaps.value = art.maps;
      u.uMotion.value = o.reduced ? 0.25 : 1;
      (u.uPlace.value as THREE.Vector4).set(...f.place);
      (u.uFigRows.value as THREE.Vector2).copy(rowsOf(f.pixels[1], f.gutter, 2));
      (u.uLidRows.value as THREE.Vector2).copy(rowsOf(f.pixels[1], f.gutter, 3));
      (u.uSheet.value as THREE.Vector2).copy(SHEET);
      u.uSplit.value = f.split;
      this.setDeformers(f);
      this.dressPeople(false);
    } else {
      this.grid = null;
      this.people = null;
    }
  }
  /** Reduced motion (as asked for now: the App keeps it current; the motes' number is set once). */
  reduced: boolean;

  /** Each deformer's slot, by name; its moves are set each drawing by `pose`. */
  private readonly slot = new Map<string, number>();
  private readonly axis = new THREE.Vector2();
  private readonly at = new Map<string, THREE.Vector2>();

  private setDeformers(f: FigureArt): void {
    const D = this.m.people.uniforms.uD.value as THREE.Vector4[];
    for (const v of D) v.set(-1e5, -1e5, 1, 1);
    for (let i = 0; i < DEFORMERS; i++) D[i * 4 + 1].set(0, 0.5, 0, 0), D[i * 4 + 2].set(0, 0, 0, 0), D[i * 4 + 3].set(0, 0, 0, 0);
    f.deformers.slice(0, DEFORMERS).forEach((d, i) => {
      this.slot.set(d.name, i);
      D[i * 4].set(d.c[0] * SHEET.x, d.c[1] * SHEET.y, d.r[0] * SHEET.x, d.r[1] * SHEET.y);
      D[i * 4 + 1].set(d.angle, d.edge, d.part === 'limb' ? 2 : 1, d.angle);
      D[i * 4 + 2].set(d.pivot[0] * SHEET.x, d.pivot[1] * SHEET.y, 0, 0);
      // Where it is across the painting (for the wind, which crosses left to right).
      this.at.set(d.name, new THREE.Vector2(f.place[0] + d.c[0] * f.place[2], f.place[1] + d.c[1] * f.place[3]));
    });
    this.axis.set(...f.limb.axis);
  }

  /** A deformer's move this drawing: a turn about its pivot, a swell along its short axis, a move (sheet px, y up). */
  private bone(name: string, o: { turn?: number; swell?: number; x?: number; y?: number }): void {
    const i = this.slot.get(name);
    if (i === undefined) return;
    const D = this.m.people.uniforms.uD.value as THREE.Vector4[];
    D[i * 4 + 2].z = o.x ?? 0;
    D[i * 4 + 2].w = o.y ?? 0;
    D[i * 4 + 3].set(o.turn ?? 0, o.swell ?? 0, 0, 0);
  }

  /**
   * The people's art: the wide's (cut at 0.8, placed on the painting) or the two-shot's (the panel
   * at its own size; their eyes' openings; lit as the wide lights them, at the same place). Her
   * head's redrawing at either size.
   */
  private dressPeople(near: boolean): void {
    const u = this.m.people.uniforms;
    const f = this.art.figures!;
    const n = this.art.near;
    const box = (b: [number, number, number, number]) => [b[0] / SHEET.x, 1 - (b[1] + b[3]) / SHEET.y, b[2] / SHEET.x, b[3] / SHEET.y] as const;
    if (near && n) {
      u.uFigures.value = n.texture;
      u.uLids.value = n.lids;
      u.uGrade.value = this.m.empty;
      // (Px a sheet px, as the rows were cut: their proportions hold at either stored size.)
      const k = n.pixels[0] / n.reach;
      (u.uFigRows.value as THREE.Vector2).copy(rowsOf(n.pixels[1], n.gutter, 2));
      (u.uLidRows.value as THREE.Vector2).copy(rowsOf(n.lidBox[3] * k, n.gutter, 3));
      u.uFigU.value = n.reach / SHEET.x;
      (u.uLidBox.value as THREE.Vector4).set(...box(n.lidBox));
      u.uHeads.value = n.heads.texture;
      (u.uHeadBox.value as THREE.Vector4).set(...box(n.heads.box));
      // (The eyes in stage px, y up: an angle turns the other way.)
      n.eyes.forEach((e, i) => {
        (u.uEyes.value as THREE.Vector4[])[i].set(e[0], SHEET.y - e[1], e[2], e[3]);
        (u.uIrises.value as THREE.Vector4[])[i].set(e[5], SHEET.y - e[6], e[7], -e[4]);
        (u.uWhites.value as THREE.Vector3[])[i].set(e[8], e[9], e[10]);
      });
      (u.uWidePlace.value as THREE.Vector4).set(...f.place);
      u.uMaps.value = n.maps;
      u.uNear.value = 1;
    } else {
      u.uFigures.value = f.texture;
      u.uLids.value = f.lids;
      u.uGrade.value = this.art.grade ?? this.m.empty;
      (u.uFigRows.value as THREE.Vector2).copy(rowsOf(f.pixels[1], f.gutter, 2));
      (u.uLidRows.value as THREE.Vector2).copy(rowsOf(f.pixels[1], f.gutter, 3));
      u.uFigU.value = 1;
      (u.uLidBox.value as THREE.Vector4).set(0, 0, 1, 1);
      (u.uPlace.value as THREE.Vector4).set(...f.place);
      const h = this.art.heads;
      u.uHeads.value = h?.texture ?? this.m.empty;
      (u.uHeadBox.value as THREE.Vector4).set(...(h ? box(h.box) : ([0, 0, 0, 0] as const)));
      (u.uGaze.value as THREE.Vector2).set(0, 0);
      (u.uGazeB.value as THREE.Vector2).set(0, 0);
      u.uMaps.value = this.art.maps;
      u.uNear.value = 0;
    }
    this.near = near;
  }

  /**
   * The two-shot's frame: the part of the stage (sheet px, y down; its height the painting's
   * proportion of its width) the painting's square shows. The people are placed by it, and the
   * ground under them.
   */
  private frameStage(x: number, y: number, w: number): void {
    const h = (w * this.art.size[1]) / this.art.size[0];
    (this.m.people.uniforms.uPlace.value as THREE.Vector4).set(-x / w, 1 - (SHEET.y - y) / h, SHEET.x / w, SHEET.y / h);
    const [gx, gy, gw, gh] = this.art.near!.groundBox;
    const u0 = (gx - x) / w, u1 = (gx + gw - x) / w;
    const vTop = 1 - (gy - y) / h, vBottom = 1 - (gy + gh - y) / h;
    this.frame.position.set(u0, vBottom, 0);
    this.frame.scale.set(u1 - u0, vTop - vBottom, 1);
  }

  /**
   * One frame: the memory's time `t` (its sequence position while living) and composed values.
   * `view` is the part of the painting to draw (what is on the screen); `parallax` the visitor's
   * small looks (painting uv at depth 1). Returns whether it drew.
   */
  update(renderer: THREE.WebGLRenderer, t: number, v: Values, o: { view: THREE.Vector4; parallax: THREE.Vector2; tap?: THREE.Vector4; aspect?: number }): boolean {
    if (this.disposed) return false;
    const tq = Math.floor(t * FPS) / FPS;
    const viewMoved = !this.lastView.equals(o.view);
    const lookMoved = this.lastParallax.distanceToSquared(o.parallax) > 1e-10;
    const tapping = !!o.tap && o.tap.w > 0 && o.tap.z < 2;
    // (The shot as chosen for this frame.)
    const shot = this.shot;
    const two = shot > 0 && this.hasNear;
    // A cut (the people, the evening, the shot, her head's drawing) is drawn on its own frame, not
    // at the next drawing.
    const state = `${(v['scene.after'] ?? 0) >= 0.5 ? 1 : 0}|${(v['scene.people'] ?? 1) > 0.001 ? 1 : 0}|${shot}|${Math.round(v['figure:b.cel'] ?? 0)}`;
    if (tq === this.drawnAt && !viewMoved && !lookMoved && !tapping && state === this.lastState) return false;
    this.lastState = state;
    this.drawnAt = tq;
    this.lastView.copy(o.view);
    this.lastParallax.copy(o.parallax);
    this.view.copy(o.view);
    const val = (k: string, d: number) => (k in v ? v[k] : d);
    const dusk = val('scene.dusk', 0);
    // Still as a painting until it begins to live; the air can die down (the breeze).
    const life = val('scene.life', 1);
    const motion = (this.reduced ? 0.25 : 1) * life;
    const still = val('scene.breeze', 1);
    // The air, answered by each kind of thing it moves, at 16 places across the painting.
    for (let i = 0; i < 16; i++) {
      const x = i / 15;
      const r = (k: readonly [number, number], dt = 0) => windResponse(tq - dt, x, k[0], k[1], this.spec.gusts, still);
      this.wind[i].set(r(SPRINGS.grass), r(SPRINGS.flower), r(SPRINGS.leaves), r(SPRINGS.leaves, 0.3));
    }
    for (let i = 0; i < 16; i++) this.drift[i] = windDrift(tq, i / 15, this.spec.gusts) * 6 * motion;
    if (two !== this.near && this.art.figures) this.dressPeople(two);
    for (const mat of [this.m.plate, this.m.people, this.m.flowers, this.m.air, this.m.frame]) {
      const u = mat.uniforms;
      u.uTime.value = tq;
      (u.uDrift.value as number[]).splice(0, 16, ...this.drift);
      u.uMotion.value = motion;
      (u.uWind.value as THREE.Vector4[]).forEach((w, i) => w.copy(this.wind[i]));
      u.uDusk.value = this.art.grade ? dusk : 0;
      if (o.tap) (u.uTap.value as THREE.Vector4).copy(o.tap);
      else (u.uTap.value as THREE.Vector4).set(0, 0, 0, 0);
    }
    const pu = this.m.plate.uniforms;
    // The real dusk sky arrives in the gap as the evening comes (weather, not a cross-dissolve).
    pu.uDuskSky.value = this.art.sky ? smooth(0.35, 0.95, dusk) : 0;
    const after = this.art.after && val('scene.after', 0) >= 0.5 ? 1 : 0;
    pu.uAfter.value = after;
    this.m.flowers.uniforms.uAfter.value = after;
    this.m.air.uniforms.uAfter.value = after;
    // The sky drifts right (the clouds layer's own width: its margin plus the gap's).
    if (this.art.clouds) {
      const c = this.art.clouds;
      const width = (c.box[2] * this.art.size[0]) / (1 - c.pad);
      // (From when the painting comes alive: `scene.life` rises over 5.5–7 s.)
      const alive = Math.max(0, tq - this.spec.alive);
      (pu.uCloud.value as THREE.Vector2).y = ((after ? DRIFT.after : DRIFT.day) * alive * (this.reduced ? 0.5 : 1)) / width;
    }
    (pu.uParallax.value as THREE.Vector2).copy(o.parallax);
    if (two) {
      // The two of them close, the camera locked (its frame the screen's: `aspect`), over the
      // ground round them; nothing else of the wide.
      this.frameStage(...(this.band ?? this.bandFor(o.aspect ?? WIDE)));
    }
    if (this.people) this.pose(tq, val);
    // The two-shot shows them over their ground alone; the wide shows everything else.
    this.frame.visible = two;
    if (two) {
      for (const o of this.wide) o.visible = o === this.people && (val('scene.people', 1) > 0.001);
      const fu = this.m.frame.uniforms;
      fu.uFrame.value = this.art.near!.ground;
      fu.uMaps.value = this.stir;
      const [, , gw, gh] = this.art.near!.groundBox;
      (fu.uPx.value as THREE.Vector2).set(1 / gw, 1 / gh);
    } else {
      for (const o of this.wide) if (o !== this.people) o.visible = true;
    }
    // The view: an orthographic window onto the painting's uv.
    const c = this.camera;
    c.left = o.view.x;
    c.right = o.view.x + o.view.z;
    c.bottom = o.view.y;
    c.top = o.view.y + o.view.w;
    c.updateProjectionMatrix();
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, c);
    renderer.setRenderTarget(prev);
    return true;
  }

  /**
   * Which shot is on now (chosen before `update`, so the view frames it from its first frame):
   * the timeline's, except that the two-shot is only for someone inside (seen on the wall it is
   * the wide), gives way to the wide while they turn from it, and is the wide if it couldn't be
   * had or the screen can't frame it (`aspect`, width over height: `near.aspect`): never a wait,
   * never a face shrunk onto the wall or cut by the screen's edge. `turn` is how far they have
   * turned (radians), `t` the memory's time, `now` the room's (seconds; default `t`).
   *
   * The two-shot comes back once they have settled facing it again (under SETTLE for RETURN s), on
   * a new drawing (any frame, if the memory's time is held), never within half a second of
   * something they do (`near.beats`) nor in its last two seconds: turning away gives distance,
   * turning back closeness (the interaction designer's review, 2026-10-18: one glance cost the
   * whole heart). Everything they do is drawn in both shots.
   */
  choose(v: Values, o: { inside: boolean; turn: number; t: number; now?: number; aspect?: number }): number {
    const sp = this.spec.near, aspect = o.aspect ?? WIDE;
    // (On, it holds through a browser's bars coming and going: a little either side of its aspects.)
    const on = this.shot === 1, m = on ? 0.1 : 0;
    const near = this.hasNear && !!sp && aspect >= sp.aspect[0] - m && aspect <= sp.aspect[1] + m;
    const now = o.now ?? o.t;
    const asked = Math.max(0, Math.min(1, Math.round(v['scene.shot'] ?? 0)));
    if (asked !== this.asked) this.asked = asked, (this.gaveWay = false), (this.settled = -1);
    const drawing = Math.floor(o.t * FPS);
    const fresh = drawing !== this.lastDrawing || o.t === this.lastT;
    if (asked > 0 && o.inside) {
      if (o.turn > GIVE_WAY) this.gaveWay = true, (this.settled = -1);
      else if (this.gaveWay) {
        if (o.turn > SETTLE) this.settled = -1;
        else if (this.settled < 0) this.settled = now;
        if (this.settled >= 0 && now - this.settled >= RETURN && fresh && this.mayReturn(o.t)) this.gaveWay = false;
      }
    }
    this.lastDrawing = drawing;
    this.lastT = o.t;
    const shot = this.gaveWay || !o.inside || !near ? 0 : asked;
    // Its frame is the screen's as it comes on, held while it lasts (never reframed mid-shot).
    if (shot === 1 && !on) this.band = this.bandFor(aspect);
    this.shot = shot;
    return this.shot;
  }

  /** The two-shot's frame for a screen's aspect (its band's: `near.frames`). */
  private bandFor(aspect: number): [number, number, number] {
    const fr = this.spec.near!.frames;
    return (fr.find((b) => aspect <= b.upTo) ?? fr[fr.length - 1]).frame;
  }

  /** Whether the two-shot may come back at `t`: not near a beat, not in its last two seconds. */
  private mayReturn(t: number): boolean {
    const sp = this.spec.near;
    if (!sp) return false;
    if (t > sp.span[1] - 2) return false;
    return sp.beats.every((b) => Math.abs(t - b) >= 0.5);
  }

  /** Whether the two-shot could be had (with her look drawn in the wide too: every state in both shots). */
  get hasNear(): boolean {
    return !!this.art.near && !!this.art.figures && !!this.art.heads;
  }

  /** The people at `t`: their breathing, blinks and hair (from time) and what they do (authored). */
  private pose(t: number, val: (k: string, d: number) => number): void {
    const u = this.m.people.uniforms;
    const s = this.spec;
    const life = val('scene.life', 1);
    const k = (this.reduced ? 0.5 : 1) * life;
    const ba = breath(t, s.breath.a) * k * val('figure:a.breath', 1);
    const bb = breath(t, s.breath.b) * k * val('figure:b.breath', 1);
    // (Close, the same breath and looks, less far: the rig was made for the wide, ~0.5×; at
    // 2–3× its full breath was 15 screen px: the technical artist's review, 2026-10-18.)
    const near = this.near && !!s.near;
    const deep = near ? s.near!.breath : 1;
    // Breath: the chest swells along its short axis and rises; the head and her resting hand ride it.
    const chest = (name: string, c: { swell: number; rise: number }, b: number) => {
      const i = this.slot.get(name);
      const a = i === undefined ? 0 : (u.uD.value as THREE.Vector4[])[i * 4 + 1].x;
      this.bone(name, { swell: c.swell * b, x: -Math.sin(a) * c.rise * b, y: Math.cos(a) * c.rise * b });
    };
    chest('chestA', s.chest.a, ba * deep);
    chest('chestB', s.chest.b, bb * deep);
    // Her head as the artist redrew it (`figure:b.cel`: 0 the panel's, 1 turned to him), held, in
    // either shot; while it is shown, nothing of the rig made for the panel's face moves it.
    const heads = near ? this.art.near!.heads : this.art.heads ?? null;
    const cel = heads ? Math.max(0, Math.min(heads.cells - 1, Math.round(val('figure:b.cel', 0)))) : 0;
    (u.uHeadCel.value as THREE.Vector2).set(cel >= 1 ? cel - 1 : -1, heads?.cells ?? 1);
    const redrawn = cel >= 1;
    // Heads: a roll toward where they look (−1 left .. 1 right: rolling left is anticlockwise).
    const lookA = val('figure:a.look', 0), lookB = redrawn ? 0 : val('figure:b.look', 0);
    this.bone('headA', { turn: val('figure:a.head', 0) - s.roll * lookA, y: s.headLift * ba * deep });
    this.bone('headB', { turn: val('figure:b.head', 0) - s.roll * lookB, y: s.headLift * bb * deep });
    this.bone('faceA', { x: near ? 0 : s.face * lookA });
    this.bone('faceB', { x: near || redrawn ? 0 : s.face * lookB });
    const eyesA = val('figure:a.eyes', 0), eyesB = redrawn ? 0 : val('figure:b.eyes', 0);
    // Their eyes: in the two-shot the iris moves along each opening (the lash line stays); in the
    // wide, too small for that, the soft deformers.
    for (const e of ['eyeA1', 'eyeA2']) this.bone(e, { x: near ? 0 : s.iris * eyesA });
    for (const e of ['eyeB1', 'eyeB2']) this.bone(e, { x: near ? 0 : s.iris * eyesB });
    if (near) {
      // (Along each opening and across it, down positive as drawn: up positive for the shader.)
      (u.uGaze.value as THREE.Vector2).set(s.near!.gaze[0] * eyesA, -s.near!.gaze[1] * eyesA);
      (u.uGazeB.value as THREE.Vector2).set(s.near!.gazeB[0] * eyesB, -s.near!.gazeB[1] * eyesB);
    }
    // Hair: the loose ends answer the air (each lock its own spring), as the grass does.
    const still = val('scene.breeze', 1) * life * (this.reduced ? 0.25 : 1);
    for (const [name, h] of Object.entries(s.hair)) {
      const at = this.at.get(name);
      if (!at) continue;
      const w = windResponse(t, at.x, h.hz, h.zeta, s.gusts, still);
      this.bone(name, { x: h.amp[0] * w, y: h.amp[1] * w });
    }
    // His hand: toward hers along his forearm; once, a twitch at the wrist.
    const hand = val('figure:a.hand', 0);
    this.bone('handA', { x: s.forearmA[0] * s.handReach * hand, y: s.forearmA[1] * s.handReach * hand, turn: s.twitch * val('figure:a.fingers', 0) });
    // Her forearm: drawn back along itself (under her sleeve) at 0, where the sheet draws it at 1.
    const back = 1 - val('figure:b.hand', 1);
    this.bone('forearmB', { x: this.axis.x * s.reach.slide * back, y: this.axis.y * s.reach.slide * back, turn: s.reach.turn * back });
    // Her hand on her stomach: it rides her breath and lifts a little.
    const palm = val('figure:b.fingers', 0);
    this.bone('palmB', { x: s.palm[0] * palm, y: s.palm[1] * palm + s.chest.b.rise * 0.6 * bb * deep });
    // Her crossed foot rocks at the ankle (as much as authored).
    this.bone('footB', { turn: s.foot.turn * val('figure:b.foot', 0) * Math.sin(2 * Math.PI * s.foot.hz * t) * (this.reduced ? 0.5 : 1) });
    this.bone('shoulderB', { x: s.shoulder[0] * val('figure:b.shoulder', 0), y: s.shoulder[1] * val('figure:b.shoulder', 0) });
    const settle = val('figure:b.settle', 0);
    this.bone('settleB', { x: s.settle.move[0] * settle, y: s.settle.move[1] * settle, turn: s.settle.turn * settle });
    u.uBlinkA.value = blinkDrawing(t, s.blinks.a);
    u.uBlinkB.value = blinkDrawing(t, s.blinks.b);
    u.uColour.value = val('scene.colour', 1);
    const here = val('scene.people', 1);
    u.uPeople.value = here;
    this.people!.visible = here > 0.001;
  }

  /** Let everything go (the borrowed materials stay; they are the room's). Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.target.dispose();
    this.quad.dispose();
    this.grid?.dispose();
    this.strips?.dispose();
    this.air.dispose();
    for (const mat of [this.m.plate, this.m.people, this.m.flowers, this.m.air, this.m.frame]) {
      for (const k of ['uPlate', 'uAfterPlate', 'uMaps', 'uGrade', 'uSky', 'uFigures', 'uLids', 'uFlowers', 'uSkyMask', 'uClouds', 'uCloudsAfter', 'uFrame', 'uHeads']) mat.uniforms[k].value = this.m.empty;
      mat.uniforms.uHeadCel.value.set(-1, 1);
      mat.uniforms.uAfter.value = 0;
    }
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
