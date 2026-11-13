import type { Sections } from '../types';

export const THINGS_SECTIONS: Sections = { active: 7.5, exit: 53.0, residue: 60.0, end: 63.0 };
/** The film: where it begins on the timeline (half a second after the visitor is inside), and its length (s). */
export const THINGS_AT = 11.5;
export const THINGS_SECONDS = 1026 / 24;
/** Its story's moments (seconds into the film: scripts/things/story.py, less the 6 s the wall draws;
 * tests/film-scene.test.ts holds them to what emergence.py read off the sheet). */
export const THINGS_BEATS = {
  going: 2.0, gone: 5.1, latch: 7.6, lift: 11.2, found: 12.3, turnsBack: 14.5, hand: 16.383, held: 18.495, takenBack: 20.395,
  hers: 24.895, reach: 26.195, hersHeld: 27.508, hersTaken: 28.907, erased: 32.657, him: 34.258, empty: 35.758,
};
