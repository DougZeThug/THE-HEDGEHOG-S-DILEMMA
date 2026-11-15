/**
 * The painted rig's maths: its two-shot's clock and her turn's drawings. The rig is dormant
 * (the afternoon plays its film), but its scripts and tests still read these.
 */

/**
 * The painted rig's two-shot (scripts/two-shot.py; the artist's brief of 2026-10-18 and its
 * reviews), on the rig's own 53 s timeline. Dormant since 2026-10-24: the afternoon plays its film
 * (WOODLAND_FILM), and nothing the room plays reads these. They are kept with the rig (its spec,
 * src/memory/living/woodland.ts; its art, the manifest's `rig`; scripts/two-shot.py and
 * her-turn.py, which read them) so it can be restored or reused, and its tests still hold it to
 * them. The two of them close, one locked frame; her eyes lead her head toward him, and she
 * stays there, and so does he once his eyes find her. `scene.shot` 1 was this shot.
 */
export const TWO_SHOT = { from: 15.0, hisBlink: 16.2, herEyes: 17.5, herTurn: 18.0, hisEyes: 24.0, hisRoll: 24.5, to: 27.0 };
/**
 * Her turn (`scripts/her-turn.py`; the artist's production brief, 2026-10-20): her own painted head,
 * as a drawing carried in depth, turned a little toward him, drawn on twos. `figure:b.turn` is how
 * far through its drawings she is (0 the panel's own head, 1 settled toward him); the scene shows the
 * nearest drawing.
 * - Her eyes go to him first: drawings from `herEyes` (`eyes`: their share of the way, a soft dart).
 * - A moment.
 * - Her head from `herTurn`: `drawings` of it, a twelfth of a second apart. It is quickest at about
 *   a quarter of a second, then slows as she settles (velocity t² e^(−t/`ease`), its last drawing all
 *   the way). It is 90% of the way at about two thirds of a second; on screen its last four steps
 *   are each under a pixel.
 * - As her head comes round her eyes ease back in their sockets, still on him.
 * - The hair on the grass goes with her head.
 * - Never back (the artist: "She should glance toward him, settle into that gaze, and simply remain
 *   there").
 *
 * All of it lies inside 17.5–19.0: the score leaves her look clear from 17.0 to 19.5 (its notes
 * either side are composed to the picture: scripts/woodland-score/score.py `MOMENTS`).
 */
export const TURN = { eyes: [0.6, 1], ease: 0.13, drawings: 12 };
/** How far the ease has gone `t` s after `herTurn`, 0..1 (scripts/her-turn.py `turn_head`). */
export function turnHead(t: number): number {
  const x = Math.max(0, t) / TURN.ease;
  return 1 - Math.exp(-x) * (1 + x + (x * x) / 2);
}
/** One of her turn's drawings: when it is shown (s), her eyes' and her head's share of the way, and the `figure:b.turn` that shows it. */
interface TurnDrawing {
  at: number;
  eyes: number;
  head: number;
  turn: number;
}
/** Her turn's drawings (scripts/her-turn.py `schedule` makes the same; tests check its turn.json against these). */
export function turnDrawings(): TurnDrawing[] {
  const T = TWO_SHOT;
  // (Each exactly on its twelfth, the number a film's whole frames land on: rounded to four places,
  // four of them fell 33 µs after it, and a film sampled at 24 fps held her drawings 3-1-2: the
  // skeptic and QA, 2026-10-20.)
  const twelfth = (t: number, i: number) => (Math.round(t * 12) + i) / 12;
  const out = TURN.eyes.map((eyes, i) => ({ at: twelfth(T.herEyes, i), eyes, head: 0 }));
  const all = turnHead(TURN.drawings / 12);
  for (let i = 1; i <= TURN.drawings; i++) out.push({ at: twelfth(T.herTurn, i), eyes: 1, head: turnHead(i / 12) / all });
  const r = (x: number, d: number) => Math.round(x * d) / d;
  return out.map((d, k) => ({ at: d.at, eyes: d.eyes, head: r(d.head, 1e6), turn: r((k + 1) / out.length, 1e4) }));
}
