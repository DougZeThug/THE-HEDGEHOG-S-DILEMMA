import { readFileSync } from 'node:fs';
import { Director, ROOM_OWN } from '../../src/state/Director';
import { OPENING_WRITTEN, OPENING_SPOKEN, OPENING_UNFINISHED } from '../../src/state/OpeningScore';
import { PHRASE_BY_ID } from '../../src/content/phrases';
import { VIGNETTES, spokenLines, lineKey } from '../../src/content/vignettes';
import { allVersions, versionKeys, voicesId } from '../../src/content/memory-voices';
import { Rng } from '../../src/core/rng';
import { FIELD_KEYS, type FieldValues } from '../../src/state/EmotionalField';
import type { Surface } from '../../src/content/types';
import type { Cue, TimedCue } from '../../src/state/cues';
import type { Interpretation } from '../../src/interpret/schema';
import { classify, facingOf, nearWall, readable, memorySpan, vignetteSpan, type Kind } from './measure';

/**
 * Closed-loop visitors (docs/reviews/2026-11-core-loop.md).
 *
 * The scripted personas (personas.ts) are films of a body: they never react to the room. These
 * are small policies with a genome (how they move, what they are drawn to, how long they stay
 * with things) that perceive what the room does, with a field of view, and act on it: they turn
 * to new writing, go toward a sound beyond a wall, back off when the room flinches, come to the
 * chair when it is spoken from. Their reactions are assumptions, not observations: they make the
 * loop testable, they do not say what a person feels.
 *
 * Movement is bounded as the rig's is (CameraRig): keyboard walking 1.05 m/s (Shift 0.47),
 * walking to a target (F, a tap) at most 0.55 m/s easing in, a phone's drag at any speed up to
 * 1.05; velocity eases with a 0.45 s time constant; no teleports.
 */

export type Device = 'desktop' | 'phone';
export type Manner = 'direct' | 'pausing' | 'slow' | 'never';

export interface Genome {
  id: string;
  /** For the report: the kind of visitor this was drawn as. */
  cls: string;
  device: Device;
  /** How they walk when they choose where to go: keys, Shift, walking to a target (F / tap), a drag. */
  move: 'keys' | 'shift' | 'auto' | 'drag';
  /** A phone drag's speed (m/s). */
  drag: number;
  /** 0 stands about, 1 keeps moving. */
  tempo: number;
  /** Weight of going to read something. */
  reading: number;
  /** Seconds they stay with a line. */
  span: number;
  /** Chance a line they choose is one they have read before. */
  revisit: number;
  /** Weight of going to the chair. */
  chair: number;
  manner: Manner;
  /** Chance of kneeling once at the chair. */
  kneel: number;
  chairStay: number;
  /** Chance of touching (tapping, clicking) a line they choose to read. */
  tap: number;
  /** How much what the room does redirects them. */
  curiosity: number;
  /** Chance they stop and step back when the room flinches at them. */
  flinchy: number;
  /** Chance the next approach after a flinch is gentler. */
  learns: number;
  /** Chance they leave something of their own on the wall once. */
  writes: number;
  /** When they mean to leave (s). */
  session: number;
  /** How: from the menu (the visit just ends), by turning to the door and standing there, or not at all. */
  leave: 'menu' | 'turn' | 'none';
  /** Kneels wherever they are (K) rather than at the chair. */
  kneelAnywhere?: boolean;
  /** Looks only at the floor and the ceiling. */
  floorOnly?: boolean;
  /** Keeps to the walls. */
  wallHugger?: boolean;
}

const SPAWN: [number, number] = [0, 2.85];
const LIMIT = 2.85;
const YAW: Record<Surface, number> = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2, floor: 0, ceiling: 0 };
const WALLS: Surface[] = ['north', 'east', 'south', 'west'];

const clampRoom = (v: number) => Math.max(-LIMIT, Math.min(LIMIT, v));
const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
/** Yaw that faces a point from another (0 = north, +π/2 = west). */
const yawTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(-(tx - fx), -(tz - fz));
/** Where to stand to read a wall (about 1.3 m from it), at a lateral offset. */
function standFor(s: Surface, lateral: number): [number, number] {
  const l = Math.max(-1.8, Math.min(1.8, lateral));
  switch (s) {
    case 'north': return [l, -1.9];
    case 'south': return [l, 1.9];
    case 'east': return [1.9, l];
    case 'west': return [-1.9, l];
    default: return [0.6, 0.9];
  }
}

// ───────────────────────────── genomes ─────────────────────────────

const pick = <T>(r: Rng, xs: readonly T[]) => xs[r.int(0, xs.length - 1)];

/** Draw a visitor of a class. The priors are guesses about kinds of people, said plainly. */
export function drawGenome(cls: string, r: Rng, i: number): Genome {
  const phone = cls === 'phone' || (cls === 'mixed' && r.chance(0.45));
  const device: Device = phone ? 'phone' : 'desktop';
  const move: Genome['move'] = phone ? (r.chance(0.6) ? 'drag' : 'auto') : r.chance(0.72) ? 'keys' : r.chance(0.5) ? 'auto' : 'shift';
  const g: Genome = {
    id: `${cls}-${i}`, cls, device, move,
    drag: r.range(0.35, 1.05),
    tempo: r.range(0.2, 0.8),
    reading: r.range(0.3, 1),
    span: r.range(2.5, 8),
    revisit: r.range(0.1, 0.4),
    chair: r.range(0.2, 0.8),
    manner: pick(r, ['direct', 'direct', 'pausing', 'slow'] as const),
    kneel: r.range(0, 0.5),
    chairStay: r.range(5, 30),
    tap: phone ? r.range(0.3, 0.9) : r.range(0, 0.25),
    curiosity: r.range(0.2, 0.9),
    flinchy: r.range(0.3, 0.9),
    learns: r.range(0.2, 0.8),
    writes: r.range(0, 0.3),
    session: r.range(240, 600),
    leave: r.chance(0.5) ? 'menu' : r.chance(0.5) ? 'turn' : 'none',
  };
  switch (cls) {
    case 'reader':
      Object.assign(g, { reading: r.range(0.8, 1.4), span: r.range(4, 10), chair: r.range(0.05, 0.4), tempo: r.range(0.3, 0.6), revisit: r.range(0.2, 0.5) });
      break;
    case 'chair':
      Object.assign(g, { chair: r.range(0.9, 1.6), kneel: r.range(0.3, 0.9), chairStay: r.range(15, 60), reading: r.range(0.1, 0.5), manner: pick(r, ['direct', 'direct', 'pausing', 'slow'] as const) });
      break;
    case 'explorer':
      Object.assign(g, { tempo: r.range(0.75, 1), span: r.range(1.8, 4), reading: r.range(0.4, 0.9), chair: r.range(0.2, 0.6), chairStay: r.range(3, 10) });
      break;
    case 'still':
      Object.assign(g, { tempo: r.range(0, 0.15), reading: r.range(0.1, 0.5), chair: r.range(0, 0.3), span: r.range(6, 15), curiosity: r.range(0.05, 0.4) });
      break;
    case 'phone':
      Object.assign(g, { span: r.range(2, 6), tap: r.range(0.5, 1) });
      break;
  }
  return g;
}

