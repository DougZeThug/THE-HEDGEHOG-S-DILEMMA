import * as THREE from 'three';
import { angleDiff } from '../../core/math';
import type { CameraRig } from '../CameraRig';
import type { MemoryWindow } from '../MemoryWindow';
import type { Post } from '../Post';
import { Immersion, projectQuad, visiblePart } from './Immersion';

/**
 * Going into a living memory, and coming back (docs/reviews/2026-10-woodland.md). The memory's
 * timeline says how far along the way in they are (`scene.approach`: one move, the body drifting
 * toward the wall while the drawing forms, then carried on, square to it) and how far in
 * (`scene.immerse`, 0..1):
 *
 *   0    → 0.5   (a painting not drawn in order) it spreads over the plaster, from its part round
 *                the line to all of it
 *   0.3  → 0.7   the painting on the wall becomes the painting's own light, at its place
 *   0.68 → 1     it opens out to cover the view: the painting is all there is (a screen-space
 *                settle, which also lifts it off the room's light and the other writing on that wall)
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
  /** Where the visitor is carried to (the painting's point square in front of them: the wide's cover focus). */
  focus: [number, number];
  /** What the view keeps central (a close-up's subject on an upright screen); the body stays put. Default: `focus`. */
  view?: [number, number];
  /** Held at a position (the editor, a capture): the way in is exactly where its curve is. */
  held?: boolean;
  /** Whether this variant may be entered at all. */
  enter: boolean;
  /** The visitor is looking away from the painting (from the attention check). */
  away: boolean;
  /** Withdrawing after a natural close (carried back to where they stood). */
  leavingNaturally: boolean;
  /**
   * The way in as one move (the timeline's `scene.approach`, 0..1, straight; shaped here): until
   * they are taken in, only their body drifts toward the wall (their look their own); after, the
   * same move carries them on and turns them square to it. Without it nobody is carried (the view
   * still becomes the painting's).
   */
  approach?: number;
}

/** How far along the way in (0..1) for `scene.approach` (0..1): slow to start, slow to arrive. */
export function approachCurve(a: number): number {
  const x = Math.min(1, Math.max(0, a));
  return Math.pow(x * x * (3 - 2 * x), 1.3);
}

