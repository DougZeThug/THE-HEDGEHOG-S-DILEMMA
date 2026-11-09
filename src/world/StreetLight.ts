import * as THREE from 'three';

/**
 * Streetlights passing across a wall (The Drive Home, docs/drive-home.md): the light a car's
 * passengers see go over them at night, on the wall the visitor is facing.
 *
 * Like the kitchen's light (MemoryLight), not a lamp or a decal: a quad flush with the wall that
 * brightens what is already there (plaster, ink, shadow, the memory's painting) in proportion, by a
 * sodium light, drawn into the scene's linear target before tone mapping. Each pass is a soft band
 * that crosses the whole wall from right to left and runs off into the corner: its angle goes
 * evenly, its light along the wall as that angle's tangent, so it is slowest in the wall's middle,
 * where the faces are, and quick at its edges, as a lamp's beam swung past is; sheared, wider where
 * it falls obliquely. Bounded only by the
 * wall, never by a patch: a band that started and stopped at a patch's edge read as a scanner (the
 * skeptic's review, 2026-11-09).
 *
 * Its clock is the memory's (`room.street`: each whole number one pass gone by); under reduced
 * motion nothing crosses (the faces are found all the same, the room's night only darkens).
 */
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */ `
  uniform float uGain, uX, uHalf, uShear;
  uniform vec2 uSize;
  uniform vec3 uColour;
  varying vec2 vUv;
  void main() {
    // Metres on the wall from the quad's centre (the wall's middle).
    vec2 q = (vUv - 0.5) * uSize;
    float bx = (q.x - uX - uShear * q.y) / uHalf;
    float band = exp(-bx * bx);
    // A lamp is high: the light is a little stronger up the wall, and fainter at its foot.
    float up = 0.7 + 0.3 * smoothstep(-0.5 * uSize.y, 0.5 * uSize.y, q.y);
    gl_FragColor = vec4(uGain * band * up * uColour, 0.0);
  }
`;

/** The band's half width at the wall's middle (m), and how much wider at its edges. */
const HALF = 0.42;
const WIDEN = 0.7;
/** Its slant: metres across for each metre up (the lamp ahead of the car, its light raked). */
const SHEAR = 0.22;
/** The angle swept each way from square (rad): the light's speed along the wall goes as tan. */
const SWEEP = 1.15;
/** How much brighter the lit plaster gets, in linear light (sodium: about 2000 K). */
export const STREET_GAIN = 2.4;
const SODIUM = new THREE.Vector3(1.0, 0.56, 0.2);
/** Its strength under the gentle intensity (QA, 2026-11-09: ×1.6 at its peak, not ×2.5). */
export const STREET_GENTLE = 0.4;

export class StreetLight {
  readonly mesh: THREE.Mesh;
  private u = {
    uGain: { value: 0 },
    uX: { value: 0 },
    uHalf: { value: HALF },
    uShear: { value: SHEAR },
    uSize: { value: new THREE.Vector2(1, 1) },
    uColour: { value: SODIUM.clone() },
  };
  /** The wall it is on: its group, its middle and half width (the group's metres). */
  private wall: { group: THREE.Object3D; cx: number; cy: number; halfW: number } | null = null;
  reducedMotion = false;
  /** Gentle intensity keeps it fainter. */
  strength = 1;

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      // dst * (1 + src), as the kitchen's light (MemoryLight).
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    this.mesh.name = 'street-light';
  }

  /** Lay it over a whole wall: `a` a WallText anchor (its group, and the wall's extent inside it). */
  place(a: { group: THREE.Object3D; minX: number; maxX: number; minY: number; maxY: number }): void {
    // (The anchor's extent keeps 10 cm off the corners and the floor; the light runs into them.)
    const x0 = a.minX - 0.1, x1 = a.maxX + 0.1, y0 = a.minY - 0.1, y1 = a.maxY + 0.1;
    const w = x1 - x0, h = y1 - y0;
    this.wall = { group: a.group, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, halfW: w / 2 };
    if (this.mesh.parent !== a.group) a.group.add(this.mesh);
    this.mesh.position.set(this.wall.cx, this.wall.cy, 0.007);
    this.mesh.scale.set(w, h, 1);
    this.u.uSize.value.set(w, h);
  }

  /**
   * Where a pass is (0 just coming in at the wall's right, 1 just gone off its left): its band's
   * centre and half width (the group's metres), its shear; null if none is crossing.
   */
  band(phase: number): { x: number; half: number; shear: number; amount: number; midY: number } | null {
    const w = this.wall;
    const f = phase - Math.floor(phase);
    if (!w || phase <= 0 || f <= 0 || this.reducedMotion) return null;
    const a = SWEEP * (1 - 2 * f);
    const s = Math.tan(a) / Math.tan(SWEEP);
    const half = HALF * (1 + WIDEN * Math.abs(s));
    // From just past the right corner to just past the left, so it comes in and goes off whole.
    const x = w.cx + s * (w.halfW + 2 * half);
    return { x, half, shear: SHEAR, amount: this.strength, midY: w.cy };
  }

  /** One frame: the memory's `room.street` (0 none). Returns the band, for the painting to share. */
  update(phase: number): ReturnType<StreetLight['band']> {
    const b = this.band(phase);
    if (!b || !this.wall) {
      this.mesh.visible = false;
      return null;
    }
    this.mesh.visible = true;
    this.u.uX.value = b.x - this.wall.cx;
    this.u.uHalf.value = b.half;
    this.u.uGain.value = STREET_GAIN * b.amount;
    return b;
  }

  /** Off its wall (the memory has ended). */
  release(): void {
    this.mesh.visible = false;
    this.mesh.removeFromParent();
    this.wall = null;
  }
}
