import type { DrawingDef, DrawingStyle, Shape } from '../content/drawings';
import { Rng, hashString } from '../core/rng';
import { nearestFill } from './strokes';

/**
 * Small drawings, made the way a hand makes them: strokes in order, each a wobbling line
 * pressed harder and lighter along its length, then the wall's tooth, a smudge, and (for
 * old ones) an eraser. Baked without a canvas, by stamping soft discs along each stroke's
 * centre line, so ink and timing come from the same marks (no premultiplied edges, and the
 * same result in every browser and in tests).
 *
 * The texture is the writing's: alpha is the ink, red is when the hand reaches it (as a
 * fraction of the whole), so a drawing is drawn and rubbed out by the same material.
 */

/** A point in metres within the drawing's box, y downwards. */
type P = [number, number];

interface StyleSpec {
  /** Line width (m), how much it wanders (m), pixels per metre. */
  width: number;
  wobble: number;
  pxPerM: number;
  /** Hand speed (m/s) and pauses between strokes (s). */
  speed: number;
  pause: [number, number];
  /** Wall tooth (0–1), and a soft smudge beside the line (alpha). */
  tooth: number;
  smudge: number;
  /** Extra softness (px) at the line's edge. */
  soft: number;
}

const STYLE: Record<DrawingStyle, StyleSpec> = {
  doodle: { width: 0.0022, wobble: 0.0035, pxPerM: 700, speed: 0.09, pause: [0.18, 0.4], tooth: 0.45, smudge: 0.07, soft: 0.7 },
  child: { width: 0.0042, wobble: 0.005, pxPerM: 700, speed: 0.07, pause: [0.25, 0.5], tooth: 0.35, smudge: 0.05, soft: 0.8 },
  firm: { width: 0.0026, wobble: 0.0025, pxPerM: 700, speed: 0.12, pause: [0.15, 0.3], tooth: 0.3, smudge: 0.04, soft: 0.6 },
  // Old and rubbed: soft, so it sits in the plaster like the room's other erased marks.
  ghost: { width: 0.005, wobble: 0.003, pxPerM: 300, speed: 0.1, pause: [0.2, 0.4], tooth: 0.5, smudge: 0.1, soft: 2.2 },
};

// ───────────────────────────── shapes ─────────────────────────────

const line = (a: P, b: P, n = 8): P[] => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 24): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });

/** Keep only what lies outside a region, cutting strokes cleanly where they cross its edge. */
function clipOut(strokes: P[][], inside: (p: P) => boolean): P[][] {
  const edge = (a: P, b: P): P => {
    // Where the segment from a (outside) to b (inside) crosses the edge.
    let lo = 0, hi = 1;
    for (let k = 0; k < 14; k++) {
      const m = (lo + hi) / 2;
      if (inside([a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m])) hi = m;
      else lo = m;
    }
    return [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo];
  };
  const out: P[][] = [];
  for (const s of strokes) {
    let cur: P[] = [];
    for (let i = 0; i < s.length; i++) {
      if (!inside(s[i])) {
        if (!cur.length && i > 0) cur.push(edge(s[i], s[i - 1]));
        cur.push(s[i]);
      } else if (cur.length) {
        cur.push(edge(s[i - 1], s[i]));
        if (cur.length > 1) out.push(cur);
        cur = [];
      }
    }
    if (cur.length > 1) out.push(cur);
  }
  return out;
}

