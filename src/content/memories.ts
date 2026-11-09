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
  // Memory VII, The Shape of Someone (docs/shadows.md): the chair's shadow climbs the wall, shade
  // gathers round it, and in it two people's shadows come together and hold each other while the
  // people stay apart. It opens from "You understood me once, completely, for about a minute."
  // Offered once another memory has been, as the room begins to contradict itself; seen once it
  // has been entered and played to their meeting (defs.ts SHADOWS_AT + SHADOWS_BEATS.meet, 18.1 s).
  {
    id: 'shadows', phraseId: 'understood-minute', earliest: 190, arc: 'afterAnother', arm: 2.5, commit: 1.0, minHold: 12, seenAt: 18, maxHold: 30.5, span: 44.0,
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

/**
 * The visit's heart (docs/reviews/2026-11-emotional-arc.md): one painted memory a visit, reachable
 * from early on, chosen from what has happened between the visitor and the chair:
 * - the room has recoiled at them (they came back to the chair after going away): Almost, a hand
 *   that reaches, starts and is taken back. They have just felt the room do it. This is the one
 *   rhyme a visitor can see both halves of, and the only heart that leaves a line;
 * - otherwise, from two and a half minutes, if they have stayed by it a long while (45 s, or knelt 8 s): the
 *   woodland, company and then the clearing empty (its own coda is what it leaves);
 * - or if they came to it and went away and have stayed away (50 s): Things I Should Have Said, a
 *   goodbye at a door.
 * Until its line is pointed at it may still change (a recoil makes it Almost). It needs no memory
 * before it; once it has played, no other painted memory comes that visit.
 */
export const HEART_BY_SHAPE = { recoiled: 'almost', close: 'woodland', refused: 'things' } as const;
export type HeartShape = keyof typeof HEART_BY_SHAPE;
/**
 * A heart shared by two memories (docs/shadows.md): someone who has stayed by the chair is given
 * the woodland or Memory VII, the shadows (the chair's own shadow goes to the wall, and in it two
 * shadows hold each other "for about a minute"), whichever they have seen fewer times on earlier
 * visits; on a first visit, by the visit's own coin. (As an offered memory after another, it played
 * in 0-2% of simulated visits: the interaction designer's review, 2026-11-09.)
 */
export const HEART_SHARED: Partial<Record<HeartShape, readonly string[]>> = { close: ['woodland', 'shadows'] };
/** Every memory that can be a heart. */
export const HEART_IDS: ReadonlySet<string> = new Set([...Object.values(HEART_BY_SHAPE), ...Object.values(HEART_SHARED).flat()]);
/** This visit's heart for a shape: `counts` seen on earlier visits, `coin` the visit's own draw (0..1). */
export function heartOf(shape: HeartShape, counts: Record<string, number>, coin: number): string {
  const shared = HEART_SHARED[shape];
  if (!shared) return HEART_BY_SHAPE[shape];
  const least = Math.min(...shared.map((id) => counts[id] ?? 0));
  const fewest = shared.filter((id) => (counts[id] ?? 0) === least);
  return fewest[Math.min(fewest.length - 1, Math.floor(coin * fewest.length))];
}
/** What a heart leaves beside "I wanted you to stay." (a phrase id): Almost only. */
export const HEART_ANSWER: Record<string, string> = { almost: 'took-hand-back' };
/** The earliest a heart may be pointed at or begin (engine seconds from the hand-off). */
export const HEART_EARLIEST = 75;
/** The other hearts are chosen only from here (the recoil, a median 103 s in, comes first). */
export const HEART_DECIDE = 150;
/** Almost is pointed at no sooner than this after the recoil (its 7 s hold, and a breath). */
export const HEART_AFTER_RECOIL = 17;
