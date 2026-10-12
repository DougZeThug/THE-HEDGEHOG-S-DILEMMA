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

export interface SurfaceTextures {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

/**
 * Plaster/paper surface: off-white, low-frequency blotches, corner shading (a cheap stand-in
 * for bounce occlusion), old tape marks, eraser ghosts, a few pinholes.
 */
export function plasterTextures(seed: number, wM: number, hM: number, opts: { tone?: [number, number, number]; floor?: boolean; ceiling?: boolean } = {}): SurfaceTextures {
  const pxPerM = 200;
  const W = Math.min(2048, Math.round(wM * pxPerM));
  const H = Math.min(2048, Math.round(hM * pxPerM));
  const [c, g] = canvas(W, H);
  const r = new Rng(seed);
  const [tr, tg, tb] = opts.tone ?? [236, 234, 229];
  g.fillStyle = `rgb(${tr},${tg},${tb})`;
  g.fillRect(0, 0, W, H);

  // broad, soft tonal variation
  for (let i = 0; i < 26; i++) {
    const x = r.range(0, W), y = r.range(0, H), rad = r.range(80, 420);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const warm = r.chance(0.5);
    const col = warm ? '214,205,190' : '200,203,206';
    grd.addColorStop(0, `rgba(${col},${r.range(0.03, 0.08)})`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fibres
  g.globalAlpha = 0.05;
  const pat = g.createPattern(grainCanvas(), 'repeat')!;
  g.fillStyle = pat;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;

  if (!opts.floor && !opts.ceiling) {
    // eraser ghosts: faint grey smears where something was written and rubbed out
    for (let i = 0; i < 14; i++) {
      const x = r.range(0.05, 0.95) * W, y = r.range(0.2, 0.85) * H;
      g.save();
      g.translate(x, y);
      g.rotate(r.range(-0.2, 0.2));
      g.filter = 'blur(6px)';
      g.fillStyle = `rgba(120,120,125,${r.range(0.012, 0.03)})`;
      g.fillRect(-r.range(30, 110), -r.range(6, 14), r.range(60, 220), r.range(10, 26));
      g.restore();
    }
    g.filter = 'none';
    // old tape marks
    for (let i = 0; i < 4; i++) {
      const x = r.range(0.05, 0.95) * W, y = r.range(0.15, 0.9) * H;
      g.save();
      g.translate(x, y);
      g.rotate(r.range(-0.6, 0.6));
      g.fillStyle = `rgba(200,180,140,${r.range(0.05, 0.1)})`;
      g.fillRect(-14, -5, 28, 10);
      g.restore();
    }
    // pinholes
    for (let i = 0; i < 9; i++) {
      g.fillStyle = 'rgba(70,70,70,0.35)';
      g.beginPath();
      g.arc(r.range(0, W), r.range(0.2, 0.8) * H, 0.9, 0, Math.PI * 2);
      g.fill();
    }
    // corner occlusion — floor and ceiling junctions, wall corners
    const edge = (x0: number, y0: number, x1: number, y1: number, a: number) => {
      const grd = g.createLinearGradient(x0, y0, x1, y1);
      grd.addColorStop(0, `rgba(120,118,112,${a})`);
      grd.addColorStop(1, 'rgba(120,118,112,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    };
    edge(0, H, 0, H - 0.5 * pxPerM, 0.22);
    edge(0, 0, 0, 0.35 * pxPerM, 0.16);
    edge(0, 0, 0.4 * pxPerM, 0, 0.15);
    edge(W, 0, W - 0.4 * pxPerM, 0, 0.15);
    // scuffs near the skirting
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(90,88,84,${r.range(0.03, 0.08)})`;
      g.fillRect(r.range(0, W), H - r.range(8, 50), r.range(4, 30), r.range(1, 3));
    }
  } else if (opts.floor) {
    // painted boards, barely there
    const board = 0.18 * pxPerM;
    for (let x = r.range(0, board); x < W; x += board) {
      g.fillStyle = `rgba(150,145,138,${r.range(0.05, 0.09)})`;
      g.fillRect(x, 0, 1.2, H);
    }
    // the floor is darker towards the walls
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(110,105,98,0.18)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    // worn patch around where the chair has been moved, again and again
    for (let i = 0; i < 40; i++) {
      const a = r.range(0, Math.PI * 2), d = r.range(0.1, 0.5) * pxPerM;
      g.fillStyle = `rgba(110,104,96,${r.range(0.02, 0.06)})`;
      g.save();
      g.translate(W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d);
      g.rotate(r.range(0, Math.PI));
      g.fillRect(-r.range(4, 18), -0.8, r.range(8, 36), 1.6);
      g.restore();
    }
  } else {
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(120,118,112,0.16)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  // bump: plaster tooth
  const [bc, bg] = canvas(512, 512);
  const bimg = bg.createImageData(512, 512);
  const br = new Rng(seed + 7);
  for (let i = 0; i < 512 * 512; i++) {
    const v = 128 + (br.next() - 0.5) * 40;
    bimg.data[i * 4] = bimg.data[i * 4 + 1] = bimg.data[i * 4 + 2] = v;
    bimg.data[i * 4 + 3] = 255;
  }
  bg.putImageData(bimg, 0, 0);
  bg.filter = 'blur(1px)';
  bg.drawImage(bc, 0, 0);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(bc);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(wM / 1.2, hM / 1.2);
  return { map, bump };
}

/** Wood grain for the chair: warm, honey-brown, slightly worn. */
export function woodTexture(seed = 5): THREE.CanvasTexture {
  const W = 512, H = 512;
  const [c, g] = canvas(W, H);
  const r = new Rng(seed);
  const base = g.createLinearGradient(0, 0, W, 0);
  base.addColorStop(0, '#6e5038');
  base.addColorStop(0.5, '#7a5a40');
  base.addColorStop(1, '#684a32');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    let x = r.range(0, W);
    const dark = r.chance(0.6);
    g.strokeStyle = dark ? `rgba(60,34,16,${r.range(0.08, 0.28)})` : `rgba(200,150,95,${r.range(0.05, 0.16)})`;
    g.lineWidth = r.range(0.6, 3.2);
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= H; y += 16) {
      x += Math.sin(y * 0.02 + i) * r.range(0.2, 1.4);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // a couple of knots
  for (let k = 0; k < 2; k++) {
    const x = r.range(60, W - 60), y = r.range(60, H - 60);
    for (let j = 8; j > 0; j--) {
      g.strokeStyle = `rgba(60,32,14,${0.06 + j * 0.01})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(x, y, j * 2.2, j * 5.5, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.globalAlpha = 0.18;
  g.fillStyle = g.createPattern(grainCanvas(), 'repeat')!;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
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
