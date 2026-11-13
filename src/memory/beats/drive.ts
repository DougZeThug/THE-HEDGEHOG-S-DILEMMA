import type { Sections } from '../types';

export const DRIVE_SECTIONS: Sections = { active: 6.0, exit: 44.0, residue: 52.5, end: 58.5 };
/** The film: where it begins on the timeline (in the found faces), and its length (s: the room cut). */
export const DRIVE_AT = 6.0;
export const DRIVE_SECONDS = 1094 / 24;
/** Its moments (the film's own seconds: scripts/the-drive-home/film.py, mix.sh). */
export const DRIVE_BEATS = { lamp: 7.8, window: 10.9, lamp2: 13.6, hands: 17.0, vent: 28.1, ventBack: 36.25, indicator: 38.9, town: 40.8, away: 44.0 };
/** The three streetlights across the wall (memory s): each [start, end]. */
export const DRIVE_PASSES: [number, number][] = [[2.4, 3.9], [4.6, 6.1], [7.4, 9.0]];
