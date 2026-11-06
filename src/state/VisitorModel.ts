import { approach } from '../core/math';
import type { Surface } from '../content/types';

/**
 * VisitorModel — what the room can honestly observe about the visitor.
 *
 * It does not guess feelings. It records behaviour: where they stand, how far from the
 * chair, how long they have been still, what they look at and for how long, how often
 * they come near the chair and then retreat.
 */

export interface VisitorInput {
  /** Visitor position on the floor plane (metres; chair at origin). */
  x: number;
  z: number;
  /** View yaw/pitch in radians. */
  yaw: number;
  pitch: number;
  /** Phrase currently held in attention (if any). */
  gazePhraseId: string | null;
  /** Looking at the chair. */
  gazeChair: boolean;
  /** Nearest surface if close to one (within ~1.1 m), else null. */
  nearSurface: Surface | null;
  kneeling: boolean;
  /**
   * Moved by a memory (its way in, its carry), not by themselves: not counted as walking or
   * looking (the room must not take the memory's own move for the visitor's restlessness).
   */
  carried?: boolean;
}

/**
 * Attention needed before a look counts as meeting a phrase, and the gap that makes the
 * next look a new meeting. Looking away and coming back is itself meaningful, so the gap
 * is short; touching the words is a meeting at once.
 */
export const ENCOUNTER = { settle: 1.8, apart: 10 };

export interface EncounterRecord {
  count: number;
  startedAt: number;
  /** Last moment attention rested on it. */
  lastSeen: number;
  /** Inside an encounter right now. */
  open: boolean;
}

export const BANDS = {
  near: 1.15,
  /** Must go past this after being near to count as a withdrawal. */
  withdraw: 2.1,
  far: 2.6,
};

export interface ApproachRecord {
  enteredAt: number;
  leftAt: number | null;
  dwell: number;
  /**
   * They came to the chair (docs/reviews/2026-11-core-loop.md): heading for it as they came within
   * reach, then stopped by it a moment or came right up to it. Walking past it, backing in, or
   * being carried there by a memory is not coming to it; nor is coming in and going without
   * stopping (`pass`) — unless, however they came in, they then stand still right beside it,
   * seeing it.
   */
  confirmed: boolean;
  arrivedAt: number | null;
  pass: boolean;
}

export class VisitorModel {
  t = 0;
  x = 0;
  z = 2.4;
  distance = 2.4;
  /** Smoothed distance (slow), for the field. */
  distanceSlow = 2.4;
  speed = 0;
  /** Seconds without translation. */
  stillFor = 0;
  /** Seconds without translation AND with very little looking around. */
  deepStillFor = 0;
  /** Longest single stillness so far. */
  longestStill = 0;
  /** Cumulative deep-still seconds. */
  totalStill = 0;
  movedDistance = 0;
  lookActivity = 0;
  kneeling = false;
  kneelTime = 0;

  near = false;
  nearSince = 0;
  totalNear = 0;
  totalFar = 0;
  approaches: ApproachRecord[] = [];
  /** Approach → quick retreat cycles. */
  hesitations = 0;
  /** Time of most recent withdrawal (left near band and passed the withdraw radius). */
  lastWithdrawAt = -Infinity;
  lastApproachAt = -Infinity;
  private armedWithdraw = false;

  surfaceDwell: Record<Surface, number> = { north: 0, east: 0, south: 0, west: 0, floor: 0, ceiling: 0 };
  surfacesVisited = new Set<Surface>();

  gazeId: string | null = null;
  gazeFor = 0;
  gazeChair = false;
  gazeChairFor = 0;
  /** Seconds the chair has been out of the view (more than ~50° from where they face). */
  chairOutOfViewFor = 0;
  totalChairGaze = 0;
  gazeTotals = new Map<string, number>();
  /** Every phrase's history of being met: the same words, encountered again. */
  encounters = new Map<string, EncounterRecord>();
  /** Encounters that began on this tick. */
  encounterStarted: { id: string; count: number }[] = [];
  /** A phrase touched (tapped / clicked) since the last update. */
  private touched: string | null = null;
  /** Phrases looked at long enough to have been read (≥ 1.6 s). */
  read = new Set<string>();
  readOrder: string[] = [];

  private lastYaw = 0;
  private lastPitch = 0;
  private initialised = false;
  /** The last second of where they were (which way they were going as they came near the chair). */
  private trail: { t: number; jump: boolean; x: number; z: number }[] = [];
  private stopRun = 0;

