/**
 * Which lines open into a living memory, and when (docs/memories.md). What each memory is (its
 * art, timeline and sound) is in src/memory/defs.ts; this is only what the Director needs.
 *
 * A line without a memory stays a line: nothing about it says otherwise.
 */
import type { Phase } from './types';

export interface SceneMemory {
  id: string;
  phraseId: string;
  /** Earliest engine time (seconds from the hand-off) it may play. */
  earliest: number;
  /** Seconds of looking at the line that arm it (a tap arms it at once). */
  arm: number;
  /** Seconds of a later look that begin it, once armed and eligible. */
  commit: number;
  /** Seconds before looking away may end it. */
  minHold: number;
  /** The longest it plays (the controller closes it then). */
  maxHold: number;
  /** First visit, and returning visits in turn. */
  variants: { first: string; revisit: string[] };
  /**
   * Begins only when the visitor comes back to the line (cereal: the first memory must not teach
   * "stare at a line and get a picture"); otherwise a read of `arm` seconds begins it.
   */
  lookBack: boolean;
  /**
   * Offered later in a visit: its line is written alone on the wall the visitor faces (as the
   * kitchen-light memory's is), in these phases, at least `apart` seconds after another memory.
   */
  offer?: { phases: Phase[]; apart: number };
}

export const SCENE_MEMORIES: SceneMemory[] = [
  // The discoverable first memory: early, armed by reading or touching the line.
  { id: 'cereal', phraseId: 'cereal', earliest: 20, arm: 2.5, commit: 1.0, minHold: 10, maxHold: 22, variants: { first: 'first', revisit: ['later'] }, lookBack: true },
  // Peace with a cost: the longest, once the room has begun to contradict itself.
  {
    id: 'bedroom', phraseId: 'happiest-unneeded', earliest: 150, arm: 2.5, commit: 1.0, minHold: 12, maxHold: 26,
    variants: { first: 'morning', revisit: ['dusk'] }, lookBack: false, offer: { phases: ['contradiction', 'transform'], apart: 120 },
  },
  // Absence, last and shortest: a door ajar, the landing light, someone passing.
  {
    id: 'door', phraseId: 'door-open', earliest: 240, arm: 2.5, commit: 1.0, minHold: 9, maxHold: 16,
    variants: { first: 'passing', revisit: ['approach'] }, lookBack: false, offer: { phases: ['contradiction', 'transform'], apart: 120 },
  },
];

export const SCENE_BY_PHRASE = new Map(SCENE_MEMORIES.map((m) => [m.phraseId, m]));