/** Visitors chosen to break things: what does the room do with them? */
export function adversaries(): Genome[] {
  const base: Genome = {
    id: '', cls: 'adversary', device: 'desktop', move: 'keys', drag: 0.8, tempo: 0.5, reading: 0.6, span: 4, revisit: 0.2, chair: 0.5,
    manner: 'direct', kneel: 0.3, chairStay: 10, tap: 0.1, curiosity: 0.5, flinchy: 0.5, learns: 0.5, writes: 0, session: 600, leave: 'none',
  };
  return [
    { ...base, id: 'speed-walker', tempo: 1, span: 1, reading: 0.4, chairStay: 2, curiosity: 0.1 },
    { ...base, id: 'idle', tempo: 0, reading: 0, chair: 0, span: 30, curiosity: 0, manner: 'never' },
    { ...base, id: 'tap-spammer', device: 'phone', move: 'drag', tap: 1, span: 1.2, reading: 1.5, tempo: 0.7 },
    { ...base, id: 'kneel-anywhere', kneelAnywhere: true, kneel: 1 },
    { ...base, id: 'wall-hugger', wallHugger: true, chair: 0, manner: 'never', tempo: 0.8 },
    { ...base, id: 'never-chair', chair: 0, manner: 'never', reading: 1 },
    { ...base, id: 'early-leaver', session: 75, leave: 'turn' },
    { ...base, id: 'floor-reader', floorOnly: true, reading: 1, chair: 0.6 },
  ];
}

export const CLASSES = ['reader', 'chair', 'explorer', 'still', 'phone', 'mixed'];

// ───────────────────────────── the policy ─────────────────────────────

interface Frame {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  gaze: string | null;
  gazeChair: boolean;
  kneeling: boolean;
  tap?: { phraseId?: string; chair?: boolean };
  write?: boolean;
}

type Intent =
  | { k: 'read'; id: string; face: Surface; stand: [number, number]; until: number | null; tapped: boolean }
  | { k: 'chair'; stage: 'ring' | 'pause' | 'in' | 'stay' | 'back'; until: number; manner: Manner }
  | { k: 'still'; until: number; yaw: number; chair?: boolean }
  | { k: 'wander'; to: [number, number]; until: number }
  | { k: 'listen'; face: Surface; stand: [number, number]; until: number | null }
  | { k: 'leave'; until: number | null }
  | { k: 'watch'; until: number };

/** What the visitor could perceive this tick. */
export interface Percept {
  /** Writing that appeared, and where. */
  writing: { id: string | null; surface: Surface | null }[];
  /** Voices and sounds, and where they come from. */
  sounds: { at: string; surface: Surface | null }[];
  /** The room's light changing at once (a flash, a dim). */
  light: ('warm' | 'cold' | 'dim' | 'recoil')[];
  /** A memory has begun (they watch it). */
  memoryUntil: number | null;
}

export class Policy {
  x = SPAWN[0];
  z = SPAWN[1];
  yaw = 0;
  pitch = -0.04;
  private vx = 0;
  private vz = 0;
  private yawVel = 0;
  private intent: Intent | null = null;
  private kneeling = false;
  private wrote = false;
  private writeAt: number;
  private nextManner: Manner;
  /** Lines this visitor has read (its own memory of the room). */
  private readSet = new Set<string>();
  private chairVisits = 0;
  /** What the policy did, for the report. */
  log: { t: number; kind: 'tap' | 'tap-chair' | 'write' | 'flinch-back'; phrase?: string }[] = [];
  leftAt: number | null = null;
  private walkTarget: [number, number] | null = null;
  private walkSpeed = 1.05;
  private walkAuto = false;
  private lookYaw: number | null = null;
  private tapChair = false;
  private confirmed = false;
  private sawEbb: number | null = null;

  constructor(readonly g: Genome, private r: Rng) {
    this.writeAt = r.range(60, Math.max(90, g.session * 0.7));
    this.nextManner = g.manner;
  }

  private speedFor(gentle = false): { s: number; auto: boolean } {
    const g = this.g;
    if (gentle) return g.device === 'phone' || g.move === 'auto' ? { s: 0.55, auto: true } : { s: 0.47, auto: false };
    switch (g.move) {
      case 'keys': return { s: 1.05, auto: false };
      case 'shift': return { s: 0.47, auto: false };
      case 'auto': return { s: 0.55, auto: true };
      case 'drag': return { s: g.drag, auto: false };
    }
  }

  private turnRate() {
    return this.g.device === 'phone' ? 2.2 : this.g.move === 'keys' || this.g.move === 'shift' ? 2.6 : 3;
  }

  private walk(to: [number, number] | null, gentle = false) {
    this.walkTarget = to ? [clampRoom(to[0]), clampRoom(to[1])] : null;
    const sp = this.speedFor(gentle);
    this.walkSpeed = sp.s;
    this.walkAuto = sp.auto;
  }

  private arrived(eps = 0.08) {
    return !this.walkTarget || Math.hypot(this.walkTarget[0] - this.x, this.walkTarget[1] - this.z) < eps;
  }

  get distance() {
    return Math.hypot(this.x, this.z);
  }