  update(dt: number, inp: VisitorInput): void {
    this.t += dt;
    if (!this.initialised) {
      this.x = inp.x;
      this.z = inp.z;
      this.lastYaw = inp.yaw;
      this.lastPitch = inp.pitch;
      this.distance = this.distanceSlow = Math.hypot(inp.x, inp.z);
      this.initialised = true;
    }
    const dx = inp.x - this.x;
    const dz = inp.z - this.z;
    const step = inp.carried ? 0 : Math.hypot(dx, dz);
    this.x = inp.x;
    this.z = inp.z;
    this.movedDistance += step;
    const instSpeed = dt > 0 ? step / dt : 0;
    this.speed = approach(this.speed, instSpeed, dt, 0.25);

    let dyaw = inp.yaw - this.lastYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const look = inp.carried ? 0 : Math.abs(dyaw) + Math.abs(inp.pitch - this.lastPitch);
    this.lastYaw = inp.yaw;
    this.lastPitch = inp.pitch;
    this.lookActivity = approach(this.lookActivity, dt > 0 ? look / dt : 0, dt, 0.6);

    // Stillness. Carried: the memory's journey is not the visitor's stillness, so the accumulators hold.
    if (!inp.carried) {
      if (this.speed < 0.04) {
        this.stillFor += dt;
        if (this.lookActivity < 0.12) {
          this.deepStillFor += dt;
          this.totalStill += dt;
        } else this.deepStillFor = Math.max(0, this.deepStillFor - dt * 3);
      } else {
        this.stillFor = 0;
        this.deepStillFor = 0;
      }
    }
    this.longestStill = Math.max(this.longestStill, this.deepStillFor);

    this.kneeling = inp.kneeling;
    if (inp.kneeling) this.kneelTime += dt;

    // Distance to chair and approach/withdraw cycles (hysteresis).
    this.distance = Math.hypot(inp.x, inp.z);
    this.distanceSlow = approach(this.distanceSlow, this.distance, dt, 4);
    this.trail.push({ t: this.t, jump: step > 0.4 || !!inp.carried, x: inp.x, z: inp.z });
    while (this.trail.length && this.t - this.trail[0].t > 1) this.trail.shift();

    // Carried: the memory's own move is not the visitor's approach or retreat, so the bands hold.
    if (!inp.carried) {
      if (!this.near && this.distance < BANDS.near) {
        this.near = true;
        this.nearSince = this.t;
        this.lastApproachAt = this.t;
        // Backing in, the chair out of view, a jump (a memory's carry), or heading somewhere else: not coming to it.
        const pass = this.chairOutOfViewFor > 0.5 || !this.heading(inp.x, inp.z) || this.trail.slice(-5).some((p) => p.jump);
        this.approaches.push({ enteredAt: this.t, leftAt: null, dwell: 0, confirmed: false, arrivedAt: null, pass });
        this.stopRun = 0;
        this.armedWithdraw = false;
      } else if (this.near && this.distance > BANDS.near + 0.25) {
        this.near = false;
        const rec = this.approaches[this.approaches.length - 1];
        if (rec) {
          rec.leftAt = this.t;
          rec.dwell = this.t - rec.enteredAt;
        }
        if (rec && !rec.confirmed) rec.pass = true;
        // (Passing by is not coming near: it makes no withdrawal, and no hesitation.)
        this.armedWithdraw = !rec?.pass;
      }
      if (this.near) {
        this.totalNear += dt;
        const rec = this.approaches[this.approaches.length - 1];
        if (rec) {
          rec.dwell = this.t - rec.enteredAt;
          // Arrived: stopped by it half a second, or come right up to it, or come straight at it and
          // straight back out again (the hesitation itself: not walking past it).
          this.stopRun = this.speed < 0.15 ? this.stopRun + dt : 0;
          // (However they came in: standing still right beside it, seeing it, is being with it — QA, 2026-11-06.)
          if (!rec.confirmed && this.stopRun >= 0.5 && this.distance <= 0.9 && this.chairOutOfViewFor === 0 && !inp.carried) rec.pass = false;
          if (!rec.confirmed && !rec.pass && (this.stopRun >= 0.5 || this.distance <= 0.6 || this.heading(inp.x, inp.z, -1, 45))) {
            rec.confirmed = true;
            rec.arrivedAt = this.t;
          }
        }
      }
      if (this.armedWithdraw && this.distance > BANDS.withdraw) {
        this.armedWithdraw = false;
        this.lastWithdrawAt = this.t;
        const rec = this.approaches[this.approaches.length - 1];
        // A hesitation: came close, did not stay, went back out.
        if (rec && rec.dwell < 9) this.hesitations++;
      }
      if (this.distance > BANDS.far) this.totalFar += dt;
    }

    // Surfaces
    if (inp.nearSurface) {
      this.surfaceDwell[inp.nearSurface] += dt;
      if (this.surfaceDwell[inp.nearSurface] > 2) this.surfacesVisited.add(inp.nearSurface);
    }

    // Attention
    if (inp.gazePhraseId && inp.gazePhraseId === this.gazeId) this.gazeFor += dt;
    else {
      this.gazeId = inp.gazePhraseId;
      this.gazeFor = 0;
    }
    if (this.gazeId) {
      const total = (this.gazeTotals.get(this.gazeId) ?? 0) + dt;
      this.gazeTotals.set(this.gazeId, total);
      if (total >= 1.6 && !this.read.has(this.gazeId)) {
        this.read.add(this.gazeId);
        this.readOrder.push(this.gazeId);
      }
    }
    // Encounters: a settled look is a meeting; a meeting ends when attention leaves.
    // Touching the words settles attention on them at once.
    this.encounterStarted = [];
    if (this.touched) {
      if (this.gazeId !== this.touched) {
        this.gazeId = this.touched;
        this.gazeFor = 0;
      }
      this.gazeFor = Math.max(this.gazeFor, ENCOUNTER.settle);
      if (!this.read.has(this.touched)) {
        this.read.add(this.touched);
        this.readOrder.push(this.touched);
      }
      this.touched = null;
    }
    for (const [id, e] of this.encounters) if (e.open && id !== this.gazeId) e.open = false;
    if (this.gazeId) {
      let e = this.encounters.get(this.gazeId);
      if (e?.open) e.lastSeen = this.t;
      else if (this.gazeFor >= ENCOUNTER.settle) {
        if (!e) this.encounters.set(this.gazeId, (e = { count: 0, startedAt: this.t, lastSeen: this.t, open: false }));
        if (e.count === 0 || this.t - e.lastSeen - this.gazeFor >= ENCOUNTER.apart) {
          e.count++;
          e.startedAt = this.t;
          this.encounterStarted.push({ id: this.gazeId, count: e.count });
        }
        e.open = true;
        e.lastSeen = this.t;
      }
    }

    if (inp.gazeChair) {
      this.gazeChairFor += dt;
      this.totalChairGaze += dt;
    } else this.gazeChairFor = 0;
    {
      const fx = -Math.sin(inp.yaw), fz = -Math.cos(inp.yaw), n = Math.hypot(inp.x, inp.z);
      const inView = n < 0.6 || (fx * -inp.x + fz * -inp.z) / n > Math.cos((50 * Math.PI) / 180);
      this.chairOutOfViewFor = inView ? 0 : this.chairOutOfViewFor + dt;
    }
    this.gazeChair = inp.gazeChair;
  }

