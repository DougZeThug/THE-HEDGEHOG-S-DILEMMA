import type { Sections } from '../types';

export const DRIVE_SECTIONS: Sections = { active: 6.0, exit: 44.0, residue: 52.5, end: 58.5 };
/** The film: where it begins on the timeline (in the found faces), and its length (s: the room cut). */
export const DRIVE_AT = 6.0;
/** Where the room's cut begins in the film (s): film.py ROOM_FROM. The film's own second 0 is the memory's DRIVE_AT, so a memory second is the film's. */
export const DRIVE_FROM = DRIVE_AT;
export const DRIVE_SECONDS = 1094 / 24;
/** Its moments (the film's own seconds: scripts/the-drive-home/film.py, mix.sh). */
export const DRIVE_BEATS = { lamp: 7.8, window: 10.9, lamp2: 13.6, hands: 17.0, vent: 28.1, ventBack: 36.25, indicator: 38.9, town: 40.8, away: 44.0 };
/** The three streetlights across the wall (memory s): each [start, end]. */
export const DRIVE_PASSES: [number, number][] = [[2.4, 3.9], [4.6, 6.1], [7.4, 9.0]];
/** The room counts it seen once it has been entered and played to the driver's turn of the vent (memory s, whole). */
export const DRIVE_SEEN_AT = Math.ceil(DRIVE_BEATS.vent);

/**
 * The column's centre (u across the frame) an upright phone keeps by the film's own second (the
 * full film's, not the room cut's), measured on the room cut's frames: from each shot's start to the
 * next. A pair is a pan within the shot: [start u, end u, from s, to s].
 */
export const DRIVE_SHOTS: [number, number | [number, number, number, number]][] = [
  [DRIVE_FROM, 0.7], //             two: the passenger, at his window (the driver on the left, in the dark)
  [DRIVE_BEATS.window, 0.42], //    window: his face
  [16.9, 0.6], //                   hands: his hands, rubbed together
  [21.4, 0.45], //                  driver: the driver's face, eyes on the road
  [25.9, 0.56], //                  vent: the hand on the vent
  [29.9, 0.47], //                  warm: the passenger, the air on him
  [34.3, 0.43], //                  vent-back: his hand on it
  [37.8, [0.72, 0.24, 38.0, 40.7]], // two-again: from the passenger, slowly, to the driver
  [DRIVE_BEATS.town, 0.3], //       town: the two of them under the town's lights
  [DRIVE_BEATS.away, 0.47], //      away: the tail lamps
];
