/**
 * A living memory's moving parts, named once (docs/memories.md).
 *
 * A memory is played by one controller on the room's one clock. Its authored timeline (Theatre.js)
 * is laid out in sections, in sequence seconds:
 *
 *   0 ─ emerge ─ active ─ (the living scene) ─ exit ─ (withdrawing) ─ residue ─ (what stays) ─ end
 *
 * The controller maps its own local time onto that sequence: through the emergence, through the
 * living scene and then holding at its last frame while the visitor stays (the procedural motion
 * goes on), and through the exit and the residue once the Director releases it.
 */

export type Lifecycle = 'dormant' | 'emerging' | 'active' | 'withdrawing' | 'residue' | 'complete';

/** Section starts in sequence seconds (emerging begins at 0). */
export interface Sections {
  /** The scene is fully formed: the living section begins. */
  active: number;
  /** The authored withdrawal begins. */
  exit: number;
  /** What remains after the image has gone (sound tails, sunlight in the room). */
  residue: number;
  /** The end of the sequence. */
  end: number;
}

/** A marker on the authored timeline (Theatre.js sequence markers), e.g. `sfx:spoon`. */
export interface Marker {
  label: string;
  position: number;
}

/** Flat values, keyed by `object.prop` (e.g. `window.reveal`, `layer:bowl-a.opacity`). */
export type Values = Record<string, number>;

/** The authored timeline the controller positions (Theatre.js in the app, a fake in tests). */
export interface TimelineSource {
  readonly sections: Sections;
  readonly markers: Marker[];
  /** Position the sequence (seconds) and return the authored values there, synchronously. */
  at(position: number): Values;
  dispose(): void;
}

/** Why a memory ends before its natural close. */
export type ReleaseReason = 'complete' | 'look-away' | 'walk-away' | 'interrupt' | 'switch' | 'depart' | 'hidden';

/** What the controller hands the renderer and the audio each step. */
export interface MemoryFrame {
  state: Lifecycle;
  /** Local time since the memory started (seconds). */
  t: number;
  /** The authored sequence position shown. */
  position: number;
  /** Authored values (Theatre), procedural envelopes (GSAP), and the composed result. */
  base: Values;
  env: Values;
  final: Values;
}
