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

/** The close-up's two faces across the film (u: his left edge, her right edge, measured on its frames). */
const FACES = { from: 0.07, to: 0.68 };
/** Her face's middle, a little toward him (room for her look to go to). */
const HERS = 0.55;

/**
 * The close-up on a landscape screen. Wider than 16:9: its frame's top kept (their hair and faces
 * are in the top third of the shot; centred, a 2:1 window cut both foreheads and a 21:9 one their
 * eyebrows), so what a wide screen loses is their shoulders and hands. Narrower (a tablet, a window
 * half a screen wide): both faces while they fit, else hers (centred, a 4:3 window put his face on
 * its edge and a square one kept only his hair: the cinematic director, 2026-10-24).
 */
export function closeCover(aspect: number): [number, number] {
  const seen = Math.min(1, PAINT / aspect) / OVER;
  const v = Math.max(0.5, Math.min(SHOT.top - seen / 2, 1 - seen / 2));
  const across = Math.min(1, aspect / PAINT) / OVER;
  if (across >= 0.999 / OVER) return [0.5, v];
  return [across >= FACES.to - FACES.from ? (FACES.from + FACES.to) / 2 : HERS, v];
}

export interface FilmSpec extends Pick<LivingSpec, 'cover' | 'coverAt'> {
  /**
   * Let go before `before` (memory s), the film cuts to its frame at `to` (its own seconds) and
   * holds it as it goes back into the wall: the frame the wall's pencil draws.
   */
  leave?: { before: number; to: number };
  /**
   * Its close shots (memory s, from–to), when there are any: the room frames them as close (its
   * vignette centred and further out, as for the rig's two-shot), and frames them by their own
   * focus: `upright`, on a screen narrower than it is tall; `coverAt`, on any other.
   */
  close?: {
    spans: [number, number][];
    /** The same, in the film's frames: the room frames by the frame on the screen, not the clock. */
    frames: [number, number][];
    upright: [number, number];
    coverAt: (aspect: number) => [number, number];
  };
}

export const WOODLAND_FILM_SPEC: FilmSpec = {
  // The wides as the rig's: centred; upright, the column between his face and her hand (both heads
  // in it on a 9:19.5 phone: the interaction designer's review, 2026-10-18).
  cover: { wide: [0.5, 0.5], upright: [0.385, 0.5], ultra: [0.5, 0.5] },
  // (Let go before the cut, the film goes back to its first frame, the painting's own, both of them
  // looking up, as the pencil it sinks into draws them. Carried out of the close-up, two faces went
  // into a pencil of the wide; out of the second wide, her turned head into a pencil of her looking
  // up; and someone who had left before her glance was shown its outcome: the cinematic director
  // and the skeptic, 2026-10-24.)
  leave: { before: WOODLAND_FILM.shots.dusk, to: 0 },
  close: {
    spans: [[WOODLAND_FILM.shots.close, WOODLAND_FILM.shots.wideAgain]],
    frames: [[Math.round((WOODLAND_FILM.shots.close - WOODLAND_FILM.at) * WOODLAND_FILM.fps), Math.round((WOODLAND_FILM.shots.wideAgain - WOODLAND_FILM.at) * WOODLAND_FILM.fps)]],
    // Upright, no column holds both faces (his at u 0.17, hers at 0.58: a 9:16 column is 0.31 of
    // the width): hers, the glance being hers, with room on his side for her look to go to. He is
    // seen again, still looking up, in the wide that follows.
    upright: [HERS, 0.5],
    coverAt: closeCover,
  },
};
