/**
 * What a memory's sounds are. Timing lives on the authored timeline (Theatre markers such as
 * `sfx:spoon`, `bed:kitchen`, `music:kitchen`, which the artist moves in Studio); the cue sheet
 * says what each marker sounds like and where it is. A marker with no entry is silent.
 *
 * Every file is played as recorded (no loudness normalising): each entry carries its authored
 * level, measured offline. Distance and place come from the engine (panner, lowpass, the
 * memory's own small room), never from the recording, so files are generated close and dry.
 */
export type CueKind = 'sfx' | 'bed' | 'music';

export interface Place {
  /** Across the window, −0.5 (left) … 0.5 (right). */
  u: number;
  /** Up the window, −0.5 … 0.5. */
  v: number;
  /** Metres behind the wall's surface: inside the memory, never in the white room. */
  d: number;
}

export interface Cue {
  /** A manifest key (`mem:spoon-bowl`, `vf-laugh-next-room`) or a music file (`music/memory-kitchen.mp3`). */
  asset: string;
  /** Which take of the key (default: chosen by the memory's seed). */
  take?: number;
  /** Authored level, dB, applied to the file as recorded. */
  gainDb: number;
  place: Place;
  /** Moving while it plays (footsteps): place at its end, reached over the clip. */
  to?: Place;
  /** Lowpass, Hz (a muffle through a wall, distance); `lowpassTo` sweeps it over the clip. */
  lowpass?: number;
  lowpassTo?: number;
  /** Highpass, Hz: a small speaker (the kitchen radio) has no bass. */
  highpass?: number;
  fadeIn?: number;
  /** Beds and music: how long they take to leave once the memory lets go. */
  fadeOut?: number;
  /** Cut (0.3 s) when the memory is interrupted, rather than ringing on: footsteps, not a clink. */
  cutOnInterrupt?: boolean;
  /** Music only: start this far into the file. */
  offset?: number;
  /** What a caption says while it sounds (for visitors who can't hear it). */
  caption?: string;
}

export interface CueSheet {
  /** The memory's own small room: [seconds, decay, wet]. Never the white room's reverb. */
  room: [number, number, number];
  cues: Record<string, Cue>;
}

export function cueKind(label: string): CueKind | null {
  const k = label.slice(0, label.indexOf(':'));
  return k === 'sfx' || k === 'bed' || k === 'music' ? k : null;
}
