/** What every film's adapter (almost, things, shadows, drive, woodlandFilm) and the scenes share. */

/** coverQuad's overscan (src/world/living/Immersion.ts): the frame is scaled this much past the screen. */
export const COVER_OVERSCAN = 1.06;

type Point = [number, number];

/** Where a film sits on a screen, and (if it has them) how its close shots are framed. */
export interface FilmSpec {
  /** The film uv (and v) kept at the screen's centre when it covers the view. `uprightScale`: how much closer than just covering an upright screen (unset: 1). */
  cover: { wide: Point; upright: Point; ultra: Point; uprightScale?: number };
  /** In place of `wide` and `ultra`: the focus for any screen this wide (width over height, not upright). */
  coverAt?: (aspect: number) => Point;
  /** On an upright screen, where it covers by the film's own second (`scene.film`), if it moves. */
  uprightAt?: (film: number, reduced?: boolean) => Point;
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
    upright: Point;
    coverAt: (aspect: number) => Point;
  };
}
