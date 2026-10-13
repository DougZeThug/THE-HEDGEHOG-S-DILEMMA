import type { VisitorModel } from './VisitorModel';

/**
 * Engagement — what the visitor *does*, as discrete signals, and how far the visit has
 * gone because of it.
 *
 * Every kind of attention counts: reading, coming back to a line, touching writing or the
 * chair, approaching it, kneeling, looking around, crossing the room, pausing on purpose,
 * writing something. Stillness is one of these, not the key to the others. The visit's
 * depth grows with what the visitor does, and slowly by itself, so a visitor who only
 * stands and listens still sees the room change — just later.
 */

export type SignalKind =
  | 'read' // attention settled on a line
  | 'return' // met a line again after looking away
  | 'tap' // touched / clicked writing
  | 'tap-chair'
  | 'approach' // came near the chair
  | 'kneel'
  | 'sweep' // looked around the room
  | 'cross' // moved to another part of the room
  | 'pause' // stopped, after moving or looking, and stayed stopped
  | 'linger' // stayed with the chair (every 15 s near it)
  | 'contribute';

export interface Signal {
  kind: SignalKind;
  t: number;
  /** Phrase involved, if any. */
  id?: string;
}

/** Attention to the material (reading, coming back, touching, kneeling, writing) counts for more than moving about. */
const WEIGHT: Record<SignalKind, number> = {
  read: 1.2, return: 3, tap: 1, 'tap-chair': 0.8, approach: 1.6, kneel: 2.5, sweep: 0.25, cross: 0.35, pause: 1.2, linger: 1.4, contribute: 4,
};
/** Depth gained per second just by being there (a still visitor still gets somewhere). */
const PASSIVE = 0.03;

type Zone = 'chair' | 'north' | 'east' | 'south' | 'west' | 'middle';

export class Engagement {
  depth = 0;
  readonly log: Signal[] = [];
  /** Signals raised on the current tick. */
  fresh: Signal[] = [];
  private seenApproaches = 0;
  private seenReturns = new Map<string, number>();
  private kneelNoted = false;
  private yawWindow: { t: number; d: number }[] = [];
  private lastYaw: number | null = null;
  private lastSweep = -Infinity;
  private zone: Zone | null = null;
  private zoneCandidate: Zone | null = null;
  private zoneSince = 0;
  private pauseArmed = false;
  private movedAt = 0;
  private lingered = 0;

  /** Signals per second over the last 30 s: how actively the visitor is engaging. */
  activity(now: number): number {
    let n = 0;
    for (let i = this.log.length - 1; i >= 0 && now - this.log[i].t < 30; i--) n += WEIGHT[this.log[i].kind];
    return n / 30;
  }

  last(): Signal | undefined {
    return this.log[this.log.length - 1];
  }

  count(kind: SignalKind): number {
    return this.log.filter((s) => s.kind === kind).length;
  }

  raise(kind: SignalKind, t: number, id?: string) {
    const s: Signal = { kind, t, id };
    this.log.push(s);
    this.fresh.push(s);
    this.depth += WEIGHT[kind];
    if (this.log.length > 300) this.log.shift();
  }

  update(dt: number, v: VisitorModel, yaw: number) {
    this.fresh = [];
    const t = v.t;
    this.depth += PASSIVE * dt;

    for (const e of v.encounterStarted) {
      if (e.count === 1) this.raise('read', t, e.id);
      else if ((this.seenReturns.get(e.id) ?? 0) < e.count) this.raise('return', t, e.id);
      this.seenReturns.set(e.id, e.count);
    }
    if (v.approaches.length > this.seenApproaches) {
      this.seenApproaches = v.approaches.length;
      this.raise('approach', t);
    }
    if (v.kneeling && !this.kneelNoted && v.kneelTime > 1) {
      this.kneelNoted = true;
      this.raise('kneel', t);
    }
    if (!v.kneeling) this.kneelNoted = false;
    if (!v.near) this.lingered = 0;
    else if (v.nearFor >= 15 * (this.lingered + 1)) {
      this.lingered++;
      this.raise('linger', t);
    }

    // Looking around: more than ~130° of turning within 6 s.
    if (this.lastYaw !== null) {
      let d = yaw - this.lastYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yawWindow.push({ t, d: Math.abs(d) });
    }
    this.lastYaw = yaw;
    while (this.yawWindow.length && t - this.yawWindow[0].t > 6) this.yawWindow.shift();
    const turned = this.yawWindow.reduce((s, x) => s + x.d, 0);
    if (turned > 2.3 && t - this.lastSweep > 12) {
      this.lastSweep = t;
      this.yawWindow = [];
      this.raise('sweep', t);
    }

    // Moving to another part of the room (held for a moment, so passing through doesn't count).
    const z = zoneOf(v);
    if (z !== this.zoneCandidate) {
      this.zoneCandidate = z;
      this.zoneSince = t;
    } else if (z !== this.zone && t - this.zoneSince > 1.5) {
      if (this.zone !== null && z !== 'chair') this.raise('cross', t);
      this.zone = z;
    }

    // A deliberate pause: stopping after moving or looking, and staying stopped.
    if (v.speed > 0.15 || v.lookActivity > 0.5) {
      this.pauseArmed = true;
      this.movedAt = t;
    }
    if (this.pauseArmed && v.deepStillFor > 4 && t - this.movedAt > 4) {
      this.pauseArmed = false;
      this.raise('pause', t);
    }
  }
}

function zoneOf(v: VisitorModel): Zone {
  if (v.distance < 1.3) return 'chair';
  const ax = Math.abs(v.x), az = Math.abs(v.z);
  if (Math.max(ax, az) < 1.6) return 'middle';
  if (ax > az) return v.x > 0 ? 'east' : 'west';
  return v.z > 0 ? 'south' : 'north';
}
