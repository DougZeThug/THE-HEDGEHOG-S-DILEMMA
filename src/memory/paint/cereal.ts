import { crayon, ellipse, graphite, sheet, sunPane, tooth, wash, type Pt, type Sheet } from './brush';

/**
 * "We ate cereal for dinner and it was perfect."
 *
 * A small kitchen table in late sun: two bowls that don't match, one spoon, and the cereal box
 * left standing on the table (the one thing nobody puts away). The sun comes through a window
 * just out of frame, its curtain hanging at the edge; on the back wall lies its slanted pane with
 * the sash in shadow, the kitchen-light memory's own window (the transom high, the upright off
 * centre). Nobody is drawn.
 *
 * Three colours: ochre (the table, the box's side, the sun), a muted blue (one bowl, the glass,
 * the curtain), a brick red (the box's front, the other bowl's rim). The line is written across
 * the upper band, over the pale back wall, where the plaster is left nearly bare.
 *
 * Window 0.9 × 0.6 m; metres from its centre, y up. Code-painted stand-in, replaceable.
 */
export const SIZE: [number, number] = [0.9, 0.6];
export const LAYERS = ['wall', 'curtain', 'table', 'things', 'pencil', 'sun'] as const;
export const KINDS: Record<(typeof LAYERS)[number], 'pigment' | 'light' | 'sketch'> = {
  wall: 'pigment',
  curtain: 'pigment',
  table: 'pigment',
  things: 'pigment',
  pencil: 'sketch',
  sun: 'light',
};

const OCHRE: [number, number, number] = [196, 146, 78];
const BLUE: [number, number, number] = [104, 132, 162];
const RED: [number, number, number] = [178, 86, 66];

// The table: its far edge and near edge, cut by the frame.
const TABLE: Pt[] = [
  [-0.45, -0.07],
  [0.45, -0.05],
  [0.45, -0.3],
  [-0.45, -0.3],
];
const BOX: Pt[] = [
  [-0.36, -0.105],
  [-0.24, -0.105],
  [-0.24, 0.135],
  [-0.36, 0.135],
];
const BOX_SIDE: Pt[] = [
  [-0.24, -0.105],
  [-0.212, -0.088],
  [-0.212, 0.148],
  [-0.24, 0.135],
];
const BOX_TOP: Pt[] = [
  [-0.36, 0.135],
  [-0.24, 0.135],
  [-0.212, 0.148],
  [-0.332, 0.148],
];
// Two bowls that don't match, one overlapping the other: a wide blue one, a smaller cream one
// with a red rim.
const BOWL_A = { cx: -0.06, cy: -0.135, rx: 0.115, ry: 0.032, depth: 0.06 };
const BOWL_B = { cx: 0.1, cy: -0.17, rx: 0.085, ry: 0.024, depth: 0.05 };
// The curtain of a window just out of frame on the right, where the sun comes from.
const CURTAIN: Pt[] = [
  [0.37, 0.3],
  [0.45, 0.3],
  [0.45, -0.045],
  [0.4, -0.05],
  [0.392, 0.05],
  [0.383, 0.17],
];

/** The outside of a bowl: the front half of its rim, down round its belly to the foot. */
function bowlOutside(b: typeof BOWL_A): Pt[] {
  const front = ellipse(b.cx, b.cy, b.rx, b.ry, Math.PI, 2 * Math.PI, 24);
  const belly: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    belly.push([b.cx + b.rx * Math.cos(a) * (1 - 0.12 * Math.sin(a)), b.cy - (b.ry + b.depth) * Math.sin(a)]);
  }
  // Round the front of the rim left to right, then back along the belly right to left.
  return [...front, ...belly];
}
const bowlInside = (b: typeof BOWL_A) => ellipse(b.cx, b.cy, b.rx, b.ry, 0, Math.PI * 2, 36);

/** One flake of cereal: a small irregular dab of wax. */
function dab(s: Sheet, x: number, y: number, [r, g, b]: [number, number, number]): void {
  const c = s.ctx;
  c.fillStyle = `rgba(${r}, ${g}, ${b}, ${s.r.range(0.6, 0.9)})`;
  c.beginPath();
  c.ellipse((x + SIZE[0] / 2) * s.ppm, (SIZE[1] / 2 - y) * s.ppm, s.ppm * s.r.range(0.005, 0.009), s.ppm * s.r.range(0.003, 0.005), s.r.range(0, Math.PI), 0, Math.PI * 2);
  c.fill();
}

