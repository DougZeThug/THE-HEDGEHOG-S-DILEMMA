/**
 * The woodland memory's recorded sound, laid along its own timeline offline: the generated takes
 * (audition/woodland/, scripts/generate-woodland.mjs) shaped into the stems the memory plays
 * (public/music/woodland-*.mp3), each at a level of its own (the cue sheet sets each one's place
 * in the mix, measured: src/memory/defs.ts). Decisions 71–74 of docs/reviews/2026-10-woodland.md.
 *
 *   woodland-air.mp3            0–47 s: the wind in the leaves and the long grass, one file across
 *                               the cut. A take is levelled (its own bursts taken out), then given
 *                               the painting's air: its breeze (BREEZE_KEYS), its gust where the
 *                               leaves are seen to sway, from the left (`heard`, `leavesPan`), less
 *                               of it beyond the wall, and gone with the painting. A little warmth
 *                               under it (the clearing had nothing between 150 and 500 Hz).
 *   woodland-evening.mp3        from the cut (34.5 s): the evening cicadas already singing, far
 *                               (a forest's tail, the top softened), receding into the wall with
 *                               the painting (43–46.5).
 *   woodland-air-empty.mp3, woodland-evening-empty.mp3   the revisit's (the empty clearing alone).
 *   woodland-bird-1.mp3, -2     two far birds: one short phrase each, placed by the cue sheet.
 *
 *   npx vite-node scripts/woodland-stems.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BREEZE_KEYS, CUT } from '../src/memory/defs';
import { heard, leavesPan } from '../src/memory/synthWoods';

const RATE = 48000;
const TAKES = 'audition/woodland';
const OUT = 'public/music';

type Stereo = [Float32Array, Float32Array];

function decode(file: string): Stereo {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(RATE), '-'], { maxBuffer: 1 << 30 });
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const l = new Float32Array(all.length / 2), r = new Float32Array(all.length / 2);
  for (let i = 0; i < l.length; i++) (l[i] = all[2 * i]), (r[i] = all[2 * i + 1]);
  return [l, r];
}

/** Written as an MP3 (LAME's gapless header, so a decoder drops its priming). */
function encode(name: string, [l, r]: Stereo): void {
  const tmp = join(tmpdir(), `${name}.f32`);
  const inter = new Float32Array(l.length * 2);
  for (let i = 0; i < l.length; i++) (inter[2 * i] = l[i]), (inter[2 * i + 1] = r[i]);
  writeFileSync(tmp, Buffer.from(inter.buffer));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', '192k', join(OUT, `${name}.mp3`)]);
  rmSync(tmp);
  console.log(`${OUT}/${name}.mp3: ${(l.length / RATE).toFixed(2)} s`);
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const curve = (pts: [number, number][], t: number) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * smooth(pts[i - 1][0], pts[i][0], t);
  return pts[pts.length - 1][1];
};

/** An RBJ biquad, in place. */
function biquad(x: Float32Array, type: 'lowpass' | 'highpass' | 'peak' | 'highshelf', f: number, q: number, gainDb = 0): void {
  const w = (2 * Math.PI * f) / RATE, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), A = Math.pow(10, gainDb / 40);
  let c: number[];
  if (type === 'lowpass') c = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al];
  else if (type === 'highpass') c = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al];
  else if (type === 'peak') c = [1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A];
  else {
    const s = 2 * Math.sqrt(A) * al;
    c = [A * (A + 1 + (A - 1) * cw + s), -2 * A * (A - 1 + (A + 1) * cw), A * (A + 1 + (A - 1) * cw - s), A + 1 - (A - 1) * cw + s, 2 * (A - 1 - (A + 1) * cw), A + 1 - (A - 1) * cw - s];
  }
  const [b0, b1, b2, a0, a1, a2] = c.map((v) => v / c[3]);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
}

/** A lowpass whose corner moves (`f(t)`, Hz), in blocks of 64 samples, its state carried. */
function sweep(x: Float32Array, f: (t: number) => number, from: number): void {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i0 = 0; i0 < x.length; i0 += 64) {
    const fc = Math.min(RATE * 0.45, f(from + i0 / RATE));
    const w = (2 * Math.PI * fc) / RATE, cw = Math.cos(w), al = Math.sin(w) / (2 * 0.707);
    const a0 = 1 + al, b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, a1 = (-2 * cw) / a0, a2 = (1 - al) / a0;
    for (let i = i0; i < Math.min(x.length, i0 + 64); i++) {
      const y = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = y;
      x[i] = y;
    }
  }
}

