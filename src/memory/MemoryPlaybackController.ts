import { lifeTimeline, leaveTimeline, type Sway } from './behaviours';
import { compose, type Weights } from './compose';
import { seek } from './gsapClock';
import { CueDispatch, type Due } from './cueDispatch';
import type { Lifecycle, Marker, MemoryFrame, ReleaseReason, TimelineSource, Values } from './types';

/**
 * The one owner of a playing memory: its lifecycle and its local time. The App steps it once a
 * frame with the room's dt (0 while hidden or paused); it positions the authored timeline
 * (Theatre.js, through a TimelineSource), positions its procedural behaviours (paused GSAP
 * timelines), composes the two, and hands the audio the events that fall due. Nothing else
 * advances a memory.
 *
 *   dormant → emerging → active → withdrawing → residue → complete
 *
 * A release at the end of the living scene plays the authored withdrawal; one before it (the
 * visitor turned away, walked off) freezes the authored timeline where it is and leaves through a
 * graceful procedural exit. A hard release (a switch, leaving, a long hide) ends it at once.
 */
export interface AudioSink {
  /** Events due now or within the lookahead; `delay` is seconds ahead on the audio clock. */
  play(due: Due[]): void;
  /** Leaving: beds fade over `fade` seconds; tails may run on. */
  release(mode: 'natural' | 'interrupt', fade: number): void;
  /** Returns events it was handed but hadn't sounded yet, so they are handed out again on resume. */
  pause(): Marker[] | void;
  resume(): void;
  /** The sequence jumped (the editor): stop what was scheduled, resync beds. */
  seek(position: number): void;
  dispose(fade: number): void;
}

export interface PlaybackOptions {
  timeline: TimelineSource;
  audio?: AudioSink;
  weights: Weights;
  reduced: boolean;
  /** Seconds of the entrance's soft fade. */
  entrance: number;
  /** Secondary motion, from the memory's definition. */
  sways: Sway[];
  /** Seconds of a graceful early exit. */
  exit: number;
  /** The residue envelope (sunlight staying in the room), only after a natural close. */
  residue?: { rise: number; hold: number; fall: number };
  /** The longest the living scene is held before the memory closes itself (the Director usually releases it first). */
  maxHold: number;
  /** Seconds sound may run on after the image has gone. */
  tail: number;
  onState?: (s: Lifecycle, why?: ReleaseReason) => void;
}

const HARD: ReleaseReason[] = ['switch', 'depart', 'hidden'];

export class MemoryPlaybackController {
  private _state: Lifecycle = 'dormant';
  private _t = 0;
  private pos = 0;
  private paused = false;
  private env: Values = {};
  private life: gsap.core.Timeline;
  private leave: gsap.core.Timeline | null = null;
  private released = 0;
  private mode: 'natural' | 'interrupt' = 'natural';
  private hard = false;
  private why: ReleaseReason | undefined;
  private readonly dispatch: CueDispatch;
  private last: MemoryFrame | null = null;

  constructor(private o: PlaybackOptions) {
    this.life = lifeTimeline(this.env, { reduced: o.reduced, entrance: o.entrance, sways: o.sways });
    this.dispatch = new CueDispatch(o.timeline.markers);
  }

  get state(): Lifecycle {
    return this._state;
  }
  get t(): number {
    return this._t;
  }
  get position(): number {
    return this.pos;
  }
  get isPaused(): boolean {
    return this.paused;
  }
  get frame(): MemoryFrame | null {
    return this.last;
  }

  private get s() {
    return this.o.timeline.sections;
  }
  /** Where the living scene holds while the visitor stays. */
  private get holdAt(): number {
    return Math.max(0, this.s.exit - 1e-3);
  }

  private set(s: Lifecycle) {
    if (s === this._state) return;
    this._state = s;
    this.o.onState?.(s, this.why);
  }

  start(): void {
    if (this._state !== 'dormant') return;
    this._t = 0;
    this.pos = 0;
    this.set('emerging');
    this.step(0);
  }

