import type { Timing } from './handwriting';

/**
 * Stroke order for handwriting that was drawn with a font.
 *
 * A font gives filled shapes, not pen paths. To let a hand write them, every inked pixel is
 * given a time: within each letter, each connected piece of ink is followed outward from where
 * a pen would touch down (its top-left), so the pen seems to travel along the stroke. Small
 * marks above the letters (the dot of an i, the bar of a t) and punctuation are added after the
 * word, the way people go back to dot and cross. Pixels that aren't ink take the time of the
 * nearest ink, so filtering and mipmaps never blend a stroke with "never".
 *
 * Pure: alpha in, times out. Runs once per piece of writing, when it is first needed.
 */

export interface CharBox {
  /** Index of the character in the text. */
  i: number;
  /** Horizontal extent and the band of its line, in canvas pixels. */
  x0: number;
  x1: number;
  yTop: number;
  yBottom: number;
  /** Baseline and x-height (for telling a dot above the letters from the letters). */
  base: number;
  xHeight: number;
  /** Typewritten characters arrive whole, as if stamped. */
  stamp?: boolean;
  /** Which line of the text it is on (the bands of neighbouring lines overlap). */
  line?: number;
}

export interface Bake {
  /** Hand time (seconds) of every pixel, Float32 in canvas order; Infinity where no ink is near. */
  time: Float32Array;
  /** The hand's time for each word, including dots and bars added after it. */
  words: [number, number][];
  /** Seconds from the first stroke to the last. */
  duration: number;
}

const LIFT = 0.05;
const DOT = 0.07;

/**
 * Times for every pixel. `alpha` is the canvas's alpha channel (W×H), `boxes` the characters'
 * boxes, `timing` when each character is written (handwriting.ts).
 */