const rms = (x: Float32Array, a = 0, b = x.length) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const slice = ([l, r]: Stereo, a: number, b: number): Stereo => [l.slice(Math.round(a * RATE), Math.round(b * RATE)), r.slice(Math.round(a * RATE), Math.round(b * RATE))];
/** The two channels' RMS brought to `db` dBFS (measured over [a, b) seconds, or all). */
function level(s: Stereo, db: number, a?: number, b?: number): void {
  const i0 = a === undefined ? 0 : Math.round(a * RATE), i1 = b === undefined ? s[0].length : Math.round(b * RATE);
  const k = Math.pow(10, db / 20) / Math.max(1e-9, Math.sqrt((rms(s[0], i0, i1) ** 2 + rms(s[1], i0, i1) ** 2) / 2));
  for (const c of s) for (let i = 0; i < c.length; i++) c[i] *= k;
}

/**
 * A take's own swells and lulls taken out (its level over a second, divided out, within ±10 dB),
 * so the air it carries is the painting's, not the take's.
 */
function levelled(s: Stereo, win = RATE / 2): Stereo {
  const n = s[0].length, hop = 480;
  const pts: number[] = [];
  for (let i = 0; i < n; i += hop) {
    const a = Math.max(0, i - win / 2), b = Math.min(n, i + win / 2);
    pts.push(Math.sqrt((rms(s[0], a, b) ** 2 + rms(s[1], a, b) ** 2) / 2));
  }
  const target = pts.slice().sort((a, b) => a - b)[Math.floor(pts.length / 2)];
  const out: Stereo = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const j = i / hop, j0 = Math.floor(j), f = j - j0;
    const e = pts[Math.min(pts.length - 1, j0)] * (1 - f) + pts[Math.min(pts.length - 1, j0 + 1)] * f;
    const g = Math.min(3.16, Math.max(0.316, target / Math.max(1e-9, e)));
    out[0][i] = s[0][i] * g;
    out[1][i] = s[1][i] * g;
  }
  return out;
}

/** Two takes laid end to end, crossfaded (equal power) over `fade` seconds at `at`. */
function join2(a: Stereo, b: Stereo, at: number, fade: number, length: number): Stereo {
  const n = Math.round(length * RATE), i0 = Math.round((at - fade / 2) * RATE), k = Math.round(fade * RATE);
  const out: Stereo = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const u = Math.min(1, Math.max(0, (i - i0) / k));
    const ga = Math.cos((u * Math.PI) / 2), gb = Math.sin((u * Math.PI) / 2);
    for (let c = 0; c < 2; c++) {
      const va = i < a[c].length ? a[c][i] : 0;
      const jb = i - i0;
      const vb = jb >= 0 && jb < b[c].length ? b[c][jb] : 0;
      out[c][i] = va * ga + vb * gb;
    }
  }
  return out;
}

/**
 * A small forest's tail (`seconds` to fall 60 dB), mixed under at `wetDb`: four damped combs and two
 * allpasses a channel (Schroeder–Moorer), each channel's delays its own, so the tail is wide.
 */
function forest(s: Stereo, seconds: number, wetDb: number): Stereo {
  const out: Stereo = [s[0].slice(), s[1].slice()];
  const wet = Math.pow(10, wetDb / 20);
  const combs = [[1557, 1617, 1491, 1422], [1601, 1559, 1453, 1381]];
  const alls = [[556, 441], [579, 427]];
  for (let c = 0; c < 2; c++) {
    const x = s[c], y = new Float32Array(x.length);
    for (const d0 of combs[c]) {
      const d = Math.round((d0 * RATE) / 44100);
      const g = Math.pow(10, (-3 * d) / RATE / seconds);
      const buf = new Float32Array(d);
      let p = 0, lp = 0;
      for (let i = 0; i < x.length; i++) {
        const o = buf[p];
        lp = o * 0.6 + lp * 0.4; // (damped: the tail darker than the call)
        buf[p] = x[i] + lp * g;
        y[i] += o * 0.25;
        if (++p === d) p = 0;
      }
    }
    for (const d0 of alls[c]) {
      const d = Math.round((d0 * RATE) / 44100), buf = new Float32Array(d);
      let p = 0;
      for (let i = 0; i < y.length; i++) {
        const o = buf[p], v = y[i] + 0.5 * o;
        buf[p] = v;
        y[i] = o - 0.5 * v;
        if (++p === d) p = 0;
      }
    }
    // The tail at `wetDb` under the dry, by energy.
    const k = (wet * rms(x)) / Math.max(1e-9, rms(y));
    for (let i = 0; i < x.length; i++) out[c][i] += y[i] * k;
  }
  return out;
}

const fadeEnds = (s: Stereo, inS: number, outS: number) => {
  const n = s[0].length, a = Math.round(inS * RATE), b = Math.round(outS * RATE);
  for (const c of s) {
    for (let i = 0; i < a; i++) c[i] *= i / a;
    for (let i = 0; i < b; i++) c[n - 1 - i] *= i / b;
  }
};

