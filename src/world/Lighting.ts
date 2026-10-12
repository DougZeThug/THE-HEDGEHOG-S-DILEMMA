import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { ROOM } from './layout';
import type { Environment } from '../state/Director';
import { approach } from '../core/math';

const COOL = new THREE.Color('#dbe6f0');
const NEUTRAL = new THREE.Color('#fff8ee');
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
  private keyBase = new THREE.Vector3(0.45, ROOM.height - 0.05, -0.75);
  private cur = { intensity: 1, warmth: 0, drift: 0, glow: 0.2, extraWarm: 0, extraCold: 0 };
  private flash: { kind: 'warm' | 'cold'; amount: number; until: number; start: number } | null = null;
  intensityScale = 1;
  /** Opening sequence multiplier. */
  fade = 1;

  constructor(quality: 'low' | 'medium' | 'high') {
    RectAreaLightUniformsLib.init();
    this.area = new THREE.RectAreaLight(NEUTRAL, 14, 0.9, 0.9);
    this.area.position.set(0, ROOM.height - 0.02, -0.2);
    this.area.lookAt(0, 0, -0.2);
    this.group.add(this.area);

    this.hemi = new THREE.HemisphereLight(0xf7f5f0, 0xd9d4cb, 2.3);
    this.group.add(this.hemi);

    this.key = new THREE.SpotLight(NEUTRAL, 16, 0, 1.15, 1, 1.6);
    this.key.position.copy(this.keyBase);
    this.key.target.position.set(0, 0, 0);
    this.key.castShadow = true;
    const size = quality === 'low' ? 1024 : 2048;
    this.key.shadow.mapSize.set(size, size);
    this.key.shadow.bias = -0.0003;
    this.key.shadow.normalBias = 0.015;
    this.key.shadow.radius = 4;
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

  /** Leave a faint warmth at a floor point (world x, z) that fades over `seconds`. */
  leaveResidue(x: number, z: number, amount: number, seconds: number, now: number) {
    this.residue.position.set(x, 0.22, z);
    this.residueFade = { amount, start: now, seconds };
  }

  update(dt: number, env: Environment, now: number, chairPos: THREE.Vector3) {
    if (this.residueFade) {
      const f = this.residueFade;
      const t = (now - f.start) / f.seconds;
      // Rises over a few seconds, then thins away slowly.
      const e = t >= 1 ? 0 : Math.min(1, (now - f.start) / 4) * (1 - t) * (1 - t);
      this.residue.intensity = f.amount * 1.1 * e * this.intensityScale * this.fade;
      if (t >= 1) this.residueFade = null;
    }
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
    const col = new THREE.Color().copy(NEUTRAL);
    if (w > 0) col.lerp(WARM, w * 0.75);
    else col.lerp(COOL, -w * 0.85);

    const k = this.intensityScale * this.fade;
    const I = c.intensity * (1 + c.extraCold * 0.15);
    this.area.color.copy(col);
    this.area.intensity = 14 * I * k;
    this.key.color.copy(col);
    this.key.intensity = 16 * I * k * (1 + c.extraCold * 0.4);
    this.hemi.color.copy(col).lerp(new THREE.Color(0xffffff), 0.4);
    this.hemi.intensity = 2.3 * (0.75 + 0.25 * I) * k;
    this.glow.intensity = (0.1 + c.glow * 0.7 + c.extraWarm * 1.2) * k;

    // The shadow drifts: the key light orbits the chair a little, the visible panel does not.
    const ang = c.drift * (1 + 0.25 * Math.sin(now * 0.05));
    const rel = this.keyBase.clone().sub(chairPos.clone().setY(0));
    rel.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    this.key.position.copy(chairPos).setY(0).add(rel);
    this.key.target.position.copy(chairPos);
    this.glow.position.set(chairPos.x, 0.55, chairPos.z + 0.25);
  }
}
