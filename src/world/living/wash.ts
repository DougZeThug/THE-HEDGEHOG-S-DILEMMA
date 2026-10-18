/**
 * The room's writing under a living memory's painting (docs/reviews/2026-10-woodland.md): while
 * the pencil draws, graphite stays with graphite; each piece of writing goes to a trace just ahead
 * of the colour, as soon as it reaches any of it (judged by the whole line it lagged, and the
 * opening's unfinished sentence captioned the two of them as their colour came: both directors,
 * 2026-10-18); it stays a trace until the pencil goes, so the empty clearing's pencil is alone a
 * while and the words come back to a white wall (the creative director and the skeptic). Its own
 * line too: the painting, drawn in order, lies under its words (image 3 has no writing on it).
 */

/** How far a washed piece of writing goes (to 15% of its strength). */
export const WASH = 0.85;

/**
 * How washed a piece of writing is (0 .. `WASH`). `box`: where it is written (centre and size, in
 * the wall's writing frame, metres); `painting`: where the painting is in that frame; `colourAt`:
 * when the colour reaches a point of the painting (uv, y up); `reveal`: the colour's progress;
 * `presence`: how far the painting is there (let go early, the writing comes back as the painting
 * goes, never after it); `hold`: how far it is held washed once the colour has come (the
 * timeline's `window.wash`, no further than the pencil is there). Judged at five points across
 * the writing: it goes as soon as the colour (a little ahead of it) reaches any of those on the
 * painting, and only as far as its share of them on it (a line half over the painting's edge
 * goes half way).
 */
export function washOf(
  box: { x: number; y: number; w: number; h: number },
  painting: { cx: number; cy: number; w: number; h: number },
  colourAt: (u: number, v: number) => number,
  reveal: number,
  presence: number,
  hold = 0,
): number {
  if (painting.w <= 0 || painting.h <= 0 || presence <= 0) return 0;
  const v = (box.y - painting.cy) / painting.h + 0.5;
  if (v < 0 || v > 1) return 0;
  let on = 0, most = 0;
  for (let i = 0; i < 5; i++) {
    const u = (box.x + box.w * ((i + 0.5) / 5 - 0.5) - painting.cx) / painting.w + 0.5;
    if (u < 0 || u > 1) continue;
    on++;
    // (The wall's own soft edge for the colour: src/world/MemoryWindow.ts; 0.05 ahead of it.)
    const g = colourAt(u, v);
    const k = Math.min(1, Math.max(0, (reveal + 0.05 - (g - 0.08)) / 0.16));
    most = Math.max(most, k * k * (3 - 2 * k));
  }
  return WASH * Math.max(most, Math.min(1, Math.max(0, hold))) * (on / 5) * Math.min(1, presence);
}
