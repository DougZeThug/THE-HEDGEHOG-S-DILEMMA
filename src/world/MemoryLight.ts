import * as THREE from 'three';

/**
 * A memory intruding on the room as light: late-afternoon sun through a window that isn't
 * there, falling across the wall where a line is written ("the light in the kitchen at four
 * in the afternoon"). The room has one source of light; this is a second, from nowhere.
 *
 * It is not a lamp or a decal. A quad flush with the wall brightens what is already there
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
  uniform float uEnv, uGain, uShear, uSlide, uTransom, uMullion;
  uniform vec2 uSize, uPane;
  uniform vec3 uWarm;
  varying vec2 vUv;
  void main() {
    // Metres on the wall, from the patch's centre; undo the slant of a low sun.
    vec2 q = (vUv - 0.5) * uSize;
    vec2 p = q;
    p.x -= p.y * uShear + uSlide;
    // Softer further from the sill (the top of the patch).
    float soft = max(mix(0.025, 0.09, smoothstep(-uPane.y, uPane.y, p.y)), 1.5 * fwidth(p.x));
    vec2 a = smoothstep(-uPane - soft, -uPane + soft, p) * (1.0 - smoothstep(uPane - soft, uPane + soft, p));
    float light = a.x * a.y;
    // The frame's shadow, about 4 cm: a kitchen sash, not a symmetrical cross (the transom high,
    // the upright off centre).
    float bars = max(1.0 - smoothstep(0.02, 0.02 + soft, abs(p.x - uMullion)), 1.0 - smoothstep(0.02, 0.02 + soft, abs(p.y - uTransom)));
    light *= 1.0 - 0.85 * bars;
    // Sun fills the air round it: a broad, faint warmth beyond the patch (a projector wouldn't).
    vec2 g = q / (uPane * 2.2);
    float halo = 0.07 * exp(-2.0 * dot(g, g));
    // Added to what is there in proportion to it (the blend makes this dst * (1 + s)): it
    // brightens on any target, float or 8-bit.
    gl_FragColor = vec4(uEnv * uGain * (light + halo) * uWarm, 0.0);
  }
`;

/** The window's light, half-height (m); its slant (a low, 4 pm sun); how far it slides. */
const PANE_H = 0.35;
const SHEAR = 0.55;
const SLIDE = 0.04;

export class MemoryLight {
  readonly mesh: THREE.Mesh;
  private uniforms = {
    uEnv: { value: 0 },
    /** How much brighter the lit plaster gets, in linear light before tone mapping (about 3000 K). */
    uGain: { value: 0.6 },
    uWarm: { value: new THREE.Vector3(1.0, 0.68, 0.36) },
    uTransom: { value: PANE_H * 0.6 },
    uMullion: { value: 0.15 },
    uShear: { value: SHEAR },
    uSlide: { value: 0 },
    uSize: { value: new THREE.Vector2(1, 1) },
    uPane: { value: new THREE.Vector2(0.5, PANE_H) },
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
      // dst * (1 + src): the plaster, ink and shadow already there, brightened by the light.
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
   * Lay the light on a wall: `parent` is the wall's writing group; (x, y) the centre of the line
   * in its local metres, (lineW, lineH) its size. The light is wider than the line; the frame's
   * transom sits 8 cm above the words so its shadow never runs along them. The patch may run
   * down behind the skirting (sun doesn't stop politely above it), never into the ceiling.
   * It arrives `delay` seconds after it is asked for: the room hushes first.
   */
  start(parent: THREE.Object3D, x: number, y: number, lineW: number, lineH: number, minX: number, maxX: number, maxY: number, cue: { attack: number; hold: number; release: number }, now: number, delay = 0.8) {
    const paneW = Math.max(0.5, lineW / 2 + 0.1);
    this.uniforms.uPane.value.set(paneW, PANE_H);
    this.uniforms.uTransom.value = PANE_H * 0.6;
    this.uniforms.uMullion.value = 0.15;
    // Room for the slant, the slide and the faint warmth round it.
    const w = (paneW + PANE_H * SHEAR) * 2 * 2.4 + SLIDE;
    const h = PANE_H * 2 * 2.4;
    const top = y + lineH / 2;
    const cy = Math.min(top + 0.08 - this.uniforms.uTransom.value, maxY - PANE_H - 0.09);
    // Not past the corners: the lit pane stays on this wall.
    const reach = paneW + PANE_H * SHEAR + 0.05;
    const cx = THREE.MathUtils.clamp(x, minX + reach, maxX - reach);
    parent.add(this.mesh);
    this.mesh.position.set(cx, cy, 0.006);
    this.mesh.scale.set(w, h, 1);
    this.uniforms.uSize.value.set(w, h);
    this.run = { start: now + delay, attack: cue.attack, hold: cue.hold, release: cue.release };
    this.mesh.visible = true;
  }

  /**
   * The light a living memory leaves in the room (its bleed): the same pane, at the size, place
   * and slant of the sun painted in the memory, so the painted sun becomes the room's.
   * (cx, cy): the pane's centre on the wall (the group's metres); half sizes; the sash's transom
   * and mullion offsets from the centre.
   */
  startPane(parent: THREE.Object3D, cx: number, cy: number, halfW: number, halfH: number, transom: number, mullion: number, cue: { attack: number; hold: number; release: number }, now: number, delay = 0) {
    this.uniforms.uPane.value.set(halfW, halfH);
    this.uniforms.uTransom.value = transom;
    this.uniforms.uMullion.value = mullion;
    const w = (halfW + halfH * SHEAR) * 2 * 2.4 + SLIDE;
    const h = halfH * 2 * 2.4;
    parent.add(this.mesh);
    this.mesh.position.set(cx, cy, 0.006);
    this.mesh.scale.set(w, h, 1);
    this.uniforms.uSize.value.set(w, h);
    this.run = { start: now + delay, attack: cue.attack, hold: cue.hold, release: cue.release };
    this.mesh.visible = true;
  }

  /** How present the light is now (0–1); 0 when it has gone. */
  update(now: number): number {
    const r = this.run;
    if (!r) return 0;
    const t = now - r.start;
    if (t < 0) return (this.uniforms.uEnv.value = 0);
    const s = (x: number) => x * x * (3 - 2 * x);
    // Under reduced motion it comes and goes more slowly and does not slide: light, not movement.
    const attack = this.reducedMotion ? Math.max(r.attack, 4) : r.attack;
    const end = attack + r.hold + r.release;
    if (t >= end) {
      this.run = null;
      this.mesh.visible = false;
      this.uniforms.uEnv.value = 0;
      return 0;
    }
    const env = t < attack ? s(Math.min(1, t / attack)) : t < attack + r.hold ? 1 : s(Math.max(0, (end - t) / r.release));
    this.uniforms.uEnv.value = env * this.strength;
    this.uniforms.uSlide.value = this.reducedMotion ? 0 : SLIDE * (t / end - 0.5);
    return env;
  }

  get active() {
    return this.run !== null;
  }
}
