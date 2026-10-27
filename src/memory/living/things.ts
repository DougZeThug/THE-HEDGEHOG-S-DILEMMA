/**
 * "Things I Should Have Said" (docs/things.md): how its film sits on a screen. The film is the
 * sheet's open-matte frame (1280×1440, drawn by scripts/things/): covering a wide screen shows a
 * band across its middle, the doorway and the two of them in it; covering an upright one, the crop
 * round the doorway and her.
 */

// Rows and columns of the sheet the drawing lives in (the reference camera, scripts/things/scene.py)
const W = 1280;
const H = 1440;
/** The middle of what is drawn (the lintel to their feet), from the sheet's top. */
const MIDDLE = 730;
/** The casing over the doorway and the lowest foot, the drawing's top and bottom rows (every pose
 *  of v2, scripts/things/: she stands nearer us, so her feet are lower than they were). */
const LINTEL = 412;
const FEET = 1047;
/** The top of his head when he turns back toward her, his face first drawn (sheet row). */
const HEAD = 499;
/** Rows kept clear above the lintel and below their feet while the screen has them; the feet's least. */
const ABOVE = 16;
const BELOW = 20;
const BELOW_LEAST = 10;
/** coverQuad's overscan (src/world/living/Immersion.ts). */
const OVER = 1.06;
/** The doorway and the two of them, across (columns 390-873: QA, 2026-10-22): their middle. */
const ACROSS = 632;

/**
 * The film v kept at the screen's centre on a screen this wide (width over height, not upright).
 * The drawing's middle while the lintel and her feet both fit with room; on a wider screen the
 * shortfall is taken mostly from above the lintel, and from about 1.9:1 the lintel itself goes (a
 * landscape phone, 21:9), then their feet, never his head as he turns back to her (cut at 2.2:1,
 * the moment his face is first drawn: QA, 2026-10-22).
 */
export function thingsCover(aspect: number): [number, number] {
  const half = W / (aspect * OVER) / 2;
  const highest = FEET + BELOW - half;           // the centre row that keeps her feet with room
  const lowest = LINTEL - ABOVE + half;          // the centre row that keeps the lintel with room
  const row = highest <= lowest
    ? Math.min(lowest, Math.max(highest, MIDDLE))
    : Math.min(HEAD - 8 + half, Math.max(FEET + BELOW_LEAST - half, 0.7 * highest + 0.3 * lowest));
  return [0.5, 1 - row / H];
}

export const THINGS = {
  /** The film uv kept at the screen's centre when it covers the view. */
  // (Upright: 1.2 times closer than just covering it. The drawing, columns 390-873, is narrower than
  // a phone's column of the sheet: covered, the people were under half its height; at 1.3 the
  // casing touched its edge, and on a 360-wide phone 1.22 left 8 px of her back: the cinematic director, QA, 2026-10-22.)
  cover: { wide: thingsCover(16 / 9), upright: [ACROSS / W, 1 - MIDDLE / H] as [number, number], ultra: thingsCover(2.39), uprightScale: 1.2 },
  coverAt: thingsCover,
};
