import * as THREE from 'three';
import { angleDiff } from '../../core/math';
import type { CameraRig } from '../CameraRig';
import type { MemoryWindow } from '../MemoryWindow';
import type { Post } from '../Post';
import { Immersion, projectQuad, visiblePart } from './Immersion';

/**
 * Going into a living memory, and coming back (docs/reviews/2026-10-woodland.md). The memory's
 * timeline says how far in (`scene.immerse`, 0..1); this turns that into one continuous move:
 *
 *   0    → 0.35  the painting spreads over the plaster, from its part round the line to all of it
 *   0.15 → 0.85  the visitor is carried to it, square on, to where it just fills the view
 *   0.72 → 1     the last of the plaster goes: the painting is all there is (a screen-space settle,
 *                which also lifts it off the room's light and the other writing on that wall)
 *
 * and back, the same way, to exactly where they stood. Under reduced motion nobody is carried:
 * the painting spreads, then the view crossfades to it.
 *
 * While inside, looking and walking are the memory's. Any new turn backs the move off a little,
 * in proportion (the memory yields); a turn of 30°, or holding a step, lets it go: it reverses,
 * and control comes back half-way out, turned the way they turned. Taps do nothing. Escape still
 * pauses (settings), as everywhere.
 */
export interface InsideFrame {
  /** The timeline's immersion (composed: an early leaving already takes it back). */
  immerse: number;
  /** Where the visitor may stand to be carried (its painting's place, the scene's cover focus). */
  focus: [number, number];
  /** Whether this variant may be entered at all. */
  enter: boolean;
  /** The visitor is looking away from the painting (from the attention check). */
  away: boolean;
  /** Withdrawing after a natural close (carried back to where they stood). */
  leavingNaturally: boolean;
}

