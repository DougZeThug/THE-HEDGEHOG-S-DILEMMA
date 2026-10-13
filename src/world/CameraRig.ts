import * as THREE from 'three';
import { approach, angleDiff, clamp } from '../core/math';
import type { Room } from './Room';

const EYE = 1.58;
const KNEEL_EYE = 0.6;

/**
 * First-person body: slow, weighted walking; a view that settles. Supports mouse
 * (pointer lock or drag), keyboard only (arrows turn), touch (left half walks, right
 * half looks) and an "attend" mode that walks you gently toward what you are looking at.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  pos = new THREE.Vector3(0.15, 0, 2.55);
  yaw = 0.06;
  pitch = -0.06;
  private vel = new THREE.Vector2();
  private yawVel = 0;
  private eye = EYE;
  kneeling = false;
  reducedMotion = false;
  enabled = true;
  sensitivity = 0.0022;
  /** Vertical field of view for this screen's shape (portrait phones need more, wide screens less). */
  baseFov = 62;
  private bobT = 0;
  private breathT = 0;
  /** Auto-walk target (attend mode). */
  private goal: THREE.Vector3 | null = null;
  private lookGoal: { yaw: number; pitch: number } | null = null;

  keys = new Set<string>();
  /** Analogue move from touch: x = turn, y = forward. */
  touchMove = new THREE.Vector2();
  private chair = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.03, 40);
    this.camera.rotation.order = 'YXZ';
  }

  /** Keep roughly 58–95° of horizontal view whatever the screen's shape (a 16:9 screen stays at 62° vertical). */
  setAspect(aspect: number) {
    const v = (h: number) => (2 * Math.atan(Math.tan((h * Math.PI) / 360) / aspect) * 180) / Math.PI;
    this.baseFov = Math.min(88, clamp(62, v(58), v(95)));
  }

  look(dx: number, dy: number) {
    if (!this.enabled) return;
    this.yaw -= dx * this.sensitivity;
    this.pitch = clamp(this.pitch - dy * this.sensitivity, -1.35, 1.35);
    this.lookGoal = null;
  }

  /** Walk toward a world point, stopping `stopAt` metres short. */
  attend(target: THREE.Vector3, stopAt: number) {
    const d = new THREE.Vector3(target.x - this.pos.x, 0, target.z - this.pos.z);
    const len = d.length();
    if (len <= stopAt + 0.05) {
      this.faceToward(target);
      return;
    }
    d.normalize().multiplyScalar(len - stopAt);
    this.goal = this.pos.clone().add(d);
    this.faceToward(target);
  }

  faceToward(target: THREE.Vector3) {
    const eyePos = this.pos.clone().setY(this.eye);
    const d = target.clone().sub(eyePos);
    const yaw = Math.atan2(-d.x, -d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    this.lookGoal = { yaw, pitch: clamp(pitch, -1.2, 1.2) };
  }

  cancelAttend() {
    this.goal = null;
    this.lookGoal = null;
  }

  setKneel(k: boolean) {
    this.kneeling = k;
    if (k) this.cancelAttend();
  }

  get eyeHeight() {
    return this.eye;
  }

  update(dt: number, room: Room, chairPos: THREE.Vector3) {
    this.chair.copy(chairPos);
    const k = this.keys;
    let fwd = 0, strafe = 0, turn = 0;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
      if (k.has('KeyA')) strafe -= 1;
      if (k.has('KeyD')) strafe += 1;
      if (k.has('ArrowLeft') || k.has('KeyQ')) turn += 1;
      if (k.has('ArrowRight') || k.has('KeyE')) turn -= 1;
      fwd += this.touchMove.y;
      turn -= this.touchMove.x * 0.9;
    }
    const slow = k.has('ShiftLeft') || k.has('ShiftRight') ? 0.45 : 1;
    const speed = (this.kneeling ? 0 : 1.05) * slow;
    if ((fwd || strafe || turn) && this.goal) this.cancelAttend();
    if (this.kneeling && (fwd || strafe)) this.kneeling = false;

    // Keyboard turning is eased.
    this.yawVel = approach(this.yawVel, turn * (this.reducedMotion ? 0.8 : 1.15), dt, 0.25);
    this.yaw += this.yawVel * dt;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let tx = (-sin * fwd + cos * strafe) * speed;
    let tz = (-cos * fwd - sin * strafe) * speed;
    const mag = Math.hypot(tx, tz);
    if (mag > speed && mag > 0) {
      tx *= speed / mag;
      tz *= speed / mag;
    }
    if (this.goal && (!this.enabled || this.kneeling)) this.goal = null;
    if (this.goal) {
      const d = new THREE.Vector2(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
      const len = d.length();
      if (len < 0.04) this.goal = null;
      else {
        const v = Math.min(0.55, len * 0.9);
        d.normalize().multiplyScalar(v);
        tx = d.x;
        tz = d.y;
      }
    }
    if (this.lookGoal && this.enabled) {
      const lg = this.lookGoal;
      const dy = angleDiff(this.yaw, lg.yaw);
      this.yaw += dy * (1 - Math.exp(-dt / 0.9));
      this.pitch += (lg.pitch - this.pitch) * (1 - Math.exp(-dt / 0.9));
      if (Math.abs(dy) < 0.002 && Math.abs(lg.pitch - this.pitch) < 0.002 && !this.goal) this.lookGoal = null;
    }
    this.vel.x = approach(this.vel.x, tx, dt, 0.45);
    this.vel.y = approach(this.vel.y, tz, dt, 0.45);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    // Walls and chair.
    const m = 0.32;
    this.pos.x = clamp(this.pos.x, -room.halfW + m, room.halfW - m);
    this.pos.z = clamp(this.pos.z, -room.halfD + m, room.halfD - m);
    const cx = this.pos.x - chairPos.x, cz = this.pos.z - chairPos.z;
    const cd = Math.hypot(cx, cz);
    const minD = this.kneeling ? 0.42 : 0.5;
    if (cd < minD && cd > 1e-4) {
      this.pos.x = chairPos.x + (cx / cd) * minD;
      this.pos.z = chairPos.z + (cz / cd) * minD;
    }

    const targetEye = this.kneeling ? KNEEL_EYE : EYE;
    this.eye = approach(this.eye, targetEye, dt, this.kneeling ? 0.9 : 0.7);

    // A body, not a tripod: footfall bob when walking, breath when standing.
    const moving = Math.hypot(this.vel.x, this.vel.y);
    this.bobT += dt * moving * 6.2;
    this.breathT += dt;
    let bob = 0, sway = 0;
    if (!this.reducedMotion) {
      bob = Math.sin(this.bobT) * 0.012 * clamp(moving / 0.8);
      sway = Math.sin(this.breathT * 0.9) * 0.0035 * (1 - clamp(moving * 3));
    }
    this.camera.position.set(this.pos.x, this.eye + bob + sway, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    const fovTarget = this.baseFov + (this.kneeling && !this.reducedMotion ? 8 : 0);
    this.camera.fov = approach(this.camera.fov, fovTarget, dt, 1.5);
    this.camera.updateProjectionMatrix();
  }

  distanceToChair(): number {
    return Math.hypot(this.pos.x - this.chair.x, this.pos.z - this.chair.z);
  }
}
