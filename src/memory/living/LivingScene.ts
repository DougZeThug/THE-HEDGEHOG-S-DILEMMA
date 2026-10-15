import * as THREE from 'three';
import { livingCamera, livingMaterials, livingTarget, type LivingMaterials } from '../../world/living/materials';
import { blink, breath, gust } from './performance';
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
 * on the screen, the push in) moves at the screen's rate.
 */

export interface FigureArt {
  texture: THREE.Texture;
  lids: THREE.Texture;
  sketch: THREE.Texture;
  /** Where they lie on the painting: x0, y0, w, h (painting uv, y up). */
  place: [number, number, number, number];
  pixels: [number, number];
  split: number;
  anatomy: Record<string, { c?: [number, number]; r?: [number, number]; angle?: number; pivot?: [number, number]; elbow?: [number, number]; hand?: [number, number]; radius?: number }>;
}

export interface LivingArt {
  plate: THREE.Texture;
  maps: THREE.Texture;
  grade: THREE.Texture | null;
  /** The same composition later, nobody there (the cut, `scene.after`). */
  after: THREE.Texture | null;
  sky: { texture: THREE.Texture; box: [number, number, number, number] } | null;
  figures: FigureArt | null;
  /** The plate's pixels. */
  size: [number, number];
}

/** The anatomy's sheet (its numbers are fractions of this; figure uv × this = sheet pixels, y up). */
const SHEET = new THREE.Vector2(1448, 505);
const FPS = 12;

export class LivingScene {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = livingCamera();
  private readonly m: LivingMaterials;
  private readonly quad: THREE.PlaneGeometry;
  private readonly grid: THREE.PlaneGeometry | null;
  private readonly people: THREE.Mesh | null;
  private drawnAt = -1;
  private readonly lastView = new THREE.Vector4(-1, -1, -1, -1);
  private readonly lastParallax = new THREE.Vector2(9, 9);
  /** What is there (people, the cut): a change is drawn on its own frame, not the next drawing. */
  private lastState = '';
  private disposed = false;
  /** The part of the painting drawn now (x0, y0, w, h in painting uv). */
  readonly view = new THREE.Vector4(0, 0, 1, 1);

  constructor(
    private readonly art: LivingArt,
    private readonly spec: LivingSpec,
    o: { width: number; height: number; noise: THREE.Texture; reduced: boolean },
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
    this.reduced = o.reduced;
    const f = art.figures;
    if (f) {
      this.grid = new THREE.PlaneGeometry(1, 1, 120, 48);
      this.grid.translate(0.5, 0.5, 0);
      this.people = new THREE.Mesh(this.grid, this.m.people);
      this.people.frustumCulled = false;
      this.people.renderOrder = 1;
      this.scene.add(this.people);
      const u = this.m.people.uniforms;
      u.uFigures.value = f.texture;
      u.uLids.value = f.lids;
      u.uFSketch.value = f.sketch;
      u.uGrade.value = art.grade ?? this.m.empty;
      u.uMaps.value = art.maps;
      u.uMotion.value = o.reduced ? 0.25 : 1;
      (u.uPlace.value as THREE.Vector4).set(...f.place);
      (u.uFigPx.value as THREE.Vector2).set(1 / f.pixels[0], 1 / f.pixels[1]);
      (u.uSheet.value as THREE.Vector2).copy(SHEET);
      u.uSplit.value = f.split;
      this.setAnatomy(f);
    } else {
      this.grid = null;
      this.people = null;
    }
  }
  private readonly reduced: boolean;

  private setAnatomy(f: FigureArt): void {
    const u = this.m.people.uniforms;
    const A = f.anatomy;
    const px = (p: [number, number] | undefined) => new THREE.Vector2((p?.[0] ?? 0) * SHEET.x, (p?.[1] ?? 0) * SHEET.y);
    const E = u.uE.value as THREE.Vector4[];
    const EA = u.uEA.value as number[];
    const EE = u.uEE.value as number[];
    const ells: [string, number][] = [['chestA', 0.6], ['chestB', 0.6], ['headA', 0.45], ['headB', 0.45], ['shoulderB', 0.7], ['settleB', 0.7], ['hairA', 0.6], ['hairB', 0.6]];
    ells.forEach(([k, edge], i) => {
      const a = A[k];
      const c = px(a?.c);
      E[i].set(c.x, c.y, (a?.r?.[0] ?? 0) * SHEET.x || 1, (a?.r?.[1] ?? 0) * SHEET.y || 1);
      EA[i] = a?.angle ?? 0;
      EE[i] = a ? edge : 0;
      if (!a) E[i].set(-1e4, -1e4, 1, 1);
    });
    const L = u.uL.value as THREE.Vector4[];
    const LR = u.uLR.value as THREE.Vector2[];
    (['handA', 'handB'] as const).forEach((k, i) => {
      const a = A[k];
      const e = px(a?.elbow), h = px(a?.hand);
      L[i].set(e.x, e.y, h.x, h.y);
      const r = (a?.radius ?? 0) * SHEET.y;
      LR[i].set(r, r * 1.15);
    });
    const P = u.uPivot.value as THREE.Vector2[];
    const SA = u.uSwellA.value as number[];
    P[0].copy(px(A.chestA?.c));
    SA[0] = A.chestA?.angle ?? 0;
    P[1].copy(px(A.chestB?.c));
    SA[1] = A.chestB?.angle ?? 0;
    P[2].copy(px(A.handB?.elbow));
    P[3].copy(px(A.headA?.pivot));
    P[4].copy(px(A.headB?.pivot));
    P[5].copy(px(A.shoulderB?.c));
    P[6].copy(px(A.handA?.elbow));
    P[7].copy(px(A.settleB?.c));
    this.forearmA.copy(px(A.handA?.hand)).sub(px(A.handA?.elbow)).normalize();
  }
  private readonly forearmA = new THREE.Vector2();

