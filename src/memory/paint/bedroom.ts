import { crayon, ellipse, graphite, sheet, sunPane, tooth, wash, type Pt } from './brush';

/**
 * "I was happiest when nobody needed anything from me."
 *
 * A small bedroom in the morning: a single bed, unmade, slept in by one; a window with a pale
 * net curtain lit from behind (no view: nothing outside asks to be looked at); a curtain at its
 * side, the one thing in these memories that moves by itself. The morning sun lies across the
 * bed. Nobody is drawn, and nothing in the room wants anything.
 *
 * Three colours: a pale blue (the duvet, the curtain), ochre (the bed's wood, the floor), a warm
 * cream (the sheet, the pillow). The words are written across the bare band at the top.
 * Window 0.9 × 0.6 m; metres from its centre, y up. Code-painted stand-in, replaceable.
 */
export const SIZE: [number, number] = [0.9, 0.6];
export const BAND = 0.17;
export const LAYERS = ['room', 'curtain', 'bed', 'pencil', 'sun'] as const;
export const KINDS: Record<(typeof LAYERS)[number], 'pigment' | 'light' | 'sketch'> = {
  room: 'pigment',
  curtain: 'pigment',
  bed: 'pigment',
  pencil: 'sketch',
  sun: 'light',
};

const BLUE: [number, number, number] = [132, 156, 184];
const OCHRE: [number, number, number] = [190, 148, 92];
const CREAM: [number, number, number] = [232, 222, 202];

const WIN = { x0: 0.15, x1: 0.37, y0: -0.11, y1: 0.12, mullion: 0.26, transom: 0.04 };
const CURTAIN: Pt[] = [
  [0.075, 0.13],
  [0.15, 0.13],
  [0.148, 0.02],
  [0.14, -0.08],
  [0.13, -0.16],
  [0.09, -0.165],
  [0.085, -0.06],
  [0.08, 0.04],
];
// The bed: a single bed along the wall, its foot toward the window.
const DUVET: Pt[] = [
  [-0.36, -0.12],
  [-0.2, -0.105],
  [-0.05, -0.12],
  [0.05, -0.135],
  [0.06, -0.2],
  [0.03, -0.25],
  [-0.15, -0.255],
  [-0.36, -0.245],
];
const SHEET: Pt[] = [
  [-0.4, -0.11],
  [0.07, -0.115],
  [0.07, -0.26],
  [-0.4, -0.26],
];
const HEAD: Pt[] = [
  [-0.42, -0.27],
  [-0.39, -0.27],
  [-0.39, 0.0],
  [-0.42, 0.0],
];
/** The morning sun's pane across the bed, in the painting's metres. */
export const SUN_PANE = { x: -0.1, y: -0.16, w: 0.3, h: 0.16, shear: -0.35, transom: 0.03, mullion: 0.04 };

