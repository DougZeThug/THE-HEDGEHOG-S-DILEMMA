/**
 * "Things I Should Have Said" (docs/things.md): how its film sits on a screen. The film is the
 * sheet's open-matte frame (1280×1440, drawn by scripts/things/): covering a wide screen shows a
 * band across its middle, the doorway and the two of them in it (the camera stands back so the
 * lintel and the threshold are inside the band with room: the cinematic director's review,
 * 2026-10-21); covering an upright one, the crop round the doorway and her.
 */

// Rows and columns of the sheet the drawing lives in (the reference camera, scripts/things/scene.py)
const W = 1280;
const H = 1440;
/** The middle of what is drawn (the lintel to her feet), from the sheet's top. */
const MIDDLE = 745;
/** The doorway and her, across (columns): their middle. */
const ACROSS = 700;

/** The film v kept at the screen's centre on a screen this wide: the drawing's middle, always. */
export function thingsCover(_aspect: number): [number, number] {
  return [0.5, 1 - MIDDLE / H];
}

export const THINGS = {
  /** The film uv kept at the screen's centre when it covers the view. */
  cover: { wide: thingsCover(16 / 9), upright: [ACROSS / W, 1 - MIDDLE / H] as [number, number], ultra: thingsCover(2.39) },
  coverAt: thingsCover,
};
