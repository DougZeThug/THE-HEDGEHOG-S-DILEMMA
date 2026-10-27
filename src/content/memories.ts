/**
 * Which lines open into a living memory, and when (docs/memories.md). What each memory is (its
 * art, timeline and sound) is in src/memory/defs.ts; this is only what the Director needs.
 *
 * A line without a memory stays a line: nothing about it says otherwise.
 */
import type { Phase, Surface } from './types';
import { VIGNETTES, type Tone } from './vignettes';

export interface SceneMemory {
  id: string;
  phraseId: string;
  /** Every line that opens it, its own first (a vignette's `anchor.also`). */
  phraseIds?: string[];
  /** Earliest engine time (seconds from the hand-off) it may play. */
  earliest: number;
  /** Seconds of looking at the line that arm it (a tap arms it at once). */
  arm: number;
  /** Seconds of a later look that begin it, once armed and eligible. */
  commit: number;
  /** Seconds before looking away may end it. */
  minHold: number;
  /**
   * A painted memory counts as seen only once it has been entered and played to here (its own
   * seconds), not after `minHold` (or 8 s) watched: the woodland's heart is her look, 18 s in (a
   * visitor who turned away as it took them in, at 9 s, was counted for good: the interaction
   * designer's review, 2026-10-18).
   */
  seenAt?: number;
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
  offer?: { phases: Phase[]; apart: number; wall?: Surface; afterDark?: boolean };
  /**
   * Its place in the visit's arc (company → solitude → absence): `first` only before any other
   * memory and before `latest`; `afterAnother` only once another memory has been.
   */
  arc?: 'first' | 'afterAnother';
  latest?: number;
  /**
   * A vignette (src/content/vignettes.ts): heard, not painted. It keeps its distance from other
   * memories, may open from stillness by the chair rather than a line, and may share a place
   * with another memory (`group`) or wait until another has been seen (`requires`).
   */
  kind?: 'vignette';
  tone?: Tone;
  chair?: { within: number; still: number };
  group?: 'kitchen';
  requires?: { seen: string };
  phases?: Phase[];
  afterFinished?: string;
  /** Heard this many times (over all visits), it no longer comes. */
  maxSeen?: number;
  /** Its line is kept off the walls until the memory offers it (it belongs to that moment). */
  reserved?: boolean;
  /** Once it has played, no other painted memory is offered in that visit (it ends the arc). */
  last?: boolean;
  /** Seconds from its start to its very end (withdrawal and tail), if longer than the usual ~28. */
  span?: number;
}

