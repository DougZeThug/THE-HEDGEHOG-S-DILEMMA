import * as THREE from 'three';
import { isSideWall, type Surface, type Wall } from '../content/types';
import { Rng } from '../core/rng';
import { smoothstep } from '../core/math';
import { baseScuffs, corners, fineDetail, plaster, SCAN_AMP, texelsFor, toTex, type SurfaceMaps, type Texels } from './bake';
import { canvas } from './canvas';
import { WALL_ROLE } from './layout';
import { MARKS, erasedWriting, graphiteDust, graphiteSmudges, heightMarks, removedSheet, tally } from './marks';
import { makeNoise } from './noise';
import type { Quality } from './quality';
import { scanDetail, sampleDetail } from './scans';

/**
 * The room's surfaces, painted once at load. Everything here is meant to be nearly
 * invisible: plaster that was trowelled by hand, a floor that has been walked on, a
 * ceiling slightly cooler than the walls, and the traces of what was here before —
 * writing rubbed out, tape that held something up, a pale patch where something hung,
 * pencil ticks of someone's height, days counted.
 */

/** Weathering is soft and broad: a coarse map is enough. */
const WEATHERING_PX_PER_M = 64;

/**
 * Weathering, as an alpha map laid over a wall (its strength is the look's, so it can be turned
 * down without baking again): water that ran down from somewhere and dried in streaks, the tide
 * lines of an old damp patch, grime gathered in the corners and along the skirting. Mostly on the
 * side walls, as in the artist's reference.
 */
