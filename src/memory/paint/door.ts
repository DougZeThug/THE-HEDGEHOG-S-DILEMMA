import { crayon, graphite, sheet, tooth, wash, type Pt } from './brush';

/**
 * "the door, slightly open"
 *
 * Seen as a child in bed sees it, in the evening: the bedroom door, ajar, and a strip of the
 * landing's light coming through the gap and lying across the dark floor. Nothing else. A
 * shadow passing is only the strip dimming as something crosses the light; nobody is drawn,
 * and the door never closes.
 *
 * Two colours: a dusky blue-grey (the room in the evening, the door), ochre (the frame, the
 * floor), and the warm landing light, which is light, not paint. The words are written across
 * the bare band at the top. Window 0.9 × 0.6 m; metres from its centre. Code-painted stand-in.
 */
export const SIZE: [number, number] = [0.9, 0.6];
export const BAND = 0.17;
export const LAYERS = ['room', 'door', 'pencil', 'strip'] as const;
export const KINDS: Record<(typeof LAYERS)[number], 'pigment' | 'light' | 'sketch'> = {
  room: 'pigment',
  door: 'pigment',
  pencil: 'sketch',
  strip: 'light',
};

const DUSK: [number, number, number] = [128, 136, 156];
const OCHRE: [number, number, number] = [176, 140, 96];

// The doorway (frame) and the door, open a hand's width: hinged on the left, its edge on the right.
const FRAME = { x0: -0.13, x1: 0.13, y0: -0.27, y1: 0.12 };
const LEAF: Pt[] = [
  [-0.12, -0.27],
  [0.075, -0.255],
  [0.075, 0.108],
  [-0.12, 0.115],
];
const GAP = { x0: 0.078, x1: 0.118 };

export function paint(_variant: string, ppm: number, seed = 23): Record<string, HTMLCanvasElement> {
  const [W, H] = SIZE;
  const mk = (k: number) => sheet(W, H, ppm, seed * 31 + k);
  const out: Record<string, HTMLCanvasElement> = {};

  // The room in the evening: a dusky wash below the words, darker toward the floor.
  const room = mk(1);
  wash(room, [[-0.43, 0.13], [0.43, 0.13], [0.43, -0.29], [-0.43, -0.29]], DUSK, 0.2);
  crayon(room, [[-0.42, -0.2], [0.42, -0.2], [0.41, -0.29], [-0.41, -0.29]], DUSK, { alpha: 0.35, angle: 0.08, density: 1.1 });
  tooth(room);
  out.room = room.canvas;

  // The door, darker than the wall, and its frame in ochre.
  const door = mk(2);
  crayon(door, LEAF, DUSK, { alpha: 0.5, angle: 1.45, density: 1.3 });
  for (const side of [
    [[FRAME.x0 - 0.018, FRAME.y0], [FRAME.x0, FRAME.y0], [FRAME.x0, FRAME.y1 + 0.018], [FRAME.x0 - 0.018, FRAME.y1 + 0.018]],
    [[FRAME.x1, FRAME.y0], [FRAME.x1 + 0.018, FRAME.y0], [FRAME.x1 + 0.018, FRAME.y1 + 0.018], [FRAME.x1, FRAME.y1 + 0.018]],
    [[FRAME.x0 - 0.018, FRAME.y1], [FRAME.x1 + 0.018, FRAME.y1], [FRAME.x1 + 0.018, FRAME.y1 + 0.018], [FRAME.x0 - 0.018, FRAME.y1 + 0.018]],
  ] as Pt[][])
    crayon(door, side, OCHRE, { alpha: 0.55, angle: 1.5, density: 1.6, inset: 0.001 });
  tooth(door);
  out.door = door.canvas;

  // The underdrawing: frame, door, handle, the floor's line.
  const pen = mk(3);
  graphite(pen, [[FRAME.x0, FRAME.y0], [FRAME.x0, FRAME.y1], [FRAME.x1, FRAME.y1], [FRAME.x1, FRAME.y0]], { weight: 0.9 });
  graphite(pen, LEAF, { close: true, weight: 0.8 });
  graphite(pen, [[0.05, -0.08], [0.062, -0.08]], { weight: 1.4 });
  graphite(pen, [[-0.41, -0.27], [FRAME.x0, -0.27]], { weight: 0.6, alpha: 0.6 });
  graphite(pen, [[FRAME.x1, -0.27], [0.41, -0.27]], { weight: 0.6, alpha: 0.6 });
  out.pencil = pen.canvas;

  // The landing light: through the gap, and a wedge of it across the floor toward the bed.
  const strip = mk(4);
  const c = strip.ctx;
  const P = ([x, y]: Pt): [number, number] => [(x + W / 2) * ppm, (H / 2 - y) * ppm];
  c.save();
  c.filter = `blur(${Math.round(0.006 * ppm)}px)`;
  c.fillStyle = 'rgb(255,255,255)';
  c.beginPath();
  for (const [i, q] of ([[GAP.x0, FRAME.y1 - 0.004], [GAP.x1, FRAME.y1 - 0.004], [GAP.x1, FRAME.y0], [GAP.x0, FRAME.y0]] as Pt[]).entries()) {
    const [x, y] = P(q);
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.fill();
  c.filter = `blur(${Math.round(0.02 * ppm)}px)`;
  c.globalAlpha = 0.7;
  c.beginPath();
  for (const [i, q] of ([[GAP.x0, FRAME.y0], [GAP.x1, FRAME.y0], [0.24, -0.3], [0.1, -0.3]] as Pt[]).entries()) {
    const [x, y] = P(q);
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.fill();
  c.restore();
  out.strip = strip.canvas;
  return out;
}