  /** The chair in view (about 40° either side at a desk, 20° on an upright phone). */
  chairInView(): boolean {
    const half = ((this.g.device === 'phone' ? 20 : 40) * Math.PI) / 180;
    const n = this.distance;
    if (n < 0.6) return true;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    return (fx * -this.x + fz * -this.z) / n > Math.cos(half);
  }

  private choose(t: number, d: Director, writtenOn: Map<string, Surface>) {
    const g = this.g;
    const r = this.r;
    const shown = [...d.visible.entries()].filter(([, s]) => s.mode === 'shown').map(([id]) => id);
    const onWalls = shown.filter((id) => {
      const s = writtenOn.get(id) ?? PHRASE_BY_ID.get(id)?.surface;
      return g.floorOnly ? s === 'floor' || s === 'ceiling' : s !== 'floor' && s !== 'ceiling';
    });
    const chairW = g.manner === 'never' ? 0 : g.chair / (1 + this.chairVisits * 0.6);
    const w = { read: onWalls.length ? g.reading : 0, chair: chairW, still: (1 - g.tempo) * 0.8, wander: g.tempo * 0.6 };
    const total = w.read + w.chair + w.still + w.wander;
    let x = r.next() * total;
    if ((x -= w.read) < 0) {
      const unread = onWalls.filter((id) => !this.readSet.has(id));
      const pool = unread.length && !r.chance(g.revisit) ? unread : onWalls;
      // Nearer lines are likelier: people read what is in front of them.
      const id = pool[r.int(0, pool.length - 1)];
      const face = (writtenOn.get(id) ?? PHRASE_BY_ID.get(id)!.surface) as Surface;
      const at = PHRASE_BY_ID.get(id)?.at;
      const lateral = at ? (at[0] - 0.5) * 4 : r.range(-1.5, 1.5);
      const stand: [number, number] = face === 'floor' ? [r.range(-0.5, 0.5), 0.9] : face === 'ceiling' ? [r.range(-1, 1), r.range(-1, 1)] : standFor(face, lateral);
      // Close enough already (same wall, within ~1.4 m of the stand): turn to it, don't walk.
      const there = Math.hypot(stand[0] - this.x, stand[1] - this.z) < 1.4;
      this.intent = { k: 'read', id, face, stand: there ? [this.x, this.z] : stand, until: null, tapped: false };
      this.walk(there ? null : stand);
    } else if ((x -= w.chair) < 0) {
      this.chairVisits++;
      const m = this.nextManner;
      this.intent = { k: 'chair', stage: m === 'pausing' && this.distance > 2.2 ? 'ring' : 'in', until: t + 60, manner: m };
      this.startChairLeg();
    } else if ((x -= w.still) < 0) {
      const face = g.floorOnly ? 'north' : pick(r, WALLS.filter((s) => s !== 'south' || r.chance(0.3)));
      this.intent = { k: 'still', until: t + r.range(4, 6) * (1 + (1 - g.tempo) * 2), yaw: YAW[face] + r.range(-0.3, 0.3) };
      this.walk(null);
    } else {
      const to: [number, number] = g.wallHugger ? pick(r, [[2.6, r.range(-2.6, 2.6)], [-2.6, r.range(-2.6, 2.6)], [r.range(-2.6, 2.6), 2.6], [r.range(-2.6, 2.6), -2.6]] as [number, number][]) : [r.range(-2.4, 2.4), r.range(-2.4, 2.4)];
      this.intent = { k: 'wander', to, until: t + 12 };
      this.walk(to);
    }
  }

  private startChairLeg() {
    const it = this.intent;
    if (!it || it.k !== 'chair') return;
    const n = this.distance || 1;
    const ux = this.x / n, uz = this.z / n;
    if (it.stage === 'ring') {
      const ring = this.r.range(1.6, 2.1);
      this.walk([ux * ring, uz * ring]);
    } else {
      const stop = this.r.range(0.65, 0.95);
      // A slow manner walks gently (Shift, or walking to it); a phone's tap on the chair walks there.
      const gentle = it.manner === 'slow' || (this.g.device === 'phone' && this.g.tap > 0.5);
      // (A phone visitor who taps the chair is walked there by the App.)
      if (this.g.device === 'phone' && this.g.tap > 0.5) this.tapChair = true;
      this.walk([ux * stop, uz * stop], gentle);
    }
  }

