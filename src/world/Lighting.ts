import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { ROOM } from './layout';
import { PANEL } from './Room';
import type { Environment } from '../state/Director';
import { approach } from '../core/math';
import { lookFor, neutralFor, type Look } from './Style';

/** One frosted overhead source does nearly all the work; the fill is only bounce. */
const AREA = 8;
const KEY = 44;
const HEMI = 1.15;

/** VSM blur radius, in texels of a 512 map (the radius scales with the map, so the penumbra doesn't). */
const SHADOW_RADIUS = 5;
export const shadowMapSize = (quality: 'low' | 'medium' | 'high') => (quality === 'low' ? 512 : 1024);

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

    this.glow = new THREE.PointLight(0xffd2a6, 0.0, 2.0, 1.8);
    this.glow.position.set(0, 0.55, 0.25);
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
    // At rest the light is the look's colour. As the Director cools it (the visitor close, the
    // room hardening) the cream goes first: by lightWarmth -0.6 the light is exactly as cool as it
    // was before the look, so a warmer room has lost none of its range.
    const col = this.col.copy(neutralFor(this.look.warmth * THREE.MathUtils.clamp(1 + w / 0.6, 0, 1), this.neutral));
    if (w > 0) col.lerp(WARM, w * 0.75);
    else col.lerp(COOL, -w * 0.85);

    const k = this.intensityScale * this.fade;
    const I = c.intensity * (1 + c.extraCold * 0.15);
    const sc = this.score;
    // The look's balance belongs to the lit room: while the opening holds the room dark (only
    // the chair lit), it is the opening's light, unchanged; it arrives as the room does.
    const L = this.look;
    const room = THREE.MathUtils.clamp(sc.area, 0, 1);
    const as = (m: number) => 1 + (m - 1) * room;
    this.area.color.copy(col);
    this.area.intensity = AREA * I * k * sc.area * mood * as(L.area);
    this.key.color.copy(col);
    this.key.intensity = KEY * I * k * (1 + c.extraCold * 0.4) * sc.key * as(L.key);
    this.key.angle = sc.cone * as(L.cone);
    this.hemi.color.copy(col).lerp(this.white, 0.4);
    this.hemi.intensity = HEMI * (0.75 + 0.25 * I) * k * sc.hemi * mood * as(L.fill);
    this.glow.intensity = (0.1 + c.glow * 0.7 + c.extraWarm * 1.2) * k * sc.glow * as(L.glow);

    // The shadow drifts: the key light orbits the chair a little, the visible panel does not.
    const ang = c.drift * (1 + 0.25 * Math.sin(now * 0.05));
    const rel = this.keyBase.clone().sub(chairPos.clone().setY(0));
    rel.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    this.key.position.copy(chairPos).setY(0).add(rel);
    this.key.target.position.copy(chairPos);
    this.glow.position.set(chairPos.x, 0.55, chairPos.z + 0.25);
    // The shadow map is redrawn only when what it shows changes: the light moved or widened, or
    // the chair moved or turned (its blur reads a million texels twenty times on every redraw).
    const sig = this.shadowSig;
    const kp = this.key.position, tg = this.key.target.position;
    this.key.shadow.radius = SHADOW_RADIUS * (this.key.shadow.mapSize.x / 512) * this.look.shadowSoft;
    const now4 = [kp.x, kp.y, kp.z, tg.x, tg.z, this.key.angle, chairPos.x, chairPos.z, chairYaw, this.key.shadow.radius, this.key.shadow.mapSize.x];
    this.shadowDirty = now4.some((v, i) => Math.abs(v - sig[i]) > 1e-4);
    if (this.shadowDirty) for (let i = 0; i < now4.length; i++) sig[i] = now4[i];
  }

  /** How much of the room's usual key light falls on the chair now (1 = as the room has it). */
  get keyLevel() {
    return this.key.intensity / (KEY * 0.85 * this.look.key);
  }

  /** The key light or the chair changed since the shadow map was last drawn. */
  shadowDirty = true;
  private shadowSig = new Array<number>(11).fill(NaN);
}