const LEAVE = 0.52; // radians of a new turn that let it go (30°)
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class Inside {
  /** How far in it is now (after any yielding), 0..1. */
  eff = 0;
  /** The view's part of the painting (painting uv): what the living scene must draw. */
  readonly view = new THREE.Vector4(0, 0, 1, 1);
  private from: { x: number; z: number; yaw: number; pitch: number } | null = null;
  private decided = false;
  private wallOnly = false;
  private handedBack = false;
  private leaving = false;
  /** The visitor's turning since the lock (radians), and how long since they last turned. */
  private vx = 0;
  private vy = 0;
  private quiet = 0;
  /** A step held (begun while inside), and a turn key held. */
  private stepHeld = 0;
  readonly freshKeys = new Set<string>();
  freshThumb = false;
  private readonly proxy = new THREE.Object3D();
  private readonly corners = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
  private readonly zoom = new THREE.Vector3(0.5, 0.5, 1);
  private seed = 0;

  constructor(
    private readonly rig: CameraRig,
    private readonly window: MemoryWindow,
    readonly immersion: Immersion,
    private readonly post: Post,
  ) {}

  /** The visitor's look and walk belong to the memory now. */
  get locked(): boolean {
    return this.from !== null && !this.handedBack;
  }

  /** A new memory: nothing carried, nothing decided. */
  begin(seed: number): void {
    this.end();
    this.decided = this.wallOnly = this.handedBack = this.leaving = false;
    this.vx = this.vy = this.quiet = this.stepHeld = 0;
    this.freshKeys.clear();
    this.freshThumb = false;
    this.seed = (seed % 997) / 997;
  }

  /** Looking while inside: it backs the move off. Returns false if the look is the room's. */
  look(dx: number, dy: number): boolean {
    if (!this.locked) return false;
    this.vx += dx * this.rig.sensitivity;
    this.vy += dy * this.rig.sensitivity;
    this.quiet = 0;
    return true;
  }

  /** How far they have turned away from it (pitch counts half: looking down into the grass is natural). */
  private get turned(): number {
    return Math.hypot(this.vx, this.vy * 0.5);
  }

  /**
   * One frame. Returns 'leave' when the visitor has let it go (the caller releases the memory as
   * an interruption).
   */
  step(dt: number, f: InsideFrame, o: { reduced: boolean; aspect: number; scene: THREE.Texture; sketch: THREE.Texture | null; group: THREE.Object3D }): 'leave' | null {
    let out: 'leave' | null = null;
    if (!this.decided && f.immerse > 0) {
      this.decided = true;
      // Only someone looking at it is taken in; otherwise it stays on the wall.
      this.wallOnly = !f.enter || f.away;
    }
    const immerse = this.wallOnly ? 0 : f.immerse;
    // Turning: held keys turn at the room's rate; quiet, the turn springs back.
    if (this.locked) {
      const k = this.rig.keys;
      const left = this.freshKeys.has('ArrowLeft') || this.freshKeys.has('KeyQ');
      const right = this.freshKeys.has('ArrowRight') || this.freshKeys.has('KeyE');
      if ((left && k.has('ArrowLeft')) || (left && k.has('KeyQ'))) this.vx -= 1.15 * dt, (this.quiet = 0);
      if ((right && k.has('ArrowRight')) || (right && k.has('KeyE'))) this.vx += 1.15 * dt, (this.quiet = 0);
      const stepping = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown'].some((c) => this.freshKeys.has(c) && k.has(c)) || (this.freshThumb && this.rig.touchMove.length() > 0.3);
      this.stepHeld = stepping ? this.stepHeld + dt : 0;
      // (Judged before the turn springs back: a long frame must not swallow a turn.)
      if (!this.leaving && (this.turned >= LEAVE || this.stepHeld >= 0.35)) {
        this.leaving = true;
        out = 'leave';
      }
      this.quiet += dt;
      if (this.quiet > 0.4 && !this.leaving) {
        const d = Math.exp(-Math.min(dt, 0.1) / 0.8);
        this.vx *= d;
        this.vy *= d;
      }
    }
    // The memory yields as they turn away.
    this.eff = immerse * (1 - 0.6 * smooth(0, LEAVE, this.turned));
    const e = this.eff;
    const spread = o.reduced ? smooth(0, 0.5, e) : smooth(0, 0.35, e);
    const carry = o.reduced ? 0 : smooth(0.15, 0.85, e);
    const settle = o.reduced ? 1 : smooth(0.8, 1, e);
    const show = o.reduced ? smooth(0.4, 1, e) : smooth(0.72, 0.92, e);
    this.window.spread = spread;

    // The whole painting, where it is on its wall.
    const p = this.window.painting;
    if (this.proxy.parent !== o.group) o.group.add(this.proxy);
    this.proxy.position.set(p.cx, p.cy, 0.004);
    this.proxy.scale.set(p.w, p.h, 1);
    this.proxy.updateMatrixWorld();

    // Carried in (and back).
    if (e > 0 && !this.from && !this.handedBack && !o.reduced) {
      this.from = { x: this.rig.pos.x, z: this.rig.pos.z, yaw: this.rig.yaw, pitch: this.rig.pitch };
      this.rig.cancelAttend();
    }
    if (o.reduced && e > 0 && !this.from && !this.handedBack) {
      // Not carried, but held still while the view is the painting's.
      this.from = { x: this.rig.pos.x, z: this.rig.pos.z, yaw: this.rig.yaw, pitch: this.rig.pitch };
    }
    if (this.from && !this.handedBack) {
      if (this.leaving && e <= 0.5) {
        // Let go: control comes back here, turned the way they turned.
        this.handedBack = true;
        this.rig.yaw -= this.vx;
        this.rig.pitch = Math.max(-1.2, Math.min(1.2, this.rig.pitch - this.vy * 0.5));
        this.from = null;
      } else if (!o.reduced) {
        const t = this.target(f.focus, o.aspect);
        const a = this.from;
        const yaw = a.yaw + angleDiff(a.yaw, t.yaw) * carry;
        this.rig.place(a.x + (t.x - a.x) * carry, a.z + (t.z - a.z) * carry, yaw, a.pitch + (t.pitch - a.pitch) * carry);
        if (e <= 1e-3 && f.leavingNaturally) {
          // Back exactly where they stood.
          this.rig.place(a.x, a.z, a.yaw, a.pitch);
          this.from = null;
        }
      } else if (e <= 1e-3 && f.leavingNaturally) this.from = null;
    }

    // The settle: the painting over the room, then all there is.
    const wall = o.reduced ? null : projectQuad(this.proxy, this.rig.camera, this.corners);
    this.immersion.set({
      scene: o.scene,
      sketch: o.sketch,
      wall,
      immerse: settle,
      show,
      aspect: o.aspect,
      paint: p.w / Math.max(1e-3, p.h),
      focus: f.focus,
      zoom: this.zoom,
      view: this.view,
      seed: this.seed,
    });
    // What the scene must draw: the painting's part on the screen (all of it on the wall).
    if (this.immersion.pass.enabled && show > 0.5) visiblePart(this.immersion.screenToPainting, this.zoom, this.view);
    else this.view.set(0, 0, 1, 1);
    this.immersion.u.uView.value.copy(this.view);
    this.window.setView(this.view);
    this.post.immersed = show * settle;
    this.post.roomHidden = show >= 0.999 && settle >= 0.999;
    return out;
  }

  /** Where the visitor is carried: square to the wall, the focus at the view's centre, the painting just filling it. */
  private target(focus: [number, number], aspect: number): { x: number; z: number; yaw: number; pitch: number } {
    const p = this.window.painting;
    const pt = new THREE.Vector3(p.cx + (focus[0] - 0.5) * p.w, p.cy + (focus[1] - 0.5) * p.h, 0);
    this.proxy.parent!.localToWorld(pt);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(this.proxy.parent!.matrixWorld);
    n.y = 0;
    n.normalize();
    const v = THREE.MathUtils.degToRad(this.rig.baseFov);
    const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
    const d = Math.max(0.45, Math.min(p.h / (2 * Math.tan(v / 2)), p.w / (2 * Math.tan(h / 2))) * 1.04);
    const eye = this.rig.eyeHeight;
    return { x: pt.x + n.x * d, z: pt.z + n.z * d, yaw: Math.atan2(n.x, n.z), pitch: Math.atan2(pt.y - eye, d) };
  }

  /** It has ended (or was switched off): whoever was carried is put back, and the room is the room. */
  end(): void {
    if (this.from && !this.handedBack) this.rig.place(this.from.x, this.from.z, this.from.yaw, this.from.pitch);
    this.from = null;
    this.eff = 0;
    this.immersion.off();
    this.post.immersed = 0;
    this.post.roomHidden = false;
    this.view.set(0, 0, 1, 1);
    this.proxy.removeFromParent();
  }
}