export function weatheringMap(surface: Surface, wM: number, hM: number, seed: number): THREE.CanvasTexture {
  const ppm = WEATHERING_PX_PER_M;
  const W = Math.round(wM * ppm), H = Math.round(hM * ppm);
  const [c, g] = canvas(W, H, true);
  const img = g.createImageData(W, H);
  const r = new Rng(seed);
  const n = makeNoise(seed + 3), m = makeNoise(seed + 7);
  const side = isSideWall(surface);
  // Streaks (metres): where the water started, how far it ran, how wide, how dark.
  // On the side walls a few distinct runs gathered in two places (near each end), clean wall
  // between, as in the reference; elsewhere a couple of faint ones.
  const zones = [0.7, wM - 1.0];
  const streaks = Array.from({ length: side ? 4 : 2 }, (_, i) => side
    ? { x: zones[i % 2] + r.range(-0.35, 0.35), top: r.range(1.6, hM - 0.3), len: r.range(0.9, 2.2), w: r.range(0.015, 0.035), a: r.range(0.2, 0.32), k: r.range(0, 100) }
    : { x: r.range(0.15, wM - 0.15), top: r.range(1.0, hM - 0.3), len: r.range(0.5, 1.8), w: r.range(0.025, 0.07), a: r.range(0.05, 0.1), k: r.range(0, 100) });
  for (let j = 0; j < H; j++) {
    const v = hM - (j + 0.5) / ppm; // height above the floor
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / ppm;
      let a = 0;
      // Old damp: cloudy, irregular, never round.
      a += smoothstep(0.6, 0.78, n.fbm(u / 0.5, v / 0.5, 4)) * (side ? 0.09 : 0.04);
      for (const st of streaks) {
        const t = (st.top - v) / st.len;
        if (t < 0 || t > 1) continue;
        const wob = (m.fbm(st.k, v * 3, 2) - 0.5) * 0.06;
        const dx = (u - st.x - wob) / st.w;
        if (Math.abs(dx) > 6) continue;
        // Starts faint, darkest a little below where it began, thins out as it runs down;
        // uneven along its length, with a soft wider stain round the run.
        const along = smoothstep(0, 0.15, t) * (1 - t) ** 1.4 * (0.6 + 0.8 * m.fbm(st.k + 5, v * 8, 2));
        a += st.a * along * (Math.exp(-dx * dx) + 0.4 * Math.exp(-(dx * dx) / 9));
      }
      // Grime in the corners and along the foot, uneven.
      const edge = Math.min(u, wM - u);
      a += 0.09 * (1 - smoothstep(0, 0.4, edge)) * (0.5 + n.fbm(u * 0.3, v / 0.6, 3));
      a += (surface === WALL_ROLE.calm ? 0.04 : 0.08) * (1 - smoothstep(0.1, 0.5, v)) * (0.6 + 0.6 * m.fbm(u / 0.4, 3, 2));
      const k = (j * W + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(255 * Math.min(1, a));
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/** The paint on a wall's surface; `my` flips a height above the floor into a canvas row. */
type Brush = { t: Texels; g: CanvasRenderingContext2D; r: Rng; mx: (u: number) => number; my: (v: number) => number; floorY: number };

/** The history each wall carries: authored wall by wall, so a four-way choice rather than a property. */
const WALL_HISTORY: Record<Wall, (b: Brush) => void> = {
  [WALL_ROLE.behindChair]: ({ t, g, r, mx, my }) => {
    // Behind the chair, in the space that is kept empty: one word, rubbed out (the other person).
    // An apology was rubbed out too, lower and off to the side, not where the light gathers.
    erasedWriting(t, g, 'you', mx(3.35), my(1.35), 36, r, 1.1);
    erasedWriting(t, g, "I'm sorry", mx(4.4), my(1.0), 44, r, 0.9);
    removedSheet(t, g, mx(5.2), my(2.15), 0.42 * t.ppm, 0.3 * t.ppm, r);
    graphiteDust(t, g, mx(1.0), mx(3.2), my(0.115), r);
  },
  east: ({ t, g, r, mx, my, floorY }) => {
    heightMarks(t, g, mx(0.35), floorY, r);
    removedSheet(t, g, mx(3.6), my(2.4), 0.3 * t.ppm, 0.22 * t.ppm, r);
    erasedWriting(t, g, 'always', mx(4.9), my(0.7), 30, r, 0.8);
  },
  west: ({ t, g, r, mx, my }) => {
    // Not every rubbed-out thing was a confession: a list, once.
    erasedWriting(t, g, 'milk', mx(1.0), my(1.27), 30, r, 0.9);
    erasedWriting(t, g, 'bread', mx(1.02), my(1.15), 30, r, 0.9);
    erasedWriting(t, g, 'batteries', mx(0.99), my(1.03), 30, r, 0.8);
    // A word scribbled out hard, then erased anyway.
    g.save();
    g.globalAlpha = 0.06 * MARKS;
    g.strokeStyle = 'rgb(60,60,66)';
    g.filter = `blur(${t.k}px)`;
    g.lineWidth = 2 * t.k;
    g.beginPath();
    const sx = mx(2.4), sy = my(0.62);
    g.moveTo(sx, sy);
    for (let k = 0; k < 14; k++) g.lineTo(sx + (k * 5 + r.range(-2, 2)) * t.k, sy + ((k % 2 ? -9 : 9) + r.range(-2, 2)) * t.k);
    g.stroke();
    g.restore();
    g.filter = 'none';
  },
  [WALL_ROLE.contribution]: ({ t, g, r, mx, my }) => {
    tally(t, g, mx(5.55), my(0.42), 6, r);
    removedSheet(t, g, mx(3.2), my(1.55), 0.55 * t.ppm, 0.4 * t.ppm, r);
  },
};

export function wallMaps(surface: Surface, seed: number, wM: number, hM: number, quality: Quality): SurfaceMaps {
  const t = texelsFor(quality);
  const W = Math.round(wM * t.ppm), H = Math.round(hM * t.ppm);
  const tone: Record<string, [number, number, number]> = {
    north: [237, 234, 228],
    east: [238, 234, 227],
    west: [234, 232, 228],
    south: [236, 234, 229],
  };
  // The wall you read is the calmest surface in the room (as in the reference): less cloud, less
  // tooth; its history is in particular marks, not grain spread everywhere.
  const calm = surface === WALL_ROLE.calm;
  const { c, g, bc, bg } = plaster(t, W, H, seed, tone[surface] ?? [236, 234, 228], { mottle: 10, trowel: 5, grain: 4, blotch: calm ? 5 : 8, tooth: calm ? 4 : 7.5 }, { detail: scanDetail('plaster'), ...(isSideWall(surface) ? SCAN_AMP.sideWall : SCAN_AMP.wall) });
  const r = new Rng(seed + 11);
  const floorY = H;
  const mx = (u: number) => u * t.ppm;
  const my = (v: number) => H - v * t.ppm;

  WALL_HISTORY[surface as Wall]({ t, g, r, mx, my, floorY });

  baseScuffs(t, g, W, H, r, 22);
  graphiteSmudges(t, g, W, H, r, 3);
  fineDetail(t, g, bg, W, H, new Rng(seed + 31), { specks: 18, pits: 6, scratches: 0.8 });
  // Little at the top: the box keeps a crisp, lit edge under its darker lid.
  corners(t, g, W, H, { bottom: calm ? 0.3 : 0.55, top: 0.12, left: 0.45, right: 0.45 });
  const map = toTex(c, true);
  const bump = toTex(bc, false);
  return { map, bump };
}

/**
 * The floor: matte, warm grey-white, gently uneven; smoother along the way people walk
 * in; scuffed in arcs around the chair; and, a little to one side, the faint marks of
 * where the chair used to stand.
 */
export function floorMaps(seed: number, wM: number, dM: number, quality: Quality): SurfaceMaps {
  const t = texelsFor(quality);
  const W = Math.round(wM * t.ppm), H = Math.round(dM * t.ppm);
  // Sealed concrete, a shade darker than the walls: cloudy, flecked, with a soft sheen where
  // the light falls (so the pool reads as light on a surface, not a paler floor).
  const { c, g, bc, bg } = plaster(t, W, H, seed, [190, 186, 181], { mottle: 15, trowel: 2, grain: 5, blotch: 18 }, { detail: scanDetail('concrete'), ...SCAN_AMP.floor });
  // Aggregate in the concrete, pits, the fine scratches of things set down and dragged.
  fineDetail(t, g, bg, W, H, new Rng(seed + 31), { specks: 30, pits: 3, scratches: 0.5, light: 0.5 });
  const r = new Rng(seed + 5);
  const n = makeNoise(seed + 9);
  const cx = W / 2, cy = H / 2;

  // Roughness: matte, with a smoother path worn from the south side to the chair.
  const [rc, rg] = canvas(W, H, true);
  const rimg = rg.createImageData(W, H);
  const roughScan = scanDetail('concrete-rough');
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const along = y > cy ? 1 : Math.max(0, 1 - (cy - y) / (0.4 * t.ppm));
      const across = Math.exp(-(((x - cx) / (0.55 * t.ppm)) ** 2));
      const path = along * across * (0.6 + 0.4 * n.fbm(x / (60 * t.k), y / (60 * t.k), 2));
      const ring = Math.exp(-(((Math.hypot(x - cx, y - cy) - 0.42 * t.ppm) / (0.22 * t.ppm)) ** 2));
      // Polished where people stand by the chair: a soft sheen there catches the light.
      const near = Math.exp(-((Math.hypot(x - cx, y - cy) / (0.75 * t.ppm)) ** 2));
      // The concrete's own: where it was trowelled smoother or left open (the scan, gently).
      const sr = roughScan ? 0.035 * sampleDetail(roughScan, x / t.ppm, y / t.ppm) : 0;
      const rough = 0.74 - 0.12 * path - 0.14 * ring - 0.14 * near + (n.fbm(x / (30 * t.k), y / (30 * t.k), 2) - 0.5) * 0.1 + sr;
      const i = (y * W + x) * 4;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.round(rough * 255);
      rimg.data[i + 3] = 255;
    }
  rg.putImageData(rimg, 0, 0);

  // The path itself is a touch paler, polished by feet.
  const path = g.createLinearGradient(0, H, 0, cy);
  path.addColorStop(0, 'rgba(255,255,250,0.035)');
  path.addColorStop(1, 'rgba(255,255,250,0.0)');
  g.save();
  g.beginPath();
  g.ellipse(cx, (cy + H) / 2, 0.5 * t.ppm, (H - cy) / 2, 0, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = path;
  g.fillRect(0, 0, W, H);
  g.restore();

  // Arcs where the chair has been dragged and turned, again and again.
  for (let i = 0; i < 70; i++) {
    const a = r.range(0, Math.PI * 2), d = r.range(0.2, 0.55) * t.ppm;
    g.strokeStyle = `rgba(96,90,82,${r.range(0.025, 0.07)})`;
    g.lineWidth = r.range(0.6, 1.6) * t.k;
    g.beginPath();
    g.arc(cx, cy, d, a, a + r.range(0.04, 0.22));
    g.stroke();
  }
  // Where it used to stand: four small pressed marks and a cleaner square, a little to the side.
  const ox = cx + 0.34 * t.ppm, oy = cy - 0.22 * t.ppm;
  g.save();
  g.translate(ox, oy);
  g.rotate(-0.12);
  g.fillStyle = 'rgba(255,255,250,0.035)';
  // (At the chair's size in the room: Chair.CHAIR_SCALE.)
  g.fillRect(-0.22 * t.ppm, -0.2 * t.ppm, 0.44 * t.ppm, 0.4 * t.ppm);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.fillStyle = 'rgba(88,82,74,0.09)';
    g.beginPath();
    g.arc(sx * 0.2 * t.ppm, sy * 0.18 * t.ppm, 3.2 * t.k, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // Heel marks, sparse, mostly along the path.
  for (let i = 0; i < 26; i++) {
    const y = r.range(cy, H - 10 * t.k), x = cx + r.range(-0.6, 0.6) * t.ppm;
    g.save();
    g.translate(x, y);
    g.rotate(r.range(0, Math.PI));
    g.fillStyle = `rgba(70,66,62,${r.range(0.03, 0.08)})`;
    g.fillRect(0, 0, r.range(4, 16) * t.k, r.range(0.8, 1.8) * t.k);
    g.restore();
  }
  // The floor darkens away from the chair: the concrete nearest it has been walked to, swept,
  // sat beside; further out it is duller and greyer (and the pool of light reads as a pool).
  // Neutral grey, not brown (falling light keeps its hue; dirt doesn't), centred a little toward
  // the panel, as the light is.
  const lcy = cy - 0.4 * t.ppm;
  const vg = g.createRadialGradient(cx, lcy, 0.8 * t.ppm, cx, lcy, 3.6 * t.ppm);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.45, 'rgba(118,118,118,0.12)');
  vg.addColorStop(1, 'rgba(118,118,118,0.22)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  // And toward where the visitor comes in, the floor nearer them is in the dim: they look into
  // the light, not stand in it.
  const front = g.createLinearGradient(0, cy + 0.2 * t.ppm, 0, H);
  front.addColorStop(0, 'rgba(110,110,110,0)');
  front.addColorStop(1, 'rgba(110,110,110,0.5)');
  g.fillStyle = front;
  g.fillRect(0, 0, W, H);
  corners(t, g, W, H, { top: 0.45, bottom: 0.45, left: 0.45, right: 0.45 }, '96,92,86');

  return { map: toTex(c, true), bump: toTex(bc, false), rough: toTex(rc, false) };
}

/** The ceiling: a slightly cooler white, nearly featureless, with the faintest board joints. */
export function ceilingMaps(seed: number, wM: number, dM: number, quality: Quality): SurfaceMaps {
  const t = texelsFor(quality);
  const W = Math.round(wM * t.ppm), H = Math.round(dM * t.ppm);
  const { c, g, bc } = plaster(t, W, H, seed, [229, 232, 235], { mottle: 4, trowel: 1.5, grain: 2 }, { detail: scanDetail('plaster'), ...SCAN_AMP.ceiling });
  for (let x = 1.2 * t.ppm; x < W; x += 1.2 * t.ppm) {
    g.fillStyle = 'rgba(120,124,130,0.06)';
    g.fillRect(x, 0, Math.max(1, t.k), H);
  }
  // (No painted spill round the skylight: the ceiling is the room's dark lid, as in the reference;
  // its bounce is Room's emissive map, on the look.)
  corners(t, g, W, H, { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }, '104,108,114');
  return { map: toTex(c, true), bump: toTex(bc, false) };
}

/** The glow is a soft gradient: a coarse map is enough. */
const GLOW_PX_PER_M = 40;

/**
 * The ceiling's bounce, as a map: broad, centred between the skylight and the wall behind the
 * chair (the light that comes back off the floor and that wall), not a halo round the opening.
 */
export function ceilingGlowMap(wM: number, dM: number, panel: { x: number; z: number }): THREE.CanvasTexture {
  const ppm = GLOW_PX_PER_M;
  const [c, g] = canvas(Math.round(wM * ppm), Math.round(dM * ppm));
  // Canvas rows run toward -z in the room (the ceiling is laid face down).
  const px = c.width / 2 + panel.x * ppm, pz = c.height / 2 - (panel.z - 0.9) * ppm;
  const grd = g.createRadialGradient(px, pz, 0.2 * ppm, px, pz, 3.6 * ppm);
  grd.addColorStop(0, '#d8d8d8');
  grd.addColorStop(0.45, '#8a8a8a');
  grd.addColorStop(1, '#2a2a2a');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  // Linear values (a factor, not a colour).
  return new THREE.CanvasTexture(c);
}
