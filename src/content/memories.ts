/**
 * Which lines open into a living memory, and when (docs/memories.md). What each memory is (its
 * art, timeline and sound) is in src/memory/defs.ts; this is only what the Director needs.
 *
 * A line without a memory stays a line: nothing about it says otherwise.
 */
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
}

export const SCENE_MEMORIES: SceneMemory[] = [
  // The discoverable first memory: early, armed by reading or touching the line.
  { id: 'cereal', phraseId: 'cereal', earliest: 20, arm: 2.5, commit: 1.0, minHold: 10, maxHold: 22, variants: { first: 'first', revisit: ['later'] } },
];

export const SCENE_BY_PHRASE = new Map(SCENE_MEMORIES.map((m) => [m.phraseId, m]));
