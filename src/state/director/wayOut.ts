import { PHRASE_IDS } from '../../content/ids';
import { STAY_WORDS } from '../../content/relations';
import { phaseAtLeast } from '../Phase';
import { RULE, isPhaseTurn } from '../rules';
import type { VisitorInput } from '../VisitorModel';
import type { RuleHost } from './host';

/**
 * The way out (docs/reviews/2026-11-core-loop.md). Nothing is detected: from the middle of a visit,
 * touching one line on the wall they came in by (it is about leaving early, and it being lovely)
 * starts the room letting them go: its sound thins, its own light ebbs from the walls, the
 * chair, behind them, stays lit, and creaks once. Walking on, toward the wall, they go. A turn, a
 * step any other way, touching anything else, or nothing at all for a while keeps them: the room
 * comes back, and if they turned round, they find the chair lit alone as they first saw it.
 * Touching the words again does nothing: leaving is not the act that found it (interaction
 * designer, 2026-11-06: a second touch is the explorer's reflex).
 */
export const WAY_OUT: string = PHRASE_IDS.partyEarly;

/**
 * The way out's numbers: how long the room waits for them to go (s); how far on toward the wall
 * is going (m) and how near the wall that ends; a turn (rad) or a step any other way (m) that
 * keeps them; how long after a touch they may take to arrive and stand there; how soon after
 * being kept it may begin again.
 */
export const LET_GO = { wait: 12, on: 0.25, wall: 2.55, turn: 0.35, step: 0.25, window: 20, again: 30 };

export class WayOut {
  /** They left by the way out (the departure line knows). */
  left = false;
  private exitShown = false;
  private exitShownAt = -Infinity;
  private lastStayVoiceAt = -Infinity;
  private letGoCreaked = false;
  private letGoAsked = -Infinity;
  private keptAt = -Infinity;
  private lastYaw = 0;

  constructor(private readonly h: RuleHost) {}

  /** The room is letting them go (the way out touched, then stood still): the App doesn't walk them on for a touch. */
  get lettingGo(): boolean {
    return this.letGo !== null;
  }

  /** The way out is shown and the visit is turned to it: nothing answers beside it. */
  isOpenLine(phraseId: string): boolean {
    return phraseId === WAY_OUT && this.exitShown;
  }

  /** Letting them go, or about to be (touched, not yet standing there). */
  engaged(): boolean {
    return this.letGo !== null || this.h.now - this.letGoAsked <= LET_GO.window;
  }

  /** The way out was kept (they stayed) less than `seconds` ago. */
  keptWithin(seconds: number): boolean {
    return this.h.now - this.keptAt < seconds;
  }

  /** "Stay" and its answers are never said near the way out: not as it appears, nor while they touch it (it would be a plea). */
  refusesStayWords(): boolean {
    return this.engaged() || Math.abs(this.h.now - this.exitShownAt) < 20;
  }

  /** A voice sounded: "stay" said, the way out keeps clear of it. */
  voiceSounded(phraseId: string): void {
    if (STAY_WORDS.has(phraseId)) this.lastStayVoiceAt = this.h.now;
  }

  /** A line was touched. */
  touched(phraseId: string): void {
    // Touching anything else while the room is letting them go keeps them.
    if (this.engaged() && phraseId !== WAY_OUT) {
      this.letGoAsked = -Infinity;
      if (this.letGo) this.keep();
    }
    // (A touch walks them to the words: the room starts letting them go once they are standing
    // there, still. Touched again while it does, nothing: leaving is not the act that found it.)
    else if (phraseId === WAY_OUT && !this.letGo && this.exitOpen()) this.letGoAsked = this.h.now;
  }

  /** Back in after a departure: they have not left by the way out (it may be taken again, in a while). */
  returned(): void {
    this.left = false;
    this.letGo = null;
    this.letGoAsked = -Infinity;
    this.keptAt = this.h.now;
  }

  private letGo: { at: number; x: number; z: number; yaw: number } | null = null;

  /** The way out may be taken: the visit has turned (contradiction or later), nothing else holds the room. */
  private exitOpen(): boolean {
    return !this.h.departing && !this.letGo && !this.h.shared.pendingPhase && this.h.now - this.h.shared.lastTurnAt >= 20 && !this.h.scheduler.pending().some((e) => isPhaseTurn(e.payload.rule)) && phaseAtLeast(this.h.phase, 'contradiction') && this.h.now >= 120 &&
      this.h.now - this.keptAt >= LET_GO.again && !this.h.scenes.active && !this.h.aftermath() && this.h.now >= this.h.shared.heldSilenceUntil && this.h.visible.has(WAY_OUT);
  }

