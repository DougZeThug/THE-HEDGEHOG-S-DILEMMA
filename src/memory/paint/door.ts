import { crayon, graphite, sheet, tooth, type Pt } from './brush';

/**
 * "the door, slightly open"
 *
 * It opens from the room's own drawing: the faint door on the south wall, "drawn twice over",
 * which has been there since the visit began. The painted door is registered onto those drawn
 * lines (REGISTER), so the drawing the visitor has walked past becomes a door with the landing's
 * light behind it.
 *
 * Seen from the bed in the evening, by a child who is meant to be asleep: the door ajar, the
 * light through the gap and lying across the floor in a widening wedge toward the bed, the edge
 * of the blanket in the corner (the bedroom's blue: the same room). Someone on the landing is only
 * a shadow in that light (the `shadow` layer, a shade: it takes light away, it adds no paint).
 *
 * Colours: a dusky blue-grey (the room, the door), ochre (the frame), the bedroom's blue (the
 * blanket); the light is light. Window 0.9 × 0.6 m; metres from its centre. Code-painted stand-in.
 */
export const SIZE: [number, number] = [0.9, 0.6];
export const BAND = 0;
export const LAYERS = ['room', 'door', 'pencil', 'strip', 'shadow'] as const;
export const KINDS: Record<(typeof LAYERS)[number], 'pigment' | 'light' | 'sketch' | 'shade'> = {
  room: 'pigment',
  door: 'pigment',
  pencil: 'sketch',
  strip: 'light',
  shadow: 'shade',
};

const DUSK: [number, number, number] = [124, 132, 152];
const OCHRE: [number, number, number] = [176, 140, 96];
const BLUE: [number, number, number] = [112, 132, 160];

// The doorway, sized and placed so it lies on the room's drawn door (0.17 × 0.30 m on the wall).
const FRAME = { x0: -0.04, x1: 0.16, y0: -0.12, y1: 0.24 };
export const REGISTER = { x: (FRAME.x0 + FRAME.x1) / 2, y: (FRAME.y0 + FRAME.y1) / 2, h: FRAME.y1 - FRAME.y0 };
// The door, open a hand's width: hinged on the left, its edge on the right.
const LEAF: Pt[] = [
  [FRAME.x0 + 0.008, FRAME.y0],
  [0.108, FRAME.y0 + 0.012],
  [0.108, FRAME.y1 - 0.01],
  [FRAME.x0 + 0.008, FRAME.y1 - 0.004],
];
const GAP = { x0: 0.11, x1: 0.152 };
const FLOOR = -0.12;

