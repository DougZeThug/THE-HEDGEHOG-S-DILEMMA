import type { Sections } from '../types';

export const WOODLAND_SECTIONS: Sections = { active: 6, exit: 38.5, residue: 44.6, end: 47.5 };
/**
 * The afternoon's film (scripts/woodland-film/assemble.py; references/woodland/film/film.json): when
 * it begins on the timeline (the opening wide, as the way in settles), its frames, and its shots
 * (memory s). Each shot runs at its own 24 fps, its whole selected length; nothing is looped,
 * reversed or retimed. Her glance is the close-up's own (measured on its frames: her eyes 4.3 s
 * in, her head 5.2–6.5 s, settled by 6.8 s).
 */
export const WOODLAND_FILM = {
  at: 9.5,
  fps: 24,
  frames: 708,
  shots: { opening: 9.5, close: 15.0, wideAgain: 25.25, dusk: 30.5, end: 39.0 },
  glance: { eyes: 19.3, head: 20.2, turned: 21.5, settled: 21.8 },
};
/** The cut: the people gone and the evening come, on the same frame (the film's frame 504). */
export const CUT = WOODLAND_FILM.shots.dusk;
/** The evening comes up over the afternoon's 40 ms cut, full on it (the two cross over the same
 *  40 ms, so nothing dips: a hole of 9.5 dB had opened with the wind gone), this far into its file
 *  (past an MP3's first moments). */
export const EVENING_AT = CUT - 0.04;
export const EVENING_OFFSET = 0.03;
/** Where the score's file begins (its first note, the turnaround of a go-round already under way,
 *  falls at 8.5, as the painting opens out: scripts/woodland-score/score.py). */
export const SCORE_FROM = 8.2;
/**
 * The afternoon's shots as the room plays them (its film's): the cut to the two of them close, and
 * back to the wide. The sound reads its times from here (synthWoods.ts `TIMES`).
 */
export const SHOTS = { two: WOODLAND_FILM.shots.close, wideAgain: WOODLAND_FILM.shots.wideAgain };
