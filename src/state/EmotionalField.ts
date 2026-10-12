import { approach, clamp, smoothstep } from '../core/math';
import type { VisitorModel } from './VisitorModel';
import type { Memory } from './Memory';
import type { Phase } from '../content/types';
import { PHRASE_BY_ID } from '../content/phrases';
import { warmthOf } from './Memory';

/**
 * EmotionalField — the room's own latent weather. Not a diagnosis of the visitor:
 * a set of slowly moving pressures the room composes with.
 *
 * Competing needs are built in. Being near the chair feeds both warmth and exposure;
 * which wins depends on how the visitor is near (restless or settled), how often they
 * have retreated before, and how far into the visit we are. Distance feeds both relief
 * and solitude; a visitor who has been holding warm memories finds them resurfacing
 * when they are far away.
 */
export const FIELD_KEYS = ['warmth', 'exposure', 'solitude', 'relief', 'tension', 'reminiscence', 'hush', 'dissonance'] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export type FieldValues = Record<FieldKey, number>;

const PHASE_INDEX: Record<Phase, number> = { arrival: 0, familiar: 1, contradiction: 2, transform: 3 };

export class EmotionalField {
  v: FieldValues = { warmth: 0.2, exposure: 0, solitude: 0.15, relief: 0.1, tension: 0.05, reminiscence: 0, hush: 0, dissonance: 0.05 };
  /** Transient impulses added on top of targets; they decay on their own. */
  private impulse: FieldValues = { warmth: 0, exposure: 0, solitude: 0, relief: 0, tension: 0, reminiscence: 0, hush: 0, dissonance: 0 };
  private farTimer = 0;
  private lastWithdrawSeen = -Infinity;
  private lastReadCount = 0;
  /** Peak exposure in the current approach (released as relief on withdrawal). */
  private exposurePeak = 0;

  nudge(delta: Partial<FieldValues>): void {
    for (const k of FIELD_KEYS) if (delta[k]) this.impulse[k] = clamp(this.impulse[k] + delta[k]!, -1, 1);
  }

  update(dt: number, vis: VisitorModel, mem: Memory, phase: Phase): void {
    const pi = PHASE_INDEX[phase];
    const n = smoothstep(2.9, 0.7, vis.distance); // proximity 0..1
    const restless = clamp(vis.speed / 0.9 * 0.5 + vis.lookActivity / 1.2 * 0.5);
    const settled = smoothstep(3, 20, vis.deepStillFor);
    const acclimate = smoothstep(8, 35, vis.nearFor) * (0.5 + 0.5 * settled);
    const hes = mem.strength.hesitation;

    if (vis.distance > 2.4) this.farTimer += dt;
    else this.farTimer = Math.max(0, this.farTimer - dt * 2);

    // Reading feeds reminiscence and dissonance through the phrases themselves.
    if (vis.read.size > this.lastReadCount) {
      for (const id of vis.readOrder.slice(this.lastReadCount)) {
        const ph = PHRASE_BY_ID.get(id);
        if (!ph) continue;
        this.impulse.reminiscence += (ph.dims.nostalgia ?? 0) * 0.25 + warmthOf(ph.dims) * 0.05;
        this.impulse.dissonance += (ph.dims.contradiction ?? 0) * 0.18;
        this.impulse.tension += ((ph.dims.anger ?? 0) + (ph.dims.fear ?? 0)) * 0.06;
      }
      this.lastReadCount = vis.read.size;
    }

    // Withdrawal releases what exposure built up — as relief.
    if (vis.lastWithdrawAt > this.lastWithdrawSeen) {
      this.lastWithdrawSeen = vis.lastWithdrawAt;
      this.impulse.relief += 0.15 + this.exposurePeak * 0.7;
      this.exposurePeak = 0;
    }

    const warmMem = mem.warmMemories.length > 0 ? 1 : 0;

    const target: FieldValues = {
      exposure:
        n * clamp(0.12 + pi * 0.11 + hes * 0.35 + restless * 0.3 + (vis.kneeling ? 0.15 : 0) - acclimate * 0.55),
      warmth: clamp(
        n * (0.3 + 0.3 * mem.strength.closeness + 0.35 * acclimate - 0.25 * hes) +
          (1 - n) * 0.15 * mem.strength.warmth +
          0.12 * mem.strength.contributor,
      ),
      solitude: clamp((1 - n) * (0.2 + 0.55 * smoothstep(8, 80, this.farTimer)) - 0.2 * mem.strength.closeness * n),
      relief: clamp(0.08 + (1 - n) * 0.12 + settled * 0.15),
      tension: clamp(restless * 0.35 + this.v.exposure * 0.35 + this.v.dissonance * 0.15 - settled * 0.3),
      reminiscence: clamp(0.08 * pi + warmMem * this.v.solitude * 0.45 + mem.strength.warmth * 0.15),
      hush: clamp(smoothstep(5, 45, vis.deepStillFor) * 0.85 + (vis.kneeling ? 0.25 : 0)),
      dissonance: clamp(0.05 + pi * 0.09 + hes * 0.3),
    };

    const tau: FieldValues = {
      warmth: 9, exposure: 5, solitude: 18, relief: 10, tension: 4, reminiscence: 35, hush: 5, dissonance: 25,
    };
    // Movement breaks hush quickly; stillness builds it slowly.
    if (target.hush < this.v.hush) tau.hush = 1.2;

    for (const k of FIELD_KEYS) {
      const tgt = clamp(target[k] + this.impulse[k]);
      this.v[k] = clamp(approach(this.v[k], tgt, dt, tau[k]));
      // impulses decay
      this.impulse[k] = approach(this.impulse[k], 0, dt, k === 'reminiscence' || k === 'dissonance' ? 50 : 18);
    }
    this.exposurePeak = Math.max(this.exposurePeak, this.v.exposure);
  }

  snapshot() {
    const o: Record<string, number> = {};
    for (const k of FIELD_KEYS) o[k] = +this.v[k].toFixed(2);
    return o;
  }
}
