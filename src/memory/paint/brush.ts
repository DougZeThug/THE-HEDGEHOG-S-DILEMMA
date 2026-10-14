/**
 * The memories' stand-in painting, in the room's own hand (docs/memories.md): a graphite
 * underdrawing that stays visible, wax-crayon fill that skips on the tooth and stops short of
 * its lines, a thin watery wash with a tide-mark edge, and light (never painted, only added).
 *
 * Run offline by scripts/bake-memories.mjs in a browser canvas; never shipped. Every layer is
 * replaceable by a PNG or WebP of the same size (docs/memories.md, "Replacing a layer").
 *
 * Coordinates are metres in the memory's window, from its centre, y up.
 */
export type Pt = [number, number];

export class Rand {
  constructor(private s: number) {}
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

export interface Sheet {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  /** Pixels per metre. */
  ppm: number;
  w: number;
  h: number;
  r: Rand;
}

export function sheet(wM: number, hM: number, ppm: number, seed: number): Sheet {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(wM * ppm);
  canvas.height = Math.round(hM * ppm);
  const ctx = canvas.getContext('2d')!;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return { ctx, canvas, ppm, w: wM, h: hM, r: new Rand(seed) };
}

/** Window metres → canvas pixels. */
export function px(s: Sheet, [x, y]: Pt): Pt {
  return [(x + s.w / 2) * s.ppm, (s.h / 2 - y) * s.ppm];
}

function path(s: Sheet, pts: Pt[], jitter = 0, close = true): void {
  const c = s.ctx;
  c.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = px(s, [p[0] + s.r.range(-jitter, jitter), p[1] + s.r.range(-jitter, jitter)]);
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  });
  if (close) c.closePath();
}

/** Points round an ellipse (a bowl's rim, seen from above a table). */
export function ellipse(cx: number, cy: number, rx: number, ry: number, from = 0, to = Math.PI * 2, n = 40): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

/**
 * Graphite: a line drawn twice, not quite on itself, with the pressure lifting here and there.
 * `weight` is the lead's width in millimetres.
 */
export function graphite(s: Sheet, pts: Pt[], o: { weight?: number; alpha?: number; close?: boolean; passes?: number } = {}): void {
  const c = s.ctx;
  // A memory is seen from two or three metres: its lead is drawn about twice as broad as a
  // pencil's, so the underdrawing still reads at that distance (the room's writing is the same).
  const w = ((o.weight ?? 0.9) * 2.2 / 1000) * s.ppm;
  const passes = o.passes ?? 2;
  for (let p = 0; p < passes; p++) {
    const pts2 = o.close ? [...pts, pts[0]] : pts;
    // Broken into short runs so the pressure varies along the line.
    for (let i = 0; i < pts2.length - 1; i++) {
      if (s.r.next() < 0.06) continue; // the lead lifts
      c.strokeStyle = `rgba(52, 52, 58, ${Math.min(1, (o.alpha ?? 0.75) * 1.15) * s.r.range(0.6, 1)})`;
      c.lineWidth = w * s.r.range(0.7, 1.25);
      const j = 0.0012 * (p + 1);
      const [x1, y1] = px(s, [pts2[i][0] + s.r.range(-j, j), pts2[i][1] + s.r.range(-j, j)]);
      const [x2, y2] = px(s, [pts2[i + 1][0] + s.r.range(-j, j), pts2[i + 1][1] + s.r.range(-j, j)]);
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
    }
  }
}

/**
 * Wax crayon: hatched strokes at one angle, inside a shape drawn a little smaller than its
 * outline (a child's colouring stops short of the line), skipping on the plaster's tooth.
 */
