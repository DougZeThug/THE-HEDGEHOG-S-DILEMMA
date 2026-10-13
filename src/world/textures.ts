import * as THREE from 'three';
import { Rng, hashString } from '../core/rng';
import type { Hand, Size } from '../content/types';

/** Procedural canvases: plaster, paper, painted floor, wood grain, handwriting. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
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
}

export const HANDS: Record<Hand, HandStyle> = {
  pencil: { font: 'Reenie Beanie', weight: 400, scale: 1.45, ink: '#3c3c42', opacity: 0.8, grain: 0.42, wobble: 0.05, tracking: 0 },
  faint: { font: 'Reenie Beanie', weight: 400, scale: 1.45, ink: '#64676e', opacity: 0.5, grain: 0.55, wobble: 0.05, tracking: 0 },
  pen: { font: 'Caveat', weight: 500, scale: 1.15, ink: '#1f2a44', opacity: 0.86, grain: 0.1, wobble: 0.03, tracking: 0 },
  marker: { font: 'Caveat', weight: 700, scale: 1.15, ink: '#18181a', opacity: 0.9, grain: 0.06, wobble: 0.03, tracking: 0 },
  typed: { font: 'Cormorant Garamond', weight: 600, scale: 1.0, ink: '#26272a', opacity: 0.86, grain: 0.04, wobble: 0, tracking: 0.12 },
  child: { font: 'Nothing You Could Do', weight: 400, scale: 1.0, ink: '#404046', opacity: 0.78, grain: 0.35, wobble: 0.09, tracking: 0.02 },
  crayon: { font: 'Caveat', weight: 600, scale: 1.2, ink: '#a9702f', opacity: 0.82, grain: 0.38, wobble: 0.04, tracking: 0 },
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

export function measureText(text: string, hand: Hand, size: Size): { w: number; h: number } {
  const st = HANDS[hand];
  const px = SIZE_EM[size] * st.scale * PX_PER_M;
  const lines = wrap(text, st, px, WRAP[size] * PX_PER_M);
  const g = mctx();
  g.font = fontString(st, px);
  let max = 0;
  for (const l of lines) max = Math.max(max, g.measureText(l).width + l.length * st.tracking * px);
  return { w: (max + px * 0.3) / PX_PER_M, h: (lines.length * px * LINE + px * 0.35) / PX_PER_M };
}

/**
 * Draw a phrase as it might have been written on a wall: words sit on a slightly
 * wandering baseline; pencil has tooth; pressure varies a little along the line.
 * Returns a white-on-transparent texture (tinted by the material colour).
 */
export function textTexture(text: string, hand: Hand, size: Size, key: string, maxTexPx = 2048): { tex: THREE.CanvasTexture; w: number; h: number } {
  const st = HANDS[hand];
  const m = measureText(text, hand, size);
  let scale = 1;
  const wantW = m.w * PX_PER_M, wantH = m.h * PX_PER_M;
  if (wantW > maxTexPx) scale = maxTexPx / wantW;
  const W = Math.max(8, Math.ceil(wantW * scale));
  const H = Math.max(8, Math.ceil(wantH * scale));
  const [c, g] = canvas(W, H);
  const px = SIZE_EM[size] * st.scale * PX_PER_M * scale;
  const lines = wrap(text, st, SIZE_EM[size] * st.scale * PX_PER_M, WRAP[size] * PX_PER_M);
  const r = new Rng(hashString(key));
  g.font = fontString(st, px);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
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
      if (st.tracking) {
        let cx = 0;
        for (const ch of w) {
          g.fillText(ch, cx, 0);
          cx += g.measureText(ch).width + st.tracking * px;
        }
        x += cx;
      } else {
        g.fillText(w, 0, 0);
        x += g.measureText(w).width;
      }
      g.restore();
      x += g.measureText(' ').width * (0.9 + r.next() * 0.3) + (st.tracking ? st.tracking * px : 0);
    }
    y += px * LINE;
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
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, w: m.w, h: m.h };
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