  private beginLetGo(): void {
    const v = this.h.visitor;
    this.letGo = { at: this.h.now, x: v.x, z: v.z, yaw: this.lastYaw };
    // Sound first; the walls' light goes over the next seconds, the chair's stays.
    this.h.queue(0, { type: 'silence', depth: 0.5, seconds: LET_GO.wait + 4, dim: 0.25, dimSeconds: LET_GO.wait + 4, fall: 2.5 }, RULE.leaving, { ttl: 1 });
    // Nothing of the room's own while it lets them go.
    this.h.pacing.holdFor(this.h.now, LET_GO.wait + 1);
  }

  /** Touched again as the room let them go: they have gone. */
  private goNow(): void {
    this.letGo = null;
    this.left = true;
    this.h.queue(0, { type: 'leave' }, RULE.leaving, { ttl: 2 });
  }

  /** The visitor paused the room (settings): a leaving under way is not taken. */
  stayed(): void {
    this.letGoAsked = -Infinity;
    if (this.letGo) this.keep();
  }

  /** They stayed: the room comes back (heard first, then seen, a moment after they turn). */
  private keep(): void {
    this.letGo = null;
    this.keptAt = this.h.now;
    this.h.pacing.release(this.h.now);
    this.h.queue(1.5, { type: 'lift', seconds: 4 }, RULE.leavingKept, { ttl: 2 });
  }

  tick(input: VisitorInput) {
    this.lastYaw = input.yaw;
    // The line is on its wall by the time the visit turns: found, not watched (written while they face elsewhere).
    if (!this.exitShown && phaseAtLeast(this.h.phase, 'contradiction') && this.h.now >= 120 && this.h.facing !== 'south' && !this.h.visible.has(WAY_OUT) && !this.h.scheduler.hasPending(`reveal:${WAY_OUT}`) && this.h.now - this.lastStayVoiceAt >= 20) {
      this.exitShown = true;
      this.exitShownAt = this.h.now;
      this.h.reveal(WAY_OUT, 0, 'exit-line', 'emerge', 8);
    }
    // (Standing there after the touch: the touch's own short walk to the words is not them going.)
    const since = this.h.now - this.letGoAsked;
    if (since <= LET_GO.window && since >= 1 && !this.letGo && this.h.visitor.deepStillFor >= Math.min(0.8, since) && this.exitOpen()) {
      this.letGoAsked = -Infinity;
      this.beginLetGo();
    }
    if (!this.exitShown && this.h.visible.has(WAY_OUT) && phaseAtLeast(this.h.phase, 'contradiction') && this.h.now >= 120) {
      this.exitShown = true;
      this.exitShownAt = this.h.now;
    }
    // Taken off the wall by something else: written back, while they face elsewhere.
    if (this.exitShown && !this.h.visible.has(WAY_OUT) && this.h.facing !== 'south' && !this.h.scheduler.hasPending(`reveal:${WAY_OUT}`)) this.h.reveal(WAY_OUT, 0, 'exit-line', 'emerge', 8);
    const g = this.letGo;
    if (!g) return;
    // A moment in, the chair behind them, once: what they would be leaving (creative director).
    if (!this.letGoCreaked && this.h.now - g.at >= 4.5) {
      this.letGoCreaked = true;
      this.h.queue(0, { type: 'sound', kind: 'chair-creak', position: { kind: 'chair' }, gain: 0.2 }, 'leaving-creak', { ttl: 2 });
    }
    let turn = Math.abs(input.yaw - g.yaw) % (Math.PI * 2);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    // Walking on, toward the wall they came in by (the way they face), is going.
    const fx = -Math.sin(g.yaw), fz = -Math.cos(g.yaw);
    const dx = input.x - g.x, dz = input.z - g.z;
    const on = dx * fx + dz * fz, aside = Math.abs(dx * fz - dz * fx);
    // (At once if they like: the room only begins once they have stood still after the touch, so
    // its own walk to the words is over. Codex review, PR #56.)
    if (turn <= LET_GO.turn && aside < LET_GO.step && (on >= LET_GO.on || (on > 0.05 && input.z >= LET_GO.wall))) {
      this.goNow();
      return;
    }
    // A step back or aside, a turn: they stay. (A step on that isn't yet going is still waiting; a
    // step that goes more aside or back than on, of a step's length, diagonals included, is staying.
    // Not the plain distance: walking on a little off straight would stay before it could go. PR #56.)
    const moved = Math.hypot(dx, dz);
    if (turn > LET_GO.turn || aside >= LET_GO.step || on <= -LET_GO.step || (moved > LET_GO.step && on < moved * Math.SQRT1_2) || input.kneeling || this.h.scenes.active) {
      this.keep();
      return;
    }
    // Not taken: the room waited, and they stayed.
    if (this.h.now - g.at >= LET_GO.wait) this.keep();
  }
}