/** The strokes of a drawing, in the order drawn (metres, y down). */
export function shapeStrokes(shape: Shape, w: number, h: number, r: Rng): P[][] {
  const j = (s: number) => r.range(-s, s);
  switch (shape) {
    case 'sun': {
      const cx = w * 0.46, cy = h * 0.48, rad = Math.min(w, h) * 0.24;
      // Round once and a little past where it started, as a child does.
      const out: P[][] = [arc(cx, cy, rad, rad * r.range(0.9, 1.05), -2.2, -2.2 + Math.PI * 2.15, 28)];
      const n = r.int(7, 9);
      for (let k = 0; k < n; k++) {
        const a = -1.6 + (k / n) * Math.PI * 2 + j(0.15);
        const r0 = rad * 1.25, r1 = rad * r.range(1.6, 2.0);
        out.push(line([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1], 4));
      }
      return out;
    }
    case 'noughts': {
      const g = (t: number) => t * w;
      const out: P[][] = [
        line([g(0.36), h * 0.05], [g(0.33 + j(0.02)), h * 0.95]),
        line([g(0.66), h * 0.04], [g(0.68 + j(0.02)), h * 0.96]),
        line([w * 0.04, h * 0.35], [w * 0.96, h * (0.33 + j(0.02))]),
        line([w * 0.03, h * 0.66], [w * 0.95, h * (0.68 + j(0.02))]),
      ];
      const cell = (c: number, rw: number): P => [w * (0.17 + c * 0.33), h * (0.18 + rw * 0.32)];
      const X = ([x, y]: P) => {
        const s = w * 0.09;
        out.push(line([x - s, y - s], [x + s, y + s], 4), line([x + s, y - s + j(0.003)], [x - s, y + s], 4));
      };
      const O = ([x, y]: P) => out.push(arc(x, y, w * 0.095, h * 0.09, -1.8, -1.8 + Math.PI * 2.1, 16));
      // X, O, X, O, X: nobody has won, and the next move was never made.
      X(cell(1, 1));
      O(cell(0, 0));
      X(cell(2, 0));
      O(cell(0, 2));
      X(cell(0, 1));
      return out;
    }
    case 'pen-test': {
      // Someone getting a biro to work: a tight spiral, then a scribble back and forth.
      const spiral: P[] = [];
      for (let k = 0; k <= 70; k++) {
        const a = (k / 70) * Math.PI * 8, rr = h * 0.06 + (h * 0.36 * k) / 70;
        spiral.push([w * 0.22 + Math.cos(a) * rr, h * 0.5 + Math.sin(a) * rr * 0.9]);
      }
      const zig: P[] = [];
      for (let k = 0; k <= 11; k++) zig.push([w * (0.46 + k * 0.045) + j(0.002), h * (k % 2 ? 0.2 : 0.78) + j(0.004)]);
      return [spiral, zig];
    }
    case 'sheet-doodle': {
      // Doodles that ran on across a sheet of paper, cut dead along two of its edges where the
      // paper was: the sheet's corner sits at the box's top right, from (0.6 w, 0) to (w, 0.55 h).
      const inside = (p: P) => p[0] >= w * 0.6 && p[1] <= h * 0.55;
      const loops: P[] = [];
      for (let i = 0; i <= 70; i++) {
        const t = i / 70;
        loops.push([w * (0.02 + t * 0.95) + Math.cos(t * 30) * w * 0.045, h * 0.26 + Math.sin(t * 30) * h * 0.12]);
      }
      const coil: P[] = [];
      for (let i = 0; i <= 50; i++) {
        const t = i / 50;
        coil.push([w * 0.78 + Math.sin(t * 22) * w * 0.05, h * (0.98 - t * 0.9) + Math.cos(t * 22) * h * 0.03]);
      }
      const zig: P[] = [];
      for (let i = 0; i <= 9; i++) zig.push([w * (0.04 + i * 0.055), h * (i % 2 ? 0.66 : 0.82) + j(0.003)]);
      return clipOut([loops, coil, zig], inside);
    }
    case 'chair': {
      // Drawn round once, side on, at its own size: only its outer edge, and gaps where the
      // pencil couldn't get between the legs. It stops short of the skirting.
      return [
        [[w * 0.2, h * 0.97], [w * 0.14, h * 0.5], [w * 0.1, h * 0.03], [w * 0.2, h * 0.0], [w * 0.24, h * 0.06], [w * 0.28, h * 0.48]],
        [[w * 0.28, h * 0.48], [w * 0.95, h * 0.5], [w * 0.96, h * 0.57], [w * 0.9, h * 0.57], [w * 0.89, h * 0.97]],
        line([w * 0.84, h * 0.6], [w * 0.84, h * 0.72], 4),
        line([w * 0.33, h * 0.57], [w * 0.55, h * 0.57], 6),
        line([w * 0.27, h * 0.6], [w * 0.27, h * 0.75], 4),
      ];
    }
    case 'door': {
      // A frame, and the door a little open; the frame gone over twice.
      const f: P[] = [[w * 0.06, h * 0.98], [w * 0.06, h * 0.03], [w * 0.94, h * 0.03], [w * 0.94, h * 0.98]];
      const again = f.map(([x, y]) => [x + j(0.004), y + j(0.004)] as P);
      const leaf: P[] = [[w * 0.06, h * 0.03], [w * 0.68, h * 0.09], [w * 0.68, h * 0.93], [w * 0.06, h * 0.98]];
      return [f, leaf, again, arc(w * 0.6, h * 0.53, w * 0.025, w * 0.025, 0, Math.PI * 2, 8)];
    }
    case 'eye': {
      const cx = w * 0.5, cy = h * 0.55;
      return [
        arc(cx, cy + h * 0.45, w * 0.48, h * 0.78, Math.PI * 1.15, Math.PI * 1.85, 16),
        arc(cx, cy - h * 0.45, w * 0.46, h * 0.7, Math.PI * 0.17, Math.PI * 0.83, 16),
        ...[-0.3, -0.1, 0.1, 0.3].map((k) => line([cx + w * k, cy - h * 0.38], [cx + w * k * 1.3, cy - h * 0.62], 2)),
      ];
    }
    case 'two-cups': {
      // Two cups side by side; the second never finished: no handle, no bottom, one side short.
      const cup = (x: number, done: boolean): P[][] => {
        const cw = w * 0.34, top = h * 0.2, bot = h * 0.92;
        const s: P[][] = [
          arc(x + cw / 2, top, cw / 2, h * 0.07, Math.PI, Math.PI * 3, 18),
          line([x, top], [x + cw * 0.08, bot], 6),
        ];
        // The second: a rim, one side, and the other side stopping two-thirds of the way down.
        if (!done) return [...s, line([x + cw, top], [x + cw * 0.95, top + (bot - top) * 0.62], 5)];
        s.push(arc(x + cw / 2, bot - h * 0.02, cw * 0.43, h * 0.05, Math.PI * 0.05, Math.PI * 0.95, 10));
        s.push(line([x + cw, top], [x + cw * 0.92, bot], 6));
        s.push(arc(x + cw * 1.02, h * 0.5, w * 0.08, h * 0.17, -Math.PI * 0.45, Math.PI * 0.45, 10));
        return s;
      };
      return [...cup(w * 0.04, true), ...cup(w * 0.56, false)];
    }
  }
}