  /**
   * Moving toward the chair (`sign` 1) or straight away from it (−1): the last half-second's travel
   * within `within`° of that way. Not moving: no evidence against going toward it, none for going away.
   */
  private heading(x: number, z: number, sign: 1 | -1 = 1, within = 25): boolean {
    const back = this.trail.filter((p) => this.t - p.t <= 0.6);
    const from = back[0];
    if (!from) return sign === 1;
    const mx = x - from.x, mz = z - from.z;
    const m = Math.hypot(mx, mz);
    if (m < 0.05) return sign === 1;
    const bx = -x * sign, bz = -z * sign, b = Math.hypot(bx, bz) || 1;
    return (mx * bx + mz * bz) / (m * b) > Math.cos((within * Math.PI) / 180);
  }

  /** The approach in progress, or the last one. */
  get lastApproach(): ApproachRecord | undefined {
    return this.approaches[this.approaches.length - 1];
  }

  /** Approaches that were approaches (not walking past the chair). */
  get comings(): ApproachRecord[] {
    return this.approaches.filter((a) => a.confirmed);
  }

  /** The visitor touched these words: treat it as deliberate, settled attention. */
  touch(id: string): void {
    this.touched = id;
  }

  encounterCount(id: string): number {
    return this.encounters.get(id)?.count ?? 0;
  }

  /** Seconds near the chair in the current approach (0 if not near). */
  get nearFor(): number {
    return this.near ? this.t - this.nearSince : 0;
  }

  get sinceWithdraw(): number {
    return this.t - this.lastWithdrawAt;
  }

  snapshot() {
    return {
      t: +this.t.toFixed(1),
      distance: +this.distance.toFixed(2),
      speed: +this.speed.toFixed(2),
      stillFor: +this.stillFor.toFixed(1),
      deepStillFor: +this.deepStillFor.toFixed(1),
      near: this.near,
      nearFor: +this.nearFor.toFixed(1),
      approaches: this.approaches.length,
      hesitations: this.hesitations,
      read: this.read.size,
      gaze: this.gazeId,
      gazeFor: +this.gazeFor.toFixed(1),
      kneeling: this.kneeling,
      surfaces: [...this.surfacesVisited].join(','),
    };
  }
}
