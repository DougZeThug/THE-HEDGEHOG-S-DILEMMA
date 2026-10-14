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
export type LayerKind = 'pigment' | 'light' | 'sketch';

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
  uniform float uKind[${SLOTS}];   // 0 pigment, 1 light, 2 sketch
  uniform vec2 uShift[${SLOTS}];   // parallax and layer offset, in uv
  uniform int uCount;
  uniform vec2 uSize;              // metres
  uniform vec2 uNominal;           // the painting's own size (m), in which its light is authored
  uniform float uPlaster;          // the lit plaster's mean, linear (what pigment is relative to)
  uniform float uReveal, uSketch, uResidue, uPresence, uStylize;
  uniform vec3 uLight;             // the memory's light colour × intensity, linear
  uniform vec4 uPool;              // light pool: centre (m), radius (m), softness (m)
  uniform vec4 uReserve;           // the words: centre (m), half size (m)
  uniform float uSeed;
  varying vec2 vUv;

  vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

  void layer(int i, vec4 c, inout vec3 col, inout float cov, inout vec3 light, inout float sketch) {
    float o = uOpacity[i];
    if (uKind[i] > 1.5) { sketch = max(sketch, c.a * o); col = c.rgb * o + col * (1.0 - c.a * o); cov = c.a * o + cov * (1.0 - c.a * o); }
    else if (uKind[i] > 0.5) light += c.rgb * o;
    else { col = c.rgb * o + col * (1.0 - c.a * o); cov = c.a * o + cov * (1.0 - c.a * o); }
  }

  void main() {
    vec2 m = (vUv - 0.5) * uSize; // metres from the window's centre
    float n = texture2D(uNoise, vUv * uSize * 0.9 + uSeed).r;
    float n2 = texture2D(uNoise, vUv * uSize * 3.1 - uSeed).r;

    // The pool of the memory's light: what it reaches is what is revealed. The drawing is
    // found a little ahead of the colour (the light finds the pencil first).
    vec2 mp = (vUv - 0.5) * uNominal;
    float d = length((mp - uPool.xy) / max(uPool.z, 1e-3)) + (n - 0.5) * 0.35 + (n2 - 0.5) * 0.12;
    float soft = uPool.w / max(uPool.z, 1e-3) + 0.05;
    float colourMask = 1.0 - smoothstep(uReveal - soft, uReveal + soft, d);
    float sketchMask = 1.0 - smoothstep(uSketch - soft, uSketch + soft, d);
    // Never to the window's edge: ragged, inside its rectangle.
    vec2 e = min(vUv, 1.0 - vUv) * uSize;
    float edge = smoothstep(0.0, 0.06 + 0.05 * n, min(e.x, e.y));

    vec3 col = vec3(0.0); float cov = 0.0; vec3 light = vec3(0.0); float sketch = 0.0;
    if (uCount > 0) layer(0, texture2D(uL0, vUv + uShift[0]), col, cov, light, sketch);
    if (uCount > 1) layer(1, texture2D(uL1, vUv + uShift[1]), col, cov, light, sketch);
    if (uCount > 2) layer(2, texture2D(uL2, vUv + uShift[2]), col, cov, light, sketch);
    if (uCount > 3) layer(3, texture2D(uL3, vUv + uShift[3]), col, cov, light, sketch);
    if (uCount > 4) layer(4, texture2D(uL4, vUv + uShift[4]), col, cov, light, sketch);
    if (uCount > 5) layer(5, texture2D(uL5, vUv + uShift[5]), col, cov, light, sketch);

    // Unstylized (the editor's comparison): the layers as baked, with no mask, noise or reserve.
    float mask = mix(1.0, colourMask, uStylize);
    float smask = mix(1.0, sketchMask, uStylize);
    // Graphite is found by the light first; colour follows.
    float pigCov = (cov - sketch) * mask + sketch * smask;
    pigCov = clamp(pigCov, 0.0, 1.0) * edge * uPresence;

    // Bare plaster round the words, feathered over 2–3 cm with a rough edge.
    vec2 r = abs(m - uReserve.xy) - uReserve.zw;
    float rd = max(r.x, r.y) + (n2 - 0.5) * 0.02;
    float reserve = 1.0 - smoothstep(-0.005, 0.025, rd);
    pigCov *= 1.0 - mix(0.0, 0.45, reserve * uStylize);

    vec3 pigment = toLinear(col / max(cov, 1e-3));
    vec3 lit = toLinear(min(light, vec3(1.0))) * uLight * mask * edge * uPresence;
    // What stays: a faint warmth where the light was, after the image has gone.
    lit += uLight * uResidue * colourMask * edge * 0.35;

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

export class MemoryWindow {
  readonly mesh: THREE.Mesh;
  private readonly dummy: THREE.DataTexture;
  private readonly u: Record<string, THREE.IUniform>;
  private layers: WindowLayer[] = [];
  /** The painting's proportions (width / height). */
  private aspect = 1.5;
  private eye = new THREE.Vector3();
  private eyeReady = false;
  private readonly tmp = new THREE.Vector3();
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
      uCount: { value: 0 },
      uSize: { value: new THREE.Vector2(0.9, 0.6) },
      uNominal: { value: new THREE.Vector2(0.9, 0.6) },
      // Linear (236, 234, 228): the plaster the painting is relative to.
      uPlaster: { value: 0.84 },
      uReveal: { value: 0 },
      uSketch: { value: 0 },
      uResidue: { value: 0 },
      uPresence: { value: 0 },
      uStylize: { value: 1 },
      uLight: { value: new THREE.Vector3() },
      uPool: { value: new THREE.Vector4(0, 0, 0.5, 0.1) },
      uReserve: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSeed: { value: 0 },
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
  setLayers(layers: WindowLayer[], size: [number, number] = [0.9, 0.6]): void {
    this.layers = layers.slice(0, SLOTS);
    this.aspect = size[0] / size[1];
    (this.u.uNominal.value as THREE.Vector2).set(size[0], size[1]);
    const keys = ['uL0', 'uL1', 'uL2', 'uL3', 'uL4', 'uL5'];
    const kinds = this.u.uKind.value as number[];
    for (let i = 0; i < SLOTS; i++) {
      const l = this.layers[i];
      this.u[keys[i]].value = l ? l.texture : this.dummy;
      kinds[i] = !l ? 0 : l.kind === 'light' ? 1 : l.kind === 'sketch' ? 2 : 0;
    }
    this.u.uCount.value = this.layers.length;
  }

  /** Let the memory's textures go (the caller disposes them); back to the neutral dummy. */
  clearLayers(): void {
    this.setLayers([]);
    this.u.uPresence.value = 0;
    this.u.uLight.value.set(0, 0, 0);
    this.u.uResidue.value = 0;
  }

  get layerNames(): string[] {
    return this.layers.map((l) => l.name);
  }

  /** Put the window on the wall where its line is written (a WallText anchor). */
  place(a: { group: THREE.Object3D; x: number; y: number; w: number; h: number; minX: number; maxX: number; minY: number; maxY: number }, seed: number): void {
    this.placed = a;
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
    // About as wide as the words (never a panorama, never a postage stamp), its top just above
    // them: the line is written across the painting's pale upper band, the scene lies below it.
    const w = THREE.MathUtils.clamp(a.w * 0.95, 0.8, 1.3) * v('window.scale', 1);
    const h = w / this.aspect;
    let cx = a.x + v('window.offsetX', 0);
    let cy = a.y + a.h / 2 + 0.05 - h / 2 + v('window.offsetY', 0);
    cx = THREE.MathUtils.clamp(cx, a.minX + w / 2, a.maxX - w / 2);
    cy = THREE.MathUtils.clamp(cy, a.minY + h / 2, a.maxY - h / 2);
    this.mesh.position.set(cx, cy, 0.004);
    this.mesh.scale.set(w, h, 1);
    this.u.uSize.value.set(w, h);
    this.u.uReserve.value.set(a.x - cx, a.y - cy, a.w / 2 + 0.02, a.h / 2 + 0.015);
    this.u.uReveal.value = v('window.reveal', 0) * 1.25;
    this.u.uSketch.value = v('window.sketch', 0) * 1.25;
    this.u.uPresence.value = v('window.presence', 1);
    this.u.uResidue.value = v('window.residue', 0);
    this.u.uPool.value.set(v('light.x', 0), v('light.y', 0), v('light.radius', 0.45), v('light.soft', 0.12));
    this.u.uLight.value.copy(kelvin(v('light.warmth', 3000))).multiplyScalar(v('light.intensity', 0));

    // Parallax from a smoothed, un-bobbed eye, in the window's own frame: millimetres to two
    // centimetres, soft-clamped, fading out at grazing angles.
    if (!this.eyeReady) {
      this.eye.copy(eye);
      this.eyeReady = true;
    } else this.eye.lerp(eye, 1 - Math.exp(-dt / 0.6));
    const local = this.mesh.worldToLocal(this.tmp.copy(this.eye));
    // worldToLocal includes the mesh's scale; undo it to get metres.
    const lx = local.x * w, ly = local.y * h, lz = Math.max(0.3, local.z);
    const grazing = THREE.MathUtils.smoothstep(Math.atan2(Math.hypot(lx, ly), lz), 1.05, 0.7);
    const amount = v('window.parallax', 1) * grazing;
    const opac = this.u.uOpacity.value as number[];
    const shift = this.u.uShift.value as THREE.Vector2[];
    for (let i = 0; i < SLOTS; i++) {
      const l = this.layers[i];
      if (!l) {
        opac[i] = 0;
        shift[i].set(0, 0);
        continue;
      }
      const k = `layer:${l.name}.`;
      opac[i] = v(k + 'opacity', 1);
      const depth = v(k + 'depth', 0);
      const sx = MAX_SHIFT * Math.tanh(((lx / lz) * depth * amount) / MAX_SHIFT);
      const sy = MAX_SHIFT * Math.tanh(((ly / lz) * depth * amount) / MAX_SHIFT);
      // A layer seen from the right shows more of its left: shift its sampling toward the eye.
      shift[i].set((sx - v(k + 'x', 0)) / w, (sy - v(k + 'y', 0)) / h);
    }
  }

  /** The editor's comparison: 1 = as in the room, 0 = the layers as baked. */
  set stylize(s: number) {
    this.u.uStylize.value = s;
  }

  /** The memory has ended: neutral again, off the wall's group. */
  release(): void {
    this.clearLayers();
    this.placed = null;
  }
}
