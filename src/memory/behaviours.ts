import { gsap, quiet } from './gsapClock';
import type { Values } from './types';

/**
 * Reusable procedural behaviours, as paused GSAP timelines that write to a memory's envelope
 * object (never to Three objects, never with callbacks): the controller positions them on the
 * room's clock, so seeking anywhere gives the same values and nothing happens behind its back.
 *
 * Envelope keys (read by compose.ts):
 *   emerge                 0 → 1   the memory's entrance (a soft fade so no start ever pops)
 *   dissolve               0 → 1   the mask receding
 *   exit                   1 → 0   a graceful early exit (the visitor turned away)
 *   residue                0 → 1 → 0  what stays after the image (sunlight in the room)
 *   sway:<layer>.<x|y|rot> ±amp    secondary motion: a curtain breathing, a spoon settling
 */
export interface Reduced {
  reduced: boolean;
}

/** The life of a memory, on local time: its entrance and its living motion. */
export function lifeTimeline(env: Values, o: Reduced & { entrance: number; sways: Sway[] }): gsap.core.Timeline {
  env.emerge = 0;
  const tl = gsap.timeline({ paused: true });
  tl.addLabel('in', 0).to(env, { emerge: 1, duration: o.reduced ? Math.max(2, o.entrance * 1.6) : o.entrance, ease: 'sine.inOut' }, 'in');
  tl.addLabel('living', o.entrance);
  for (const s of o.sways) sway(tl, env, s, o.reduced);
  quiet();
  return tl;
}

export interface Sway {
  /** Envelope key, e.g. `sway:curtain.x`. */
  key: string;
  /** Amplitude (the layer's units: metres, radians). */
  amp: number;
  /** Seconds for one full breath. */
  period: number;
  /** When it starts (local seconds). */
  at: number;
  /** A phase offset (0..1 of a period), so two sways never breathe together. */
  phase?: number;
}

/** A gentle, endless breath: a curtain in a draught, a spoon settling, light drifting. */
export function sway(tl: gsap.core.Timeline, env: Values, s: Sway, reduced: boolean): void {
  env[s.key] = 0;
  if (reduced || s.amp === 0) return;
  const half = s.period / 2;
  const start = s.at + (s.phase ?? 0) * s.period;
  // It starts from stillness: still until `start`, then a first half-breath out from rest, then
  // the endless breath (nothing is rendered ahead of its time).
  tl.fromTo(env, { [s.key]: 0 }, { [s.key]: s.amp, duration: half, ease: 'sine.inOut', immediateRender: false }, start);
  const inner = gsap.timeline({ repeat: -1, yoyo: true });
  inner.fromTo(env, { [s.key]: s.amp }, { [s.key]: -s.amp, duration: half, ease: 'sine.inOut', immediateRender: false });
  tl.add(inner, start + half);
}

/** Leaving, on time since release: the mask receding, or (interrupted) a quicker graceful exit. */
export function leaveTimeline(env: Values, o: Reduced & { mode: 'natural' | 'interrupt'; dissolve: number; exit: number; residue?: { rise: number; hold: number; fall: number } }): gsap.core.Timeline {
  env.dissolve = 0;
  env.exit = 1;
  env.residue = 0;
  const tl = gsap.timeline({ paused: true });
  const slow = o.reduced ? 1.6 : 1;
  tl.addLabel('leave', 0);
  if (o.mode === 'natural') tl.to(env, { dissolve: 1, duration: o.dissolve * slow, ease: 'sine.in' }, 'leave');
  else tl.to(env, { exit: 0, dissolve: 0.6, duration: o.exit * slow, ease: 'sine.inOut' }, 'leave');
  if (o.residue) {
    const r = o.residue;
    tl.addLabel('residue', o.mode === 'natural' ? o.dissolve * slow * 0.6 : o.exit * slow * 0.6);
    tl.to(env, { residue: 1, duration: r.rise * slow, ease: 'sine.out' }, 'residue');
    tl.to(env, { residue: 0, duration: r.fall * slow, ease: 'sine.in' }, `residue+=${(r.rise + r.hold) * slow}`);
  }
  quiet();
  return tl;
}

/** How long a leave timeline runs (it may include a residue). */
export function leaveDuration(tl: gsap.core.Timeline): number {
  return tl.duration();
}
