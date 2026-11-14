import type { CueSheet } from './cueSheet';
import type { Key, SheetSeed } from './seed';
import type { Sway } from './behaviours';
import type { Marker, Sections } from './types';

/**
 * The living memories' playable definitions (docs/memories.md): what each one's authored
 * timeline starts as (its Theatre seed, saved over in Studio), what it sounds like (its cue
 * sheet; timing is on the timeline's markers), and the few procedural choices. Which phrase
 * opens which memory, and when, is the Director's (src/content/memories.ts).
 *
 * Loaded only with the memory runtime (a lazy chunk).
 */
export interface MemoryDef {
  id: string;
  /** Art folder in public/memories/<art>/<variant>/. */
  art: string;
  variants: string[];
  /** Layers, back to front, with their kinds (from the art manifest; repeated here for the seed). */
  layers: string[];
  /** Fallbacks if the sheet has no section or sound markers yet. */
  sections: Sections;
  markers: Marker[];
  seed: (variant: string) => SheetSeed;
  cues: (variant: string) => CueSheet;
  /** Procedural sways laid under the timeline (none for most memories). */
  sways?: Sway[];
  /** Seconds of a graceful early exit. */
  exit: number;
  /** The longest the living scene is held before it closes itself. */
  maxHold: number;
  /** Seconds sound may run on after the image has gone. */
  tail: number;
  /** What stays in the room after a natural close, and when it comes (seconds after `exit`). */
  bleed?: 'kitchen-light';
  bleedAt?: number;
  /** How deep the room hushes while it plays. */
  hush: number;
  /** A drawing on the room's wall the painting opens from, registered onto its lines. */
  opensFrom?: string;
  /** The white room's own light goes down to this while it plays (the door: evening). */
  roomDim?: number;
  /** How long that dim holds once it goes (seconds from `exit`, its last four rising): 4. */
  roomDimOut?: number;
  /**
   * The variant whose music is the room's last (the woodland's afternoon): the room's drone is
   * silent from its start (a chord of the room's under it, a semitone from its key), and once it
   * has been seen the room plays no music of its own again that visit, the drone, its piano, its
   * humming: the music that belonged to that afternoon never returns, and nothing stands in for it
   * (the artist's brief of 2026-10-19; the creative and cinematic directors' reviews).
   */
  lastMusic?: string;
  /**
   * `false`: the room's drone is silent while it plays, and comes back after (a film with no score:
   * a chord under it would be one; the sound designer's review of "Almost", 2026-10-20).
   */
  drone?: false;
  /** What the picture is, for a screen reader (announced once, when it has formed). */
  describe: (variant: string) => string;
  /**
   * What changes later, told to a screen reader at the moment it happens (sequence seconds): only
   * to someone taken in (`inside`), only to someone it stayed on the wall for (`wall`), or only
   * while a close-up is shown (`shot`).
   */
  announce?: (variant: string) => { at: number; text: string; inside?: boolean; wall?: boolean; shot?: number }[];
  /**
   * A line written where the painting was, as it goes (the woodland's: decisions 119–123): once, at
   * `at` (sequence seconds) of `variant`, in the hand and size of the memory's own line, under it
   * and inside the painting's former place; only for someone taken in, to a memory that played on
   * to there unbroken. Told to a screen reader as it is written.
   */
  coda?: { variant: string; at: number; text: string };
  /**
   * A living memory (animated, and entered): its scene's object names in the timeline (`scene`,
   * `figure:a`, `figure:b`) are added to the schema, and the variants that have a living scene in
   * the art manifest are drawn by it (src/memory/living/). The others play on the wall as usual,
   * but sunk in the plaster as the scene is, and over their words, which go to a trace as the
   * colour comes and come back with the pencil (src/app/livingMemory.ts).
   */
  living?: boolean;
}

export const sheetId = (id: string, variant: string) => `${id}-${variant}`;

/** The four section markers every sheet carries, from its sections. */
export const sectionMarkers = (S: Sections): Marker[] => [
  { label: 'active', position: S.active },
  { label: 'exit', position: S.exit },
  { label: 'residue', position: S.residue },
  { label: 'end', position: S.end },
];

/** The cue (and marker) a film's own sound plays on: begun with the film, withdrawn if the film fails. */
export const FILM_CUE = 'music:film';

/** The cue a film memory's wall sound plays on: the room's own sound before the film begins. */
export const WALL_CUE = 'music:wall';

/** A film's own clock (`scene.film`): its first frame until `at`, then real time for `seconds`, then its last frame held. */
export const filmClock = (at: number, seconds: number): Key[] => [[0, 0, 'hold'], [at, 0, 'linear'], [at + seconds, seconds, 'hold']];

/**
 * The way in and out of a living memory (`scene.approach`, `scene.immerse`), shaped in Inside.ts:
 * `approach` begins at `from` (seconds) and is whole by `full`; `immerse` stays 0 until `begin`,
 * rises to 0.68 by `rise`, and is 1 from `full` until the exit; both go back after it (`back` is
 * when immerse reaches 0, seconds after the exit).
 */
export function entryTracks(exit: number, o: { from?: number; approach: number; begin: number; rise: number; full: number; back?: number }): Record<string, Key[]> {
  return {
    'scene.approach': [[o.from ?? 1.0, 0, 'linear'], [o.approach, 1], [exit + 1, 1, 'linear'], [exit + 5, 0]],
    'scene.immerse': [[0, 0, 'hold'], [o.begin, 0, 'linear'], [o.rise, 0.68, 'linear'], [o.full, 1, 'hold'], [exit, 1, 'linear'], [exit + 2, 0.72, 'linear'], [exit + (o.back ?? 5), 0]],
  };
}