export function paint(variant: string, ppm: number, seed = 7): Record<string, HTMLCanvasElement> {
  const [W, H] = SIZE;
  const mk = (k: number) => sheet(W, H, ppm, seed * 31 + k);
  const out: Record<string, HTMLCanvasElement> = {};
  const later = variant === 'later';

  // The back wall: one thin warm wash, nothing else (the words are written across it).
  const wall = mk(1);
  wash(wall, [[-0.45, -0.065], [0.45, -0.045], [0.45, 0.3], [-0.45, 0.3]], [222, 202, 170], 0.14);
  out.wall = wall.canvas;

  // The curtain, hanging still at the edge of the window we don't see.
  const cur = mk(2);
  crayon(cur, CURTAIN, BLUE, { alpha: 0.5, angle: 1.5, density: 1.2 });
  tooth(cur);
  out.curtain = cur.canvas;

  // The table, ochre wax worked along the grain, heavier at its near edge.
  const tab = mk(3);
  crayon(tab, TABLE, OCHRE, { alpha: 0.4, angle: 0.06, density: 0.9 });
  crayon(tab, [[-0.45, -0.265], [0.45, -0.265], [0.45, -0.3], [-0.45, -0.3]], OCHRE, { alpha: 0.55, angle: 0.03, density: 1.3 });
  tooth(tab);
  out.table = tab.canvas;

  // The things: the box (red front, ochre side), the two bowls, cereal in one.
  const th = mk(4);
  if (later) {
    // Later the same evening: the box on its side, both bowls filled again.
    crayon(th, [[-0.4, -0.115], [-0.16, -0.115], [-0.16, -0.045], [-0.4, -0.045]], RED, { alpha: 0.6, angle: 1.3 });
  } else {
    crayon(th, BOX, RED, { alpha: 0.6, angle: 1.3, density: 1.4 });
    crayon(th, BOX_SIDE, OCHRE, { alpha: 0.55, angle: 1.45, density: 1.4 });
    crayon(th, BOX_TOP, OCHRE, { alpha: 0.35, angle: 0.1 });
  }
  crayon(th, bowlOutside(BOWL_A), BLUE, { alpha: 0.6, angle: 0.25, density: 1.6, inset: 0.002 });
  crayon(th, bowlOutside(BOWL_B), [226, 214, 196], { alpha: 0.6, angle: 0.25, density: 1.6, inset: 0.002 });
  crayon(th, ellipse(BOWL_B.cx, BOWL_B.cy, BOWL_B.rx, BOWL_B.ry, Math.PI, 2 * Math.PI, 20).concat(ellipse(BOWL_B.cx, BOWL_B.cy - 0.008, BOWL_B.rx * 0.99, BOWL_B.ry, 0, -Math.PI, 20)), RED, { alpha: 0.7, inset: 0, density: 2 });
  // Milk and cereal inside the bowls (the cream bowl only later: seconds).
  const full = later ? [BOWL_A, BOWL_B] : [BOWL_A];
  for (const b of full) {
    crayon(th, bowlInside(b), [236, 230, 216], { alpha: 0.35, angle: 0.1, inset: 0.006, density: 1.5 });
    for (let i = 0; i < 26; i++) {
      const a = th.r.range(0, Math.PI * 2), d = Math.sqrt(th.r.next());
      const x = b.cx + Math.cos(a) * b.rx * 0.78 * d, y = b.cy + Math.sin(a) * b.ry * 0.62 * d;
      dab(th, x, y, OCHRE);
    }
  }
  tooth(th);
  out.things = th.canvas;

  // The underdrawing: everything, in graphite, a little looser than the colour.
  const pen = mk(5);
  graphite(pen, [[-0.45, -0.07], [0.45, -0.05]], { weight: 0.8 });
  graphite(pen, [[-0.45, -0.265], [0.45, -0.265]], { weight: 0.9 });
  graphite(pen, [[0.37, 0.3], [0.383, 0.17], [0.392, 0.05], [0.4, -0.05]], { weight: 0.7 });
  graphite(pen, [[0.41, 0.28], [0.415, 0.1], [0.42, -0.04]], { weight: 0.5, alpha: 0.5 });
  if (later) graphite(pen, [[-0.4, -0.115], [-0.16, -0.115], [-0.16, -0.045], [-0.4, -0.045]], { close: true });
  else {
    graphite(pen, BOX, { close: true });
    graphite(pen, [[-0.24, -0.105], [-0.212, -0.088], [-0.212, 0.148], [-0.332, 0.148], [-0.36, 0.135]]);
  }
  for (const b of [BOWL_A, BOWL_B]) {
    graphite(pen, bowlInside(b), { weight: 0.8 });
    graphite(pen, bowlOutside(b).slice(25), { weight: 0.9 });
  }
  // The spoon, resting in the wide bowl, its handle over the rim toward the other.
  graphite(pen, [[-0.04, -0.13], [0.02, -0.122], [0.075, -0.108]], { weight: 1.3 });
  graphite(pen, ellipse(-0.055, -0.133, 0.016, 0.007, 0, Math.PI * 2, 12), { weight: 0.9 });
  out.pencil = pen.canvas;

  // The sun, from the window on the right: a slanted pane across the back wall with the sash
  // in shadow (the kitchen-light memory's own window), and a warm spill along the table.
  const sun = mk(6);
  const warm: [number, number, number] = later ? [255, 214, 168] : [255, 228, 190];
  sunPane(sun, { x: 0.02, y: 0.1, w: 0.34, h: 0.26, shear: 0.55, transom: 0.05, mullion: 0.03, colour: warm, blur: 0.014 });
  sun.ctx.save();
  sun.ctx.filter = `blur(${Math.round(0.03 * ppm)}px)`;
  sun.ctx.globalAlpha = 0.55;
  sun.ctx.fillStyle = `rgb(${warm.join(',')})`;
  const spill: Pt[] = [[-0.16, -0.075], [0.38, -0.055], [0.3, -0.2], [-0.26, -0.22]];
  sun.ctx.beginPath();
  spill.forEach((q, i) => {
    const [x, y] = [(q[0] + W / 2) * ppm, (H / 2 - q[1]) * ppm];
    if (i) sun.ctx.lineTo(x, y);
    else sun.ctx.moveTo(x, y);
  });
  sun.ctx.fill();
  sun.ctx.restore();
  out.sun = sun.canvas;
  return out;
}

export type { Sheet };