  /** One tick: perceive, decide, move. */
  step(t: number, dt: number, d: Director, writtenOn: Map<string, Surface>, p: Percept): Frame {
    const g = this.g;
    const r = this.r;
    let tap: Frame['tap'];
    let write = false;

    // A memory: they watch it where they are.
    if (p.memoryUntil !== null) {
      this.intent = { k: 'watch', until: p.memoryUntil };
      this.walk(null);
    }
    // Leaving.
    if (this.leftAt === null && g.leave !== 'none' && t >= g.session && this.intent?.k !== 'watch') {
      if (g.leave === 'menu') this.leftAt = t;
      else if (this.intent?.k !== 'leave') {
        this.intent = { k: 'leave', until: null };
        this.walk([this.r.range(-0.4, 0.6), 2.5]);
      }
    }
    // The room flinching at them as they come close.
    if (this.intent?.k === 'chair' && (this.intent.stage === 'in' || this.intent.stage === 'stay') && p.light.includes('recoil') && this.distance < 2.2 && r.chance(g.flinchy)) {
      this.log.push({ t, kind: 'flinch-back' });
      const n = this.distance || 1;
      this.intent = { k: 'chair', stage: 'back', until: t + r.range(3, 7), manner: this.intent.manner };
      this.walk([(this.x / n) * 2.3, (this.z / n) * 2.3]);
      if (r.chance(g.learns)) this.nextManner = r.chance(0.5) ? 'pausing' : 'slow';
    } else if (p.light.includes('warm') && this.intent?.k === 'chair') this.intent.until += g.chairStay * 0.3;

    // Curiosity: what the room does redirects them, sometimes.
    const busy = this.intent && (this.intent.k === 'watch' || this.intent.k === 'leave' || (this.intent.k === 'chair' && this.intent.stage === 'stay' && this.kneeling));
    if (!busy) {
      const facing = facingOf(this.yaw);
      const fresh = p.writing.find((w) => w.id && w.surface === facing && PHRASE_BY_ID.has(w.id));
      const beyond = p.sounds.find((s) => s.at === 'beyond' && s.surface);
      const fromChair = p.sounds.find((s) => s.at === 'chair');
      if (fresh?.id && !(this.intent?.k === 'read' && this.intent.id === fresh.id) && r.chance(g.curiosity * 0.5)) {
        this.intent = { k: 'read', id: fresh.id, face: facing, stand: [this.x, this.z], until: null, tapped: false };
        this.walk(null);
      } else if (beyond?.surface && r.chance(g.curiosity * 0.4)) {
        const stand = standFor(beyond.surface, r.range(-1.2, 1.2));
        this.intent = { k: 'listen', face: beyond.surface, stand, until: null };
        this.walk(stand);
      } else if (fromChair && g.manner !== 'never' && this.intent?.k !== 'chair' && r.chance(g.curiosity * g.chair * 0.5)) {
        this.intent = { k: 'chair', stage: 'in', until: t + 60, manner: this.nextManner };
        this.startChairLeg();
      }
    }

    // Their own wish to write.
    if (!this.wrote && t >= this.writeAt && g.writes > 0 && this.intent?.k !== 'watch' && this.leftAt === null) {
      this.wrote = true;
      if (r.chance(g.writes)) {
        write = true;
        this.log.push({ t, kind: 'write' });
      }
    }

    if (!this.intent) this.choose(t, d, writtenOn);
    const it = this.intent!;
    let gaze: string | null = null;
    let gazeChair = false;
    let face: number | null = this.lookYaw;
    switch (it.k) {
      case 'read': {
        const s = it.face;
        const target = s === 'floor' ? yawTo(this.x, this.z, 0, 0) : s === 'ceiling' ? this.yaw : YAW[s];
        face = target;
        this.pitch = s === 'floor' ? -0.6 : s === 'ceiling' ? 0.6 : -0.04;
        if (this.arrived(0.15) && Math.abs(wrap(this.yaw - target)) < 0.5) {
          if (it.until === null) {
            it.until = t + g.span * r.range(0.6, 1.4);
            if (r.chance(g.tap)) {
              tap = { phraseId: it.id };
              this.log.push({ t, kind: 'tap', phrase: it.id });
            }
          }
          gaze = it.id;
          this.readSet.add(it.id);
          if (t >= it.until) this.intent = null;
        }
        break;
      }
      case 'chair': {
        face = yawTo(this.x, this.z, 0, 0);
        this.pitch = -0.4;
        gazeChair = Math.abs(wrap(this.yaw - face)) < 0.3;
        if (it.stage === 'ring' && this.arrived(0.12)) {
          it.stage = 'pause';
          it.until = t + r.range(1.2, 4);
        } else if (it.stage === 'pause' && t >= it.until) {
          it.stage = 'in';
          it.until = t + 60;
          this.startChairLeg();
        } else if (it.stage === 'in' && this.arrived(0.1)) {
          it.stage = 'stay';
          it.until = t + g.chairStay * r.range(0.6, 1.4);
          if (r.chance(g.kneel) && this.distance < 1.3) this.kneeling = true;
        } else if (it.stage === 'stay' && t >= it.until) {
          this.kneeling = false;
          // Step back out, or go on to something else from here.
          if (r.chance(0.5)) {
            const n = this.distance || 1;
            it.stage = 'back';
            it.until = t + 8;
            this.walk([(this.x / n) * 2.4, (this.z / n) * 2.4]);
          } else this.intent = null;
        } else if (it.stage === 'back' && (this.arrived(0.12) || t >= it.until)) {
          // Stepped back: often they look back at it a moment (an assumption).
          if (r.chance(0.6)) this.intent = { k: 'still', until: t + r.range(1.5, 5), yaw: yawTo(this.x, this.z, 0, 0), chair: true };
          else this.intent = null;
        } else if (it.stage === 'in' && t >= it.until) this.intent = null;
        break;
      }
      case 'still':
        face = it.yaw;
        this.pitch = g.floorOnly ? -0.7 : it.chair ? -0.35 : -0.04;
        if (it.chair) gazeChair = Math.abs(wrap(this.yaw - it.yaw)) < 0.3;
        if (t >= it.until) this.intent = null;
        break;
      case 'wander':
        face = this.walkTarget ? yawTo(this.x, this.z, this.walkTarget[0], this.walkTarget[1]) + Math.sin(t * 0.9) * 0.5 : this.yaw;
        this.pitch = g.floorOnly ? -0.7 : -0.04;
        if (this.arrived(0.2) || t >= it.until) this.intent = null;
        break;
      case 'listen':
        face = YAW[it.face];
        if (this.arrived(0.15)) {
          it.until ??= t + r.range(4, 9);
          if (t >= it.until) this.intent = null;
        }
        break;
      case 'leave':
        // To the wall they came in by; if the way out is written there, touch it and stand still.
        face = Math.PI;
        this.pitch = -0.04;
        if (this.arrived(0.12) && Math.abs(wrap(this.yaw - Math.PI)) < 0.08) {
          if (it.until === null) {
            it.until = t + 25;
            if (d.visible.has('party-early') && writtenOn.get('party-early') !== 'east' && writtenOn.get('party-early') !== 'west' && writtenOn.get('party-early') !== 'north') {
              tap = { phraseId: 'party-early' };
              this.log.push({ t, kind: 'tap', phrase: 'party-early' });
            }
          }
          gaze = d.visible.has('party-early') ? 'party-early' : null;
          // Once the room has begun to let them go (they see it ebb), they touch it again.
          if (p.light.includes('dim')) this.sawEbb ??= t;
          if (this.sawEbb !== null && t - this.sawEbb >= 2.5 && !this.confirmed) {
            this.confirmed = true;
            tap = { phraseId: 'party-early' };
          }
          if (t >= it.until) this.leftAt = t;
        }
        break;
      case 'watch':
        if (t >= it.until) this.intent = null;
        break;
    }
    if (this.tapChair) {
      this.tapChair = false;
      tap = { chair: true };
      this.log.push({ t, kind: 'tap-chair' });
    }
    if (g.kneelAnywhere && it.k === 'still' && !this.kneeling && r.chance(0.02)) this.kneeling = true;
    if (it.k !== 'chair' && it.k !== 'still') this.kneeling = false;
    if (g.kneelAnywhere && it.k !== 'still') this.kneeling = false;

    // Move: the rig's easing and limits. Kneeling holds them.
    let tx = 0, tz = 0;
    if (this.walkTarget && !this.kneeling) {
      const dx = this.walkTarget[0] - this.x, dz = this.walkTarget[1] - this.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.04) this.walkTarget = null;
      else {
        const v = this.walkAuto ? Math.min(this.walkSpeed, len * 0.9) : Math.min(this.walkSpeed, len * 4);
        tx = (dx / len) * v;
        tz = (dz / len) * v;
      }
    }
    const k = 1 - Math.exp(-dt / 0.45);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;
    this.x = clampRoom(this.x + this.vx * dt);
    this.z = clampRoom(this.z + this.vz * dt);
    // Never through the chair.
    const n = Math.hypot(this.x, this.z);
    if (n < 0.45) {
      this.x *= 0.45 / (n || 1);
      this.z *= 0.45 / (n || 1);
    }
    // Look: walking faces where they go unless they look at something.
    if (face === null && this.walkTarget) face = yawTo(this.x, this.z, this.walkTarget[0], this.walkTarget[1]);
    if (face !== null) {
      const dy = wrap(face - this.yaw);
      const rate = this.turnRate();
      this.yawVel = Math.max(-rate, Math.min(rate, dy * 3));
      this.yaw = wrap(this.yaw + this.yawVel * dt);
    }
    this.lookYaw = null;