  /**
   * One frame: the memory's time `t` (its sequence position while living) and composed values.
   * `view` is the part of the painting to draw (what is on the screen); `parallax` the visitor's
   * small looks (painting uv at depth 1). Returns whether it drew.
   */
  update(renderer: THREE.WebGLRenderer, t: number, v: Values, o: { view: THREE.Vector4; parallax: THREE.Vector2; mips: boolean; tap?: THREE.Vector4 }): boolean {
    if (this.disposed) return false;
    const tq = Math.floor(t * FPS) / FPS;
    const viewMoved = !this.lastView.equals(o.view);
    const lookMoved = this.lastParallax.distanceToSquared(o.parallax) > 1e-10;
    const tapping = !!o.tap && o.tap.w > 0 && o.tap.z < 2;
    const state = `${(v['scene.after'] ?? 0) >= 0.5 ? 1 : 0}|${(v['scene.people'] ?? 1) > 0.001 ? 1 : 0}`;
    if (tq === this.drawnAt && !viewMoved && !lookMoved && !tapping && state === this.lastState) return false;
    this.lastState = state;
    this.drawnAt = tq;
    this.lastView.copy(o.view);
    this.lastParallax.copy(o.parallax);
    this.view.copy(o.view);
    const val = (k: string, d: number) => (k in v ? v[k] : d);
    const g = gust(tq, this.spec.gusts);
    const dusk = val('scene.dusk', 0);
    // Still as a painting until it begins to live; the air can die down (the breeze).
    const motion = (this.reduced ? 0.25 : 1) * val('scene.life', 1) * val('scene.breeze', 1);
    for (const mat of [this.m.plate, this.m.people]) {
      const u = mat.uniforms;
      u.uTime.value = tq;
      u.uMotion.value = motion;
      (u.uGust.value as THREE.Vector2).set(g.strength, g.front);
      u.uDusk.value = this.art.grade ? dusk : 0;
      if (o.tap) (u.uTap.value as THREE.Vector4).copy(o.tap);
      else (u.uTap.value as THREE.Vector4).set(0, 0, 0, 0);
    }
    const pu = this.m.plate.uniforms;
    // The real dusk sky arrives in the gap as the evening comes (weather, not a cross-dissolve).
    pu.uDuskSky.value = this.art.sky ? smooth(0.35, 0.95, dusk) : 0;
    pu.uAfter.value = this.art.after && val('scene.after', 0) >= 0.5 ? 1 : 0;
    (pu.uParallax.value as THREE.Vector2).copy(o.parallax);
    if (this.people) this.pose(tq, val);
    // The view: an orthographic window onto the painting's uv.
    const c = this.camera;
    c.left = o.view.x;
    c.right = o.view.x + o.view.z;
    c.bottom = o.view.y;
    c.top = o.view.y + o.view.w;
    c.updateProjectionMatrix();
    this.target.texture.generateMipmaps = o.mips;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, c);
    renderer.setRenderTarget(prev);
    return true;
  }

  /** The people at `t`: their breathing and blinks (from time) and what they do (authored). */
  private pose(t: number, val: (k: string, d: number) => number): void {
    const u = this.m.people.uniforms;
    const s = this.spec;
    const k = (this.reduced ? 0.5 : 1) * val('scene.life', 1);
    const turn = u.uTurn.value as number[];
    const swell = u.uSwell.value as number[];
    const move = u.uMove.value as THREE.Vector2[];
    swell[0] = breath(t, s.breath.a) * s.swell * k * val('figure:a.breath', 1);
    swell[1] = breath(t, s.breath.b) * s.swell * k * val('figure:b.breath', 1);
    // B's hand: drawn back at 0, where the sheet draws it (a finger's width short of his) at 1.
    turn[2] = (1 - val('figure:b.hand', 1)) * s.handBack;
    turn[3] = val('figure:a.head', 0);
    turn[4] = val('figure:b.head', 0);
    move[5].set(s.shoulder[0], s.shoulder[1]).multiplyScalar(val('figure:b.shoulder', 0));
    // A's hand comes toward hers along his forearm.
    move[6].copy(this.forearmA).multiplyScalar(s.handReach * val('figure:a.hand', 0));
    const settle = val('figure:b.settle', 0);
    move[7].set(s.settle.move[0], s.settle.move[1]).multiplyScalar(settle);
    turn[7] = s.settle.turn * settle;
    u.uBlinkA.value = blink(t, s.blinks.a);
    u.uBlinkB.value = blink(t, s.blinks.b);
    u.uHair.value = gust(t, s.gusts).strength * (this.reduced ? 0 : 1);
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
    for (const mat of [this.m.plate, this.m.people]) {
      for (const k of ['uPlate', 'uAfterPlate', 'uMaps', 'uGrade', 'uSky', 'uFigures', 'uLids', 'uFSketch']) mat.uniforms[k].value = this.m.empty;
      mat.uniforms.uAfter.value = 0;
    }
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
