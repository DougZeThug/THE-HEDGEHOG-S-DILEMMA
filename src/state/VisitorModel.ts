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
    const step = Math.hypot(dx, dz);
    this.x = inp.x;
    this.z = inp.z;
    this.movedDistance += step;
    const instSpeed = dt > 0 ? step / dt : 0;
    this.speed = approach(this.speed, instSpeed, dt, 0.25);

    let dyaw = inp.yaw - this.lastYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const look = Math.abs(dyaw) + Math.abs(inp.pitch - this.lastPitch);
    this.lastYaw = inp.yaw;
    this.lastPitch = inp.pitch;
    this.lookActivity = approach(this.lookActivity, dt > 0 ? look / dt : 0, dt, 0.6);

    // Stillness
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
    this.longestStill = Math.max(this.longestStill, this.deepStillFor);

    this.kneeling = inp.kneeling;
    if (inp.kneeling) this.kneelTime += dt;

    // Distance to chair and approach/withdraw cycles (hysteresis).
    this.distance = Math.hypot(inp.x, inp.z);
    this.distanceSlow = approach(this.distanceSlow, this.distance, dt, 4);
    if (!this.near && this.distance < BANDS.near) {
      this.near = true;
      this.nearSince = this.t;
      this.lastApproachAt = this.t;
      this.approaches.push({ enteredAt: this.t, leftAt: null, dwell: 0 });
      this.armedWithdraw = false;
    } else if (this.near && this.distance > BANDS.near + 0.25) {
      this.near = false;
      const rec = this.approaches[this.approaches.length - 1];
      if (rec) {
        rec.leftAt = this.t;
        rec.dwell = this.t - rec.enteredAt;
      }
      this.armedWithdraw = true;
    }
    if (this.near) {
      this.totalNear += dt;
      const rec = this.approaches[this.approaches.length - 1];
      if (rec) rec.dwell = this.t - rec.enteredAt;
    }
    if (this.armedWithdraw && this.distance > BANDS.withdraw) {
      this.armedWithdraw = false;
      this.lastWithdrawAt = this.t;
      const rec = this.approaches[this.approaches.length - 1];
      // A hesitation: came close, did not stay, went back out.
      if (rec && rec.dwell < 9) this.hesitations++;
    }
    if (this.distance > BANDS.far) this.totalFar += dt;

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
