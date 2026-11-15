import * as THREE from 'three';
import type { WindowLayer } from '../core/memoryLayers';
import { FRAG, SLOTS, VERT, kelvin, noiseTexture } from './memoryWindowShader';

/** Furthest a layer may shift, metres: a breath of depth in the plaster, not a hole in it. */
const MAX_SHIFT = 0.02;
/** How strongly a living memory's painting sinks into the plaster (cinematic review, 2026-10-17). */
const SUNK = 0.72;
/** How far a living painting (drawn in order, or its revisit) is lifted toward the plaster (the
 *  skeptic's third review): rendered on the wall, the afternoon's median 0.45 of the bare plaster's,
 *  linear (from about 0.34); image 3's, measured the same way, 0.42–0.53 by which plaster it is set
 *  against. */
const LIFT = 0.35;

/**
 * A living memory, in the plaster (docs/memories.md).
 *
 * Not a picture laid over the wall: the painting is applied the way light is, into what has already
 * been drawn. Pigment multiplies the lit plaster (its mottle, its relief, the chair's shadow, the
 * room's dims all come through), and the memory's own light brightens it in proportion, as the
 * kitchen-light memory does. In one blend:
 *
 *   out = dst × (cover × pigment / plaster + (1 − cover)) + dst × light
 *
 * so where nothing is painted the wall is untouched, and a memory in a dimmed room is dimmed with
 * it. It is drawn under the handwriting (renderOrder 1; ink is 2), so the line always reads on top.
 *
 * Six fixed layer slots, premultiplied sRGB (composited in sRGB, as the painter and the artist's
 * tools do, then turned into linear light once). A layer is pigment, light (added, never painted),
 * or the graphite underdrawing, which the light finds first. The mask is the shape of the memory's
 * light, a pool, softened by noise; the words keep a reserve of bare plaster round them.
 *
 * Nothing here compiles after boot: one material, no defines, dummy textures until art arrives.
 */
export class MemoryWindow {
  readonly mesh: THREE.Mesh;
  private readonly dummy: THREE.DataTexture;
  private readonly u: Record<string, THREE.IUniform>;
  private layers: WindowLayer[] = [];
  /** The painting's proportions (width / height), and the band at its top kept for the words. */
  private aspect = 1.5;
  private band = 0.17;
  private fixed: { cx: number; cy: number; w: number } | null = null;
  /** Drawings on the wall to keep clear of (group metres). */
  avoid: { x: number; y: number; w: number; h: number }[] = [];
  /**
   * A living memory (docs/reviews/2026-10-woodland.md): the painting is `size` metres on the wall
   * and fixed there; the quad shows `crop` of it round the line, then (`spread` 0..1) the whole.
   */
  private living: { crop: [number, number, number, number]; size: [number, number]; order?: THREE.Texture | null } | null = null;
  spread = 0;
  /** Where the whole painting is on its wall (group metres), as last placed. */
  readonly painting = { cx: 0, cy: 0, w: 0, h: 0 };
  /** Where the painting is on its wall now (group metres), and its scale from painting metres. */
  private at = { cx: 0, cy: 0, scale: 1 };
  private eye = new THREE.Vector3();
  private eyeReady = false;
  private readonly tmp = new THREE.Vector3();
  private kelvinAt = -1;
  private readonly kelvinRgb = new THREE.Vector3();
  private placed: { group: THREE.Object3D; x: number; y: number; w: number; h: number; minX: number; maxX: number; minY: number; maxY: number } | null = null;

