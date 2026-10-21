/**
 * "Things I Should Have Said" (docs/things.md): how its film sits on a screen. The film is the
 * sheet's open-matte frame (1280×1440, drawn by scripts/things/): covering a wide screen shows a
 * band across its middle, the doorway and the two of them in it; covering an upright one, the crop
 * round the doorway and her.
 */

// Rows and columns of the sheet the drawing lives in (the reference camera, scripts/things/scene.py)
const W = 1280;
const H = 1440;
/** The middle of what is drawn (the lintel to her feet), from the sheet's top. */
const MIDDLE = 745;
/** The doorway's lintel and her shoe, the drawing's top and bottom rows (every beat: QA, 2026-10-21). */
const LINTEL = 426;
const FEET = 1007;
/** Rows kept clear above the lintel and below her feet while the screen has them; her feet's least. */
const ABOVE = 24;
const BELOW = 28;
const BELOW_LEAST = 12;
/** coverQuad's overscan (src/world/living/Immersion.ts). */
const OVER = 1.06;
/** The doorway and her, across (columns): their middle. */
const ACROSS = 700;

/**
 * The film v kept at the screen's centre on a screen this wide (width over height, not upright).
 * The drawing's middle while the lintel and her feet both fit with room; on a wider screen the
 * shortfall is taken mostly from above the lintel, and from about 2:1 the lintel itself goes (a
 * landscape phone, 21:9), never her feet (a constant middle cut the lintel and touched her feet
 * on a landscape phone: QA, 2026-10-21).
 */
export function thingsCover(aspect: number): [number, number] {
  const half = W / (aspect * OVER) / 2;
  const highest = FEET + BELOW - half;           // the centre row that keeps her feet with room
  const lowest = LINTEL - ABOVE + half;          // the centre row that keeps the lintel with room
  const row = highest <= lowest
    ? Math.min(lowest, Math.max(highest, MIDDLE))
    : Math.max(FEET + BELOW_LEAST - half, 0.7 * highest + 0.3 * lowest);
  return [0.5, 1 - row / H];
}

export const THINGS = {
  /** The film uv kept at the screen's centre when it covers the view. */
  cover: { wide: thingsCover(16 / 9), upright: [ACROSS / W, 1 - MIDDLE / H] as [number, number], ultra: thingsCover(2.39) },
  coverAt: thingsCover,
};