export const SCENE_MEMORIES: SceneMemory[] = [
  // The discoverable first memory: early, armed by reading or touching the line.
  { id: 'cereal', phraseId: 'cereal', earliest: 20, latest: 150, arc: 'first', arm: 2.5, commit: 1.0, minHold: 10, maxHold: 22, variants: { first: 'first', revisit: ['later'] }, lookBack: true },
  // Company that becomes absence inside one memory: two people in a clearing, a hand, the dusk
  // (docs/reviews/2026-10-woodland.md). Offered once another memory has been, ahead of the bedroom
  // (it takes a first visit's late place; the bedroom comes on a visit after it). Nothing painted
  // comes after it in that visit. A return visit meets the clearing again, empty, kept in the wall.
  {
    // (seenAt: her look, defs.ts TWO_SHOT.herTurn; tested.)
    id: 'woodland', phraseId: 'more-minutes', earliest: 200, arc: 'afterAnother', arm: 2.5, commit: 1.0, minHold: 12, seenAt: 18, maxHold: 42.5, span: 53,
    variants: { first: 'afternoon', revisit: ['empty'] }, lookBack: false, offer: { phases: ['contradiction', 'transform'], apart: 120 }, reserved: true, last: true,
  },
  // Almost (docs/almost.md): a felt film, two people side by side at a kitchen table at night; a
  // hand that reaches, a start, a hand taken back, an arm laid nearer too late. Offered once
  // another memory has been, as the room begins to contradict itself. It counts as seen once it
  // has been entered and played to the startle (defs.ts FILM_AT + FILM_BEATS.startle, 17.1 s). A
  // return visit plays it again.
  {
    id: 'almost', phraseId: 'your-hand', earliest: 170, arc: 'afterAnother', arm: 2.5, commit: 1.0, minHold: 12, seenAt: 18, maxHold: 37.5, span: 47.5,
    variants: { first: 'film', revisit: [] }, lookBack: false, offer: { phases: ['contradiction', 'transform'], apart: 120 }, reserved: true,
  },
  // Things I Should Have Said (docs/things.md): a charcoal drawing of a goodbye at a door, tried
  // again in pencil and erased. It opens from "I didn't know what to say." Offered once another
  // memory has been, as the room begins to contradict itself; seen once it has been entered and
  // played to his almost (defs.ts THINGS_AT + THINGS_BEATS.found, 23.8 s).
  {
    id: 'things', phraseId: 'didnt-know-say', earliest: 210, arc: 'afterAnother', arm: 2.5, commit: 1.0, minHold: 12, seenAt: 26, maxHold: 53.0, span: 63.0,
    variants: { first: 'film', revisit: [] }, lookBack: false, offer: { phases: ['contradiction', 'transform'], apart: 120 }, reserved: true,
  },
  // Peace with a cost: the longest, once the room has begun to contradict itself.
  {
    id: 'bedroom', phraseId: 'happiest-unneeded', earliest: 150, arm: 2.5, commit: 1.0, minHold: 12, maxHold: 26,
    // Offered as the answer to the room's long dark silence (or, if there was none, from 200 s).
    variants: { first: 'morning', revisit: ['dusk'] }, lookBack: false, offer: { phases: ['contradiction', 'transform'], apart: 120, afterDark: true },
  },
  // Absence, last: it opens from the room's own drawn door (south wall); its line is written
  // beneath that drawing when the visitor faces it, once another memory has been. Someone comes
  // to the door and stops; a return visit, they only pass.
  {
    id: 'door', phraseId: 'door-open', earliest: 240, arc: 'afterAnother', arm: 2.5, commit: 1.0, minHold: 9, maxHold: 18,
    variants: { first: 'approach', revisit: ['passing'] }, lookBack: false, offer: { phases: ['contradiction', 'transform'], apart: 120, wall: 'south' }, reserved: true,
  },
];

export const SCENE_BY_PHRASE = new Map(SCENE_MEMORIES.map((m) => [m.phraseId, m]));

/** The vignettes, as memories the MemoryDirector can open (what they are is in vignettes.ts). */
export const VIGNETTE_MEMORIES: SceneMemory[] = VIGNETTES.map((v) => ({
  id: v.id,
  phraseId: v.anchor.phrase ?? '',
  phraseIds: v.anchor.phrase ? [v.anchor.phrase, ...(v.anchor.also ?? [])] : [],
  earliest: v.earliest,
  arm: v.arm,
  commit: v.commit,
  minHold: v.seenAt ?? 6,
  maxHold: Math.max(...Object.values(v.variants).map((s) => s.span)),
  variants: { first: 'first', revisit: [] },
  lookBack: v.lookBack,
  kind: 'vignette',
  tone: v.tone,
  chair: v.anchor.chair,
  group: v.group,
  requires: v.requires,
  phases: v.phases,
  afterFinished: v.afterFinished,
  maxSeen: v.maxSeen,
  offer: v.offer,
}));

/** Every memory the Director may open: the painted ones, then the vignettes. */
export const ALL_MEMORIES: SceneMemory[] = [...SCENE_MEMORIES, ...VIGNETTE_MEMORIES];
/** By the line that opens it (the chair's vignette has none). */
export const MEMORY_BY_PHRASE = new Map(ALL_MEMORIES.flatMap((m) => linesOf(m).map((p) => [p, m] as const)));

/** Every line that opens a memory, its own first. */
export function linesOf(m: SceneMemory): string[] {
  return m.phraseIds?.length ? m.phraseIds : m.phraseId ? [m.phraseId] : [];
}
