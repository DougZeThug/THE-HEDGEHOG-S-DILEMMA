import { CueDispatch } from './cueDispatch';
import { MemoryAudio, type MemoryAudioHost } from './MemoryAudio';
import { scoreMarkers, toCueSheet, type Effect, type GapKind, type Score, type VignetteDef } from '../content/vignettes';
import type { Marker } from './types';

/**
 * A vignette, played (src/content/vignettes.ts). Its score is a list of timed events; this hands
 * them out once each, on the same clock and with the same parts as a living memory's sound
 * (CueDispatch → MemoryAudio, the memory bus, its own small room), so a line is never late
 * against its pause and a pause never drifts. The room's part (the light, a word going, a mark
 * on the floor) is the host's: this only says when.
 *
 * - **Natural end**: at the end of its span, plus a moment for the last sound to ring.
 * - **Interrupted** (the visitor left, wrote, or the tab was away too long): a sentence being
 *   said is cut, nothing new begins, and the room's effects are let go by the host.
 * - **Paused** (settings, a hidden tab): what hasn't sounded is taken back and handed out again
 *   when it resumes; a sentence cut by the pause is said again from its start.
 */
export interface VignetteHost extends MemoryAudioHost {
  /** Something the room does, `delay` seconds from now. */
  effect(fx: Effect, delay: number): void;
  /** A gap begins (a deliberate silence lets the memory's air fall away). */
  gap?(kind: GapKind, seconds: number, caption?: string): void;
  /** The vignette is letting go: effects still to come are cancelled; lingering ones may stay. */
  letGo?(mode: 'natural' | 'interrupt'): void;
  /** A key's recordings (to pick a line's reading by name). */
  filesOf?(key: string): readonly string[];
}

const TAIL = 1.5;

export class VignettePlayer {
  readonly score: Score;
  readonly audio: MemoryAudio;
  private dispatch: CueDispatch;
  private markers: Marker[];
  position = 0;
  private started = false;
  private releasedAt: number | null = null;
  private mode: 'natural' | 'interrupt' | null = null;
  private paused = false;
  /** Sentences a pause cut part-way: said again, from their start, as it resumes. */
  private again: Marker[] = [];

  constructor(readonly def: VignetteDef, readonly variant: string, private host: VignetteHost, seed = 1) {
    this.score = def.variants[variant] ?? def.variants.first;
    this.markers = scoreMarkers(this.score);
    this.dispatch = new CueDispatch(this.markers, 0.3);
    this.audio = new MemoryAudio(host, toCueSheet(def, this.score, undefined, (k) => host.filesOf?.(k) ?? []), this.markers, seed);
  }

  prepare(): Promise<void> {
    return this.audio.prepare();
  }

  start(): void {
    this.started = true;
  }

  /** Heard past its first moments (counts as seen; a returning visitor gets what follows). */
  get seen(): boolean {
    return this.position >= (this.def.seenAt ?? Math.min(6, this.score.span * 0.5));
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * It has finished, or let go and had its moment to ring out. Let go gracefully (walking off,
   * turning to write, its own end), it is done only once the sentence being said has been said.
   */
  get done(): boolean {
    if (this.releasedAt !== null) {
      if (this.mode === 'interrupt') return this.position >= this.releasedAt + 0.6;
      const speaking = this.audio.voicesUntil > this.host.ctx.currentTime + 0.05;
      return this.position >= this.releasedAt + TAIL && (!speaking || this.position >= this.releasedAt + 15);
    }
    return this.started && this.position >= this.score.span + TAIL;
  }

  /** Advance by `dt` seconds of the memory's clock (0 while paused). */
  step(dt: number): void {
    if (!this.started || this.paused) return;
    this.position += dt;
    if (this.releasedAt !== null) return;
    if (this.position >= this.score.span) {
      this.release('natural');
      return;
    }
    const due = this.dispatch.advance(this.position, this.score.span);
    const sounds = due.filter((d) => /^(voice|sfx|bed|music):/.test(d.marker.label));
    this.audio.play(sounds);
    for (const d of due) {
      const i = Number(d.marker.label.slice(d.marker.label.lastIndexOf('@') + 1));
      const e = this.score.events[i];
      if (!e) continue;
      if ('fx' in e) this.host.effect(e.fx, d.delay);
      else if ('gap' in e) {
        if (e.gap === 'silence') this.audio.duckBeds(0.2, e.seconds);
        this.host.gap?.(e.gap, e.seconds, e.caption);
      }
    }
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    for (const m of this.audio.pause()) {
      // Not yet sounding: handed out again in time. Already begun: said again on resume.
      if (m.position > this.position) this.dispatch.unfire(m);
      else this.again.push(m);
    }
  }

  /**
   * Back from a pause. A sentence the pause cut is said again from its start: the score goes back
   * to just before it, so everything after it keeps its place (nothing is said over it).
   */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.audio.resume();
    if (this.again.length && this.releasedAt === null) {
      const from = Math.max(0, Math.min(...this.again.map((m) => m.position)) - 0.6);
      this.position = from;
      this.dispatch.seek(from);
    }
    this.again = [];
  }

  release(mode: 'natural' | 'interrupt'): void {
    if (this.releasedAt !== null) return;
    this.releasedAt = this.position;
    this.mode = mode;
    this.audio.release(mode, mode === 'natural' ? 2.5 : 0.6);
    this.host.letGo?.(mode);
  }

  get releasedHow(): 'natural' | 'interrupt' | null {
    return this.mode;
  }

  dispose(fade = 0.3): void {
    this.audio.dispose(fade);
  }
}
