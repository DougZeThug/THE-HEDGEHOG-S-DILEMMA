/**
 * What a memory's sounds are. Timing lives on the authored timeline (Theatre markers such as
 * `sfx:spoon`, `bed:kitchen`, `music:kitchen`, which the artist moves in Studio); the cue sheet
 * says what each marker sounds like and where it is. A marker with no entry is silent.
 *
 * Every file is played as recorded (no loudness normalising): each entry carries its authored
 * level, measured offline. Distance and place come from the engine (panner, lowpass, the
 * memory's own small room), never from the recording, so files are generated close and dry.
 */
export type CueKind = 'sfx' | 'bed' | 'music' | 'voice';

export interface Place {
  /** Across the window, −0.5 (left) … 0.5 (right). */
  u: number;
  /** Up the window, −0.5 … 0.5. */
  v: number;
  /** Metres behind the wall's surface: inside the memory, never in the white room. */
  d: number;
}

/**
 * A place in the white room rather than in a painting (a vignette has no window): fixed when the
 * vignette begins, from where the visitor is and which way they face (src/App.ts `spot`).
 * - `chair`: the chair, at the height of someone sitting on it
 * - `left`/`right`: beside the visitor, a little ahead (two people, the space between them)
 * - `close`: just beside the visitor's head (a phone held to the ear)
 * - `self`: a step in front of the visitor, straight ahead (the one remembering: their own voice, centred)
 * - `beyond`: past the wall where the memory's line is (another room)
 * - `door`: the room's door
 * - `anchor`: the line itself, on its wall
 */
export type Spot = 'chair' | 'left' | 'right' | 'close' | 'self' | 'beyond' | 'door' | 'anchor';
export interface SpotPlace {
  at: Spot;
  /** Metres: how far from the visitor (left/right/close) or beyond the wall. */
  d?: number;
  /** Height, metres (default: about where a head is). */
  h?: number;
}
export type AnyPlace = Place | SpotPlace;
export const isSpot = (p: AnyPlace): p is SpotPlace => 'at' in p;

export interface Cue {
  /** A manifest key (`mem:spoon-bowl`, `vf-laugh-next-room`) or a music file (`music/memory-kitchen.mp3`). */
  asset: string;
  /** Which take of the key (default: chosen by the memory's seed). */
  take?: number;
  /** Authored level, dB, applied to the file as recorded. */
  gainDb: number;
  place: AnyPlace;
  /** Moving while it plays (footsteps): place at its end, reached over the clip. */
  to?: AnyPlace;
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
  /**
   * Voices: the words spoken, captioned as speech (not as a sound) for as long as they sound,
   * and which side the speaker is on, so two people can be told apart in the captions.
   */
  text?: string;
  side?: 'left' | 'right';
  /** Stop this many seconds into the file (a sentence cut off, a laugh that doesn't finish). */
  stopAfter?: number;
  /** Dry: no room around it (a voice on a phone, held to the ear). */
  dry?: boolean;
}

export interface CueSheet {
  /** The memory's own small room: [seconds, decay, wet]. Never the white room's reverb. */
  room: [number, number, number];
  cues: Record<string, Cue>;
}

export function cueKind(label: string): CueKind | null {
  const k = label.slice(0, label.indexOf(':'));
  return k === 'sfx' || k === 'bed' || k === 'music' || k === 'voice' ? k : null;
}
