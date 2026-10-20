/**
 * "Almost" (docs/almost.md): how its film sits on a screen. The film is an open-matte frame
 * (1280×1440 photographed): covering a wide screen shows the 16:9 band across its middle; covering
 * an upright one, the 9:16 crop round the two figures (scripts/almost/assemble.py's crops, the
 * same photographs).
 */
export const ALMOST = {
  /** The film uv (and v) kept at the screen's centre when it covers the view. */
  // (Upright: between their faces, so her beanie and his elbow are both in on a tall phone. Wider
  // than 2:1: low, losing the lamp's shade rather than their fingers: the cinematic review.)
  cover: { wide: [0.5, 0.5] as [number, number], upright: [0.5, 0.5] as [number, number], ultra: [0.5, 0.46] as [number, number] },
};