// ───────────────────────────── baking ─────────────────────────────

/** A drawing's texture data and timing: the writing's format (rows bottom-up, R time, A ink). */
export interface DrawingBake {
  data: Uint8Array;
  W: number;
  H: number;
  /** Each stroke's [start, end] in the hand's seconds (the writing's "words"). */
  words: [number, number][];
  duration: number;
}

/** Smooth noise in 0–1 from a few sines with random phases (cheap, deterministic). */
function wander(r: Rng) {
  const f = [r.range(0.7, 1.3), r.range(1.9, 2.7), r.range(4, 5.5)], ph = [r.range(0, 6.3), r.range(0, 6.3), r.range(0, 6.3)];
  return (t: number) => (Math.sin(t * f[0] + ph[0]) * 0.55 + Math.sin(t * f[1] + ph[1]) * 0.3 + Math.sin(t * f[2] + ph[2]) * 0.15) * 0.5 + 0.5;
}

const hash2 = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Value noise at a cell size of `cell` px, for where an eraser has been. */
function valueNoise(x: number, y: number, cell: number, s: number) {
  const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = smooth(0, 1, gx - x0), fy = smooth(0, 1, gy - y0);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function bakeDrawing(def: DrawingDef): DrawingBake {
  const st = STYLE[def.style];
  const seed = hashString(def.id);
  const r = new Rng(seed);
  const [wM, hM] = def.size;
  const k = st.pxPerM;
  // Room for the line's width, its wandering, a centimetre of overshoot and the smudge.
  const pad = Math.ceil((st.width + st.wobble * 2.4 + 0.011) * k + st.soft + 6);
  const W = Math.ceil(wM * k) + pad * 2, H = Math.ceil(hM * k) + pad * 2;
  const alpha = new Float32Array(W * H);
  const time = new Float32Array(W * H).fill(Infinity);
  const strokes = shapeStrokes(def.shape, wM, hM, r);
  const words: [number, number][] = [];
  let t = 0;

  const stamp = (cx: number, cy: number, hw: number, a: number, tt: number, soft: number) => {
    const R = hw + soft + 1;
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.ceil(cy + R)); y++) {
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cov = smooth(hw + soft, hw - soft, d) * a;
        if (cov <= 0.01) continue;
        const p = y * W + x;
        if (cov > alpha[p]) alpha[p] = cov;
        if (tt < time[p]) time[p] = tt;
      }
    }
  };

  for (const s0 of strokes) {
    if (s0.length < 2) continue;
    // No line goes where it was meant to: a slight bow, and ends that stop short or run on.
    const s = s0.slice() as P[];
    // Never more than a centimetre past, so nothing runs off the bake's margin.
    const run = (a: P, b: P, f: number): P => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const e = Math.max(-0.4 * l, Math.min(0.01, f * l)) / l;
      return [b[0] + (b[0] - a[0]) * e, b[1] + (b[1] - a[1]) * e];
    };
    if (Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > 1e-4) s[0] = run(s[1], s[0], r.range(-0.15, 0.25));
    const m = s.length - 1;
    if (Math.hypot(s[m][0] - s[m - 1][0], s[m][1] - s[m - 1][1]) > 1e-4) s[m] = run(s[m - 1], s[m], r.range(-0.15, 0.35));
    const bow = r.range(-1, 1) * st.wobble * 1.4;
    const wx = wander(r), wy = wander(r), press = wander(r);
    const heavy = def.style === 'child' ? 1.15 : 1;
    // Resample at half-pixel steps along the stroke, wandering a little.
    let len = 0;
    const seg: number[] = [0];
    for (let i = 1; i < s.length; i++) seg.push((len += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1])));
    const n = Math.max(2, Math.ceil(len * k * 2));
    const dur = len / (st.speed * r.range(0.8, 1.2));
    const start = t;
    let i = 1;
    for (let q = 0; q <= n; q++) {
      const at = (q / n) * len;
      while (i < s.length - 1 && seg[i] < at) i++;
      const f = seg[i] > seg[i - 1] ? (at - seg[i - 1]) / (seg[i] - seg[i - 1]) : 0;
      const u = q / n;
      const bend = Math.sin(Math.PI * u) * bow;
      const x = s[i - 1][0] + (s[i][0] - s[i - 1][0]) * f + (wx(at * 60) - 0.5) * 2 * st.wobble + bend;
      const y = s[i - 1][1] + (s[i][1] - s[i - 1][1]) * f + (wy(at * 60) - 0.5) * 2 * st.wobble + bend * 0.6;
      // Pressure: lighter where the line starts and lifts, uneven along the way.
      const p = Math.min(1, (0.55 + 0.45 * press(at * 40)) * smooth(0, 0.08, u) * (0.6 + 0.4 * smooth(1, 0.85, u)) * heavy);
      const px = pad + x * k, py = pad + y * k;
      const hw = (st.width * k * (0.75 + 0.35 * p)) / 2;
      stamp(px, py, hw, 0.35 + 0.6 * p, start + u * dur, st.soft);
      // A smudge beside the line, where a hand or a sleeve went over it.
      if (st.smudge > 0) stamp(px + 1.5, py + 1, hw + 3, st.smudge, start + u * dur, 2);
    }
    t = start + dur;
    words.push([start, t]);
    t += r.range(st.pause[0], st.pause[1]);
  }
  const duration = Math.max(1e-3, words.length ? words[words.length - 1][1] : 0);

  // The wall's tooth, and an eraser's patches.
  const toothSeed = seed % 9973, rubSeed = (seed >> 3) % 7919;
  const rub = def.rubbed ?? 0;
  // One sideways swipe of an eraser, from a to b (fractions of the box), as wide as `width`.
  const sw = def.swipe ? { ax: pad + def.swipe.from[0] * wM * k, ay: pad + def.swipe.from[1] * hM * k, bx: pad + def.swipe.to[0] * wM * k, by: pad + def.swipe.to[1] * hM * k, half: (def.swipe.width * Math.min(wM, hM) * k) / 2 } : null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (alpha[p] <= 0) continue;
      const v = hash2(x, y, toothSeed);
      let a = alpha[p] * (1 - st.tooth * (v > 0.55 ? (v - 0.55) * 2.2 : 0));
      if (rub > 0) {
        // Rubbed in patches, in the direction an eraser goes: mostly gone where the noise is low.
        const n = valueNoise(x, y * 1.8, 9 * (k / 700) + 4, rubSeed) * 0.7 + valueNoise(x, y, 3, rubSeed + 1) * 0.3;
        a *= 0.15 + 0.85 * smooth(rub - 0.12, rub + 0.12, n);
      }
      if (sw) {
        const vx = sw.bx - sw.ax, vy = sw.by - sw.ay;
        const t = Math.max(0, Math.min(1, ((x - sw.ax) * vx + (y - sw.ay) * vy) / (vx * vx + vy * vy)));
        const d = Math.hypot(x - (sw.ax + vx * t), y - (sw.ay + vy * t));
        // Ragged at its edges, and lighter where the eraser lifted at the end.
        const edgeN = (valueNoise(x, y, 5, rubSeed + 2) - 0.5) * sw.half * 0.6;
        const gone = smooth(sw.half + edgeN, sw.half * 0.55 + edgeN, d) * (0.6 + 0.4 * smooth(1, 0.7, t));
        a *= 1 - 0.85 * gone;
      }
      alpha[p] = a;
    }
  }

  // Everything unwritten takes the time of the nearest mark, so filtering never mixes a stroke with "never".
  nearestFill(time, W, H, new Int32Array(W * H));
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const src = y * W, dst = (H - 1 - y) * W;
    for (let x = 0; x < W; x++) {
      const o = (dst + x) * 4;
      data[o] = Math.round(Math.min(1, Math.max(0, time[src + x] / duration)) * 255);
      data[o + 3] = Math.round(Math.min(1, alpha[src + x]) * 255);
    }
  }
  return { data, W, H, words, duration };
}

/** The drawing's size on the wall including the margin the bake adds round it (m). */
export function bakedSize(def: DrawingDef, bake: DrawingBake): [number, number] {
  const k = STYLE[def.style].pxPerM;
  return [bake.W / k, bake.H / k];
}
