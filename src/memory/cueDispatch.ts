import { isLasting } from './cueSheet';
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
  /** Already this far into it (a stall passed its start): start it part-way in. */
  late?: number;
}

/** How late a one-shot a stall passed may still be played (seconds). */
const LATE_ONE_SHOT = 3;
/** How far behind the position an event may be and still be handed out (seconds). */
const TOLERANCE = 0.12;
/** How far ahead of the picture (seconds) events are handed out, unless the owner asks for more. */
export const LOOKAHEAD = 0.3;
/** A step longer than this (seconds) is treated as a stall that jumped forward, not as playing. */
const MAX_STEP = 0.5;

export class CueDispatch {
  private fired = new Set<string>();
  private last: number | null = null;

  constructor(readonly markers: Marker[], readonly lookahead = LOOKAHEAD) {}

  /** By label and place: the audio's markers are its own copies of the timeline's. */
  private id(m: Marker): string {
    return `${m.label}@${m.position.toFixed(3)}`;
  }

  /**
   * Advance from the last position to `pos`, never past `limit` (where the sequence will hold).
   * A step longer than MAX_STEP is treated as a stall.
   */
  advance(pos: number, limit = Infinity): Due[] {
    const prev = this.last;
    this.last = pos;
    if (prev !== null && pos < prev - 1e-6) {
      this.seek(pos);
      return [];
    }
    if (prev !== null && pos - prev > MAX_STEP) {
      // A stall (a slow frame) jumped forward while playing: a bed or the music it passed is
      // still owed, started part-way in. A one-shot passed in the last few seconds is still
      // played, late (the footsteps that are the door's only event are not lost to one slow
      // frame, which a memory's clock follows however long it took); older ones are not.
      const owed: Due[] = [];
      for (const m of this.markers) {
        const id = this.id(m);
        if (this.fired.has(id) || m.position < prev || m.position >= pos) continue;
        if (isLasting(m.label)) owed.push({ marker: m, delay: 0, late: pos - m.position });
        else if (pos - m.position <= LATE_ONE_SHOT) owed.push({ marker: m, delay: 0 });
      }
      // What it passed is heard; what lies ahead stays as it was: one already handed out ahead of
      // the picture is not armed again (as a seek would), or a second stall plays it twice (the
      // wall's goodbye, twice over, 0.73 s apart: QA, 2026-10-22).
      for (const m of this.markers) if (m.position < pos) this.fired.add(this.id(m));
      return owed;
    }
    const to = Math.min(pos + this.lookahead, limit);
    // From wherever the last step reached (a slowish frame skips nothing), or a frame's grace.
    const from = Math.min(pos - TOLERANCE, prev ?? pos);
    const out: Due[] = [];
    for (const m of this.markers) {
      const id = this.id(m);
      if (this.fired.has(id)) continue;
      // Due inside the window ahead; one passed since the last step still sounds (a little late);
      // one further behind is never played late.
      if (m.position <= to && m.position >= from) {
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

  /**
   * The sequence steps back from `was` to `from` (a pause took a sentence back to say it again):
   * what lies ahead is armed again, except what had already sounded in between (the bed the audio
   * has just restored, an effect): only what the pause took back (`takenBack`) is handed out again.
   */
  rewind(from: number, was: number, takenBack: Marker[]): void {
    this.seek(from);
    const back = new Set(takenBack.map((m) => this.id(m)));
    for (const m of this.markers) if (m.position >= from && m.position < was && !back.has(this.id(m))) this.markHeard(m);
  }

  /** It has sounded already: never hand it out again (after a step back that would re-arm it). */
  markHeard(m: Marker): void {
    this.fired.add(this.id(m));
  }

  /** The audio could not keep an event it was handed (paused before it sounded): arm it again. */
  unfire(m: Marker): void {
    this.fired.delete(this.id(m));
  }

}