  constructor() {
    this.dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.dummy.needsUpdate = true;
    this.u = {
      uL0: { value: this.dummy },
      uL1: { value: this.dummy },
      uL2: { value: this.dummy },
      uL3: { value: this.dummy },
      uL4: { value: this.dummy },
      uL5: { value: this.dummy },
      uNoise: { value: noiseTexture() },
      uOpacity: { value: new Array(SLOTS).fill(0) },
      uKind: { value: new Array(SLOTS).fill(0) },
      uShift: { value: Array.from({ length: SLOTS }, () => new THREE.Vector2()) },
      uSkew: { value: new Array(SLOTS).fill(0) },
      uCount: { value: 0 },
      uSize: { value: new THREE.Vector2(0.9, 0.6) },
      uNominal: { value: new THREE.Vector2(0.9, 0.6) },
      // Linear (236, 234, 228): the plaster the painting is relative to.
      uPlaster: { value: 0.84 },
      uReveal: { value: 0 },
      uSketch: { value: 0 },
      uPresence: { value: 0 },
      uStylize: { value: 1 },
      uLight: { value: new THREE.Vector3() },
      uPool: { value: new THREE.Vector4(0, 0, 0.5, 0.1) },
      uReserve: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSeed: { value: 0 },
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
      uView0: { value: new THREE.Vector4(0, 0, 1, 1) },
      uOpen: { value: 0 },
      uOrder: { value: this.dummy },
      uOrdered: { value: 0 },
      uSoftReserve: { value: 0 },
      uSunk: { value: 1 },
      uLift: { value: 0 },
      uUnder: { value: 0 },
      uFeather: { value: 0 },
      uBand: { value: new THREE.Vector4(0, 0.5, 0, 0) },
      uBandY: { value: 0 },
      uFound: { value: 0 },
      uDark: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      // out = src.rgb × dst + dst × src.a (see the shader); the alpha channel is left alone.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.mesh.renderOrder = 1;
    this.mesh.name = 'memory-window';
    // Visible and neutral (cover 0, light 0 leaves the wall exactly as it is), so the boot
    // compile and the first frame draw it once for real.
    this.mesh.visible = true;
  }

  /** The textures a memory brings, in slot order (back to front). Fewer than six is fine. */
  /**
   * `size`: the painting's own size (m); `band`: how much of its top (painting metres) is kept
   * for the words, which are written across it on bare plaster.
   */
  setLayers(layers: WindowLayer[], size: [number, number] = [0.9, 0.6], band = 0.17): void {
    this.layers = layers.slice(0, SLOTS);
    this.band = band;
    this.aspect = size[0] / size[1];
    (this.u.uNominal.value as THREE.Vector2).set(size[0], size[1]);
    const keys = ['uL0', 'uL1', 'uL2', 'uL3', 'uL4', 'uL5'];
    const kinds = this.u.uKind.value as number[];
    for (let i = 0; i < SLOTS; i++) {
      const l = this.layers[i];
      this.u[keys[i]].value = l ? l.texture : this.dummy;
      kinds[i] = !l ? 0 : l.kind === 'light' ? 1 : l.kind === 'sketch' ? 2 : l.kind === 'shade' ? 3 : 0;
    }
    this.u.uCount.value = this.layers.length;
  }

  /**
   * A living memory's painting: its size on the wall and the part shown first; null for any other.
   * `under`: a living memory's revisit, a painting on the wall as any other, but sunk and lifted in
   * the plaster as its scene was, and lying under its words, which are washed (src/app/livingMemory.ts): without,
   * its words' bare plaster took the top half of it, and at full strength the dusk was a black stain.
   */
  setLiving(o: { crop: [number, number, number, number]; size: [number, number]; order?: THREE.Texture | null; feather?: number } | null, under = false): void {
    this.living = o;
    this.u.uFeather.value = o?.feather ?? 0;
    this.spread = 0;
    this.u.uSoftReserve.value = o ? 1 : 0;
    this.u.uSunk.value = o || under ? SUNK : 1;
    this.u.uUnder.value = !o && under ? 1 : 0;
    // (The revisit is the same pigment in the same plaster: lifted as well. Its dusk stays darker
    // than the afternoon, as its own colours are: QA, 2026-10-18.)
    this.u.uLift.value = o?.order || (!o && under) ? LIFT : 0;
    this.u.uOrder.value = o?.order ?? this.dummy;
    this.u.uOrdered.value = o?.order ? 1 : 0;
    if (!o) {
      (this.u.uCrop.value as THREE.Vector4).set(0, 0, 1, 1);
      this.u.uOpen.value = 0;
    }
  }

  /** The part of the painting the first layer holds (a living scene draws only what is seen). */
  setView(v: THREE.Vector4): void {
    (this.u.uView0.value as THREE.Vector4).copy(v);
  }

  /** Where the painting is on its wall now (centre and size, in its writing group's metres). */
  get rect(): { cx: number; cy: number; w: number; h: number } {
    return this.living ? this.painting : { cx: this.mesh.position.x, cy: this.mesh.position.y, w: this.mesh.scale.x, h: this.mesh.scale.y };
  }

  /** The tiling noise its mask uses (shared: the living scene and the immersion use it too). */
  get noise(): THREE.Texture {
    return this.u.uNoise.value as THREE.Texture;
  }

  /** Let the memory's textures go (the caller disposes them); back to the neutral dummy. */
  private clearLayers(): void {
    this.setLiving(null);
    this.setBand(null);
    this.u.uDark.value = 1;
    (this.u.uView0.value as THREE.Vector4).set(0, 0, 1, 1);
    this.setLayers([]);
    this.u.uPresence.value = 0;
    this.u.uLight.value.set(0, 0, 0);
  }

  /** Put the window on the wall where its line is written (a WallText anchor). */
  /**
   * `fixed`: where the painting goes when it opens from something already on the wall (the door
   * opens from the room's drawn door): its centre and width, in the group's metres. Otherwise it
   * is placed round its line.
   */
  place(a: { group: THREE.Object3D; x: number; y: number; w: number; h: number; minX: number; maxX: number; minY: number; maxY: number }, seed: number, fixed: { cx: number; cy: number; w: number } | null = null): void {
    this.placed = a;
    this.fixed = fixed;
    this.mesh.visible = true;
    if (this.mesh.parent !== a.group) a.group.add(this.mesh);
    this.u.uSeed.value = (seed % 997) / 997;
    this.eyeReady = false;
  }

  get isPlaced(): boolean {
    return this.placed !== null;
  }

  /**
   * One frame of a playing memory. `final` is the controller's composed frame; `eye` is the
   * visitor's eye without its walking bob (parallax must not swim with each step).
   */
  update(final: Record<string, number>, eye: THREE.Vector3, dt: number): void {
    const a = this.placed;
    if (!a) return;
    const v = (k: string, d: number) => (k in final ? final[k] : d);
    const L = this.living;
    // About as wide as the words (never a panorama, never a postage stamp), its top just above
    // them: the line is written across the painting's pale upper band, the scene lies below it.
    // (A living memory's first part is as wide as its crop of the painting.)
    const w = L ? L.size[0] * L.crop[2] : this.fixed ? this.fixed.w : THREE.MathUtils.clamp(a.w * 0.95, 0.8, 1.3) * v('window.scale', 1);
    const h = L ? L.size[1] * L.crop[3] : w / this.aspect;
    let cx = a.x + v('window.offsetX', 0);
    // The words sit in the band at the painting's top (never down in the scene): its top is just
    // above them, or higher if they wrap onto more lines than the band holds.
    const scale = w / (this.u.uNominal.value as THREE.Vector2).x;
    const top = Math.max(a.y + a.h / 2 + 0.03, a.y - a.h / 2 + this.band * scale);
    // A line written low on the wall has no room below it: the painting goes above the words
    // instead, its foot just over them, like a picture over its caption.
    const below = top - h >= a.minY;
    let cy = (below ? top - h / 2 : a.y + a.h / 2 + 0.02 + h / 2) + v('window.offsetY', 0);
    if (this.fixed) {
      cx = this.fixed.cx;
      cy = this.fixed.cy;
    }
    // Step sideways off any drawing it would cover: the nearer side that clears it inside the
    // wall, else the other.
    cx = THREE.MathUtils.clamp(cx, a.minX + w / 2, a.maxX - w / 2);
    const covers = (x: number, d: { x: number; y: number; w: number; h: number }) => Math.abs(d.y - cy) < (d.h + h) / 2 && Math.abs(d.x - x) < (d.w + w) / 2;
    for (const d of this.avoid) {
      if (!covers(cx, d)) continue;
      const sides = [d.x - (d.w + w) / 2 - 0.02, d.x + (d.w + w) / 2 + 0.02]
        .map((x) => THREE.MathUtils.clamp(x, a.minX + w / 2, a.maxX - w / 2))
        .filter((x) => !covers(x, d))
        .sort((p, q) => Math.abs(p - cx) - Math.abs(q - cx));
      if (sides.length) cx = sides[0];
    }
    cx = THREE.MathUtils.clamp(cx, a.minX + w / 2, a.maxX - w / 2);
    cy = THREE.MathUtils.clamp(cy, a.minY + h / 2, a.maxY - h / 2);
    if (L) {
      this.placeLiving(L, a, cx, cy);
      this.reveal(final, v);
      return;
    }
    this.mesh.position.set(cx, cy, 0.004);
    this.at.cx = cx;
    this.at.cy = cy;
    this.at.scale = scale;
    this.mesh.scale.set(w, h, 1);
    this.u.uSize.value.set(w, h);
    this.u.uReserve.value.set(a.x - cx, a.y - cy, a.w / 2 + 0.02, a.h / 2 + 0.015);
    this.u.uReveal.value = v('window.reveal', 0) * 1.25;
    this.u.uSketch.value = v('window.sketch', 0) * 1.25;
    this.u.uPresence.value = v('window.presence', 1);
    this.u.uPool.value.set(v('light.x', 0), v('light.y', 0), v('light.radius', 0.45), v('light.soft', 0.12));
    const k = Math.round(v('light.warmth', 3000) / 25) * 25;
    if (k !== this.kelvinAt) {
      this.kelvinAt = k;
      this.kelvinRgb.copy(kelvin(k));
    }
    this.u.uLight.value.copy(this.kelvinRgb).multiplyScalar(v('light.intensity', 0));

    // Parallax from a smoothed, un-bobbed eye, in the window's own frame: millimetres to two
    // centimetres, soft-clamped, fading out at grazing angles.
    if (!this.eyeReady) {
      this.eye.copy(eye);
      this.eyeReady = true;
    } else this.eye.lerp(eye, 1 - Math.exp(-dt / 0.6));
    const local = this.mesh.worldToLocal(this.tmp.copy(this.eye));
    // worldToLocal includes the mesh's scale; undo it to get metres.
    const lx = local.x * w, ly = local.y * h, lz = Math.max(0.3, local.z);
    const grazing = 1 - THREE.MathUtils.smoothstep(Math.atan2(Math.hypot(lx, ly), lz), 0.7, 1.05);
    const amount = v('window.parallax', 1) * grazing;
    const opac = this.u.uOpacity.value as number[];
    const shift = this.u.uShift.value as THREE.Vector2[];
    const skew = this.u.uSkew.value as number[];
    for (let i = 0; i < SLOTS; i++) {
      const l = this.layers[i];
      if (!l) {
        opac[i] = 0;
        shift[i].set(0, 0);
        skew[i] = 0;
        continue;
      }
      const k = `layer:${l.name}.`;
      opac[i] = v(k + 'opacity', 1);
      const depth = v(k + 'depth', 0);
      const sx = MAX_SHIFT * Math.tanh(((lx / lz) * depth * amount) / MAX_SHIFT);
      const sy = MAX_SHIFT * Math.tanh(((ly / lz) * depth * amount) / MAX_SHIFT);
      // A layer seen from the right shows more of its left: shift its sampling toward the eye.
      shift[i].set((sx - v(k + 'x', 0)) / w, (sy - v(k + 'y', 0)) / h);
      // (Authored in the painting's own metres at its bottom edge.)
      skew[i] = -(v(k + 'skew', 0) * scale) / w;
    }
  }

  /**
   * A living memory: the whole painting fixed on the wall (its crop where a window would be,
   * the rest round it, kept inside the wall), and the quad showing the crop → the whole as it
   * spreads. One drawn in order shows the whole of it from the start: its order is its edge (the
   * pencil out from the words, the colour as a wash), never a straight one.
   */
  private placeLiving(L: { crop: [number, number, number, number]; size: [number, number]; order?: THREE.Texture | null }, a: NonNullable<MemoryWindow['placed']>, cx: number, cy: number): void {
    const [W, H] = L.size;
    const [u0, v0, du, dv] = L.crop;
    let px = cx - (u0 + du / 2 - 0.5) * W;
    let py = cy - (v0 + dv / 2 - 0.5) * H;
    // The whole painting stays on its wall.
    const keep = (p: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : THREE.MathUtils.clamp(p, lo, hi));
    px = keep(px, a.minX + W / 2, a.maxX - W / 2);
    py = keep(py, a.minY + H / 2, a.maxY - H / 2);
    this.painting.cx = px;
    this.painting.cy = py;
    this.painting.w = W;
    this.painting.h = H;
    const s = L.order ? 1 : THREE.MathUtils.clamp(this.spread, 0, 1);
    const k = s * s * (3 - 2 * s);
    const rx = u0 * (1 - k), ry = v0 * (1 - k), rw = du + (1 - du) * k, rh = dv + (1 - dv) * k;
    const mx = px + (rx + rw / 2 - 0.5) * W, my = py + (ry + rh / 2 - 0.5) * H;
    this.mesh.position.set(mx, my, 0.004);
    this.mesh.scale.set(rw * W, rh * H, 1);
    this.u.uSize.value.set(rw * W, rh * H);
    (this.u.uCrop.value as THREE.Vector4).set(rx, ry, rw, rh);
    (this.u.uNominal.value as THREE.Vector2).set(W, H);
    this.u.uOpen.value = k;
    this.u.uReserve.value.set(a.x - mx, a.y - my, a.w / 2 + 0.02, a.h / 2 + 0.015);
    this.at.cx = px;
    this.at.cy = py;
    this.at.scale = 1;
  }

  /**
   * Light passing across its wall (The Drive Home): the band's centre (its writing group's metres),
   * half width and shear, and its strength; the wall's middle height there. null: none.
   */
  setBand(b: { x: number; half: number; shear: number; amount: number; midY: number } | null): void {
    const u = this.u.uBand.value as THREE.Vector4;
    if (!b) {
      u.w = 0;
      return;
    }
    u.set(b.x - this.mesh.position.x, b.half, b.shear, b.amount);
    this.u.uBandY.value = b.midY - this.mesh.position.y;
  }

  /** The light and the layers of a living memory (no parallax: its scene draws its own depth). */
  private reveal(final: Record<string, number>, v: (k: string, d: number) => number): void {
    this.u.uFound.value = v('window.found', 0);
    this.u.uDark.value = this.u.uOrdered.value > 0.5 ? v('window.dark', 1) : 1;
    this.u.uReveal.value = v('window.reveal', 0) * 1.25;
    this.u.uSketch.value = v('window.sketch', 0) * 1.25;
    this.u.uPresence.value = v('window.presence', 1);
    this.u.uPool.value.set(v('light.x', 0), v('light.y', 0), v('light.radius', 0.45), v('light.soft', 0.12));
    const k = Math.round(v('light.warmth', 3000) / 25) * 25;
    if (k !== this.kelvinAt) {
      this.kelvinAt = k;
      this.kelvinRgb.copy(kelvin(k));
    }
    this.u.uLight.value.copy(this.kelvinRgb).multiplyScalar(v('light.intensity', 0));
    const opac = this.u.uOpacity.value as number[];
    const shift = this.u.uShift.value as THREE.Vector2[];
    const skew = this.u.uSkew.value as number[];
    for (let i = 0; i < SLOTS; i++) {
      const l = this.layers[i];
      opac[i] = l ? v(`layer:${l.name}.opacity`, 1) : 0;
      shift[i].set(0, 0);
      skew[i] = 0;
    }
    void final;
  }

  /** The editor's comparison: 1 = as in the room, 0 = the layers as baked. */
  set stylize(s: number) {
    this.u.uStylize.value = s;
  }
  get stylize(): number {
    return this.u.uStylize.value as number;
  }

  /** The memory has ended: neutral again, off the wall's group. */
  /** A point of the painting (its own metres, from its centre) on its wall (the group's metres). */
  toWall(x: number, y: number): { x: number; y: number; scale: number } {
    return { x: this.at.cx + x * this.at.scale, y: this.at.cy + y * this.at.scale, scale: this.at.scale };
  }

  release(): void {
    this.clearLayers();
    this.placed = null;
    // Not drawn at all between memories (it was drawn neutral once at boot, to compile).
    this.mesh.visible = false;
  }
}
