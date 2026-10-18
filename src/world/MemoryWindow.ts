import * as THREE from 'three';
import type { Values } from '../memory/types';

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
export type LayerKind = 'pigment' | 'light' | 'sketch' | 'shade';

export interface WindowLayer {
  name: string;
  kind: LayerKind;
  texture: THREE.Texture;
}

export const SLOTS = 6;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uL0, uL1, uL2, uL3, uL4, uL5, uNoise;
  uniform float uOpacity[${SLOTS}];
  uniform float uKind[${SLOTS}];   // 0 pigment, 1 light, 2 sketch, 3 shade (a shadow in the light)
  uniform vec2 uShift[${SLOTS}];   // parallax and layer offset, in uv
  uniform float uSkew[${SLOTS}];   // a hanging layer's sway: none at the top (its rod), most at the bottom, in uv
  uniform int uCount;
  uniform vec2 uSize;              // metres
  uniform vec2 uNominal;           // the painting's own size (m), in which its light is authored
  uniform float uPlaster;          // the lit plaster's mean, linear (what pigment is relative to)
  uniform float uReveal, uSketch, uPresence, uStylize;
  uniform vec3 uLight;             // the memory's light colour × intensity, linear
  uniform vec4 uPool;              // light pool: centre (m), radius (m), softness (m)
  uniform vec4 uReserve;           // the words: centre (m), half size (m)
  uniform float uSeed;
  // A living memory: the part of the painting this quad shows (painting uv, as it spreads), the
  // part its first layer (the living scene's render target) holds, and how far it is open.
  uniform vec4 uCrop;
  uniform vec4 uView0;
  uniform float uOpen;
  uniform float uSoftReserve;
  // A living memory drawn stroke by stroke (scripts/stroke-order.py): when each line is drawn (r)
  // and when the colour reaches each point (g), against the sketch's and the reveal's progress.
  uniform sampler2D uOrder;
  uniform float uOrdered;
  // How strongly a living memory's pigment sinks into the plaster (a faded fresco, never a hole:
  // the dusk painting multiplied in at full strength is a black stain).
  uniform float uSunk;
  // How far a living painting drawn in order is lifted toward the plaster (a light wash, as image
  // 3, not a dark stain), all the way at its colour's front.
  uniform float uLift;
  varying vec2 vUv;

  vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

  float shade = 1.0;
  void layer(int i, vec4 c, inout vec3 col, inout float cov, inout vec3 light, inout vec4 lead) {
    float o = uOpacity[i];
    // A shadow falls only in the light: it takes light away, never adds paint.
    if (uKind[i] > 2.5) { shade *= 1.0 - c.a * o; return; }
    // The graphite is kept apart (premultiplied), so the colour it lies over (not yet revealed)
    // never tints it; it is laid over the colour at the end, revealed by its own mask.
    if (uKind[i] > 1.5) lead = c * o + lead * (1.0 - c.a * o);
    else if (uKind[i] > 0.5) light += c.rgb * o;
    else { col = c.rgb * o + col * (1.0 - c.a * o); cov = c.a * o + cov * (1.0 - c.a * o); }
  }

  void main() {
    vec2 m = (vUv - 0.5) * uSize; // metres from the window's centre
    // Where on the painting (the whole of it, unless a living memory shows a part).
    vec2 P = uCrop.xy + vUv * uCrop.zw;
    float n = texture2D(uNoise, P * uNominal * 0.9 + uSeed).r;
    float n2 = texture2D(uNoise, P * uNominal * 3.1 - uSeed).r;

    // The pool of the memory's light: what it reaches is what is revealed. The drawing is
    // found a little ahead of the colour (the light finds the pencil first).
    vec2 mp = (P - 0.5) * uNominal;
    float d = length((mp - uPool.xy) / max(uPool.z, 1e-3)) + (n - 0.5) * 0.35 + (n2 - 0.5) * 0.12;
    float soft = uPool.w / max(uPool.z, 1e-3) + 0.05;
    float colourMask = 1.0 - smoothstep(uReveal - soft, uReveal + soft, d);
    float sketchMask = 1.0 - smoothstep(uSketch - soft, uSketch + soft, d);
    // The light's own pool (where it falls, whatever is revealed yet).
    float pool = 1.0 - smoothstep(1.0 - soft, 1.0 + soft, d);
    if (uOrdered > 0.5) {
      // Each line appears in order (out from the words); the colour follows as a wash, its edge
      // broken by the paper's grain, soft. (uSketch and uReveal run to 1.25 for the pool: 1 is all.)
      vec2 o = texture2D(uOrder, P).rg;
      sketchMask = clamp((uSketch / 1.25 - o.r) / 0.012 + 0.5, 0.0, 1.0);
      float g = o.g + (n2 - 0.5) * 0.05;
      colourMask = smoothstep(g - 0.08, g + 0.08, uReveal / 1.25);
    }
    // Opened across the plaster, the whole of it is found (its edge is the quad's ragged edge;
    // one drawn in order has its order for an edge).
    colourMask = max(colourMask, uOpen * step(0.5, uReveal) * (1.0 - uOrdered));
    sketchMask = max(sketchMask, uOpen * step(0.5, uSketch) * (1.0 - uOrdered));
    // Never to the window's edge: ragged, inside its rectangle (wider as a living one spreads:
    // a brush, not a frame). One drawn in order has its corners rounded as wide as its band (no
    // corner is ever seen: image 3 has none; the creative director's and the skeptic's reviews).
    vec2 e = min(vUv, 1.0 - vUv) * uSize;
    float band = (0.06 + 0.05 * n) * (1.0 + 0.6 * uOpen);
    float rr = band * 1.5 * uOrdered;
    float ed = (e.x < rr && e.y < rr) ? rr - length(vec2(rr) - e) : min(e.x, e.y);
    float edge = smoothstep(0.0, band, ed + (n2 - 0.5) * 0.08 * uOpen);

    vec3 col = vec3(0.0); float cov = 0.0; vec3 light = vec3(0.0); vec4 lead = vec4(0.0);
    if (uCount > 0) layer(0, texture2D(uL0, (P - uView0.xy) / uView0.zw + uShift[0] + vec2(uSkew[0] * (1.0 - P.y), 0.0)), col, cov, light, lead);
    if (uCount > 1) layer(1, texture2D(uL1, P + uShift[1] + vec2(uSkew[1] * (1.0 - P.y), 0.0)), col, cov, light, lead);
    if (uCount > 2) layer(2, texture2D(uL2, P + uShift[2] + vec2(uSkew[2] * (1.0 - P.y), 0.0)), col, cov, light, lead);
    if (uCount > 3) layer(3, texture2D(uL3, P + uShift[3] + vec2(uSkew[3] * (1.0 - P.y), 0.0)), col, cov, light, lead);
    if (uCount > 4) layer(4, texture2D(uL4, P + uShift[4] + vec2(uSkew[4] * (1.0 - P.y), 0.0)), col, cov, light, lead);
    if (uCount > 5) layer(5, texture2D(uL5, P + uShift[5] + vec2(uSkew[5] * (1.0 - P.y), 0.0)), col, cov, light, lead);

    // Unstylized (the editor's comparison): the layers as baked, with no mask, noise or reserve.
    float mask = mix(1.0, colourMask, uStylize);
    // (The light reveals as the colour does: before it, on bare plaster, it read as two pale
    // smears, not as light: the skeptic's third review.)
    float lightMask = mask;
    float smask = mix(1.0, sketchMask, uStylize);
    // Drawn in order, the colour keeps inside its ragged edge and the pencil runs on past it, to
    // the plate's edge (image 3); otherwise both keep inside it.
    float edgeAll = edge;
    if (uOrdered > 0.5) {
      mask *= edge;
      smask *= smoothstep(0.0, 0.015, ed);
      edgeAll = 1.0;
    }
    // Graphite is found by the light first; colour follows. Lead over colour, premultiplied.
    float cA = cov * mask, lA = lead.a * smask;
    vec3 premul = lead.rgb * smask + col * mask * (1.0 - lA);
    if (uLift > 0.0) {
      // (Its colour lifted toward the plaster's own lightness, all the way at the colour's front:
      // a dark multiply read as stains coming and a scorch going.)
      vec3 sc = col / max(cov, 1e-3);
      float plasterS = 1.055 * pow(uPlaster, 1.0 / 2.4) - 0.055;
      premul = lead.rgb * smask + mix(vec3(plasterS), sc, (1.0 - uLift) * smoothstep(0.0, 1.0, mask)) * cA * (1.0 - lA);
    }
    cov = lA + cA * (1.0 - lA);
    col = premul;
    float pigCov = clamp(cov, 0.0, 1.0) * edgeAll * uPresence * uSunk;

    // Bare plaster round the words, feathered over 2–3 cm with a rough edge.
    vec2 r = abs(m - uReserve.xy) - uReserve.zw;
    // (A living memory's painting keeps its words in a bloom of plaster, not a card: a wider,
    // noise-edged reserve, the painting faintly there behind them.)
    float bloom = step(0.5, uSoftReserve);
    float rd = max(r.x, r.y) + (n2 - 0.5) * mix(0.02, 0.07, bloom) + (n - 0.5) * 0.06 * bloom;
    float reserve = (1.0 - smoothstep(-0.005, mix(0.03, 0.11, bloom), rd)) * mix(1.0, 0.7, bloom);
    // (A living memory's painting, opened across the plaster, lies under its words as image 3:
    // no card of bare plaster round them.)
    pigCov *= 1.0 - mix(0.0, 0.85, reserve * uStylize * (1.0 - uOpen));

    vec3 pigment = toLinear(col / max(cov, 1e-3));
    vec3 lit = toLinear(min(light, vec3(1.0))) * shade * uLight * lightMask * edgeAll * uPresence;

    // dst × (cover × pigment / plaster + (1 − cover)) + dst × light (see the blend below).
    gl_FragColor = vec4(pigCov * pigment / uPlaster + lit, 1.0 - pigCov);
  }
