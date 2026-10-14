import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { ROOM } from './layout';
import { PANEL } from './Room';
import type { Environment } from '../state/Director';
import { approach } from '../core/math';
import { lookFor, neutralFor, type Look } from './Style';

/** One frosted overhead source does nearly all the work; the fill is only bounce. */
/** The lights were set for a 3.1 m ceiling; from higher they fall off with distance. */
const REACH = (ROOM.height / 3.1) ** 2;
const AREA = 8 * REACH;
const KEY = 44 * REACH;
const HEMI = 1.15;

/** VSM blur radius, in texels of a 512 map (the radius scales with the map, so the penumbra doesn't). */
const SHADOW_RADIUS = 5;
export const shadowMapSize = (quality: 'low' | 'medium' | 'high') => (quality === 'low' ? 512 : 1024);

/** What may change before the shadow is redrawn: key and target (m), cone (rad), chair (m, rad), blur, map. */
const SIG_TOL = [0.003, 0.003, 0.003, 0.003, 0.003, 0.003, 0.002, 0.002, 0.003, 0.01, 0.5];
const UP = new THREE.Vector3(0, 1, 0);

const COOL = new THREE.Color('#dbe6f0');
const WARM = new THREE.Color('#ffdcb4');

/**
 * One visible source (the ceiling panel) lights the room. A soft area light gives the
 * walls their gradients; a separate shadow-casting spot gives the chair its shadow —
 * which is why the shadow can quietly stop agreeing with the light.
 */
export class Lighting {
  readonly group = new THREE.Group();
  readonly area: THREE.RectAreaLight;
  readonly key: THREE.SpotLight;
  readonly hemi: THREE.HemisphereLight;
  readonly glow: THREE.PointLight;
  /**
   * The skylight's glow in the room's upper air: light that has come through the frosted glass
   * and spreads, washing the ceiling round the opening and the top of the walls nearest it,
   * brightest at the top centre of the wall behind the chair and falling away down and to the
   * corners (the artist's reference is lit so). Unshadowed; part of the look.
   */
  readonly skyGlow: THREE.PointLight;
  /** Warmth left behind at a place on the floor (not at the chair). */
  readonly residue: THREE.PointLight;
  private residueFade: { amount: number; start: number; seconds: number } | null = null;
  private keyBase = new THREE.Vector3(PANEL.x, ROOM.height - 0.06, PANEL.z);
  private cur = { intensity: 1, warmth: 0, drift: 0, glow: 0.2, extraWarm: 0, extraCold: 0 };
  private flash: { kind: 'warm' | 'cold'; amount: number; until: number; start: number } | null = null;
  intensityScale = 1;
  /** The room's look (Style.ts): light levels and colour at rest. */
  look: Look = lookFor('reference');
  private neutral = new THREE.Color();
  private col = new THREE.Color();
  private white = new THREE.Color(0xffffff);
  /** Opening sequence multiplier. */
  fade = 1;
  /**
   * The opening score's hold on each light (1 = as the room has it). The key light can start
   * narrower, so at first only the chair and the floor under it are lit — never narrower than
   * a fixture's own throw, or it reads as a stage spotlight.
   */
  readonly score = { key: 1, area: 1, hemi: 1, glow: 1, cone: 0.82 };
  /**
   * Light as a motif later in the visit: the room's own light (panel and sky) goes down until
   * only the chair is lit, as it was at the start, then comes back. The key light is untouched.
   */
  private dimming: { from: number; to: number; start: number; seconds: number } | null = null;
  private mood = 1;

  constructor(quality: 'low' | 'medium' | 'high') {
    RectAreaLightUniformsLib.init();
    this.area = new THREE.RectAreaLight(0xfff8ee, AREA, 0.9, 0.9);
    this.area.position.set(PANEL.x, ROOM.height - 0.02, PANEL.z);
    this.area.lookAt(PANEL.x, 0, PANEL.z);
    this.group.add(this.area);

    this.hemi = new THREE.HemisphereLight(0xeef1f4, 0xd8d0c4, HEMI);
    this.group.add(this.hemi);

    this.key = new THREE.SpotLight(0xfff8ee, KEY, 0, 0.82, 1, 2);
    this.key.position.copy(this.keyBase);
    this.key.target.position.set(0, 0, 0);
    this.key.castShadow = true;
    const size = shadowMapSize(quality);
    this.key.shadow.mapSize.set(size, size);
    // Only the chair casts a shadow, so the shadow's camera looks at the middle of the cone,
    // not all of it (a 115° frustum spent most of the map on bare floor): its texels shrink
    // from about 18 mm to 5 mm on a phone, and the chair's shadow keeps its seat and legs.
    this.key.shadow.focus = 0.4;
    // Soft, frosted-source shadow (VSM blur): a penumbra of a few centimetres at the floor,
    // the same on every device (the blur is in texels, so it scales with the map).
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.01;
    this.key.shadow.radius = SHADOW_RADIUS * (size / 512);
    this.key.shadow.blurSamples = 20;
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.camera.far = 8;
    this.group.add(this.key, this.key.target);

    this.skyGlow = new THREE.PointLight(0xfff1de, 0, 0, 2);
    // Low enough (a metre under the glass) that the ceiling is washed broadly, not spotted, and a
    // little toward the wall behind the chair, which it lights from the top down.
    this.skyGlow.position.set(PANEL.x, ROOM.height - 1.0, PANEL.z - 0.9);
    this.group.add(this.skyGlow);

    this.glow = new THREE.PointLight(0xffd2a6, 0.0, 2.0, 1.8);
    this.glow.position.set(0, 0.7, 0.25);
    this.group.add(this.glow);
    this.residue = new THREE.PointLight(0xffcf9c, 0, 1.4, 2);
    this.residue.position.set(0, 0.22, 0);
    this.group.add(this.residue);
  }

