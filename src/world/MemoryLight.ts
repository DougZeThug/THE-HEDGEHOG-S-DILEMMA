import * as THREE from 'three';

/**
 * A memory intruding on the room as light: late-afternoon sun through a window that isn't
 * there, falling across the wall where a line is written ("the light in the kitchen at four
 * in the afternoon"). The room has one source of light; this is a second, from nowhere.
 *
 * It is not a lamp or a decal. A quad flush with the wall multiplies what is already there
 * (plaster, ink, shadow) by warm light, drawn into the scene's linear target before tone
 * mapping: the plaster brightens, the ink keeps its contrast, shadows stay shadows. A cross
 * of soft-edged shadow in it is the window's frame; its edge is softer at the top, further
 * from the sill. While it is there it slides a few centimetres, as the sun does.
 *
 * It has no clock of its own: the Director's cue starts it, and it is evaluated against the
 * scene's time each frame, like the room's other light changes (Lighting.dimToChair).
 */
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */ `
  uniform float uEnv, uGain, uShear, uSlide;
  uniform vec2 uSize, uPane;
  uniform vec3 uWarm;
  varying vec2 vUv;
  void main() {
    // Metres on the wall, from the patch's centre; undo the slant of a low sun.
    vec2 p = (vUv - 0.5) * uSize;
    p.x -= p.y * uShear + uSlide;
    // Softer further from the sill (the top of the patch).
    float soft = mix(0.025, 0.06, smoothstep(-uPane.y, uPane.y, p.y));
    vec2 a = smoothstep(-uPane - soft, -uPane + soft, p) * (1.0 - smoothstep(uPane - soft, uPane + soft, p));
    float light = a.x * a.y;
    // The frame: a cross of shadow, about 4 cm.
    float bars = max(1.0 - smoothstep(0.02, 0.02 + soft, abs(p.x)), 1.0 - smoothstep(0.02, 0.02 + soft, abs(p.y)));
    light *= 1.0 - 0.85 * bars;
    gl_FragColor = vec4(vec3(1.0) + uEnv * uGain * light * uWarm, 1.0);
  }
`;

/** The window's light, half-width and half-height (m), its slant, and how far it slides. */
const PANE = new THREE.Vector2(0.5, 0.35);
const SHEAR = 0.35;
const SLIDE = 0.04;

export class MemoryLight {
  readonly mesh: THREE.Mesh;
  private uniforms = {
    uEnv: { value: 0 },
    /** How much brighter the lit plaster gets (+32% red, +26% green, +18% blue at full). */
    uGain: { value: 0.32 },
    uWarm: { value: new THREE.Vector3(1.0, 0.8, 0.55) },
    uShear: { value: SHEAR },
    uSlide: { value: 0 },
    uSize: { value: new THREE.Vector2(1, 1) },
    uPane: { value: PANE.clone() },
  };
  private run: { start: number; attack: number; hold: number; release: number } | null = null;
  reducedMotion = false;
  /** Gentle intensity keeps it fainter. */
  strength = 1;

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    this.mesh.name = 'memory-light';
  }

  /** The tuning that can be changed live (the ?tune panel). */
  get gain() {
    return this.uniforms.uGain.value;
  }
  set gain(v: number) {
    this.uniforms.uGain.value = v;
  }

  /**
   * Lay the light on a wall: `parent` is the wall's writing group, (x, y) the centre of the
   * line in its local metres. The words sit in the patch's upper third, as if on a sill.
   */
  start(parent: THREE.Object3D, x: number, y: number, minY: number, maxY: number, cue: { attack: number; hold: number; release: number }, now: number) {
    const w = PANE.x * 2 + PANE.y * 2 * SHEAR + SLIDE + 0.3;
    const h = PANE.y * 2 + 0.2;
    // Lower than the words, but never through the skirting or the ceiling.
    const cy = THREE.MathUtils.clamp(y - 0.12, minY + h / 2, maxY - h / 2);
    parent.add(this.mesh);
    this.mesh.position.set(x, cy, 0.006);
    this.mesh.scale.set(w, h, 1);
    this.uniforms.uSize.value.set(w, h);
    this.run = { start: now, attack: cue.attack, hold: cue.hold, release: cue.release };
    this.mesh.visible = true;
  }

  /** How present the light is now (0–1); 0 when it has gone. */
  update(now: number): number {
    const r = this.run;
    if (!r) return 0;
    const t = now - r.start;
    const total = r.attack + r.hold + r.release;
    if (t >= total) {
      this.run = null;
      this.mesh.visible = false;
      this.uniforms.uEnv.value = 0;
      return 0;
    }
    const s = (x: number) => x * x * (3 - 2 * x);
    // Under reduced motion it comes and goes more slowly and does not slide: light, not movement.
    const attack = this.reducedMotion ? Math.max(r.attack, 4) : r.attack;
    const env = t < attack ? s(Math.min(1, t / attack)) : t < r.attack + r.hold ? 1 : s(Math.max(0, (total - t) / r.release));
    this.uniforms.uEnv.value = env * this.strength;
    this.uniforms.uSlide.value = this.reducedMotion ? 0 : SLIDE * (t / total - 0.5);
    return env;
  }

  get active() {
    return this.run !== null;
  }
}