export function crayon(s: Sheet, pts: Pt[], colour: [number, number, number], o: { angle?: number; density?: number; alpha?: number; inset?: number } = {}): void {
  const c = s.ctx;
  const inset = o.inset ?? 0.004;
  // Shrink toward the centroid.
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const shrunk = pts.map(([x, y]): Pt => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
    return [x - (dx / d) * inset, y - (dy / d) * inset];
  });
  c.save();
  path(s, shrunk, 0.0015);
  c.clip();
  const xs = shrunk.map((p) => p[0]), ys = shrunk.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const ang = o.angle ?? 0.9;
  const area = (maxX - minX) * (maxY - minY);
  // Short strokes (3–9 cm), each at a slightly different angle, scattered and overlapping, the
  // way a crayon is worked back and forth: never ruled lines.
  const n = Math.round((area / 0.00012) * (o.density ?? 1));
  const [r, g, b] = colour;
  for (let i = 0; i < n; i++) {
    const mx = s.r.range(minX - 0.02, maxX + 0.02), my = s.r.range(minY - 0.02, maxY + 0.02);
    const a = ang + s.r.range(-0.18, 0.18);
    const len = s.r.range(0.03, 0.09) / 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    c.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(o.alpha ?? 0.55) * s.r.range(0.3, 0.8)})`;
    c.lineWidth = s.ppm * s.r.range(0.0025, 0.006);
    const [x1, y1] = px(s, [mx - ca * len, my - sa * len]);
    const [x2, y2] = px(s, [mx + ca * len, my + sa * len]);
    c.beginPath();
    c.moveTo(x1, y1);
    c.quadraticCurveTo((x1 + x2) / 2 + s.r.range(-2, 2), (y1 + y2) / 2 + s.r.range(-2, 2), x2, y2);
    c.stroke();
  }
  c.restore();
}

/** A thin, watery wash with a slightly darker tide-mark where it dried. */
export function wash(s: Sheet, pts: Pt[], colour: [number, number, number], alpha = 0.18): void {
  const c = s.ctx;
  const [r, g, b] = colour;
  path(s, pts, 0.004);
  c.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  c.fill();
  c.strokeStyle = `rgba(${r * 0.85}, ${g * 0.85}, ${b * 0.85}, ${alpha * 0.9})`;
  c.lineWidth = s.ppm * 0.002;
  c.stroke();
}

/** The plaster's tooth: wax doesn't reach into the hollows. Knocks speckled holes out of what is drawn. */
export function tooth(s: Sheet, amount = 0.12): void {
  const c = s.ctx;
  const { width: W, height: H } = s.canvas;
  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  // A coarse value noise at about 1.5 mm, so the skipping has the size of plaster grain.
  const cell = Math.max(2, Math.round(s.ppm * 0.0025));
  const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = s.r.next();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const gx = x / cell, gy = y / cell, x0 = gx | 0, y0 = gy | 0, tx = gx - x0, ty = gy - y0;
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1], cc = grid[(y0 + 1) * gw + x0], dd = grid[(y0 + 1) * gw + x0 + 1];
      const n = a + (b - a) * tx + (cc - a) * ty + (a - b - cc + dd) * tx * ty;
      if (n < amount) {
        const i = (y * W + x) * 4 + 3;
        d[i] = Math.round(d[i] * (n / amount) * 0.4);
      }
    }
  c.putImageData(img, 0, 0);
}

/** Light: a soft, slanted pane of it with the window's bars in shadow. Added to the wall, never painted. */
export function sunPane(s: Sheet, o: { x: number; y: number; w: number; h: number; shear: number; transom: number; mullion: number; colour: [number, number, number]; blur?: number }): void {
  const c = s.ctx;
  const [r, g, b] = o.colour;
  c.save();
  c.filter = `blur(${Math.round((o.blur ?? 0.012) * s.ppm)}px)`;
  const pane = (x0: number, x1: number, y0: number, y1: number) => {
    const P = (x: number, y: number): Pt => [o.x + x + (y - 0) * o.shear, o.y + y];
    path(s, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)]);
    c.fill();
  };
  c.fillStyle = `rgb(${r}, ${g}, ${b})`;
  const bar = 0.022;
  const hw = o.w / 2, hh = o.h / 2;
  // Four panes round an off-centre upright and a high transom.
  pane(-hw, o.mullion - bar, -hh, o.transom - bar);
  pane(o.mullion + bar, hw, -hh, o.transom - bar);
  pane(-hw, o.mullion - bar, o.transom + bar, hh);
  pane(o.mullion + bar, hw, o.transom + bar, hh);
  c.restore();
}
