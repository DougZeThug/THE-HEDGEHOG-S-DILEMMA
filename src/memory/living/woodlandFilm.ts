import { WOODLAND_FILM } from '../defs';
import type { LivingSpec } from './woodland';

/**
 * "Five More Minutes" as a film (2026-10-24; scripts/woodland-film/): how it sits on a screen. The
 * film's frame is the painting's (1354×764, the painting's rectangle: each shot at its own pixels,
 * 1:1, inside it), so covering a 16:9 screen shows each shot whole, edge to edge (coverQuad's 1.06
 * overscan is the 1.06 the shots were made at).
 */

/** Film uv of the shots' own frame inside the film (references/woodland/film/film.json). */
const SHOT = { top: 1 - 22 / 764, bottom: 1 - 742 / 764 };
/** coverQuad's overscan (src/world/living/Immersion.ts). */
const OVER = 1.06;
const PAINT = 1354 / 764;

/**
 * The close-up on a screen wider than 16:9: its frame's top kept (their hair and faces are in the
 * top third of the shot; centred, a 2:1 window cut both foreheads and a 21:9 one their eyebrows),
 * so what a wide screen loses is their shoulders and hands.
 */
export function closeCover(aspect: number): [number, number] {
  const seen = Math.min(1, PAINT / aspect) / OVER;
  return [0.5, Math.max(0.5, Math.min(SHOT.top - seen / 2, 1 - seen / 2))];
}

export interface FilmSpec extends Pick<LivingSpec, 'cover' | 'coverAt'> {
  /**
   * Its close shots (memory s, from–to), when there are any: the room frames them as close (its
   * vignette centred and further out, as for the rig's two-shot), and frames them by their own
   * focus: `upright`, on a screen narrower than it is tall; `coverAt`, on any other.
   */
  close?: { spans: [number, number][]; upright: [number, number]; coverAt: (aspect: number) => [number, number] };
}

export const WOODLAND_FILM_SPEC: FilmSpec = {
  // The wides as the rig's: centred; upright, the column between his face and her hand (both heads
  // in it on a 9:19.5 phone: the interaction designer's review, 2026-10-18).
  cover: { wide: [0.5, 0.5], upright: [0.385, 0.5], ultra: [0.5, 0.5] },
  close: {
    spans: [[WOODLAND_FILM.shots.close, WOODLAND_FILM.shots.wideAgain]],
    // Upright, no column holds both faces (his at u 0.17, hers at 0.58: a 9:16 column is 0.31 of
    // the width): hers, the glance being hers, with room on his side for her look to go to. He is
    // seen again, still looking up, in the wide that follows.
    upright: [0.55, 0.5],
    coverAt: closeCover,
  },
};
