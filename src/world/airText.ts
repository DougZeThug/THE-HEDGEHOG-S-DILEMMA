import * as THREE from 'three';
import { PHRASE_BY_ID } from '../content/phrases';
import type { Hand } from '../content/types';
import type { Environment } from '../core/environment';
import { clamp, smoothstep } from '../core/math';
import { hashString } from '../core/rng';
import { makeTextMaterial, type TextUniforms } from './textMaterial';
import { HANDS, textTexture } from './textures';
import { handAt, wallClock, type WritePlan } from './writePlan';

interface AirShadow {
  mesh: THREE.Mesh;
  uniforms: TextUniforms;
  light: THREE.Vector3;
  local: Float32Array;
}

interface AirItem {
  key: string;
  mesh: THREE.Mesh;
  uniforms: TextUniforms;
  duration: number;
  plan: WritePlan | null;
  vis: number;
  target: number;
  rate: number;
  opacity: number;
  centre: THREE.Vector3;
  shadow: AirShadow | null;
}

/**
 * Writing in the air: by the same hand as on the walls but fainter, on no surface at all, and its
 * shadow on the floor. At most one piece at a time.
 */
export class AirWriting {
  /** Add to the scene. */
  readonly group = new THREE.Group();
  /** The key light's strength relative to the room's usual (the shadow follows it). */
  shadowLight = 1;
  /** Told once when the writing goes: rubbed out by someone coming close, or simply fading. */
  onGone: ((how: 'approach' | 'faded', at: THREE.Vector3) => void) | null = null;
  private item: AirItem | null = null;
  private tmp = new THREE.Vector3();

  constructor(private geo: THREE.PlaneGeometry, private reducedMotion: () => boolean) {}

  /**
   * Write a phrase in the air at `at` (world), facing `face`. It holds its orientation (it is not a
   * sign that turns to follow you) and is legible only from about where it was written to: turn
   * its edge to you and it is gone, and from behind there is nothing. It goes, rubbed out of the
   * air, when the visitor comes within `goesAt` metres of it, or after `ttl` seconds.
   */
  write(o: { key: string; phraseId: string; at: THREE.Vector3; face: THREE.Vector3; light?: THREE.Vector3; goesAt?: number; ttl?: number; now: number }): boolean {
    const p = PHRASE_BY_ID.get(o.phraseId);
    if (!p || this.item) return false;
    // In short lines, a narrow block that can stand beside the chair rather than across it.
    const { tex, w, h, duration } = textTexture(p.text, p.hand, p.size, o.key, 2048, 0.85);
    const { mat, uniforms } = makeTextMaterial(tex, p.hand, w / h, hashString(o.key), duration);
    mat.polygonOffset = false;
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.scale.set(w, h, 1);
    mesh.position.copy(o.at);
    mesh.lookAt(o.face.x, o.at.y, o.face.z);
    mesh.renderOrder = 3;
    mesh.userData = { text: p.text, goesAt: o.goesAt ?? 1.4, expires: o.now + (o.ttl ?? 45), y: o.at.y, born: o.now, normal: new THREE.Vector2(o.face.x - o.at.x, o.face.z - o.at.z).normalize() };
    this.group.add(mesh);
    const plan: WritePlan = { start: wallClock() + 0.6, floor: 0, cap: duration };
    if (this.reducedMotion()) plan.floor = duration;
    uniforms.uWrite.value = 0;
    const shadow = o.light ? this.makeShadow(mesh, o.light, tex, p.hand, w / h, o.key, duration) : null;
    this.item = { key: o.key, mesh, uniforms, duration, plan, vis: 1, target: 1, rate: 1, opacity: HANDS[p.hand].opacity * 0.75, centre: o.at.clone(), shadow };
    return true;
  }

  /**
   * A faint shadow of the writing on the floor, cast by the light over the chair: the words'
   * own quad projected from the light onto the floor, the same writing sampled soft. It is
   * written and rubbed out with the words. It is what says they hang in the air.
   */
  private makeShadow(text: THREE.Mesh, light: THREE.Vector3, tex: THREE.Texture, hand: Hand, aspect: number, key: string, duration: number): AirShadow {
    // A strip in six rows, so the trapezoid the light casts doesn't fold the writing along its diagonal.
    const geo = new THREE.PlaneGeometry(1, 1, 1, 6);
    const local = Float32Array.from(geo.attributes.position.array);
    const n = geo.attributes.normal.array as Float32Array;
    for (let i = 0; i < n.length; i += 3) {
      n[i] = 0;
      n[i + 1] = 1;
      n[i + 2] = 0;
    }
    const { mat, uniforms } = makeTextMaterial(tex, hand, aspect, hashString(key), duration);
    mat.color.set(0x000000);
    // Soft enough that no letter can be read: grey under the words, not a mirror of them.
    uniforms.uLod.value = 4;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const shadow = { mesh, uniforms, light, local };
    this.project(text, shadow, true);
    return shadow;
  }