    // A look that rests on writing: what they chose to read, or else what is in front of them when standing.
    if (!gaze && !gazeChair && it.k === 'still' && !it.chair) {
      const id = [...d.visible.entries()].find(([vid, s]) => s.mode === 'shown' && (writtenOn.get(vid) ?? PHRASE_BY_ID.get(vid)?.surface) === facingOf(this.yaw))?.[0];
      if (id) gaze = id;
    }
    return { x: this.x, z: this.z, yaw: this.yaw, pitch: this.pitch, gaze, gazeChair, kneeling: this.kneeling, tap, write };
  }
}

// ───────────────────────────── one visit ─────────────────────────────

const manifest = JSON.parse(readFileSync('public/voices/manifest.json', 'utf8')) as Record<string, string[]>;
/** What the App allows (vignettesAvailable): vignettes and painted memories' voices whose every line is kept. */
export const AVAILABLE = new Set<string>([
  ...VIGNETTES.filter((def) => Object.keys(def.variants).flatMap((k) => spokenLines(def, k)).every((l) => manifest[lineKey(def, l)]?.length)).map((d) => d.id),
  ...allVersions().filter((v) => versionKeys(v.id, v.variant, v.version).every((k) => manifest[k]?.length)).map((v) => voicesId(v.id, v.variant, v.version)),
]);

export type ActionKind = 'meet' | 'return' | 'tap' | 'tap-chair' | 'approach' | 'withdraw' | 'kneel' | 'pause' | 'pause-chair' | 'write' | 'turn';
export type AnswerKind = 'text' | 'voice' | 'sound' | 'music' | 'light' | 'silence' | 'memory' | 'chair' | 'none';

export interface Dev {
  t: number;
  rule: string;
  kind: Kind;
  label: string;
  room: boolean;
  phrase?: string;
  beside?: string;
  surface?: Surface;
  at?: string;
  /** Perceived as it happened (in view, or heard). */
  seen: boolean;
  /** Writing found later: its wall faced for 1.5 s within 60 s. */
  found?: boolean;
  cue: Cue['type'];
  flashKind?: 'warm' | 'cold';
  dim?: boolean;
}

export interface Action {
  t: number;
  kind: ActionKind;
  phrase?: string;
  surface?: Surface;
  /** For an arrival at the chair: the visit's first, a return after going away, or again (a step back and in). */
  manner?: 'first' | 'return' | 'again';
}

export interface ApproachRow {
  t: number;
  manner: 'first' | 'return' | 'again';
  answer: AnswerKind;
  dExposure: number;
  dWarmth: number;
}

export interface VisitSummary {
  genome: string;
  cls: string;
  device: Device;
  seed: number;
  arm: string;
  visit: number;
  seconds: number;
  actions: Record<string, { n: number; answered: number; caused: number; kinds: Record<string, number> }>;
  placebo: { n: number; hit: number };
  /** The chance baseline of each act's own criterion (caused answers at quiet moments). */
  placeboBy: Record<string, { n: number; hit: number }>;
  /** The same act on the same thing again (a line, the chair): how often the room gave the identical answer (a vending machine would always). */
  vending: { pairs: number; same: number };
  passive: { windows: number; empty: number };
  longestSeenGap: number;
  perMinute: number;
  voices: number;
  imposedQuiet: number;
  most20: number;
  overlaps: number;
  repeatsSameKind: number;
  reach: {
    memories: string[];
    vignettes: string[];
    kitchen: boolean;
    finishedAt: number | null;
    air: boolean;
    table: boolean;
    held: boolean;
    situations: string[];
    firstMemoryAt: number | null;
    offers: number;
  };
  approaches: ApproachRow[];
  field: Record<string, number[]>;
  phases: Record<string, number>;
  leaving: string | null;
  departure: string;
  /** Departed through the room itself (experiment C), and when. */
  leftInRoom: number | null;
  /** The room started letting them go (experiment C), and how often a leaving was cancelled. */
  ebbs: number;
  falseLeave: boolean;
  /** Labels of what happened (for comparing a second visit with the first). */
  labels: string[];
  memoryCounts: Record<string, number>;
}

export interface VisitOptions {
  seconds?: number;
  experiments?: readonly string[];
  arm?: string;
  past?: { visits: number; memoryCounts: Record<string, number>; trace: 'close' | null };
  interpretation?: Interpretation;
  dt?: number;
}

const answerOf = (x: Dev): AnswerKind =>
  /^(vignette|memory-scene|memory) /.test(x.label) || x.cue === 'memory' ? 'memory' : x.kind === 'text' ? 'text' : x.kind === 'chair' ? 'chair' : (x.kind as AnswerKind);

