import * as THREE from 'three';
import { Rng } from '../core/rng';
import { texelsFor, type Texels } from './bake';
import { canvas } from './canvas';
import type { Quality } from './quality';
import { HANDS } from './textures';

/**
 * How legible the room's history is. Its marks were drawn so faint (alpha 0.02–0.12) that no
 * render showed them; the review (2026-10-illustrated) asked for them to be found from a metre
 * or two on a phone, the erased "I'm sorry" still a ghost.
 */
export const MARKS = 1.6;

/** Graphite that was written and rubbed out: a grey ghost, smeared, with eraser passes through it. */
export function erasedWriting(t: Texels, g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, r: Rng, strength = 1, font = HANDS.pencil.font) {
  const px = size * t.k;
  const [tc, tg] = canvas(Math.ceil(px * text.length * 0.6 + px), Math.ceil(px * 1.6), true);
  tg.font = `400 ${px}px "${font}", cursive`;
  tg.fillStyle = 'rgb(62,62,68)';
  tg.textBaseline = 'middle';
  tg.fillText(text, px * 0.3, tc.height / 2);
  g.save();
  g.translate(x, y);
  g.rotate(r.range(-0.04, 0.04));
  g.filter = `blur(${1.4 * t.k}px)`;
  g.globalAlpha = 0.05 * strength * MARKS;
  g.drawImage(tc, 0, 0);
  g.globalAlpha = 0.025 * strength * MARKS;
  g.drawImage(tc, r.range(2, 6) * t.k, r.range(-1, 1.5) * t.k); // smear in the direction of rubbing
  g.filter = `blur(${6 * t.k}px)`;
  g.globalAlpha = 0.018 * strength * MARKS;
  g.fillStyle = 'rgb(128,128,134)';
  for (let k = 0; k < 3; k++) g.fillRect(r.range(-6 * t.k, tc.width * 0.5), tc.height * r.range(0.3, 0.5), tc.width * r.range(0.3, 0.6), tc.height * 0.22);
  g.restore();
  g.filter = 'none';
  g.globalAlpha = 1;
}

/** Four small residues of masking tape around a paler rectangle: something hung here, for a long time. */
export function removedSheet(t: Texels, g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, r: Rng) {
  g.save();
  g.translate(cx, cy);
  g.rotate(r.range(-0.02, 0.02));
  // Cleaner than the wall round it: the paper kept the grime off.
  g.fillStyle = 'rgba(255,255,252,0.09)';
  g.fillRect(-w / 2, -h / 2, w, h);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    if (r.chance(0.15)) continue; // one corner was never taped
    g.save();
    g.translate((sx * w) / 2, (sy * h) / 2);
    g.rotate(sx * sy * r.range(0.5, 0.9));
    g.fillStyle = `rgba(196,176,128,${r.range(0.07, 0.12) * MARKS})`;
    g.fillRect(-13 * t.k, -4.5 * t.k, 26 * t.k, 9 * t.k);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(-13 * t.k, -4.5 * t.k, 26 * t.k, 2 * t.k);
    g.restore();
  }
  g.restore();
}