`;

/** A 256² tiling value noise: one fetch instead of a hash fbm (cheaper, and no artefacts on phones). */
function noiseTexture(): THREE.DataTexture {
  const N = 256, G = 16;
  const grid = new Float32Array(G * G);
  let s = 1234567;
  for (let i = 0; i < grid.length; i++) grid[i] = ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const data = new Uint8Array(N * N * 4);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = 0, amp = 0.5, f = 1;
      for (let o = 0; o < 3; o++) {
        const gx = (x / N) * G * f, gy = (y / N) * G * f;
        const x0 = Math.floor(gx), y0 = Math.floor(gy);
        const tx = sm(gx - x0), ty = sm(gy - y0);
        const at = (i: number, j: number) => grid[((j % G) * G + (i % G)) % grid.length];
        const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
        v += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
        amp *= 0.5;
        f *= 2;
      }
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round((v / 0.875) * 255);
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** A colour temperature (K) as linear RGB, normalised to its brightest channel. */
export function kelvin(k: number): THREE.Vector3 {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = new THREE.Color(Math.min(255, Math.max(0, r)) / 255, Math.min(255, Math.max(0, g)) / 255, Math.min(255, Math.max(0, b)) / 255);
  c.convertSRGBToLinear();
  const mx = Math.max(c.r, c.g, c.b);
  return new THREE.Vector3(c.r / mx, c.g / mx, c.b / mx);
}

/** Furthest a layer may shift, metres: a breath of depth in the plaster, not a hole in it. */
const MAX_SHIFT = 0.02;
/** How strongly a living memory's painting sinks into the plaster (cinematic review, 2026-10-17). */
const SUNK = 0.72;
/** How far a living painting drawn in order is lifted toward the plaster (its median ~0.57 of the
 *  plaster's lightness, as image 3's, from ~0.34: the skeptic's third review). */
const LIFT = 0.35;

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

  /** A living memory's painting: its size on the wall and the part shown first; null for any other. */
  setLiving(o: { crop: [number, number, number, number]; size: [number, number]; order?: THREE.Texture | null } | null): void {
    this.living = o;
    this.spread = 0;
    this.u.uSoftReserve.value = o ? 1 : 0;
    this.u.uSunk.value = o ? SUNK : 1;
    this.u.uLift.value = o?.order ? LIFT : 0;
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
  clearLayers(): void {
    this.setLiving(null);
    (this.u.uView0.value as THREE.Vector4).set(0, 0, 1, 1);
    this.setLayers([]);
    this.u.uPresence.value = 0;
    this.u.uLight.value.set(0, 0, 0);
  }

  get layerNames(): string[] {
    return this.layers.map((l) => l.name);
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
  update(final: Values, eye: THREE.Vector3, dt: number): void {
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
      this.reveal(final, v, scale);
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

  /** The light and the layers of a living memory (no parallax: its scene draws its own depth). */
  private reveal(final: Values, v: (k: string, d: number) => number, _scale: number): void {
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
