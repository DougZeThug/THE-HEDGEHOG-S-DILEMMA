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

/** A revisit without a scene of its own has no order map: its colour is everywhere at once. */
const EVERYWHERE = () => 0.5;

/**
 * What a playing memory's frame washes the room's writing by (src/App.ts, `washUnderPainting`),
 * or null if it keeps its words: only a living memory lies under its writing (the cereal, bedroom
 * and door memories keep theirs on bare plaster, legible). `scene`: its living scene this
 * variant, if it has one (its order map's colour times; none for a revisit: the colour everywhere
 * at once, at the reveal's half way). `presenceWeight`: the intensity's (gentle paints it fainter,
 * but it is no less there: the words still go to their trace). The hold is `window.wash`, never
 * past the pencil.
 */
export function washInputs(
  def: { living?: boolean },
  scene: { colourAt: ((u: number, v: number) => number) | null } | null,
  final: Record<string, number>,
  presenceWeight = 1,
): { colourAt: (u: number, v: number) => number; reveal: number; presence: number; hold: number } | null {
  if (!def.living) return null;
  const colourAt = scene ? scene.colourAt : EVERYWHERE;
  if (!colourAt) return null;
  return {
    colourAt,
    reveal: final['window.reveal'] ?? 0,
    presence: Math.min(1, (final['window.presence'] ?? 1) / Math.max(presenceWeight, 1e-3)),
    hold: Math.min(final['window.sketch'] ?? 0, final['window.wash'] ?? 0),
  };
}

/**
 * How washed a piece of writing is (0 .. `WASH`). `box`: where it is written (centre and size, in
 * the wall's writing frame, metres); `painting`: where the painting is in that frame; `colourAt`:
 * when the colour reaches a point of the painting (uv, y up); `reveal`: the colour's progress;
 * `presence`: how far the painting is there (let go early, the writing comes back as the painting
 * goes, never after it); `hold`: how far it is held washed once the colour has come (the
 * timeline's `window.wash`, no further than the pencil is there). Judged at five points across
 * the writing, along its top, its middle and its bottom: it goes as soon as the colour (a little
 * ahead of it) reaches any of those on the painting, and as far as the share of a row on it (a line
 * half over the painting's edge goes half way; a block of lines with one across the painting goes
 * all the way. Judged by its middle row, "I wanted you to" stayed written across the kitchen table:
 * the cinematic director's review of "Almost", 2026-10-21).
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
  let share = 0, most = 0;
  for (let j = -1; j <= 1; j++) {
    // (its top and bottom rows a little inside its box, where the letters are)
    const v = (box.y + box.h * 0.4 * j - painting.cy) / painting.h + 0.5;
    if (v < 0 || v > 1) continue;
    let on = 0;
    for (let i = 0; i < 5; i++) {
      const u = (box.x + box.w * ((i + 0.5) / 5 - 0.5) - painting.cx) / painting.w + 0.5;
      if (u < 0 || u > 1) continue;
      on++;
      // (The wall's own soft edge for the colour: src/world/MemoryWindow.ts; 0.05 ahead of it.)
      const g = colourAt(u, v);
      const k = Math.min(1, Math.max(0, (reveal + 0.05 - (g - 0.08)) / 0.16));
      most = Math.max(most, k * k * (3 - 2 * k));
    }
    share = Math.max(share, on / 5);
  }
  return WASH * Math.max(most, Math.min(1, Math.max(0, hold))) * share * Math.min(1, presence);
}