  /** The Director (or the controller itself, at its longest hold) lets the memory go. */
  release(why: ReleaseReason = 'complete'): void {
    if (this._state === 'dormant' || this._state === 'complete') return;
    const hard = HARD.includes(why);
    if (this._state === 'withdrawing' || this._state === 'residue') {
      if (hard) this.dispose(0.3);
      return;
    }
    this.why = why;
    this.hard = hard;
    // The authored withdrawal plays only from the end of the living scene; before it, leave gracefully.
    this.mode = !hard && this.pos >= this.holdAt - 0.05 ? 'natural' : 'interrupt';
    this.released = this._t;
    this.leave = leaveTimeline(this.env, {
      reduced: this.o.reduced,
      mode: this.mode,
      dissolve: Math.max(0.5, this.s.residue - this.s.exit),
      exit: hard ? 0.3 : this.o.exit,
      residue: this.mode === 'natural' ? this.o.residue : undefined,
    });
    this.o.audio?.release(this.mode, hard ? 0.3 : this.mode === 'natural' ? this.s.residue - this.s.exit : this.o.exit);
    this.set('withdrawing');
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    for (const m of this.o.audio?.pause() ?? []) this.dispatch.unfire(m);
  }
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.o.audio?.resume();
  }

  /** Advance by the room's dt. Returns the frame to draw, or null once complete. */
  step(dt: number): MemoryFrame | null {
    if (this._state === 'dormant' || this._state === 'complete') return null;
    if (this.paused) return this.last;
    this._t += dt;
    const t = this._t;
    const s = this.s;
    let limit = Infinity;
    switch (this._state) {
      case 'emerging':
        this.pos = t;
        if (t >= s.active) this.set('active');
        limit = this.holdAt;
        break;
      case 'active':
        this.pos = Math.min(t, this.holdAt);
        limit = this.holdAt;
        if (t >= this.o.maxHold) this.release('complete');
        break;
      case 'withdrawing':
      case 'residue': {
        const since = t - this.released;
        if (this.mode === 'natural') this.pos = Math.min(s.end, s.exit + since);
        const exitTime = this.hard ? 0.3 : this.o.exit * (this.o.reduced ? 1.6 : 1);
        if (this._state === 'withdrawing' && (this.mode === 'natural' ? this.pos >= s.residue : since >= exitTime)) this.set('residue');
        const leaveEnd = Math.max(this.leave?.duration() ?? 0, this.mode === 'natural' ? s.end - s.exit : 0);
        // A hard release (a switch, leaving, a long hide) has no tail.
        if (since >= leaveEnd + (this.hard ? 0 : this.o.tail)) {
          this.complete();
          return null;
        }
        break;
      }
    }
    seek(this.life, t);
    if (this.leave) seek(this.leave, t - this.released);
    const base = this.o.timeline.at(this.pos);
    const env = { ...this.env };
    const frame: MemoryFrame = { state: this._state, t, position: this.pos, base, env, final: compose(base, env, this.o.weights) };
    this.last = frame;
    const due = this.dispatch.advance(this.pos, limit);
    if (due.length) this.o.audio?.play(due);
    return frame;
  }

  /**
   * The editor scrubbing (Theatre Studio, or the editor's slider): show the sequence at `position`
   * as if played naturally, with nothing audible fired by the jump.
   */
  scrub(position: number): MemoryFrame {
    const s = this.s;
    const p = Math.max(0, Math.min(s.end, position));
    if (this._state === 'dormant' || this._state === 'complete') this._state = 'emerging';
    this.pos = p;
    this._t = p < s.exit ? p : s.exit + (p - s.exit);
    if (p < s.active) this.set('emerging');
    else if (p < s.exit) this.set('active');
    else if (p < s.residue) this.set('withdrawing');
    else this.set('residue');
    if (p >= s.exit) {
      if (!this.leave || this.mode !== 'natural') {
        this.leave?.kill();
        this.mode = 'natural';
        this.leave = leaveTimeline(this.env, { reduced: this.o.reduced, mode: 'natural', dissolve: Math.max(0.5, s.residue - s.exit), exit: this.o.exit, residue: this.o.residue });
      }
      this.released = s.exit;
      seek(this.leave, p - s.exit);
    } else if (this.leave) {
      this.leave.kill();
      this.leave = null;
      this.env.dissolve = 0;
      this.env.exit = 1;
      this.env.residue = 0;
    }
    seek(this.life, this._t);
    this.dispatch.seek(p);
    this.o.audio?.seek(p);
    const base = this.o.timeline.at(p);
    const env = { ...this.env };
    const frame: MemoryFrame = { state: this._state, t: this._t, position: p, base, env, final: compose(base, env, this.o.weights) };
    this.last = frame;
    return frame;
  }

  private complete(): void {
    this.dispose(0);
  }

  /** End now and let everything go: timelines killed, sounds faded and disconnected. */
  dispose(fade = 0.3): void {
    if (this._state === 'complete') return;
    this.life.kill();
    this.leave?.kill();
    this.leave = null;
    this.o.audio?.dispose(fade);
    this.o.timeline.dispose();
    this.last = null;
    this.set('complete');
  }
}