/** Is this development an answer, in place, to that action? (An act's own acknowledgement — the hum's dip at a touch — is not.) */
function local(a: Action, x: Dev): boolean {
  if (x.rule === 'tap') return false;
  switch (a.kind) {
    case 'meet':
    case 'return':
    case 'tap':
      return (
        (!!a.phrase && (x.phrase === a.phrase || x.beside === a.phrase)) ||
        (x.kind === 'text' && !!a.surface && x.surface === a.surface) ||
        (x.kind === 'voice' && x.at === 'beyond' && x.surface === a.surface) ||
        ((x.kind === 'voice' || x.kind === 'sound') && x.at === 'surface' && x.surface === a.surface) ||
        (a.kind === 'tap' && x.kind === 'silence')
      );
    case 'approach':
    case 'kneel':
    case 'tap-chair':
    case 'pause-chair':
      return x.at === 'chair' || x.surface === 'floor' || x.kind === 'light' || x.kind === 'silence' || x.kind === 'chair' || x.cue === 'air' || x.cue === 'vignette' || x.cue === 'memory-scene';
    case 'turn':
      return x.kind === 'text' && x.surface === a.surface;
    case 'withdraw':
    case 'pause':
    case 'write':
      return !x.room && x.rule !== 'contribution';
  }
}