mkdirSync(OUT, { recursive: true });

// ── The afternoon's air (memory time = file time, 0–47 s) ─────────────────────
{
  // The second take for the wall, the crossing and the gust; the first, from its evenest stretch,
  // across the cut (14–24 s of it fall on 31–41 s), so that nothing in the air marks the cut.
  const A = levelled(decode(`${TAKES}/woodland-air-2.mp3`)), B = slice(levelled(decode(`${TAKES}/woodland-air-1.mp3`)), 3, 30);
  const air = join2(A, B, 21, 2, 47);
  // (Its top softened and its body brought up: the takes are bright, close rustle, and the
  // afternoon's warmth is in the low middle; a little room left for the piano's tune, 600–1200 Hz.)
  for (const c of air) {
    biquad(c, 'highpass', 90, 0.7);
    biquad(c, 'peak', 300, 0.8, 10);
    biquad(c, 'peak', 850, 1, -3);
    biquad(c, 'highshelf', 5000, 0.7, -6);
  }
  // (−36 dBFS on the breeze alone: the gust, half again its weight, peaks a few dB under full scale.)
  level(air, -36);
  const open = (t: number) => 0.25 + 0.75 * smooth(6.5, 10.5, t);
  const going = (t: number) => 1 - smooth(43, 45, t);
  // As the leaves were (synthWoods): the breeze, and a gust of half again its weight over it.
  const env = (t: number) => (0.15 * curve(BREEZE_KEYS, t) + 0.5 * Math.pow(heard(t).strength, 1.5)) / 0.15 * open(t) * going(t);
  for (let i = 0; i < air[0].length; i++) {
    const t = i / RATE, g = env(t), pan = leavesPan(t) * 0.6;
    air[0][i] *= g * Math.sqrt(1 - pan);
    air[1][i] *= g * Math.sqrt(1 + pan);
  }
  fadeEnds(air, 0.05, 0.05);
  encode('woodland-air', air);
}

// ── The evening, from the cut (file 0 = memory 34.5) ─────────────────────────
{
  const from = 3.0, len = 47 - CUT;
  const eve = forest(slice(decode(`${TAKES}/woodland-evening-1.mp3`), from, from + len), 1.8, -14);
  // Further off than the take: its top softened; it goes back into the wall with the painting
  // (43–46.5 memory s: the top closing to 2.5 kHz as it goes).
  for (const c of eve) sweep(c, (t) => 7000 * Math.pow(2500 / 7000, smooth(43, 46.5, t)), CUT);
  level(eve, -23, 0, 6);
  for (let i = 0; i < eve[0].length; i++) {
    const g = 1 - smooth(43, 46.5, CUT + i / RATE);
    eve[0][i] *= g;
    eve[1][i] *= g;
  }
  fadeEnds(eve, 0, 0.05);
  encode('woodland-evening', eve);
}

// ── The revisit: the empty clearing at dusk, on the wall (its own 0–21 s) ──────
{
  const eve = forest(slice(decode(`${TAKES}/woodland-evening-2.mp3`), 2.0, 23.0), 1.8, -14);
  for (const c of eve) biquad(c, 'lowpass', 7000, 0.707);
  level(eve, -23, 2, 8);
  for (let i = 0; i < eve[0].length; i++) {
    const t = i / RATE, g = smooth(0.5, 2.5, t) * (1 - smooth(16, 20, t));
    eve[0][i] *= g;
    eve[1][i] *= g;
  }
  encode('woodland-evening-empty', eve);
  const air = slice(levelled(decode(`${TAKES}/woodland-air-2.mp3`)), 4, 25);
  for (const c of air) {
    biquad(c, 'highpass', 90, 0.7);
    biquad(c, 'peak', 300, 0.8, 10);
    biquad(c, 'highshelf', 5000, 0.7, -6);
  }
  level(air, -30);
  for (let i = 0; i < air[0].length; i++) {
    // The evening's calm (as after the cut: 0.3 of the afternoon's breeze).
    const t = i / RATE, g = (0.3 * smooth(0.5, 2.5, t) * (1 - smooth(16, 20, t)));
    air[0][i] *= g;
    air[1][i] *= g;
  }
  encode('woodland-air-empty', air);
}

// ── Two far birds: one phrase each ───────────────────────────────────────────
for (const [name, file, a, b] of [['woodland-bird-1', 'woodland-bird-2.mp3', 0.35, 1.4], ['woodland-bird-2', 'woodland-bird-3.mp3', 0.1, 1.75]] as const) {
  const s = slice(decode(`${TAKES}/${file}`), a, b);
  fadeEnds(s, 0.01, 0.1);
  level(s, -20);
  encode(name, s);
}
