import type { Marker } from './types';

/**
 * Which authored audio events are due, on the memory's sequence, without ever playing one twice.
 *
 * Events are markers on the timeline (`sfx:spoon`, `bed:kitchen`, `music:kitchen`). Each step the
 * controller says where the sequence was and is, and how far it may go without a release (the
 * hold at the end of the living scene): events inside the lookahead window are handed out once,
 * with how far ahead of now they fall, so the audio can schedule them on the AudioContext's clock.
 *
 * Seeking never plays anything: a jump marks everything it passed as heard. Seeking back (the
 * editor) re-arms what lies ahead, so playing forward again plays it again, once.
 */
export interface Due {
  marker: Marker;
  /** Seconds from now (sequence time) at which it should sound; ≥ 0. */
  delay: number;
}

export class CueDispatch {
  private fired = new Set<string>();
  private last: number | null = null;

  constructor(readonly markers: Marker[], readonly lookahead = 0.3, readonly tolerance = 0.12) {}

  private id(m: Marker): string {
    return `${m.label}@${m.position.toFixed(3)}`;
  }

  /**
   * Advance from the last position to `pos`, never past `limit` (where the sequence will hold).
   * A step longer than `maxStep` is treated as a seek.
   */
  advance(pos: number, limit = Infinity, maxStep = 0.5): Due[] {
    const prev = this.last;
    this.last = pos;
    if (prev !== null && (pos < prev - 1e-6 || pos - prev > maxStep)) {
      this.seek(pos);
      return [];
    }
    const to = Math.min(pos + this.lookahead, limit);
    const out: Due[] = [];
    for (const m of this.markers) {
      const id = this.id(m);
      if (this.fired.has(id)) continue;
      // Due inside the window ahead; one only just passed may still sound (late by a frame), one
      // further behind is never played late.
      if (m.position <= to && m.position >= pos - this.tolerance) {
        this.fired.add(id);
        out.push({ marker: m, delay: Math.max(0, m.position - pos) });
      }
    }
    return out;
  }

  /** A jump: what lies behind counts as heard, what lies ahead is armed again. */
  seek(pos: number): void {
    this.last = pos;
    for (const m of this.markers) {
      const id = this.id(m);
      if (m.position < pos) this.fired.add(id);
      else this.fired.delete(id);
    }
  }

  /** The audio could not keep an event it was handed (paused before it sounded): arm it again. */
  unfire(m: Marker): void {
    this.fired.delete(this.id(m));
  }

  get heard(): number {
    return this.fired.size;
  }
}
