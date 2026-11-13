import type { WallText } from '../world/WallText';
import type { LivingMemory } from '../memory/runtime';

/** The living memory playing now (at most one), and the writing it formed round. */
export interface Living {
  memory: LivingMemory;
  id: string;
  /** The key of the writing it formed round, and where that is on its wall. */
  key: string;
  anchor: NonNullable<ReturnType<WallText['anchorOf']>>;
  /** What it leaves in the room (the kitchen's sun) has been handed over. */
  bled: boolean;
  /** When the tab was hidden, while it is. */
  hiddenSince: number | null;
  /** Held at a position by the editor or a capture: shown as if played there, nothing sounds. */
  held: boolean;
  /** A `?memory=` preview: never counted, nothing persisted. */
  preview?: boolean;
  /** The room's light has come to the visitor at its end (The Drive Home: `room.lean`). */
  leaned?: boolean;
  /** Seconds looking away from it, and watching it. */
  awayFor: number;
  watched: number;
  /** Seconds it is held before looking away may let it go. */
  minHold: number;
  /** The position it counts as seen from (a memory that says where its heart is). */
  seenAt?: number;
  /** How far it has played (its sequence position), for `seenAt`. */
  reached: number;
  /** The visitor is deep inside its painting (the room's hum goes further down). */
  deep: boolean;
  /** Why it was let go, if it was (the lifecycle's own reason, or the visitor's). */
  why: string | null;
  /** Let go early (a film's `leave`): the film held on the frame it cut to, to the end. */
  leftEarly?: boolean;
  /** Looking away from it now (last attention check). */
  away: boolean;
  /** How many of its later descriptions have been told to a screen reader. */
  told: number;
  /** The room's writing its painting has washed out (given back when it goes). */
  washed: Set<string>;
  /** Since when its sound has been stopped while it was visible; let go for it. */
  downSince: number | null;
  gaveUp: boolean;
  /** Its line where the painting was, if it has one: tried (once). */
  coda: boolean;
}
