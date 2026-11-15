import { performancesFor } from '../performance';
import { VOICE_FRAGMENT_BY_ID } from '../../content/relations';
import { FRAGMENT_IDS } from '../../content/ids';
import { isStillness } from '../rules';
import type { RuleHost } from './host';

export class Stillness {
  constructor(private readonly h: RuleHost) {
    // Stillness is one way in among many: it is answered soon, but not always the same way.
    const t1 = h.rng.range(5, 9);
    const t2 = t1 + h.rng.range(7, 12);
    const t3 = t2 + h.rng.range(10, 16);
    this.stillAt = [t1, t2, t3, t3 + h.rng.range(14, 24)];
    this.stillVoice = h.rng.chance(0.8);
    this.stillMusic = h.rng.chance(0.45);
  }

  /** The visit's clock for stillness restarts (a memory has just passed, or the opening has just ended). */
  restart(): void {
    this.stillClock = 0;
  }

  /** Stillness that grew while the visitor was carried is not theirs to be answered for. */
  pause(): void {
    this.stillClock = 0;
    this.stillVoiceOwed = false;
  }

  private stillStage = 0;

  /** Seconds of stillness that is not reading (reading has its own answers). */
  private stillClock = 0;

  /** How many times stillness has been answered and broken: each time, it is answered later. */
  private stillCycles = 0;

  private stillVoiceOwed = false;

  /** Stillness thresholds differ from visit to visit, so waiting is never a ladder. */
  private stillAt: [number, number, number, number];

  private stillVoice: boolean;

  private stillMusic: boolean;

  /**
   * Stillness thins the room. Sometimes that is all it does; sometimes writing that only
   * exists for someone standing still comes through, or a voice drifts in. The thresholds
   * and what follows them differ per visit.
   */
  tick(dt: number) {
    const v = this.h.visitor;
    // Inside a held silence nothing new appears or sounds; the ladder waits (its clock too, or
    // every rung would come at once when it ends) and goes on after.
    const held = this.h.pacing.holding(this.h.now) || this.h.now < this.h.shared.heldSilenceUntil;
    if (v.stillFor === 0) this.stillClock = 0;
    // Reading pauses stillness — but a look that has rested on one line for a while has
    // become contemplation, and counts.
    else if (!held && v.deepStillFor > 0 && (!v.gazeId || v.gazeFor > 6)) this.stillClock += dt;
    const s = this.stillClock;
    const k = 1 + 0.5 * Math.min(3, this.stillCycles);
    const [t1, t2, t3, t4] = this.stillAt.map((x) => x * k);
    if (v.stillFor === 0 && [...this.h.visible.values()].some((st) => st.mode === 'still' && !st.hiding)) {
      // Writing that only exists for someone standing still is gone the moment they move,
      // however it came.
      for (const [id, st] of this.h.visible)
        if (st.mode === 'still' && !st.hiding) {
          st.hiding = true;
          this.h.queue(0, { type: 'hide', phraseId: id, seconds: 2.5 }, 'unstill');
        }
    }
    if (v.stillFor === 0 && this.stillStage > 0) {
      this.stillStage = 0;
      this.stillVoiceOwed = false;
      this.stillCycles++;
      this.h.scheduler.cancelWhere((e) => isStillness(e.rule));
      return;
    }
    if (s > t1 && this.stillStage < 1 && !held) {
      this.stillStage = 1;
      const p = this.h.selector.select(this.h.ctx(), { tiers: ['still'], exclude: this.h.hiddenExcluding(), surfaces: [this.h.facing] }) ??
        this.h.selector.select(this.h.ctx(), { tiers: ['still'], exclude: this.h.hiddenExcluding() });
      if (p) this.h.reveal(p.id, 0, 'still-1', 'still', 7);
    }
    if (s > t2 && this.stillStage < 2 && !held) {
      this.stillStage = 2;
      if (this.h.rng.chance(0.6)) {
        const p = this.h.selector.select(this.h.ctx(), { tiers: ['still'], exclude: this.h.hiddenExcluding() });
        if (p) this.h.reveal(p.id, 0, 'still-2', 'still', 9);
      }
      this.stillVoiceOwed = this.stillVoice;
    }
    // The voice that stillness brings waits for the room to be free, while the stillness lasts.
    if (this.stillVoiceOwed && this.stillStage >= 2 && this.h.scheduler.ready('still-voice', this.h.now, 60) && this.h.pacing.intenseFree(this.h.now) && this.h.scheduler.majorFree(this.h.now) && !this.h.attending()) {
      this.stillVoiceOwed = false;
      const sp = this.h.selector.select(this.h.ctx(), {
        voiced: true,
        tiers: ['still', 'arrival', 'familiar', ...(this.h.phase === 'arrival' ? [] : (['contradiction'] as const))],
        bias: (x) => (this.h.memory.spoken.has(x.id) ? -0.6 : 0) + (x.tier === 'still' ? 0.2 : 0) + (performancesFor(x.id).length ? 0.4 : 0),
      });
      if (sp) {
        this.h.scheduler.mark('still-voice', this.h.now);
        this.h.speakPhrase('still-voice', sp, { kind: 'approach' }, 1, 'whisper', 0.65);
      }
    }
    if (s > t3 && this.stillStage < 3 && !held) {
      this.stillStage = 3;
      this.h.queue(0, { type: 'silence', depth: 0.85, seconds: 20 }, 'still-silence', { major: true, ttl: 30 });
    }
    if (s > t4 && this.stillStage < 4 && !held) {
      this.stillStage = 4;
      if (this.stillMusic && !this.h.situations.claimed('music') && this.h.scheduler.ready('music', this.h.now, 40)) {
        this.h.scheduler.mark('music', this.h.now);
        this.h.queue(0, { type: 'music', mood: 'sparse', notes: 4, truncate: true }, 'still-music', { major: true, ttl: 40 });
      } else if (this.h.memory.warmMemories.length && this.h.rng.chance(0.5)) {
        this.h.fragment('still-hum', VOICE_FRAGMENT_BY_ID.get(FRAGMENT_IDS.hum)!, { kind: 'beyond', surface: 'east' }, 4, 0.4);
      }
    }
  }
}
