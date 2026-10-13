import * as THREE from 'three';
import { Rng, hashString } from '../core/rng';
import type { Hand, Size } from '../content/types';
import { handTiming, wordRanges } from './handwriting';
import { bakeStrokes, type CharBox } from './strokes';

/** Procedural canvases: plaster, paper, painted floor, wood grain, handwriting. */

function canvas(w: number, h: number, readBack = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  // Canvases read back on the CPU stay on the CPU: no GPU readback stall.
  return [c, c.getContext('2d', readBack ? { willReadFrequently: true } : undefined)!];
}

let grainCache: HTMLCanvasElement | null = null;
/** Fine, irregular grain used for paper fibres and pencil tooth. */
export function grainCanvas(): HTMLCanvasElement {
  if (grainCache) return grainCache;
  const [c, g] = canvas(256, 256);
  const img = g.createImageData(256, 256);
  const r = new Rng(99);
  for (let i = 0; i < 256 * 256; i++) {
    const v = r.next();
    const a = v > 0.55 ? (v - 0.55) * 2.2 : 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 0;
    img.data[i * 4 + 3] = Math.floor(a * 255);
  }
  g.putImageData(img, 0, 0);
  grainCache = c;
  return c;
}

let waxCache: HTMLCanvasElement | null = null;
/**
 * Where a crayon's wax skips: short streaks along the stroke direction, where the stick rode
 * over the high points of the plaster, and a few larger bare patches. Coarser than pencil tooth.
 */
export function waxCanvas(): HTMLCanvasElement {
  if (waxCache) return waxCache;
  const [c, g] = canvas(256, 256);
  const r = new Rng(311);
  g.strokeStyle = '#000';
  g.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = r.range(0, 256), y = r.range(0, 256), len = r.range(2, 9), a = r.range(-0.5, 0.2);
    g.globalAlpha = r.range(0.25, 0.9);
    g.lineWidth = r.range(0.6, 1.8);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    g.globalAlpha = r.range(0.15, 0.45);
    g.beginPath();
    g.ellipse(r.range(0, 256), r.range(0, 256), r.range(2, 6), r.range(1, 3), r.range(-0.4, 0.2), 0, Math.PI * 2);
    g.fill();
  }
  waxCache = c;
  return c;
}

// ─────────────────────────────── handwriting ───────────────────────────────

export interface HandStyle {
  font: string;
  weight: number;
  /** Visual scale of the font relative to the nominal letter height (fonts differ). */
  scale: number;
  ink: string;
  opacity: number;
  /** Pencil tooth (0–1). */
  grain: number;
  /** Word-level baseline wobble (fraction of em). */
  wobble: number;
  tracking: number;
  italic?: boolean;
  /**
   * Wax rather than ink: each letter is laid down in a few slightly offset, round-ended passes
   * (blunt, thick, uneven edges), and the wax skips over the plaster's tooth in short streaks.
   */
  waxy?: boolean;
}

export const HANDS: Record<Hand, HandStyle> = {
  pencil: { font: 'Reenie Beanie', weight: 400, scale: 1.45, ink: '#3c3c42', opacity: 0.8, grain: 0.42, wobble: 0.05, tracking: 0 },
  faint: { font: 'Reenie Beanie', weight: 400, scale: 1.45, ink: '#64676e', opacity: 0.5, grain: 0.55, wobble: 0.05, tracking: 0 },
  pen: { font: 'Caveat', weight: 500, scale: 1.15, ink: '#1f2a44', opacity: 0.86, grain: 0.1, wobble: 0.03, tracking: 0 },
  marker: { font: 'Caveat', weight: 700, scale: 1.15, ink: '#18181a', opacity: 0.9, grain: 0.06, wobble: 0.03, tracking: 0 },
  typed: { font: 'Cormorant Garamond', weight: 600, scale: 1.0, ink: '#26272a', opacity: 0.86, grain: 0.04, wobble: 0, tracking: 0.12 },
  child: { font: 'Nothing You Could Do', weight: 400, scale: 1.0, ink: '#404046', opacity: 0.78, grain: 0.35, wobble: 0.09, tracking: 0.02 },
  crayon: { font: 'Caveat', weight: 600, scale: 1.2, ink: '#a9702f', opacity: 0.9, grain: 0.34, wobble: 0.04, tracking: 0, waxy: true },
  cyan: { font: 'Reenie Beanie', weight: 400, scale: 1.45, ink: '#4f8794', opacity: 0.7, grain: 0.45, wobble: 0.05, tracking: 0 },
  visitor: { font: 'Caveat', weight: 400, scale: 1.2, ink: '#2b2e35', opacity: 0.84, grain: 0.18, wobble: 0.04, tracking: 0 },
};

/** Nominal letter height (metres) per size. */
export const SIZE_EM: Record<Size, number> = { xs: 0.06, s: 0.095, m: 0.14, l: 0.21, xl: 0.3 };

/** Maximum line width before wrapping (metres). */
const WRAP: Record<Size, number> = { xs: 1.1, s: 1.6, m: 2.1, l: 2.6, xl: 3.0 };

