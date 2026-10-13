import type { Phase } from '../content/types';
import type { Cue } from './cues';

/**
 * Pacing — the room's sense of rhythm.
 *
 * The scheduler stops events piling up; this decides whether a quiet stretch is a choice or
 * a stall. It tells apart:
 *
 *  - recovery: just after something strong (a voice, music, a situation's turn). Quiet here
 *    is intended, and nothing intense should follow it.
 *  - quiet: nothing for a while, but within what feels deliberate for this point in the
 *    visit and for how actively the visitor is engaging.
 *  - stalled: the visitor is doing things and the room has been silent past that limit —
 *    unproductive waiting. Something should answer what they are doing.
 *
 * It also notices repetition (the same kind of thing twice in a row), so the room can
 * answer with something different rather than more of the same.
 */

export type Rhythm = 'arrival' | 'recovery' | 'quiet' | 'stalled';

export type DevKind = 'voice' | 'sound' | 'music' | 'text' | 'light' | 'chair' | 'silence';

export interface Dev {
  t: number;
  kind: DevKind;
  rule: string;
  intense: boolean;
}

/** Seconds of quiet that still feel chosen, by phase (for a visitor who is engaging). Later, silence is allowed to last. */
const QUIET: Record<Phase, number> = { arrival: 10, familiar: 18, contradiction: 26, transform: 36 };
/** Seconds of held quiet after something intense: longest after a voice. */
const RECOVERY = { voice: 20, other: 12 };

export function devKind(cue: Cue): DevKind | null {
  switch (cue.type) {
    case 'voice':
      return cue.text ? 'voice' : 'sound';
    case 'sound':
      return 'sound';
    case 'music':
      return 'music';
    case 'silence':
      return 'silence';
    case 'reveal':
    case 'redraw':
    case 'write':
    case 'link':
    case 'erode':
    case 'air':
    case 'draw':
      return 'text';
    case 'glow':
    case 'flash':
      return 'light';
    case 'chairTurn':
    case 'chairNudge':
      return 'chair';
    default:
      return null;
  }
}

export class Pacing {
  readonly devs: Dev[] = [];
  lastDev = 0;
  lastIntense = -Infinity;
  private recoverUntil = -Infinity;
  /** A deliberate held silence: nothing is to interrupt it. */
  private holdUntil = -Infinity;
  /** Seconds spent stalled (waiting with nothing happening) so far — for the inspector and tests. */
  stalledSeconds = 0;

  note(t: number, cue: Cue, rule: string) {
    const kind = devKind(cue);
    if (!kind) return;
    // A dip in the room tone is a gesture, but it does not end a stall on its own.
    const intense = kind === 'voice' || kind === 'music' || (cue.type === 'silence' && cue.depth >= 0.7) || rule.startsWith('sit:');
    this.devs.push({ t, kind, rule, intense });
    if (this.devs.length > 200) this.devs.shift();
    // A dip in the room tone does not end a stall — unless it is the room deliberately not speaking.
    if (kind !== 'silence' || rule === 'withhold' || rule === 'held-silence') this.lastDev = t;
    if (intense && kind !== 'silence') {
      this.lastIntense = t;
      this.recoverUntil = Math.max(this.recoverUntil, t + (kind === 'voice' ? RECOVERY.voice : RECOVERY.other));
    }
    // A deep silence, or the room deliberately not speaking, is held: nothing breaks into it.
    if (cue.type === 'silence' && (cue.depth >= 0.7 || rule === 'withhold')) this.holdUntil = Math.max(this.holdUntil, t + cue.seconds);
  }

  /** How long quiet may last before it reads as waiting. Active visitors are answered sooner. */
  quietLimit(phase: Phase, activity: number): number {
    const base = QUIET[phase];
    return base * (activity > 0.25 ? 0.75 : activity > 0.1 ? 0.9 : 1.15);
  }

  rhythm(now: number, phase: Phase, activity: number): Rhythm {
    if (now < 6) return 'arrival';
    if (now < this.recoverUntil || now < this.holdUntil) return 'recovery';
    // Waiting only exists for someone who is doing something. A visitor who has done
    // nothing for half a minute is not kept waiting: they are in the quiet (and stillness
    // has its own answers).
    if (activity <= 0) return 'quiet';
    return now - this.lastDev > this.quietLimit(phase, activity) ? 'stalled' : 'quiet';
  }

  /** Things that happened in the last minute (not counting dips in the room tone). */
  density(now: number): number {
    let n = 0;
    for (let i = this.devs.length - 1; i >= 0 && now - this.devs[i].t < 60; i--) if (this.devs[i].kind !== 'silence') n++;
    return n;
  }

  /** Enough is happening: the room's own life (not its answers) should hold back. */
  crowded(now: number): boolean {
    return this.density(now) >= 5;
  }

  tick(dt: number, now: number, phase: Phase, activity: number) {
    if (this.rhythm(now, phase, activity) === 'stalled') this.stalledSeconds += dt;
  }

  /** Something intense may begin now (not in the middle of recovering from the last). */
  intenseFree(now: number): boolean {
    return now >= this.recoverUntil && now >= this.holdUntil;
  }

  /** Hold the room for `seconds` (after something that must be left alone to land). */
  holdFor(now: number, seconds: number) {
    this.holdUntil = Math.max(this.holdUntil, now + seconds);
  }

  /** Inside a held silence: nothing new should appear or sound. */
  holding(now: number): boolean {
    return now < this.holdUntil;
  }

  /** The same kind of thing has just happened: prefer something else. */
  repeats(kind: DevKind, now: number, within = 20): boolean {
    for (let i = this.devs.length - 1; i >= 0 && now - this.devs[i].t < within; i--) if (this.devs[i].kind === kind && kind !== 'silence') return true;
    return false;
  }

  sinceDev(now: number): number {
    return now - this.lastDev;
  }
}