export function bakeStrokes(alpha: Uint8ClampedArray | Uint8Array, W: number, H: number, boxes: CharBox[], timing: Timing, wordOf: (i: number) => number): Bake {
  const N = W * H;
  const time = new Float32Array(N).fill(Infinity);
  const owner = new Int32Array(N).fill(-1);
  const ownerDx = new Float32Array(N);
  const ink = (p: number) => alpha[p] > 24;

  // Which character each inked pixel belongs to. First its line: the bands of neighbouring lines
  // overlap, so a pixel goes to the line whose letters could reach it (an ascender rises about
  // 0.8 of the size above the baseline, a descender falls about 0.3 below). Then, of the boxes of
  // that line containing it (they overlap at the edges, padded), the one whose middle is nearest.
  const ownerCost = new Float32Array(N);
  const lineCost = (bx: CharBox, y: number) => {
    const px = (bx.base - bx.yTop) / 1.05;
    const dy = y - bx.base;
    return dy < 0 ? -dy / (0.8 * px) : dy / (0.3 * px);
  };
  for (let b = 0; b < boxes.length; b++) {
    const bx = boxes[b];
    const mid = (bx.x0 + bx.x1) / 2;
    const x0 = Math.max(0, Math.floor(bx.x0)), x1 = Math.min(W, Math.ceil(bx.x1));
    const y0 = Math.max(0, Math.floor(bx.yTop)), y1 = Math.min(H, Math.ceil(bx.yBottom));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = y * W + x;
      if (!ink(p)) continue;
      const dx = Math.abs(x + 0.5 - mid);
      const cost = bx.line === undefined ? 0 : lineCost(bx, y + 0.5);
      const o = owner[p] < 0 ? undefined : boxes[owner[p]];
      const otherLine = !!o && bx.line !== undefined && o.line !== undefined && o.line !== bx.line;
      if (!o || (otherLine ? cost < ownerCost[p] : dx < ownerDx[p])) {
        owner[p] = b;
        ownerDx[p] = dx;
        ownerCost[p] = cost;
      }
    }
  }

  // Per character: connected pieces, each with a geodesic distance from its pen-down point.
  const queue = new Int32Array(N);
  const dist = new Float32Array(N).fill(-1);
  const comp = new Int32Array(N).fill(-1);
  interface Piece { box: number; pixels: number[]; length: number; minX: number; cy: number; deferred: boolean }
  const pieces: Piece[] = [];
  for (let b = 0; b < boxes.length; b++) {
    const bx = boxes[b];
    const x0 = Math.max(0, Math.floor(bx.x0)), x1 = Math.min(W, Math.ceil(bx.x1));
    const y0 = Math.max(0, Math.floor(bx.yTop)), y1 = Math.min(H, Math.ceil(bx.yBottom));
    const mine: Piece[] = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const seed = y * W + x;
      if (owner[seed] !== b || comp[seed] >= 0) continue;
      // Flood the piece.
      const id = pieces.length + mine.length;
      const px: number[] = [];
      let qh = 0, qt = 0;
      queue[qt++] = seed;
      comp[seed] = id;
      while (qh < qt) {
        const p = queue[qh++];
        px.push(p);
        const py = (p / W) | 0, pxx = p - py * W;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = pxx + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (owner[q] === b && comp[q] < 0) {
            comp[q] = id;
            queue[qt++] = q;
          }
        }
      }
      // Pen-down: top-left of the piece (a 'y' starts at its bowl, not its tail).
      let start = px[0], best = Infinity, minX = Infinity, sy = 0;
      for (const p of px) {
        const py = (p / W) | 0, pxx = p - py * W;
        const s = pxx + 0.5 * (py - bx.yTop);
        if (s < best) {
          best = s;
          start = p;
        }
        if (pxx < minX) minX = pxx;
        sy += py;
      }
      // Distance along the ink from there (8-neighbour steps; each pixel visited once).
      let len = 0;
      qh = 0;
      qt = 0;
      queue[qt++] = start;
      dist[start] = 0;
      while (qh < qt) {
        const p = queue[qh++];
        const py = (p / W) | 0, pxx = p - py * W;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = pxx + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (comp[q] !== id || dist[q] >= 0) continue;
          dist[q] = dist[p] + 1;
          if (dist[q] > len) len = dist[q];
          queue[qt++] = q;
        }
      }
      mine.push({ box: b, pixels: px, length: Math.max(1, len), minX, cy: sy / px.length, deferred: false });
    }
    if (mine.length) {
      const big = Math.max(...mine.map((m) => m.pixels.length));
      for (const m of mine) m.deferred = mine.length > 1 && m.pixels.length < big * 0.4 && m.cy < bx.base - bx.xHeight * 0.55;
      mine.sort((a, c) => a.minX - c.minX);
      pieces.push(...mine);
    }
  }

  // Times, word by word. Each character's span is shared among its pieces by length, with a
  // lift between; small marks above the letters come once the word is finished, and the words
  // after wait for them.
  const byBox = new Map<number, Piece[]>();
  for (const pc of pieces) (byBox.get(pc.box) ?? byBox.set(pc.box, []).get(pc.box)!).push(pc);
  const boxesOfWord = new Map<number, number[]>();
  for (let b = 0; b < boxes.length; b++) {
    const w = wordOf(boxes[b].i);
    (boxesOfWord.get(w) ?? boxesOfWord.set(w, []).get(w)!).push(b);
  }
  const words: [number, number][] = [];
  let shift = 0;
  for (let w = 0; w < timing.words.length; w++) {
    const marks: Piece[] = [];
    for (const b of boxesOfWord.get(w) ?? []) {
      const bx = boxes[b];
      const list = byBox.get(b) ?? [];
      const [cs0, ce0] = timing.chars[bx.i] ?? [0, 0];
      const cs = cs0 + shift, ce = ce0 + shift;
      const main = list.filter((p) => !p.deferred);
      marks.push(...list.filter((p) => p.deferred));
      const total = main.reduce((acc, p) => acc + p.length, 0) || 1;
      const usable = Math.max(0.02, ce - cs - LIFT * Math.max(0, main.length - 1));
      let t = cs;
      for (const pc of main) {
        const span = (usable * pc.length) / total;
        for (const p of pc.pixels) time[p] = bx.stamp ? cs : t + (span * Math.max(0, dist[p])) / pc.length;
        t += span + LIFT;
      }
    }
    const start = timing.words[w].start + shift;
    let end = timing.words[w].end + shift;
    if (marks.length) {
      marks.sort((a, c) => a.minX - c.minX);
      let t = end + LIFT;
      for (const pc of marks) {
        for (const p of pc.pixels) time[p] = t + (DOT * Math.max(0, dist[p])) / pc.length;
        t += DOT + LIFT;
      }
      shift += t - end;
      end = t;
    }
    words.push([start, end]);
  }

  // Ink nobody claimed (outside every box): the time of the nearest claimed ink; then every
  // other pixel too, so filtering never mixes a stroke with "never written".
  nearestFill(time, W, H, queue);
  const duration = words.length ? words[words.length - 1][1] : 0;
  return { time, words, duration };
}

/** Multi-source flood: every unset pixel takes the time of the nearest set one. */
export function nearestFill(time: Float32Array, W: number, H: number, queue: Int32Array) {
  let qh = 0, qt = 0;
  const N = W * H;
  for (let p = 0; p < N; p++) if (time[p] !== Infinity) queue[qt++] = p;
  if (!qt) return time.fill(0), undefined;
  while (qh < qt) {
    const p = queue[qh++];
    const py = (p / W) | 0, px = p - py * W;
    const tv = time[p];
    if (px > 0 && time[p - 1] === Infinity) {
      time[p - 1] = tv;
      queue[qt++] = p - 1;
    }
    if (px < W - 1 && time[p + 1] === Infinity) {
      time[p + 1] = tv;
      queue[qt++] = p + 1;
    }
    if (py > 0 && time[p - W] === Infinity) {
      time[p - W] = tv;
      queue[qt++] = p - W;
    }
    if (py < H - 1 && time[p + W] === Infinity) {
      time[p + W] = tv;
      queue[qt++] = p + W;
    }
  }
}