export const FONTS_TO_LOAD = [
  '400 32px "Reenie Beanie"',
  '400 32px "Caveat"',
  '500 32px "Caveat"',
  '600 32px "Caveat"',
  '700 32px "Caveat"',
  '600 32px "Cormorant Garamond"',
  '400 32px "Nothing You Could Do"',
];

let measureCtx: CanvasRenderingContext2D | null = null;
function mctx() {
  if (!measureCtx) measureCtx = canvas(8, 8)[1];
  return measureCtx;
}

function fontString(st: HandStyle, px: number) {
  return `${st.italic ? 'italic ' : ''}${st.weight} ${px}px "${st.font}", "Segoe Print", "Bradley Hand", cursive`;
}

function wrap(text: string, st: HandStyle, px: number, maxPx: number): string[] {
  const g = mctx();
  g.font = fontString(st, px);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width + test.length * st.tracking * px > maxPx && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Metres-per-pixel of the text canvases. */
const PX_PER_M = 700;
const LINE = 1.18;

/** `wrapM` overrides the size's usual line length (metres). */
export function measureText(text: string, hand: Hand, size: Size, wrapM = WRAP[size]): { w: number; h: number } {
  const st = HANDS[hand];
  const px = SIZE_EM[size] * st.scale * PX_PER_M;
  const lines = wrap(text, st, px, wrapM * PX_PER_M);
  const g = mctx();
  g.font = fontString(st, px);
  let max = 0;
  // Drawn spaces run up to 1.2× and the last glyph can overhang its advance: room for both.
  const space = g.measureText(' ').width;
  for (const l of lines) max = Math.max(max, g.measureText(l).width + l.length * st.tracking * px + px * 0.12 + 0.3 * space * (l.split(' ').length - 1));
  return { w: (max + px * 0.3) / PX_PER_M, h: (lines.length * px * LINE + px * 0.35) / PX_PER_M };
}

/**
 * Draw a phrase as it might have been written on a wall: words sit on a slightly
 * wandering baseline; pencil has tooth; pressure varies a little along the line.
 *
 * The texture's alpha is the ink. Its red channel is *when* the hand reaches each pixel,
 * as a fraction of the time the whole piece takes to write (stroke order: strokes.ts; pace:
 * handwriting.ts), so a single uniform lets the shader write it. Built as raw bytes, not a
 * canvas upload: canvas colour is premultiplied, which would corrupt the timing at the soft
 * edges of the ink. The ink's colour comes from the material.
 */
export interface TextBake {
  tex: THREE.DataTexture;
  w: number;
  h: number;
  /** The hand's own time for each word (seconds), including dots and bars added after it. */
  words: [number, number][];
  /** Seconds from the first stroke to the last. */
  duration: number;
}

export function textTexture(text: string, hand: Hand, size: Size, key: string, maxTexPx = 2048, wrapM = WRAP[size]): TextBake {
  const st = HANDS[hand];
  const m = measureText(text, hand, size, wrapM);
  const tm = handTiming(text, hand, key);
  let scale = 1;
  const wantW = m.w * PX_PER_M, wantH = m.h * PX_PER_M;
  if (wantW > maxTexPx) scale = maxTexPx / wantW;
  const W = Math.max(8, Math.ceil(wantW * scale));
  const H = Math.max(8, Math.ceil(wantH * scale));
  const [, g] = canvas(W, H, true);
  const px = SIZE_EM[size] * st.scale * PX_PER_M * scale;
  const lines = wrap(text, st, SIZE_EM[size] * st.scale * PX_PER_M, wrapM * PX_PER_M);
  const r = new Rng(hashString(key));
  g.font = fontString(st, px);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineJoin = g.lineCap = 'round';
  // Wax: the letter, then two faint passes a little off it (the stick never lands twice in
  // the same place). Where each was drawn is kept, to rough up its edges afterwards.
  const drawn: { s: string; x: number; y: number; m: DOMMatrix; a: number }[] = [];
  const ink = (s: string, x: number, y: number) => {
    g.fillText(s, x, y);
    if (st.waxy) drawn.push({ s, x, y, m: g.getTransform(), a: g.globalAlpha });
  };
  const ranges = wordRanges(text);
  const boxes: CharBox[] = [];
  let wi = 0;
  let y = px * 1.0;
  for (const line of lines) {
    let x = px * 0.15;
    const words = line.split(' ');
    for (const w of words) {
      g.save();
      const dy = (r.next() - 0.5) * st.wobble * px * 2;
      g.translate(x, y + dy);
      g.rotate((r.next() - 0.5) * st.wobble * 0.6);
      g.globalAlpha = 0.82 + r.next() * 0.18;
      // Where each letter of this word is, for stroke order.
      const i0 = ranges[wi]?.[0] ?? 0;
      let cx = 0;
      for (let k = 0; k < w.length; k++) {
        const cw = st.tracking ? g.measureText(w[k]).width + st.tracking * px : g.measureText(w.slice(0, k + 1)).width - cx;
        boxes.push({ i: i0 + k, x0: x + cx - px * 0.04, x1: x + cx + cw + px * 0.04, yTop: y + dy - px * 1.05, yBottom: y + dy + px * 0.55, base: y + dy, xHeight: px * 0.45, stamp: hand === 'typed' });
        cx += cw;
      }
      if (st.tracking) {
        let cx2 = 0;
        for (const ch of w) {
          ink(ch, cx2, 0);
          cx2 += g.measureText(ch).width + st.tracking * px;
        }
        x += cx2;
      } else {
        ink(w, 0, 0);
        x += g.measureText(w).width;
      }
      g.restore();
      x += g.measureText(' ').width * (0.9 + r.next() * 0.3) + (st.tracking ? st.tracking * px : 0);
      wi++;
    }
    y += px * LINE;
  }
  // Stroke order is worked out from the letters as written, before tooth and wax break them into
  // pieces (and flecks) that would otherwise be written after the word, like dots. Anything
  // added afterwards takes the time of the nearest letter.
  const pre = g.getImageData(0, 0, W, H).data;
  if (drawn.length) {
    // The off passes leave flecks, not a second outline: they are filled through the tooth.
    g.fillStyle = g.createPattern(grainCanvas(), 'repeat')!;
    g.save();
    for (const d of drawn) {
      g.setTransform(d.m);
      g.globalAlpha = d.a * 0.7;
      g.fillText(d.s, d.x + px * 0.025, d.y - px * 0.012);
      g.fillText(d.s, d.x - px * 0.02, d.y + px * 0.02);
    }
    g.restore();
    g.globalAlpha = 1;
  }
  if (st.grain > 0) {
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = st.grain;
    const pat = g.createPattern(grainCanvas(), 'repeat')!;
    g.fillStyle = pat;
    g.save();
    g.translate(r.range(0, 256), r.range(0, 256));
    g.fillRect(-256, -256, W + 512, H + 512);
    g.restore();
    if (st.waxy) {
      const wax = g.createPattern(waxCanvas(), 'repeat')!;
      // Ragged edges: the wax breaks up along the outline, not only inside the letters.
      g.globalAlpha = 0.9;
      g.strokeStyle = wax;
      g.lineWidth = px * 0.05;
      g.save();
      for (const d of drawn) {
        g.setTransform(d.m);
        g.strokeText(d.s, d.x, d.y);
      }
      g.restore();
      // The skips, at a slight slant (the stick held at an angle), coarser than the tooth.
      g.globalAlpha = 0.6;
      g.fillStyle = wax;
      g.save();
      g.rotate(r.range(-0.12, 0.05));
      const k = Math.min(1.6, Math.max(0.6, px / 70));
      g.scale(k, k);
      g.translate(r.range(0, 256), r.range(0, 256));
      g.fillRect(-512, -512, W * 2 + 1024, H * 2 + 1024);
      g.restore();
      // Pressure that comes and goes along the line (about every 0.6 em): this survives distance.
      const grad = g.createLinearGradient(0, 0, W, 0);
      const n = Math.max(2, Math.ceil(W / (px * 0.6)));
      for (let i = 0; i <= n; i++) grad.addColorStop(i / n, `rgba(0,0,0,${r.range(0, 0.15).toFixed(3)})`);
      g.globalAlpha = 1;
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
  const img = g.getImageData(0, 0, W, H).data;
  const alpha = new Uint8Array(W * H);
  const whole = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    alpha[p] = img[p * 4 + 3];
    whole[p] = pre[p * 4 + 3];
  }
  const wordIx = new Int32Array(text.length).fill(0);
  ranges.forEach(([a, b], k) => wordIx.fill(k, a, b));
  const bake = bakeStrokes(whole, W, H, boxes, tm, (i) => wordIx[i]);
  const dur = Math.max(1e-3, bake.duration);
  // Rows flipped: a DataTexture's first row is the bottom of the image.
  const data = new Uint8Array(W * H * 4);
  for (let yy = 0; yy < H; yy++) {
    const src = yy * W, dst = (H - 1 - yy) * W;
    for (let xx = 0; xx < W; xx++) {
      const o = (dst + xx) * 4;
      data[o] = Math.round(Math.min(1, Math.max(0, bake.time[src + xx] / dur)) * 255);
      data[o + 3] = alpha[src + xx];
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  // Raw values: red is timing, not colour.
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, w: m.w, h: m.h, words: bake.words, duration: bake.duration };
}

/** A hand-drawn pencil line (for links and strike-throughs), horizontal, unit length. */
export function pencilLineTexture(seed: number): THREE.CanvasTexture {
  const W = 1024, H = 32;
  const [c, g] = canvas(W, H);
  const r = new Rng(seed);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.lineWidth = r.range(1.6, 2.6);
    g.globalAlpha = pass ? 0.45 : 0.9;
    g.beginPath();
    let y = H / 2 + r.range(-2, 2);
    g.moveTo(r.range(2, 12), y);
    for (let x = 0; x <= W; x += 32) {
      y += r.range(-0.8, 0.8);
      y = Math.max(8, Math.min(H - 8, y));
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 0.4;
  g.fillStyle = g.createPattern(grainCanvas(), 'repeat')!;
  g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
