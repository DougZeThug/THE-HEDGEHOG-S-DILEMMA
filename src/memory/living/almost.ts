/**
 * "Almost" (docs/almost.md): how its film sits on a screen. The film is an open-matte frame
 * (1280×1440 photographed): covering a wide screen shows a band across its middle; covering an
 * upright one, the 9:16 crop round the two figures (scripts/almost/assemble.py's crops, the same
 * photographs).
 */

// Rows of the open matte, from its top, that the frame keeps (photograph 0, 2026-10-21)
const W = 1280;
const H = 1440;
/** The lowest row a frame shows at least: the cup's shadow, and a few rows more. */
const FLOOR = 1058;
/** Her eyes' row, kept this far (of the frame's height) below the frame's top. */
const EYES = 606;
const EYES_BELOW = 0.12;
/** The lowest the frame sits (v, from the bottom), on screens up to 16:9: room above her hat. */
const LOW = 0.482;
/** coverQuad's overscan (src/world/living/Immersion.ts). */
const OVER = 1.06;

/**
 * The film v kept at the screen's centre on a screen this wide (width over height, not upright).
 * The frame's bottom is held just below the cup's shadow, so a wider screen loses the top first
 * (the shade's light, then her hat), never their hands or the cup; but never so low that her eyes
 * come within 12% of the top. Beyond about 2.45:1 nothing holds both. (With two constants and a
 * switch at 2:1, the cup's foot met the frame's edge from about 1.85:1, and the switch caught
 * ordinary maximised browsers: the cinematic director's review, 2026-10-21.)
 */
export function almostCover(aspect: number): [number, number] {
  const rows = W / (aspect * OVER);
  const floor = (H - FLOOR + rows / 2) / H;
  const eyes = 1 - (EYES + (0.5 - EYES_BELOW) * rows) / H;
  return [0.5, Math.max(eyes, Math.min(LOW, floor))];
}

export const ALMOST = {
  /** The film uv (and v) kept at the screen's centre when it covers the view. */
  // (Upright: between their faces, so her beanie and his elbow are both in on a tall phone. Wide
  // and ultra-wide are the rule's own at 16:9 and 2.39:1: `coverAt` is what the room uses.)
  cover: { wide: almostCover(16 / 9), upright: [0.5, 0.5] as [number, number], ultra: almostCover(2.39) },
  coverAt: almostCover,
};
