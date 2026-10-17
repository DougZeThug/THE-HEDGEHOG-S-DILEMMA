/**
 * The room's writing under a living memory's painting (docs/reviews/2026-10-woodland.md): while
 * the pencil draws, graphite stays with graphite; each piece of writing goes to a trace as the
 * colour reaches it, and comes back as the colour leaves (the kitchen's light washes its own line
 * so). Its own line too: the painting, drawn in order, lies under its words (image 3 has no
 * writing on it); they come back to the white wall after it.
 */

/** How far a washed piece of writing goes (to 15% of its strength). */
export const WASH = 0.85;

/**
 * How washed a piece of writing is (0 .. `WASH`). `box`: where it is written (centre and size, in
 * the wall's writing frame, metres); `painting`: where the painting is in that frame; `colourAt`:
 * when the colour reaches a point of the painting (uv, y up); `reveal`: the colour's progress;
 * `presence`: how far the painting is there (let go early, the writing comes back as the painting
 * goes, never after it). Judged at five points across the writing, those off the painting
 * uncoloured: a line half over its edge goes half way, a long one as the colour crosses it.
 */
export function washOf(
  box: { x: number; y: number; w: number; h: number },
  painting: { cx: number; cy: number; w: number; h: number },
  colourAt: (u: number, v: number) => number,
  reveal: number,
  presence: number,
): number {
  if (painting.w <= 0 || painting.h <= 0 || presence <= 0) return 0;
  const v = (box.y - painting.cy) / painting.h + 0.5;
  if (v < 0 || v > 1) return 0;
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    const u = (box.x + box.w * ((i + 0.5) / 5 - 0.5) - painting.cx) / painting.w + 0.5;
    if (u < 0 || u > 1) continue;
    // (The wall's own soft edge for the colour: src/world/MemoryWindow.ts.)
    const g = colourAt(u, v);
    const k = Math.min(1, Math.max(0, (reveal - (g - 0.08)) / 0.16));
    sum += k * k * (3 - 2 * k);
  }
  return WASH * (sum / 5) * Math.min(1, presence);
}
