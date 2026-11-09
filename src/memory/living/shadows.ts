/**
 * Memory VII, The Shape of Someone (docs/shadows.md): how its film sits on a screen. The film is a
 * wall in 16:9 (1920×1080, scripts/memory-vii/render.py --room), the shape of the room's own walls.
 * A wide screen sees all of it. An upright phone sees a column about a quarter of its width: the
 * two shadows begin most of the frame apart, so it follows her (the light finds her first; her
 * bowing away is hers), and as they come within a column of each other it turns to where they
 * meet, and stays there (the interaction designer's review, 2026-11-09: a fixed middle column was bare plaster until
 * they met).
 */

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

/** render.py's keys (seconds into the film; the light's x and the pair's gap, of the frame's width). */
const LIGHT_X: [number, number][] = [[0, 0.8], [6, 0.66], [12, 0.53], [16.5, 0.47], [21, 0.31], [26, 0.22]];
const GAP: [number, number][] = [[0, 1560], [5, 1180], [8, 800], [10.2, 880], [12.6, 420], [14.1, 292], [17.0, 284], [19.6, 560], [22.5, 1120], [26, 1560]].map(([t, g]) => [t, g / 1920]);

/** Where they meet (film seconds: render.py's GAP). */
const MET = 12.6;

export function key(t: number, keys: [number, number][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
    if (t <= t1) return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1][1];
}

/** Where the two shadows stand (film u, 0..1 across) at a film second: his, the middle, hers. */
export function shadowsAt(t: number): { his: number; mid: number; hers: number; gap: number } {
  const mid = 0.5 + (0.5 - key(t, LIGHT_X)) * 0.33;
  const gap = key(t, GAP);
  return { his: mid - gap / 2, mid, hers: mid + gap / 2, gap };
}

/** The film u an upright screen keeps at its centre at a film second: her, then where they meet. */
export function uprightAt(film: number): [number, number] {
  // (Once they have met it stays where they met: they leave the column on both sides, as the film
  // never takes a side; following her after, it did: the skeptic's review, 2026-11-09.)
  const s = shadowsAt(Math.min(film, MET));
  const onHer = s.hers - 0.06;
  const w = ease((s.gap - 0.22) / 0.22);
  return [Math.min(0.86, Math.max(0.14, s.mid + (onHer - s.mid) * w)), 0.48];
}

export const SHADOWS = {
  cover: { wide: [0.5, 0.5] as [number, number], upright: uprightAt(0), ultra: [0.5, 0.48] as [number, number], uprightScale: 1 },
  uprightAt,
};