const LEAVE = 0.52; // radians of a new turn that let it go (30°)
const YIELD = 0.14; // a glance (under 8°) changes nothing
// How fast the way in may catch up after a look away held it (of the whole way, a second: about
// twice its own fastest), and how long a step back is held before it is leaving.
const CATCH_UP = 0.35;
const HELD = 0.35;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class Inside {
  /** How far in it is now (after any yielding), 0..1. */
  eff = 0;
  /** The view's part of the painting (painting uv): what the living scene must draw. */
  readonly view = new THREE.Vector4(0, 0, 1, 1);
  /** Where the way back ends (where they last stood by themselves, as they looked when taken in). */
  private from: { x: number; z: number; yaw: number; pitch: number } | null = null;
  /** Where they were when taken in. */
  private start: { x: number; z: number; yaw: number; pitch: number } | null = null;
  /** Where they last stood by themselves (the drift goes on from here), and how far along the way in it was then. */
  private anchor: { x: number; z: number } | null = null;
  private l0 = 0;
  /** How far along the way in they are (0..1), and were when taken in (the lean's share of it). */
  private lean = 0;
  private pLock = 0;
  private leanStopped = false;
  /** Before it takes them: a step back held (seconds). */
  private leanStep = 0;
  /** How far in it is, as the timeline has it (before any yielding). */
  private immersed = 0;
  /** They were taken in (the painting was all there is, at least half way). */
  entered = false;
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

  /** The memory is moving them (drifting them toward the wall, or carrying them): not their own walk. */
  get carrying(): boolean {
    return this.locked || this.drifted;
  }
  private drifted = false;

  /** Taken all the way in (whatever they are doing with their look): what a close-up is for. */
  get taken(): boolean {
    return this.locked && this.immersed > 0.98;
  }

  private reduced = false;

  /** A new memory: nothing carried, nothing decided. Reduced motion is as it was when it began. */
  begin(seed: number, reduced = false): void {
    this.end();
    this.reduced = reduced;
    this.decided = this.wallOnly = this.handedBack = this.leaving = false;
    this.anchor = this.start = null;
    this.lean = this.l0 = this.pLock = this.leanStep = this.immersed = 0;
    this.leanStopped = this.entered = false;
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

  /** How far they have turned away from it (radians; pitch counts half: looking down into the grass is natural). */
  get turned(): number {
    return Math.hypot(this.vx, this.vy * 0.5);
  }

  /**
   * One frame. Returns 'leave' when the visitor has let it go (the caller releases the memory as
   * an interruption).
   */
  step(dt: number, f: InsideFrame, o: { reduced: boolean; aspect: number; scene: THREE.Texture; sketch: THREE.Texture | null; group: THREE.Object3D; leaves?: THREE.Texture | null }): 'leave' | null {
    let out: 'leave' | null = null;
    if (!this.decided && f.immerse > 0) {
      this.decided = true;
      // Decided once, when it would take them (the skeptic's and QA's reviews, 2026-10-17):
      // someone looking at it then is taken in, unless they stepped back from it; otherwise it
      // stays on the wall.
      this.wallOnly = !f.enter || f.away || this.leanStopped;
    }
    const immerse = this.wallOnly ? 0 : f.immerse;
    this.immersed = immerse;
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
    // (Past a glance, the full view goes over about 12–22°; at 30° it lets go.)
    this.eff = immerse * (1 - 0.45 * smooth(YIELD, LEAVE, this.turned));
    o = { ...o, reduced: this.reduced };
    const e = this.eff;
    // (The painting's own light comes up at its place over the wall's, then it opens out to all
    // there is: the light grows, then the frame. Cinematic review, 2026-10-17.)
    const spread = smooth(0, 0.5, e);
    const show = o.reduced ? smooth(0.4, 1, e) : smooth(0.3, 0.7, e);
    const settle = o.reduced ? 1 : smooth(0.68, 1, e);
    this.window.spread = spread;

    // The whole painting, where it is on its wall.
    const p = this.window.painting;
    if (this.proxy.parent !== o.group) o.group.add(this.proxy);
    this.proxy.position.set(p.cx, p.cy, 0.004);
    this.proxy.scale.set(p.w, p.h, 1);
    this.proxy.updateMatrixWorld();

    // Shot 1, the lean (the artist's shot list; the interaction, cinematic, skeptic's and QA's
    // reviews, 2026-10-17): while the drawing forms, they drift toward the wall along the way in,
    // their look their own. Looking away holds it where it is (looking back, it goes on, catching
    // up gently, never a lurch). Their own steps are theirs: walking up to it, or aside, the drift
    // waits and goes on from where they stop; a step back held lets it go for good (it stays on
    // the wall, and they are free). Taken in, the same move carries on: one unbroken approach.
    const want = f.approach === undefined || o.reduced ? 0 : approachCurve(f.approach);
    this.drifted = false;
    if (!this.decided && (f.approach ?? 0) > 0 && !this.from && !this.handedBack && !this.leanStopped) {
      const k = this.rig.keys, thumb = this.rig.touchMove;
      // (The left thumb's sideways push turns; only its up and down walk. A walk easing to a stop,
      // or the walk toward a tapped line, is still theirs until it has.)
      const back = k.has('KeyS') || k.has('ArrowDown') || thumb.y < -0.3;
      const walking = back || k.has('KeyW') || k.has('ArrowUp') || k.has('KeyA') || k.has('KeyD') || thumb.y > 0.3 || this.rig.moving;
      this.leanStep = back ? this.leanStep + dt : 0;
      if (this.leanStep >= HELD) this.leanStopped = true;
      else if (walking) this.anchor = null;
      else if (!f.away && want > 0) {
        if (!this.anchor) this.anchor = { x: this.rig.pos.x, z: this.rig.pos.z }, (this.l0 = this.lean);
        // (Held at a position, as the editor and a capture hold it, it is where the curve is; in a
        // frame in which no time passed, nothing moves.)
        this.lean = f.held ? want : Math.min(want, this.lean + CATCH_UP * dt);
        const t = this.along(f.focus, o.aspect, this.anchor, this.lean);
        this.rig.drift(t.x, t.z);
        this.drifted = true;
      }
    }

    // Taken in (from where the lean left them); the way back ends where they last stood by
    // themselves, as they looked when taken in.
    if (e > 0 && !this.from && !this.handedBack && !o.reduced) {
      const here = { x: this.rig.pos.x, z: this.rig.pos.z, yaw: this.rig.yaw, pitch: this.rig.pitch };
      this.start = here;
      if (!this.anchor) this.anchor = { x: here.x, z: here.z }, (this.l0 = this.lean);
      this.from = { ...this.anchor, yaw: here.yaw, pitch: here.pitch };
      this.pLock = this.lean;
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
      } else if (!o.reduced && f.approach !== undefined) {
        // One move: on along the way in (backing off a little as they turn), square to it by its
        // end; on the way back, turning back to how they looked when taken, then on to where they
        // stood.
        const a = this.from;
        const s0 = this.start ?? a;
        const yieldK = 1 - 0.45 * smooth(YIELD, LEAVE, this.turned);
        const aim = want >= this.pLock ? this.pLock + (want - this.pLock) * yieldK : want;
        // (Behind the curve after a held look, it catches up; backing off or going back, it
        // follows; held, it is on the curve; in a frame in which no time passed, nothing moves.)
        if (f.held) this.lean = aim;
        else if (dt > 0) this.lean = aim > this.lean ? Math.min(aim, this.lean + CATCH_UP * dt) : aim;
        const pos = this.lean;
        const t = this.along(f.focus, o.aspect, a, pos);
        const q = pos <= this.pLock ? 0 : this.pLock < 0.999 ? smooth(0, 1, (pos - this.pLock) / (1 - this.pLock)) : 1;
        this.rig.place(t.x, t.z, s0.yaw + angleDiff(s0.yaw, t.yaw) * q, s0.pitch + (t.pitch - s0.pitch) * q);
        if (want <= 1e-3 && f.leavingNaturally) {
          // Back exactly where they stood.
          this.rig.place(a.x, a.z, a.yaw, a.pitch);
          this.from = null;
        }
      } else if (e <= 1e-3 && f.leavingNaturally) {
        this.rig.place(this.from.x, this.from.z, this.from.yaw, this.from.pitch);
        this.from = null;
      }
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
      focus: f.view ?? f.focus,
      zoom: this.zoom,
      view: this.view,
      seed: this.seed,
      // The crossing: leaves close to the lens as the room goes (none under reduced motion).
      leaves: o.reduced ? null : o.leaves ?? null,
      // (Not on the way back: that would be a rewind.)
      crossing: o.reduced || f.leavingNaturally ? 0 : smooth(0.7, 1, e),
    });
    // What the scene must draw: the painting's part on the screen (all of it on the wall).
    if (this.immersion.pass.enabled && show > 0.5) visiblePart(this.immersion.screenToPainting, this.zoom, this.view);
    else this.view.set(0, 0, 1, 1);
    this.immersion.u.uView.value.copy(this.view);
    this.window.setView(this.view);
    this.post.immersed = show * settle;
    if (show * settle >= 0.5 && !this.wallOnly) this.entered = true;
    this.post.roomHidden = show >= 0.999 && settle >= 0.999;
    return out;
  }

  /**
   * Where the body is `p` of the way in, drifting from where they last stood (`anchor`, when the
   * way was `l0` along): there at `l0`, at the way's end at 1.
   */
  private along(focus: [number, number], aspect: number, anchor: { x: number; z: number }, p: number): { x: number; z: number; yaw: number; pitch: number } {
    const t = this.toward(focus, aspect, anchor);
    const g = this.l0 < 0.999 ? Math.min(1, Math.max(0, (p - this.l0) / (1 - this.l0))) : 1;
    return { x: anchor.x + (t.x - anchor.x) * g, z: anchor.z + (t.z - anchor.z) * g, yaw: t.yaw, pitch: t.pitch };
  }

  /**
   * Where the way in ends, from `from`: square to the wall in front of the focus, the painting just
   * filling the view, or (if they stood nearer than that) at their own distance: never backwards.
   */
  private toward(focus: [number, number], aspect: number, from: { x: number; z: number }): { x: number; z: number; yaw: number; pitch: number } {
    const t = this.target(focus, aspect);
    const da = (from.x - t.wall.x) * t.normal.x + (from.z - t.wall.z) * t.normal.z;
    if (da >= t.d) return t;
    const d = Math.max(0.45, da);
    const eye = this.rig.eyeHeight;
    return { x: t.wall.x + t.normal.x * d, z: t.wall.z + t.normal.z * d, yaw: t.yaw, pitch: Math.atan2(t.wall.y - eye, d) };
  }

  /** Where the visitor is carried: square to the wall, the focus at the view's centre, the painting just filling it. */
  private target(focus: [number, number], aspect: number): { x: number; z: number; yaw: number; pitch: number; wall: THREE.Vector3; normal: THREE.Vector3; d: number } {
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
    return { x: pt.x + n.x * d, z: pt.z + n.z * d, yaw: Math.atan2(n.x, n.z), pitch: Math.atan2(pt.y - eye, d), wall: pt, normal: n, d };
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