export function paint(variant: string, ppm: number, seed = 11): Record<string, HTMLCanvasElement> {
  const [W, H] = SIZE;
  const mk = (k: number) => sheet(W, H, ppm, seed * 31 + k);
  const out: Record<string, HTMLCanvasElement> = {};

  // The room: a pale wash on the wall below the words, the floorboards in ochre, the net
  // curtain behind the glass, a little lighter than the wall.
  const room = mk(1);
  wash(room, [[-0.43, -0.27], [0.43, -0.27], [0.43, -0.29], [-0.43, -0.29]], OCHRE, 0.3);
  crayon(room, [[-0.4, -0.262], [0.41, -0.262], [0.4, -0.295], [-0.39, -0.295]], OCHRE, { alpha: 0.4, angle: 0.04, density: 1.1 });
  crayon(room, [[WIN.x0, WIN.y0], [WIN.x1, WIN.y0], [WIN.x1, WIN.y1], [WIN.x0, WIN.y1]], CREAM, { alpha: 0.35, angle: 1.4, density: 1.2, inset: 0.006 });
  tooth(room);
  out.room = room.canvas;

  // The curtain at the window's side (it breathes: the memory's one procedural motion).
  const cur = mk(2);
  crayon(cur, CURTAIN, BLUE, { alpha: 0.42, angle: 1.52, density: 1.1 });
  tooth(cur);
  out.curtain = cur.canvas;

  // The bed: wood, sheet, a duvet pushed down and rumpled, one pillow with one dent.
  const bed = mk(3);
  crayon(bed, HEAD, OCHRE, { alpha: 0.55, angle: 1.5, density: 1.4 });
  crayon(bed, SHEET, CREAM, { alpha: 0.45, angle: 0.1, density: 1.1 });
  crayon(bed, DUVET, BLUE, { alpha: 0.5, angle: 0.5, density: 1.3 });
  crayon(bed, ellipse(-0.33, -0.112, 0.055, 0.022, 0, Math.PI * 2, 20), CREAM, { alpha: 0.6, angle: 0.2, density: 2, inset: 0.002 });
  crayon(bed, [[-0.39, -0.255], [0.07, -0.255], [0.07, -0.275], [-0.39, -0.275]], OCHRE, { alpha: 0.5, angle: 0.02, density: 1.4 });
  tooth(bed);
  out.bed = bed.canvas;

  // The underdrawing.
  const pen = mk(5);
  graphite(pen, [[WIN.x0, WIN.y0], [WIN.x1, WIN.y0], [WIN.x1, WIN.y1], [WIN.x0, WIN.y1]], { close: true, weight: 0.8 });
  graphite(pen, [[WIN.mullion, WIN.y0], [WIN.mullion, WIN.y1]], { weight: 0.6 });
  graphite(pen, [[WIN.x0, WIN.transom], [WIN.x1, WIN.transom]], { weight: 0.6 });
  graphite(pen, [[WIN.x0 - 0.01, WIN.y0 - 0.008], [WIN.x1 + 0.01, WIN.y0 - 0.008]], { weight: 0.9 });
  graphite(pen, [[0.075, 0.13], [0.15, 0.13]], { weight: 0.6 });
  graphite(pen, [[0.08, 0.04], [0.085, -0.06], [0.09, -0.165]], { weight: 0.6, alpha: 0.6 });
  graphite(pen, HEAD, { close: true, weight: 0.8 });
  graphite(pen, [[-0.39, -0.11], [0.07, -0.115], [0.07, -0.26], [-0.39, -0.26]], { weight: 0.8 });
  graphite(pen, DUVET, { close: true, weight: 0.7, alpha: 0.6 });
  graphite(pen, ellipse(-0.33, -0.112, 0.055, 0.022, 0, Math.PI * 2, 20), { weight: 0.7 });
  // The dent in the pillow, and the floor's edge.
  graphite(pen, [[-0.35, -0.108], [-0.33, -0.116], [-0.31, -0.109]], { weight: 0.5, alpha: 0.5 });
  graphite(pen, [[-0.4, -0.262], [0.41, -0.262]], { weight: 0.6, alpha: 0.6 });
  out.pencil = pen.canvas;

  // The light: the window glowing through its net, and its pane laid across the bed.
  const sun = mk(6);
  const white: [number, number, number] = [255, 255, 255];
  sun.ctx.save();
  sun.ctx.filter = `blur(${Math.round(0.012 * ppm)}px)`;
  sun.ctx.globalAlpha = 0.55;
  sun.ctx.fillStyle = 'rgb(255,255,255)';
  sun.ctx.fillRect((WIN.x0 + W / 2) * ppm, (H / 2 - WIN.y1) * ppm, (WIN.x1 - WIN.x0) * ppm, (WIN.y1 - WIN.y0) * ppm);
  sun.ctx.restore();
  sunPane(sun, { ...SUN_PANE, colour: white, blur: variant === 'dusk' ? 0.03 : 0.012 });
  out.sun = sun.canvas;
  return out;
}
