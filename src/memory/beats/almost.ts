import type { Sections } from '../types';

export const ALMOST_SECTIONS: Sections = { active: 6, exit: 37.5, residue: 44.5, end: 47.5 };
/** The film: where it begins on the timeline (half a second after the visitor is inside), and its length (s). */
export const FILM_AT = 10.3;
export const FILM_SECONDS = 679 / 24;
/** Its story's moments (seconds into the film: scripts/almost/xsheet.py). */
export const FILM_BEATS = {
  notice: 60 / 24, reach: 90 / 24, touch: 156 / 24, startle: 164 / 24, lap: 255 / 24, look: 295 / 24, offer: 343 / 24, tooLate: 415 / 24, almost: 487 / 24,
};
/** The room counts it seen once it has been entered and played to the startle (memory s, whole). */
export const ALMOST_SEEN_AT = Math.ceil(FILM_AT + FILM_BEATS.startle);