  triggerFlash(kind: 'warm' | 'cold', amount: number, seconds: number, now: number) {
    this.flash = { kind, amount, until: now + seconds, start: now };
  }

  /** Take the room back to the chair alone (area and sky to `to`) for `seconds`, then return. */
  dimToChair(to: number, seconds: number, now: number) {
    // From wherever the light is now: a second dim during a first never lifts the room first.
    this.dimming = { from: this.mood, to: Math.min(to, this.mood), start: now, seconds };
  }

  /** Back to the room's own light at once (returning after leaving). */
  cancelDim() {
    this.dimming = null;
    this.mood = 1;
  }

  /** The room's light, apart from the key, as a fraction of itself (for tests and the inspector). */
  get roomLight() {
    return this.mood;
  }

  /** Leave a faint warmth at a floor point (world x, z) that fades over `seconds`. */
  leaveResidue(x: number, z: number, amount: number, seconds: number, now: number) {
    this.residue.position.set(x, 0.22, z);
    this.residueFade = { amount, start: now, seconds };
  }

  update(dt: number, env: Environment, now: number, chairPos: THREE.Vector3, chairYaw = 0) {
    if (this.residueFade) {
      const f = this.residueFade;
      const t = (now - f.start) / f.seconds;
      // Rises over a few seconds, then thins away slowly.
      const e = t >= 1 ? 0 : Math.min(1, (now - f.start) / 4) * (1 - t) * (1 - t);
      this.residue.intensity = f.amount * 1.1 * e * this.intensityScale * this.fade;
      if (t >= 1) this.residueFade = null;
    }
    let mood = 1;
    if (this.dimming) {
      const d = this.dimming;
      const t = now - d.start;
      if (t >= d.seconds) this.dimming = null;
      else {
        // Down over 3 s, held, back over 4 s: slow enough to read as the room, not a fault.
        const s = (x: number) => x * x * (3 - 2 * x);
        const down = s(Math.min(1, t / 3)), up = s(Math.max(0, Math.min(1, (d.seconds - t) / 4)));
        const level = d.from + (d.to - d.from) * down;
        mood = 1 - (1 - level) * up;
      }
    }
    this.mood = mood;
    const c = this.cur;
    c.intensity = approach(c.intensity, env.lightIntensity, dt, 3);
    c.warmth = approach(c.warmth, env.lightWarmth, dt, 4);
    c.drift = approach(c.drift, env.shadowDrift, dt, 6);
    c.glow = approach(c.glow, env.chairGlow, dt, 3);

    let fw = 0, fc = 0;
    if (this.flash) {
      const f = this.flash;
      if (now > f.until) this.flash = null;
      else {
        const t = (now - f.start) / (f.until - f.start);
        const env2 = Math.sin(Math.PI * Math.min(1, t)) * f.amount;
        if (f.kind === 'warm') fw = env2;
        else fc = env2;
      }
    }
    c.extraWarm = approach(c.extraWarm, fw, dt, 1.5);
    c.extraCold = approach(c.extraCold, fc, dt, 1.5);

    const w = THREE.MathUtils.clamp(c.warmth + c.extraWarm - c.extraCold, -1, 1);
    const sc = this.score;
    const L = this.look;
    // How much of the room's own light there is: none while the opening holds only the chair lit,
    // less in a dim (the room going back to the chair alone). The look belongs to the lit room:
    // its cream and its balance come with the room and go with it, so the chair-alone image (the
    // opening's, and the dim's quotation of it) is white light on a dark room, as it always was.
    const lit = THREE.MathUtils.clamp(sc.area, 0, 1) * mood;
    // At rest the light is the look's colour. As the Director cools it (the visitor close, the
    // room hardening) the cream goes first: by lightWarmth -0.6 the light is exactly as cool as it
    // was before the look, so a warmer room has lost none of its range.
    this.warmthNow = L.warmth * lit * THREE.MathUtils.clamp(1 + w / 0.6, 0, 1);
    const col = this.col.copy(neutralFor(this.warmthNow, this.neutral));
    if (w > 0) col.lerp(WARM, w * 0.75);
    else col.lerp(COOL, -w * 0.85);

    const k = this.intensityScale * this.fade;
    const I = c.intensity * (1 + c.extraCold * 0.15);
    // The key on the chair: weighted by the opening only (a dim never touches the key).
    const room = THREE.MathUtils.clamp(sc.area, 0, 1);
    const as = (m: number) => 1 + (m - 1) * room;
    // The room's own light: weighted by the dim (the area light's own level is already zero while
    // the opening holds it dark, so its ramp keeps the opening's curve).
    const asLit = (m: number, by: number) => 1 + (m - 1) * by;
    this.area.color.copy(col);
    this.area.intensity = AREA * I * k * sc.area * mood * asLit(L.area, mood);
    this.key.color.copy(col);
    this.key.intensity = KEY * I * k * (1 + c.extraCold * 0.4) * sc.key * as(L.key);
    this.key.angle = sc.cone * as(L.cone);
    this.hemi.color.copy(col).lerp(this.white, 0.4);
    this.hemi.intensity = HEMI * (0.75 + 0.25 * I) * k * sc.hemi * mood * asLit(L.fill, lit);
    this.glow.intensity = (0.1 + c.glow * 0.7 + c.extraWarm * 1.2) * k * sc.glow * as(L.glow);
    // The skylight's glow belongs to the lit room: it comes and goes with the room's own light.
    this.skyGlow.color.copy(col);
    this.skyGlow.intensity = L.skyGlow * I * k * lit;

    // The shadow drifts: the key light orbits the chair a little, the visible panel does not.
    const ang = c.drift * (1 + 0.25 * Math.sin(now * 0.05));
    const rel = this.rel.copy(this.keyBase).sub(this.flat.copy(chairPos).setY(0));
    rel.applyAxisAngle(UP, ang);
    this.key.position.copy(chairPos).setY(0).add(rel);
    this.key.target.position.copy(chairPos);
    this.key.target.position.z -= this.look.aim;
    this.glow.position.set(chairPos.x, 0.7, chairPos.z + 0.25);
    // The shadow map is redrawn only when what it shows changes: the light moved or widened, or
    // the chair moved or turned (its blur reads a million texels twenty times on every redraw).
    // Tolerances are what the eye can't see: 3 mm of key light moves the shadow under 1 mm.
    const kp = this.key.position, tg = this.key.target.position;
    this.key.shadow.radius = SHADOW_RADIUS * (this.key.shadow.mapSize.x / 512) * as(this.look.shadowSoft);
    const cur = this.sigNow;
    cur[0] = kp.x; cur[1] = kp.y; cur[2] = kp.z; cur[3] = tg.x; cur[4] = tg.z;
    cur[5] = this.key.angle; cur[6] = chairPos.x; cur[7] = chairPos.z; cur[8] = chairYaw;
    cur[9] = this.key.shadow.radius; cur[10] = this.key.shadow.mapSize.x;
    const sig = this.shadowSig;
    let dirty = false;
    for (let i = 0; i < cur.length; i++) if (!(Math.abs(cur[i] - sig[i]) <= SIG_TOL[i])) dirty = true;
    this.shadowDirty = dirty;
    if (dirty) sig.set(cur);
  }

  /** How much of the room's usual key light falls on the chair now (1 = as the room has it). */
  get keyLevel() {
    return this.look.key > 0 ? this.key.intensity / (KEY * 0.85 * this.look.key) : 0;
  }

  /** The look's warmth as it is now (0 white … 1 cream): the panel's glass and the ceiling follow it. */
  warmthNow = 0;

  /** How much of the room's usual panel (area) light there is now (1 = as the room has it). */
  get panelLevel() {
    return Math.min(1, this.score.area * this.mood);
  }

  /** Draw the shadow map again next frame, whatever moved (quality changed, GL context restored). */
  invalidateShadow() {
    this.shadowSig.fill(Infinity);
    this.shadowDirty = true;
  }

  /** The key light or the chair changed since the shadow map was last drawn. */
  shadowDirty = true;
  private shadowSig = new Float64Array(11).fill(Infinity);
  private sigNow = new Float64Array(11);
  private rel = new THREE.Vector3();
  private flat = new THREE.Vector3();
}
