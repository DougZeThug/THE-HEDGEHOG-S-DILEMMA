/**
 * The Drive Home (docs/drive-home.md): how its film sits on a screen. The film is 16:9 (1920×1080,
 * scripts/the-drive-home/film.py room), the room's cut from its second shot, so its own second 0 is
 * the film's 6.0. A wide screen sees all of it. An upright phone sees a column about a quarter of
 * its width, so it follows what each shot is about: the passenger at his window, his hands, the
 * driver, the hand at the vent; in the second two-shot it pans slowly from one of them to the other,
 * so both are seen and neither looks (the interaction designer's review, 2026-11-09); last, the
 * tail lamps. Every cut is a cut here too: each shot's place is held, never eased across a cut.
 */

import { easeInOut } from '../../core/math';
import { DRIVE_FROM, DRIVE_SHOTS } from '../beats/drive';

/**
 * The film u an upright screen keeps at its centre at the room cut's own second. Under reduced
 * motion a pan is a cut, at its middle: on an upright phone it crosses about two screen widths
 * (QA, 2026-11-09).
 */
export function uprightAt(film: number, reduced = false): [number, number] {
  const t = film + DRIVE_FROM;
  let u = 0.7;
  for (const [at, v] of DRIVE_SHOTS) {
    if (t < at) break;
    const x = typeof v === 'number' ? 0 : (t - v[2]) / (v[3] - v[2]);
    u = typeof v === 'number' ? v : v[0] + (v[1] - v[0]) * (reduced ? (x < 0.5 ? 0 : 1) : easeInOut(x));
  }
  return [u, 0.5];
}

export const DRIVE = {
  cover: { wide: [0.5, 0.5] as [number, number], upright: uprightAt(0), ultra: [0.5, 0.48] as [number, number] },
  uprightAt,
};