export function paint(_variant: string, ppm: number, seed = 23): Record<string, HTMLCanvasElement> {
  const [W, H] = SIZE;
  const mk = (k: number) => sheet(W, H, ppm, seed * 31 + k);
  const out: Record<string, HTMLCanvasElement> = {};
  const P = ([x, y]: Pt): [number, number] => [(x + W / 2) * ppm, (H / 2 - y) * ppm];

  // The room in the evening: a dusky crayon round the door, stopping raggedly short of the
  // picture's sides; the floor darker; the blanket's edge in the corner.
  const room = mk(1);
  crayon(room, [[-0.33, 0.27], [0.36, 0.28], [0.39, 0.1], [0.37, FLOOR], [-0.36, FLOOR], [-0.38, 0.1]], DUSK, { alpha: 0.28, angle: 1.4, density: 0.8 });
  crayon(room, [[-0.37, FLOOR], [0.38, FLOOR], [0.42, -0.29], [-0.41, -0.29]], DUSK, { alpha: 0.42, angle: 0.1, density: 1.1 });
  crayon(room, [[-0.45, -0.2], [-0.16, -0.24], [-0.05, -0.3], [-0.45, -0.3]], BLUE, { alpha: 0.6, angle: 0.35, density: 1.5 });
  tooth(room);
  out.room = room.canvas;

  // The door, darker than the wall; its frame in ochre.
  const door = mk(2);
  crayon(door, LEAF, DUSK, { alpha: 0.55, angle: 1.45, density: 1.4 });
  for (const side of [
    [[FRAME.x0 - 0.016, FRAME.y0], [FRAME.x0, FRAME.y0], [FRAME.x0, FRAME.y1 + 0.016], [FRAME.x0 - 0.016, FRAME.y1 + 0.016]],
    [[FRAME.x1, FRAME.y0], [FRAME.x1 + 0.016, FRAME.y0], [FRAME.x1 + 0.016, FRAME.y1 + 0.016], [FRAME.x1, FRAME.y1 + 0.016]],
    [[FRAME.x0 - 0.016, FRAME.y1], [FRAME.x1 + 0.016, FRAME.y1], [FRAME.x1 + 0.016, FRAME.y1 + 0.016], [FRAME.x0 - 0.016, FRAME.y1 + 0.016]],
  ] as Pt[][])
    crayon(door, side, OCHRE, { alpha: 0.55, angle: 1.5, density: 1.6, inset: 0.001 });
  tooth(door);
  out.door = door.canvas;

  // The underdrawing: the gap's two lines first (they are what the light finds), the frame, the
  // door, the handle, the floor, the blanket's edge.
  const pen = mk(3);
  graphite(pen, [[GAP.x0, FRAME.y0], [GAP.x0, FRAME.y1]], { weight: 0.9 });
  graphite(pen, [[GAP.x1, FRAME.y0], [GAP.x1, FRAME.y1]], { weight: 0.8 });
  graphite(pen, [[FRAME.x0, FRAME.y0], [FRAME.x0, FRAME.y1], [FRAME.x1, FRAME.y1], [FRAME.x1, FRAME.y0]], { weight: 0.9 });
  graphite(pen, LEAF, { close: true, weight: 0.7, alpha: 0.6 });
  graphite(pen, [[0.085, 0.04], [0.098, 0.04]], { weight: 1.4 });
  graphite(pen, [[-0.36, FLOOR], [FRAME.x0, FLOOR]], { weight: 0.6, alpha: 0.6 });
  graphite(pen, [[FRAME.x1, FLOOR], [0.37, FLOOR]], { weight: 0.6, alpha: 0.6 });
  graphite(pen, [[-0.45, -0.2], [-0.16, -0.24], [-0.05, -0.3]], { weight: 0.9 });
  out.pencil = pen.canvas;

  // The landing light: brightest at the gap (near the latch), uneven, and a wedge of it across
  // the floor toward the bed, widening to the picture's edge.
  const strip = mk(4);
  const c = strip.ctx;
  c.save();
  c.filter = `blur(${Math.round(0.005 * ppm)}px)`;
  const [gx0] = P([GAP.x0, 0]);
  const [gx1] = P([GAP.x1, 0]);
  const [, gyTop] = P([0, FRAME.y1 - 0.004]);
  const [, gyBot] = P([0, FRAME.y0]);
  const g = c.createLinearGradient(0, gyTop, 0, gyBot);
  g.addColorStop(0, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.55, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(gx0 + 1, gyTop);
  c.lineTo(gx1, gyTop + 2);
  c.lineTo(gx1 + 1, gyBot);
  c.lineTo(gx0, gyBot);
  c.fill();
  // The wedge on the floor.
  c.filter = `blur(${Math.round(0.014 * ppm)}px)`;
  const wedge = c.createLinearGradient(0, gyBot, 0, P([0, -0.3])[1]);
  wedge.addColorStop(0, 'rgba(255,255,255,0.85)');
  wedge.addColorStop(1, 'rgba(255,255,255,0.35)');
  c.fillStyle = wedge;
  c.beginPath();
  for (const [i, q] of ([[GAP.x0, FRAME.y0], [GAP.x1, FRAME.y0], [0.36, -0.3], [0.04, -0.3]] as Pt[]).entries()) {
    const [x, y] = P(q);
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.fill();
  c.restore();
  out.strip = strip.canvas;

  // The shadow of someone on the landing: a soft upright band (their body in the light) and its
  // long shape across the wedge. It is moved by the timeline (layer:shadow.x) and only darkens
  // the light it falls in.
  const shadow = mk(5);
  const s = shadow.ctx;
  s.save();
  s.filter = `blur(${Math.round(0.02 * ppm)}px)`;
  s.fillStyle = 'rgba(0,0,0,0.85)';
  s.beginPath();
  for (const [i, q] of ([[0.1, FRAME.y1], [0.16, FRAME.y1], [0.165, FRAME.y0], [0.3, -0.3], [0.12, -0.3], [0.1, FRAME.y0]] as Pt[]).entries()) {
    const [x, y] = P(q);
    if (i) s.lineTo(x, y);
    else s.moveTo(x, y);
  }
  s.fill();
  s.restore();
  out.shadow = shadow.canvas;
  return out;
}
