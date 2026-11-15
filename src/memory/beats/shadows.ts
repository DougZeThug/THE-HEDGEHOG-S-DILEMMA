import type { Sections } from '../types';

export const SHADOWS_SECTIONS: Sections = { active: 7.0, exit: 30.5, residue: 37.5, end: 44.0 };
/** The film: where it begins on the timeline (on the wall, in the gathered shade), and its length (s). */
export const SHADOWS_AT = 5.5;
export const SHADOWS_SECONDS = 624 / 24;
/** Its moments (seconds into the film: scripts/memory-vii/render.py's keys). */
export const SHADOWS_BEATS = { light: 2.6, approach: 5.0, reach: 7.3, bows: 8.4, meet: 12.6, hold: 14.1, part: 17.0, thread: 18.6, dark: 23.6 };
/** The room counts it seen once it has been entered and played to their meeting (memory s, the whole second they meet in). */
export const SHADOWS_SEEN_AT = Math.floor(SHADOWS_AT + SHADOWS_BEATS.meet);