  /** Cast the words' quad from the light onto the floor (every frame: the light drifts, the words bob). */
  private project(text: THREE.Mesh, s: Pick<AirShadow, 'mesh' | 'light' | 'local'>, first = false) {
    text.updateMatrixWorld();
    const pos = s.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const L = s.light, y0 = 0.003, p = this.tmp;
    for (let i = 0; i < pos.count; i++) {
      p.set(s.local[i * 3], s.local[i * 3 + 1], 0).applyMatrix4(text.matrixWorld);
      const k = (L.y - y0) / Math.max(0.05, L.y - p.y);
      pos.setXYZ(i, L.x + (p.x - L.x) * k, y0, L.z + (p.z - L.z) * k);
    }
    pos.needsUpdate = true;
    if (first) {
      // Wound to face up, whichever way the words face.
      const idx = s.mesh.geometry.index!;
      const a = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(0));
      const b = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(1));
      const c = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(2));
      if (b.sub(a).cross(c.sub(a)).y < 0) {
        for (let i = 0; i < idx.count; i += 3) {
          const t = idx.getX(i + 1);
          idx.setX(i + 1, idx.getX(i + 2));
          idx.setX(i + 2, t);
        }
        idx.needsUpdate = true;
      }
    }
  }

  /** Where the writing is, while it is there (for keyboard navigation). */
  get centre(): THREE.Vector3 | null {
    const a = this.item;
    return a && a.target > 0 ? a.centre.clone() : null;
  }

  /** The writing, if any, and how much of it is there (for tests and the inspector). */
  get state(): { key: string; written: number; vis: number } | null {
    const a = this.item;
    if (!a) return null;
    return { key: a.key, written: a.plan ? Math.min(1, handAt(a.plan, wallClock()) / a.duration) : 1, vis: a.vis };
  }

  update(dt: number, now: number, pos: THREE.Vector3, env: Environment) {
    const a = this.item;
    if (!a) return;
    const d = Math.hypot(pos.x - a.centre.x, pos.z - a.centre.z);
    if (a.target > 0 && (d < a.mesh.userData.goesAt || now > a.mesh.userData.expires)) {
      a.target = 0;
      // Coming close rubs it out quickly, before anyone could walk through it; left alone, it thins away slowly.
      const close = d < a.mesh.userData.goesAt;
      a.rate = close ? 1 / 0.9 : 1 / 10;
      this.onGone?.(close ? 'approach' : 'faded', a.centre.clone());
    }
    // Barely drifting (1.5 cm over seven seconds): held up by nothing.
    a.mesh.position.y = a.mesh.userData.y + 0.0075 * Math.sin(((now - a.mesh.userData.born) / 7) * Math.PI * 2);
    // Full within 35° of where it faces, gone by 65°.
    const { x: nx, y: nz } = a.mesh.userData.normal as THREE.Vector2;
    const cos = d > 1e-3 ? (nx * (pos.x - a.centre.x) + nz * (pos.z - a.centre.z)) / d : 1;
    const facing = smoothstep(Math.cos((65 * Math.PI) / 180), Math.cos((35 * Math.PI) / 180), cos);
    a.vis = a.target > a.vis ? Math.min(a.target, a.vis + a.rate * dt) : Math.max(a.target, a.vis - a.rate * dt);
    if (a.plan) {
      const h = handAt(a.plan, wallClock());
      a.uniforms.uWrite.value = h / Math.max(1e-3, a.duration);
      if (h >= a.duration) {
        a.plan = null;
        a.uniforms.uWrite.value = 2;
      }
    }
    a.uniforms.uReveal.value = a.vis;
    a.uniforms.uOpacity.value = clamp(a.opacity * env.textContrast * facing, 0, 1);
    if (a.shadow) {
      this.project(a.mesh, a.shadow);
      const s = a.shadow.uniforms;
      s.uWrite.value = a.uniforms.uWrite.value;
      s.uReveal.value = a.vis;
      // Words that can't be seen from here (edge-on, from behind) cast nothing either.
      s.uOpacity.value = 0.22 * this.shadowLight * facing;
    }
    if (a.vis <= 0 && a.target <= 0) {
      a.mesh.removeFromParent();
      const mat = a.mesh.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
      if (a.shadow) {
        a.shadow.mesh.removeFromParent();
        a.shadow.mesh.geometry.dispose();
        (a.shadow.mesh.material as THREE.Material).dispose();
      }
      this.item = null;
    }
  }
}
