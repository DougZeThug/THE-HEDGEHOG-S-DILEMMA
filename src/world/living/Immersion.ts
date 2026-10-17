import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Sinking into a living memory (docs/reviews/2026-10-woodland.md). A full-screen pass, after
 * the room is tone-mapped and before the grade (so the room and the memory share one grain and
 * vignette). It draws the memory's painting (its render target) where the painting is on the
 * screen: at first exactly over its place on the wall (the four corners of the wall's quad,
 * projected), then, as `immerse` rises, spreading out from there until it covers the view, and
 * back again. One continuous homography: the wall's painting becomes the world without a cut.
 *
 * Its edge is ragged and soft (the noise the wall's mask uses), and inside the edge the graphite
 * underdrawing shows first, as on the wall (image 3). Near the edge the painting is pigment in
 * the plaster (multiplied into the room); further in, and the deeper the immersion, it is the
 * painting itself.
 */
const LEAVES = 5;

const ImmersionShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uScene: { value: null as THREE.Texture | null },
    uSketch: { value: null as THREE.Texture | null },
    uNoise: { value: null as THREE.Texture | null },
    /** Screen uv → painting uv (a homography). */
    uH: { value: new THREE.Matrix3() },
    /** How much of the overlay shows at all (0 = the room untouched). */
    uShow: { value: 0 },
    /** 0 = pigment in plaster everywhere, 1 = the painting itself inside its edge. */
    uSolid: { value: 0 },
    /** The painting's aspect (w / h), for an edge the same width on all sides. */
    uAspect: { value: 16 / 9 },
    /** How wide the ragged edge is, in painting heights. */
    uEdge: { value: 0.05 },
    uSeed: { value: 0 },
    /** The push in: centre (painting uv) and how far (1 = none). */
    uZoom: { value: new THREE.Vector3(0.5, 0.5, 1) },
    /** The part of the painting the render target holds (x0, y0, w, h). */
    uView: { value: new THREE.Vector4(0, 0, 1, 1) },
    /**
     * The leaves the view passes through at the crossing (the painting's own canopy, cut out: an
     * atlas of two), close to the lens and out of focus: where (screen uv), how big (screen
     * heights), turned; how present, which cell, how blurred.
     */
    uLeaves: { value: null as THREE.Texture | null },
    uLeaf: { value: Array.from({ length: LEAVES }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uLeafB: { value: Array.from({ length: LEAVES }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uScreen: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, uScene, uSketch, uNoise;
    uniform mat3 uH;
    uniform float uShow, uSolid, uAspect, uEdge, uSeed;
    uniform vec3 uZoom;
    uniform vec4 uView;
    uniform sampler2D uLeaves;
    uniform vec4 uLeaf[${LEAVES}];
    uniform vec4 uLeafB[${LEAVES}];
    uniform float uScreen;
    varying vec2 vUv;
    void main(){
      vec4 room = texture2D(tDiffuse, vUv);
      if (uShow <= 0.0) { gl_FragColor = room; return; }
      vec3 h = uH * vec3(vUv, 1.0);
      if (h.z <= 0.0) { gl_FragColor = room; return; }
      vec2 q = h.xy / h.z;
      // Distance in from the painting's nearest edge, in painting heights, made ragged.
      float e = min(min(q.x, 1.0 - q.x) * uAspect, min(q.y, 1.0 - q.y));
      float n = texture2D(uNoise, q * vec2(uAspect, 1.0) * 1.7 + uSeed).r;
      float n2 = texture2D(uNoise, q * vec2(uAspect, 1.0) * 6.3 - uSeed).r;
      e += (n - 0.5) * uEdge * 1.1 + (n2 - 0.5) * uEdge * 0.35;
      float colour = smoothstep(uEdge * 0.35, uEdge * 1.2, e);
      float lead = smoothstep(0.0, uEdge * 0.4, e) * (1.0 - colour);
      vec2 qc = clamp(uZoom.xy + (q - uZoom.xy) / uZoom.z, 0.0, 1.0);
      vec3 p = texture2D(uScene, (qc - uView.xy) / uView.zw).rgb;
      vec4 g = texture2D(uSketch, qc);
      // Pigment into plaster (relative to the plaster's display white), or the painting itself.
      vec3 multiplied = room.rgb * min(p / 0.93, vec3(1.15));
      float solid = uSolid * smoothstep(uEdge * 0.8, uEdge * 3.0, e);
      vec3 painted = mix(multiplied, p, solid);
      vec3 c = mix(room.rgb, painted, colour * uShow);
      // The graphite the light finds first, just inside the colour's edge.
      c *= 1.0 - g.a * lead * uShow * 0.75;
      // Leaves passing close to the lens (premultiplied, out of focus).
      for (int i = 0; i < ${LEAVES}; i++) {
        vec4 L = uLeaf[i], B = uLeafB[i];
        if (B.x <= 0.0) continue;
        vec2 d = (vUv - L.xy) * vec2(uScreen, 1.0) / L.z;
        float cr = cos(L.w), sr = sin(L.w);
        vec2 r = vec2(cr * d.x - sr * d.y, sr * d.x + cr * d.y) + 0.5;
        if (r.x < 0.0 || r.y < 0.0 || r.x > 1.0 || r.y > 1.0) continue;
        vec4 lf = texture2D(uLeaves, vec2((B.y + r.x) * 0.5, r.y), B.z);
        c = c * (1.0 - lf.a * B.x) + lf.rgb * B.x;
      }
      gl_FragColor = vec4(c, room.a);
    }
  `,
};

export class Immersion {
  readonly pass: ShaderPass;
  /** Painting uv corners on the screen (screen uv), last computed. */
  private readonly quad = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];

  constructor(noise: THREE.Texture) {
    this.pass = new ShaderPass(ImmersionShader);
    this.pass.uniforms.uNoise.value = noise;
  }

  get u() {
    return this.pass.uniforms;
  }

  /** Nothing to draw: the pass is skipped. */
  off(): void {
    this.u.uShow.value = 0;
    this.u.uScene.value = null;
    this.u.uSketch.value = null;
    this.u.uLeaves.value = null;
    for (const b of this.u.uLeafB.value as THREE.Vector4[]) b.x = 0;
    this.pass.enabled = false;
  }

  /**
   * One frame. `wall`: the painting's corners on the screen (screen uv; 00, 10, 11, 01), or null
   * if the wall's quad is behind the eye. `immerse` 0..1. `aspect`: the screen's (w / h).
   */
  set(o: { scene: THREE.Texture; sketch: THREE.Texture | null; wall: THREE.Vector2[] | null; immerse: number; show: number; aspect: number; paint: number; focus: [number, number]; zoom: THREE.Vector3; view: THREE.Vector4; seed: number; leaves?: THREE.Texture | null; crossing?: number }): void {
    const u = this.u;
    if (o.show <= 0 || (!o.wall && o.immerse <= 0)) {
      this.off();
      return;
    }
    this.pass.enabled = true;
    u.uScene.value = o.scene;
    u.uSketch.value = o.sketch;
    u.uShow.value = o.show;
    u.uSeed.value = o.seed;
    u.uAspect.value = o.paint;
    (u.uZoom.value as THREE.Vector3).copy(o.zoom);
    (u.uView.value as THREE.Vector4).copy(o.view);
    const k = smoothstep(o.immerse);
    const full = coverQuad(o.aspect, o.paint, o.focus);
    const from = o.wall ?? full.map((p) => p.clone().sub(new THREE.Vector2(0.5, 0.5)).multiplyScalar(0.3).add(new THREE.Vector2(0.5, 0.5)));
    for (let i = 0; i < 4; i++) this.quad[i].copy(from[i]).lerp(full[i], k);
    u.uSolid.value = clamp01((o.immerse - 0.05) / 0.45);
    // The ragged edge is a brush while it grows, and narrows into the overscan as it settles
    // (never a strip of plaster left at the screen's edge once inside).
    u.uEdge.value = 0.06 - 0.048 * k;
    const h = squareToQuad(this.quad);
    (u.uH.value as THREE.Matrix3).copy(h.invert());
    this.passLeaves(o.leaves ?? null, o.crossing ?? 0, o.aspect, o.seed);
  }

  /**
   * The leaves at the crossing (0..1: from the room going to the painting being all there is).
   * Each starts near the middle, small, grows and slides out past the screen's edge as the view
   * moves through it, its own moment, its own way; darker and softer the nearer.
   */
  private passLeaves(tex: THREE.Texture | null, k: number, aspect: number, seed: number): void {
    const L = this.u.uLeaf.value as THREE.Vector4[];
    const B = this.u.uLeafB.value as THREE.Vector4[];
    this.u.uLeaves.value = tex;
    this.u.uScreen.value = aspect;
    for (let i = 0; i < LEAVES; i++) {
      // (Quick: each passes in under half a second; never covering most of the frame at once.)
      const p = tex ? clamp01((k - i * 0.11) / 0.38) : 0;
      if (p <= 0 || p >= 1) {
        B[i].x = 0;
        continue;
      }
      // Directions round the frame, edge-on more than top and bottom (we pass between branches).
      const ang = [3.6, 5.6, 0.5, 2.4, 4.4][i] + (seed - 0.5) * 0.4;
      const reach = 0.12 + 0.95 * p ** 1.7;
      L[i].set(0.5 + (Math.cos(ang) * reach) / Math.max(aspect, 1) * 0.9, 0.5 + Math.sin(ang) * reach * 0.8, 0.3 + 1.3 * p * p, ang * 0.7 + p * 0.6);
      B[i].set(Math.sin(Math.PI * p) * 0.8, i % 2, 2.5 + 4.5 * p, 0);
    }
  }

  /** The painting's corners on the screen now (for the window's crossfade, tests and captures). */
  get corners(): readonly THREE.Vector2[] {
    return this.quad;
  }

  /** Screen uv → painting uv, as last set (identity-free: check `pass.enabled`). */
  get screenToPainting(): THREE.Matrix3 {
    return this.u.uH.value as THREE.Matrix3;
  }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/**
 * The painting's corners when it covers the screen (screen uv; 00, 10, 11, 01), a little over so
 * its ragged edge is never seen. `focus` (painting uv) is kept at the screen's centre, as far as
 * the painting still covers the screen: on an upright phone it says which part of the width is
 * seen, on a very wide screen which part of the height.
 */
export function coverQuad(screenAspect: number, paintAspect: number, focus: [number, number] = [0.5, 0.5], over = 1.06): THREE.Vector2[] {
  let w: number, h: number;
  if (screenAspect > paintAspect) {
    w = over;
    h = (screenAspect / paintAspect) * over;
  } else {
    h = over;
    w = (paintAspect / screenAspect) * over;
  }
  const x0 = Math.min(0, Math.max(1 - w, 0.5 - focus[0] * w));
  const y0 = Math.min(0, Math.max(1 - h, 0.5 - focus[1] * h));
  return [new THREE.Vector2(x0, y0), new THREE.Vector2(x0 + w, y0), new THREE.Vector2(x0 + w, y0 + h), new THREE.Vector2(x0, y0 + h)];
}

/**
 * What part of the painting is on the screen through `screenToPainting` (painting uv bounds of
 * the screen's corners, a little wider, clamped to the painting): what the scene needs to draw.
 */
export function visiblePart(screenToPainting: THREE.Matrix3, zoom: THREE.Vector3, out: THREE.Vector4): THREE.Vector4 {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const v = new THREE.Vector3();
  for (const [x, y] of [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]]) {
    v.set(x, y, 1).applyMatrix3(screenToPainting);
    if (v.z <= 0) return out.set(0, 0, 1, 1);
    let px = v.x / v.z, py = v.y / v.z;
    px = zoom.x + (px - zoom.x) / zoom.z;
    py = zoom.y + (py - zoom.y) / zoom.z;
    x0 = Math.min(x0, px);
    y0 = Math.min(y0, py);
    x1 = Math.max(x1, px);
    y1 = Math.max(y1, py);
  }
  const m = 0.01;
  x0 = Math.max(0, x0 - m);
  y0 = Math.max(0, y0 - m);
  x1 = Math.min(1, x1 + m);
  y1 = Math.min(1, y1 + m);
  if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return out.set(0, 0, 1, 1);
  return out.set(x0, y0, x1 - x0, y1 - y0);
}

/**
 * The projective map taking the unit square's corners (00, 10, 11, 01) to `q` (Heckbert, 1989),
 * as a column-major Matrix3 acting on (u, v, 1).
 */
export function squareToQuad(q: readonly THREE.Vector2[]): THREE.Matrix3 {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = p1.x - p0.x;
    b = p2.x - p1.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p2.y - p1.y;
    f = p0.y;
    g = 0;
    h = 0;
  } else {
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }
  // x = (a u + b v + c) / (g u + h v + 1), y = (d u + e v + f) / (g u + h v + 1)
  return new THREE.Matrix3().set(a, b, c, d, e, f, g, h, 1);
}

/**
 * Where a quad on a wall is on the screen: its four corners (local ±0.5) projected, in screen uv
 * (00, 10, 11, 01). Null if any corner is behind the eye.
 */
export function projectQuad(mesh: THREE.Object3D, camera: THREE.Camera, out: THREE.Vector2[]): THREE.Vector2[] | null {
  mesh.updateWorldMatrix(true, false);
  const v = new THREE.Vector4();
  const corners = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  const view = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  for (let i = 0; i < 4; i++) {
    v.set(corners[i][0], corners[i][1], 0, 1).applyMatrix4(mesh.matrixWorld).applyMatrix4(view);
    if (v.w <= 1e-4) return null;
    out[i].set((v.x / v.w) * 0.5 + 0.5, (v.y / v.w) * 0.5 + 0.5);
  }
  return out;
}