/** Run one closed-loop visit and reduce it to its numbers at once. */
export function liveVisit(g: Genome, seed: number, o: VisitOptions = {}): VisitSummary {
  const seconds = o.seconds ?? 600;
  const dt = o.dt ?? 0.1;
  const d = new Director({ seed, experiments: o.experiments, visits: o.past?.visits, memoryCounts: o.past?.memoryCounts, trace: o.past?.trace ?? null });
  d.scenes.setAvailable(AVAILABLE);
  d.release({ written: OPENING_WRITTEN, spoken: OPENING_SPOKEN, unfinished: OPENING_UNFINISHED });
  const pol = new Policy(g, new Rng(seed * 104729 + hash(g.id)));
  const writtenOn = new Map<string, Surface>();
  for (const id of OPENING_WRITTEN) writtenOn.set(id, PHRASE_BY_ID.get(id)!.surface);
  const devs: Dev[] = [];
  const actions: Action[] = [];
  const traj: { t: number; yaw: number; x: number; z: number; facing: Surface }[] = [];
  const fieldSamples: FieldValues[] = [];
  const approaches: ApproachRow[] = [];
  const phases: Record<string, number> = {};
  let memoryEnds: { id: string; at: number } | null = null;
  let lastApproaches = 0, lastWithdraw = -Infinity, wasKneeling = false, pausedAt = -Infinity, facing: Surface = 'north', facingSince = 0, turnLogged = true;
  let imposedQuiet = 0, ebbs = 0;
  let leftInRoom: number | null = null;
  let t = 0;
  for (; t < seconds; t += dt) {
    if (pol.leftAt !== null || leftInRoom !== null) break;
    if (t >= 30 && t < 300 && (d.aftermath() || d.pacing.holding(d.now))) imposedQuiet += dt;
    if (memoryEnds && t >= memoryEnds.at) {
      d.memoryEnded(memoryEnds.id, true, true);
      memoryEnds = null;
    }
    const percept: Percept = { writing: [], sounds: [], light: [], memoryUntil: null };
    // (The percept is last tick's cues: the visitor reacts to what has just happened.)
    for (const x of devs.filter((x) => x.t > t - dt - 1e-6)) {
      if (x.kind === 'text' && x.seen) percept.writing.push({ id: x.phrase ?? null, surface: x.surface ?? null });
      if ((x.kind === 'voice' || x.kind === 'sound') && x.at) percept.sounds.push({ at: x.at, surface: x.surface ?? null });
      if (x.cue === 'flash' && x.flashKind) percept.light.push(x.flashKind);
      if (x.cue === 'flinch') percept.light.push('recoil');
      if (x.dim) percept.light.push('dim');
    }
    if (memoryEnds && devs.some((x) => x.t > t - dt - 1e-6 && (x.cue === 'memory-scene' || x.cue === 'vignette'))) percept.memoryUntil = memoryEnds.at;
    const f = pol.step(t, dt, d, writtenOn, percept);
    if (f.tap) {
      const ok = d.tapped(f.tap.chair ? { chair: true } : { phraseId: f.tap.phraseId });
      if (f.tap.chair) actions.push({ t, kind: 'tap-chair' });
      else if (ok && f.tap.phraseId) actions.push({ t, kind: 'tap', phrase: f.tap.phraseId, surface: writtenOn.get(f.tap.phraseId) ?? PHRASE_BY_ID.get(f.tap.phraseId)?.surface });
    }
    if (f.write && o.interpretation) {
      d.contribute('the kettle, and you not saying anything', o.interpretation);
      actions.push({ t, kind: 'write', surface: facingOf(f.yaw) });
    }
    const fc = facingOf(f.yaw);
    const cues: TimedCue[] = d.tick(dt, {
      x: f.x, z: f.z, yaw: f.yaw, pitch: f.pitch, gazePhraseId: readable(d, f.gaze, fc, writtenOn), gazeChair: f.gazeChair, nearSurface: nearWall(f.x, f.z), kneeling: f.kneeling,
    }, fc);
    traj.push({ t, yaw: f.yaw, x: f.x, z: f.z, facing: fc });
    if (Math.round(t / dt) % 20 === 0) fieldSamples.push({ ...d.field.v });
    if (d.phase !== 'arrival' && phases[d.phase] === undefined) phases[d.phase] = +t.toFixed(1);

    // What the visitor did, as the room could see it.
    const v = d.visitor;
    for (const e of v.encounterStarted) actions.push({ t, kind: e.count > 1 ? 'return' : 'meet', phrase: e.id, surface: writtenOn.get(e.id) ?? PHRASE_BY_ID.get(e.id)?.surface });
    // Coming to the chair, counted when they arrive (walking past is not an approach).
    const arrived = v.approaches.filter((a) => a.confirmed).length;
    if (arrived > lastApproaches) {
      lastApproaches = arrived;
      const comings = v.approaches.filter((a) => a.confirmed);
      const cur = comings[comings.length - 1], prev = comings[comings.length - 2];
      const manner = !prev ? 'first' : prev.leftAt !== null && cur.enteredAt - prev.leftAt >= 4 ? 'return' : 'again';
      actions.push({ t, kind: 'approach', manner });
      approaches.push({ t, manner, answer: 'none', dExposure: 0, dWarmth: 0 });
    }
    if (v.lastWithdrawAt > lastWithdraw) {
      lastWithdraw = v.lastWithdrawAt;
      actions.push({ t, kind: 'withdraw' });
    }
    if (f.kneeling && !wasKneeling) actions.push({ t, kind: 'kneel' });
    wasKneeling = f.kneeling;
    if (v.deepStillFor >= 5 && t - pausedAt > 20) {
      pausedAt = t;
      actions.push({ t, kind: v.near ? 'pause-chair' : 'pause' });
    }
    if (fc !== facing) {
      facing = fc;
      facingSince = t;
      turnLogged = false;
    } else if (!turnLogged && t - facingSince >= 1.5 && v.speed < 0.15 && fc !== 'floor' && fc !== 'ceiling') {
      turnLogged = true;
      actions.push({ t: facingSince, kind: 'turn', surface: fc });
    }

    for (const c of cues) {
      const cue = c.cue;
      const id = cue.type === 'write' ? cue.source ?? cue.key : cue.type === 'reveal' || cue.type === 'redraw' ? cue.phraseId : null;
      if (id && PHRASE_BY_ID.has(id)) {
        const surface = cue.type === 'write' ? cue.surface ?? (cue.beside ? writtenOn.get(cue.beside) ?? PHRASE_BY_ID.get(cue.beside)?.surface : undefined) ?? PHRASE_BY_ID.get(id)!.surface : cue.type === 'redraw' ? writtenOn.get(id) ?? PHRASE_BY_ID.get(id)!.surface : PHRASE_BY_ID.get(id)!.surface;
        writtenOn.set(id, surface);
      }
      if (cue.type === 'silence' && c.rule === 'leaving') ebbs++;
      if ((cue as { type: string }).type === 'leave') leftInRoom = t;
      const k = classify(cue);
      if (!k) continue;
      const phrase = 'phraseId' in cue ? (cue.phraseId as string | undefined) : cue.type === 'write' ? cue.source : undefined;
      const surface = k.surface ?? (cue.type === 'write' && cue.beside ? writtenOn.get(cue.beside) : undefined) ?? (phrase ? writtenOn.get(phrase) : undefined);
      const pos = cue.type === 'voice' || cue.type === 'sound' ? cue.position : null;
      const at = pos?.kind;
      const posSurface = pos?.kind === 'beyond' ? pos.surface : pos?.kind === 'surface' ? writtenOn.get(pos.phraseId) ?? PHRASE_BY_ID.get(pos.phraseId)?.surface : undefined;
      const audible = k.kind === 'voice' || k.kind === 'sound' || k.kind === 'music';
      const dim = cue.type === 'silence' && !!cue.dim;
      let seen: boolean;
      // (Skeptic, 2026-11-06: light counts as seen only where the frame changes by about 8% or more —
      // a dim, a recoil measured at −14% desk, −11% phone; a flash's colour swing at constant
      // brightness and a 0.3 warm swell do not. A hush only when deep: laptop and phone speakers
      // lose the hum it takes away.)
      if (audible) seen = true;
      else if (k.kind === 'text') seen = !surface || surface === fc || surface === 'floor' && pol.distance < 2.6;
      else if (dim) seen = true;
      else if (cue.type === 'flinch') seen = cue.amount >= 0.5;
      else if (cue.type === 'flash') seen = cue.amount >= 0.6;
      else if (cue.type === 'silence') seen = g.device === 'desktop' && cue.depth >= 0.6;
      else if (cue.type === 'memory') seen = (writtenOn.get(cue.phraseId) ?? PHRASE_BY_ID.get(cue.phraseId)?.surface) === fc;
      else if (cue.type === 'memory-scene') seen = true;
      else if (cue.type === 'glow') seen = pol.chairInView();
      else seen = false;
      devs.push({
        t: +(t + dt).toFixed(2), rule: c.rule, kind: k.kind, label: k.label, room: ROOM_OWN.test(c.rule), phrase, beside: cue.type === 'write' ? cue.beside : undefined,
        surface: posSurface ?? surface, at: at ?? (cue.type === 'air' ? 'chair' : undefined), seen, cue: cue.type, flashKind: cue.type === 'flash' ? cue.kind : undefined, dim,
      });
      if (cue.type === 'memory-scene') memoryEnds = { id: cue.id, at: t + dt + memorySpan(cue.id, cue.maxHold) };
      if (cue.type === 'vignette') memoryEnds = { id: cue.id, at: t + dt + vignetteSpan(cue.id, cue.variant) + 2.7 };
    }
  }
  const end = t;

  // Writing that appeared out of view, found later: its wall faced for 1.5 s within 60 s.
  for (const x of devs) {
    if (x.kind !== 'text' || x.seen || !x.surface) continue;
    let run = 0;
    for (const p of traj) {
      if (p.t < x.t || p.t > x.t + 60) continue;
      run = p.facing === x.surface ? run + dt : 0;
      if (run >= 1.5) {
        x.found = true;
        break;
      }
    }
  }
  const perceived = (x: Dev) => x.seen;

  // Answers: the first development in place, perceived, within 8 s.
  const table: VisitSummary['actions'] = {};
  for (const a of actions) {
    const row = (table[a.kind] ??= { n: 0, answered: 0, caused: 0, kinds: {} });
    row.n++;
    const ans = devs.find((x) => x.t > a.t && x.t <= a.t + 8 && perceived(x) && local(a, x));
    const caused = devs.find((x) => x.t > a.t && x.t <= a.t + 8 && perceived(x) && !x.room && local(a, x));
    if (ans) row.answered++;
    if (caused) row.caused++;
    const k = caused ? answerOf(caused) : 'none';
    row.kinds[k] = (row.kinds[k] ?? 0) + 1;
    if (a.kind === 'approach') {
      const ap = approaches.find((p) => p.t === a.t);
      if (ap) ap.answer = k;
    }
  }
  // Repeated acts on the same thing: was the answer identical (rule and what it was)?
  const vending = { pairs: 0, same: 0 };
  const lastAnswer = new Map<string, string>();
  for (const a of actions) {
    if (a.kind === 'turn' || a.kind === 'pause' || a.kind === 'withdraw') continue;
    const target = `${a.kind === 'return' ? 'meet' : a.kind}:${a.phrase ?? 'chair'}`;
    const ans = devs.find((x) => x.t > a.t && x.t <= a.t + 8 && x.seen && !x.room && local(a, x));
    const label = ans ? `${ans.rule}|${ans.label}` : 'none';
    const prev = lastAnswer.get(target);
    if (prev !== undefined && prev !== 'none') {
      vending.pairs++;
      if (prev === label) vending.same++;
    }
    lastAnswer.set(target, label);
  }
  // The same test at moments when they had done nothing for 8 s: how often would "an answer" have come anyway?
  const placebo = { n: 0, hit: 0 };
  const placeboBy: Record<string, { n: number; hit: number }> = {};
  for (let s = 30; s < end - 8; s += 7) {
    if (actions.some((a) => a.t > s - 8 && a.t <= s + 8)) continue;
    const p = traj[Math.min(traj.length - 1, Math.round(s / dt))];
    placebo.n++;
    if (devs.some((x) => x.t > s && x.t <= s + 8 && perceived(x) && ((x.kind === 'text' && x.surface === p.facing) || (x.kind === 'voice' && x.surface === p.facing)))) placebo.hit++;
    // Each act's own criterion, as if it had been done here and now with nothing done.
    for (const kind of ['meet', 'approach', 'withdraw', 'turn'] as const) {
      const a: Action = { t: s, kind, surface: p.facing };
      const row = (placeboBy[kind] ??= { n: 0, hit: 0 });
      row.n++;
      if (devs.some((x) => x.t > s && x.t <= s + 8 && perceived(x) && !x.room && local(a, x))) row.hit++;
    }
  }
  // Windows of 30 s in which they did something and nothing the room did in answer was perceived.
  const passive = { windows: 0, empty: 0 };
  for (let s = 30; s + 30 <= end; s += 30) {
    if (!actions.some((a) => a.t >= s && a.t < s + 30)) continue;
    passive.windows++;
    if (!devs.some((x) => x.t >= s && x.t < s + 30 && perceived(x) && !x.room && x.kind !== 'silence')) passive.empty++;
  }
  // Pacing, as the existing measures see it.
  const meaningfulDevs = devs.filter((x) => x.kind !== 'silence' || /^(withhold|held-silence|still-silence|resonance:table)$/.test(x.rule));
  let gap = 0, last = 0;
  for (const x of meaningfulDevs.filter((x) => x.seen || x.found)) {
    gap = Math.max(gap, x.t - last);
    last = x.t;
  }
  gap = Math.max(gap, end - last);
  const ownT = devs.filter((x) => x.room).map((x) => x.t);
  const audible = devs.filter((x) => x.kind === 'voice' || x.kind === 'sound' || x.kind === 'music');
  let overlaps = 0;
  for (let i = 1; i < audible.length; i++) if (audible[i].t - audible[i - 1].t < 3) overlaps++;
  let repeats = 0;
  const caused = devs.filter((x) => !x.room && perceived(x) && x.kind !== 'silence');
  for (let i = 1; i < caused.length; i++) if (answerOf(caused[i]) === answerOf(caused[i - 1]) && caused[i].t - caused[i - 1].t < 20) repeats++;

  const memories = devs.filter((x) => x.cue === 'memory-scene').map((x) => x.label.replace('memory-scene ', ''));
  const vignettes = devs.filter((x) => x.cue === 'vignette').map((x) => x.label.replace('vignette ', ''));
  const firstMem = devs.find((x) => x.cue === 'memory-scene' || x.cue === 'memory');
  const thirds: Record<string, number[]> = {};
  for (const k of FIELD_KEYS) {
    const n = fieldSamples.length;
    thirds[k] = [0, 1, 2].map((i) => {
      const xs = fieldSamples.slice(Math.floor((i * n) / 3), Math.floor(((i + 1) * n) / 3)).map((s) => s[k]);
      return xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : 0;
    });
  }
  const memoryCounts: Record<string, number> = { ...(o.past?.memoryCounts ?? {}) };
  for (const id of [...memories, ...vignettes]) memoryCounts[id] = (memoryCounts[id] ?? 0) + 1;
  const nonLeaver = g.leave !== 'turn';
  return {
    genome: g.id, cls: g.cls, device: g.device, seed, arm: o.arm ?? 'base', visit: o.past?.visits ?? 1, seconds: +end.toFixed(1),
    actions: table, placebo, placeboBy, vending, passive,
    longestSeenGap: +gap.toFixed(1),
    perMinute: +(meaningfulDevs.length / (end / 60)).toFixed(2),
    voices: devs.filter((x) => x.kind === 'voice').length,
    imposedQuiet: +(imposedQuiet / Math.max(1, Math.min(270, end - 30))).toFixed(3),
    most20: Math.max(0, ...ownT.map((s) => ownT.filter((u) => u >= s && u < s + 20).length)),
    overlaps,
    repeatsSameKind: repeats,
    reach: {
      memories, vignettes,
      kitchen: devs.some((x) => x.cue === 'memory'),
      finishedAt: devs.find((x) => /^finish-/.test(x.rule))?.t ?? null,
      air: devs.some((x) => x.cue === 'air'),
      table: devs.some((x) => x.rule === 'resonance:table'),
      held: devs.some((x) => x.rule === 'held-silence' || x.rule === 'resonance:table'),
      situations: [...new Set(devs.filter((x) => x.rule.startsWith('sit:')).map((x) => x.rule.split(':')[1]))],
      firstMemoryAt: firstMem?.t ?? null,
      offers: devs.filter((x) => x.rule === 'memory-offer').length,
    },
    approaches, field: thirds, phases,
    leaving: d.leaving(), departure: d.departureLine(),
    leftInRoom, ebbs, falseLeave: nonLeaver && leftInRoom !== null,
    labels: [...new Set(devs.filter((x) => !x.room).map((x) => `${x.rule}|${x.label}`))],
    memoryCounts,
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
