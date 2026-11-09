/**
 * The Drive Home (docs/drive-home.md): how its film sits on a screen. The film is 16:9 (1920×1080,
 * scripts/the-drive-home/film.py room), the room's cut from its second shot, so its own second 0 is
 * the film's 6.0. A wide screen sees all of it. An upright phone sees a column about a quarter of
 * its width, so it follows what each shot is about: the passenger at his window, his hands, the
 * driver, the hand at the vent; in the second two-shot it pans slowly from one of them to the other,
 * so both are seen and neither looks (the interaction designer's review, 2026-11-09); last, the
 * tail lamps. Every cut is a cut here too: each shot's place is held, never eased across a cut.
 */

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

/** Where the room's cut begins in the film (s): film.py ROOM_FROM. */
export const DRIVE_FROM = 6.0;

/**
 * The column's centre (u across the frame) by the film's own second (the full film's, not the room
 * cut's), measured on the room cut's frames: from each shot's start to the next. A pair is a pan
 * within the shot: [start u, end u, from s, to s].
 */
const SHOTS: [number, number | [number, number, number, number]][] = [
  [6.0, 0.7], //    two: the passenger, at his window (the driver on the left, in the dark)
  [10.9, 0.42], //  window: his face
  [16.9, 0.6], //   hands: his hands, rubbed together
  [21.4, 0.45], //  driver: the driver's face, eyes on the road
  [25.9, 0.56], //  vent: the hand on the vent
  [29.9, 0.47], //  warm: the passenger, the air on him
  [34.3, 0.43], //  vent-back: his hand on it
  [37.8, [0.72, 0.24, 38.0, 40.7]], // two-again: from the passenger, slowly, to the driver
  [40.8, 0.3], //   town: the two of them under the town's lights
  [44.0, 0.47], //  away: the tail lamps
];

/**
 * The film u an upright screen keeps at its centre at the room cut's own second. Under reduced
 * motion a pan is a cut, at its middle: on an upright phone it crosses about two screen widths
 * (QA, 2026-11-09).
 */
export function uprightAt(film: number, reduced = false): [number, number] {
  const t = film + DRIVE_FROM;
  let u = 0.7;
  for (const [at, v] of SHOTS) {
    if (t < at) break;
    const x = typeof v === 'number' ? 0 : (t - v[2]) / (v[3] - v[2]);
    u = typeof v === 'number' ? v : v[0] + (v[1] - v[0]) * (reduced ? (x < 0.5 ? 0 : 1) : ease(x));
  }
  return [u, 0.5];
}

export const DRIVE = {
  cover: { wide: [0.5, 0.5] as [number, number], upright: uprightAt(0), ultra: [0.5, 0.48] as [number, number], uprightScale: 1 },
  uprightAt,
};