/** Pencil ticks at a child's height, with initials, mostly rubbed away. */
export function heightMarks(t: Texels, g: CanvasRenderingContext2D, x: number, floorY: number, r: Rng) {
  g.save();
  g.filter = `blur(${0.6 * t.k}px)`;
  for (const [h, label] of [[0.82, 'J'], [0.94, ''], [1.03, 'J'], [1.16, '']] as const) {
    const y = floorY - h * t.ppm;
    g.globalAlpha = r.range(0.07, 0.12) * MARKS;
    g.strokeStyle = 'rgb(60,60,66)';
    g.lineWidth = 1.2 * t.k;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + r.range(16, 24) * t.k, y + r.range(-1, 1) * t.k);
    g.stroke();
    if (label) {
      g.font = `400 ${14 * t.k}px "${HANDS.pencil.font}", cursive`;
      g.fillStyle = 'rgb(60,60,66)';
      g.fillText(label, x + 28 * t.k, y + 4 * t.k);
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

/** Days counted, in groups of five, very small and very faint. */
export function tally(t: Texels, g: CanvasRenderingContext2D, x: number, y: number, groups: number, r: Rng) {
  g.save();
  g.strokeStyle = 'rgb(66,66,72)';
  g.lineWidth = t.k;
  g.globalAlpha = 0.11 * MARKS;
  g.filter = `blur(${0.4 * t.k}px)`;
  for (let k = 0; k < groups; k++) {
    const gx = x + k * 20 * t.k;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(gx + i * 3.5 * t.k, y + r.range(-1, 1) * t.k);
      g.lineTo(gx + (i * 3.5 + r.range(-0.8, 0.8)) * t.k, y + 13 * t.k);
      g.stroke();
    }
    if (k < groups - 1 || r.chance(0.5)) {
      g.beginPath();
      g.moveTo(gx - 2 * t.k, y + 10 * t.k);
      g.lineTo(gx + 14 * t.k, y + 2 * t.k);
      g.stroke();
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

/** Graphite and crayon dust settled along the top of the skirting under the busiest writing. */
export function graphiteDust(t: Texels, g: CanvasRenderingContext2D, x0: number, x1: number, y: number, r: Rng) {
  // Soft spots drawn as gradients (canvas blur filters aren't everywhere).
  for (let x = x0; x < x1; x += 6 * t.k) {
    const cy = y - r.range(3, 10) * t.k, rad = r.range(4, 10) * t.k;
    const grd = g.createRadialGradient(x, cy, 0, x, cy, rad);
    grd.addColorStop(0, `rgba(110,86,66,${r.range(0.015, 0.04)})`);
    grd.addColorStop(1, 'rgba(110,86,66,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, cy - rad, rad * 2, rad * 2);
  }
}

/**
 * Graphite on the plaster that isn't writing: the side of a hand dragged under a line, a
 * thumb wiped clean, a palm leant on, and paler halos where something was rubbed out. Only
 * ever where hands reach (0.5–2.1 m).
 */
export function graphiteSmudges(t: Texels, g: CanvasRenderingContext2D, W: number, H: number, r: Rng, n: number) {
  const soft = (x: number, y: number, rx: number, ry: number, rot: number, rgba: string) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(1, ry / rx);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grd.addColorStop(0, rgba);
    grd.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = grd;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  };
  for (let i = 0; i < n; i++) {
    const x = r.range(0.2, W / t.ppm - 0.2) * t.ppm, y = H - r.range(0.5, 2.1) * t.ppm;
    const kind = r.next();
    if (kind < 0.45) {
      // A drag: long, low, a little slanted.
      soft(x, y, r.range(10, 26) * t.k, r.range(1.5, 4) * t.k, r.range(-0.25, 0.1), `rgba(72,72,78,${r.range(0.04, 0.09)})`);
    } else if (kind < 0.75) {
      // A thumb or fingertip.
      soft(x, y, r.range(2.5, 5) * t.k, r.range(2, 4) * t.k, r.range(0, 3), `rgba(70,70,76,${r.range(0.05, 0.1)})`);
    } else if (kind < 0.9) {
      // An eraser's halo: cleaner than the wall round it.
      soft(x, y, r.range(12, 24) * t.k, r.range(5, 10) * t.k, r.range(-0.2, 0.2), `rgba(255,255,250,${r.range(0.05, 0.09)})`);
    } else {
      // A palm, leant on.
      soft(x, y, r.range(8, 12) * t.k, r.range(10, 14) * t.k, r.range(-0.3, 0.3), `rgba(80,78,76,${r.range(0.025, 0.05)})`);
    }
  }
}

/**
 * The writer's hand, under the lines that are on the walls: the heel of a right hand dragged
 * along beneath a line from about its middle, a thumb at its end. Painted onto a wall's map
 * once the writing is laid out (u, v: the line's centre in the wall's metres; w, h its size).
 */
export function handMarks(map: THREE.CanvasTexture, lines: { u: number; v: number; w: number; h: number }[], seed: number, quality: Quality) {
  const t = texelsFor(quality);
  const c = map.image as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const H = c.height;
  const r = new Rng(seed);
  const soft = (x: number, y: number, rx: number, ry: number, rot: number, a: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(1, ry / rx);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grd.addColorStop(0, `rgba(72,72,78,${a})`);
    grd.addColorStop(1, 'rgba(72,72,78,0)');
    g.fillStyle = grd;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  };
  for (const l of lines) {
    const base = H - (l.v - l.h / 2 - r.range(0.03, 0.06)) * t.ppm;
    const x0 = (l.u - l.w / 2 + l.w * 0.4) * t.ppm;
    const len = l.w * r.range(0.35, 0.55) * t.ppm;
    // The drag: several overlapping soft strokes along the baseline.
    for (let k = 0; k < 5; k++) soft(x0 + (len * k) / 5, base + r.range(-1.5, 1.5) * t.k, len / 5, r.range(2, 4) * t.k, r.range(-0.06, 0.04), r.range(0.1, 0.16));
    soft((l.u + l.w / 2) * t.ppm + r.range(1, 4) * t.k, base - r.range(2, 8) * t.k, r.range(3, 5) * t.k, r.range(2.5, 4) * t.k, r.range(0, 3), r.range(0.12, 0.18));
  }
  map.needsUpdate = true;
}
