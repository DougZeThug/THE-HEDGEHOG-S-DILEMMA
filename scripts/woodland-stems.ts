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
 *                               (slices of the takes, wide, each swelling on its own; a forest's
 *                               tail, the top softened), receding into the wall with the painting.
 *   woodland-air-empty.mp3, woodland-evening-empty.mp3   the revisit's (the empty clearing alone).
 *   woodland-bird-1.mp3, -2     two far birds: a phrase each, placed by the cue sheet.
 *   woodland-cicada-last.mp3    one evening cicada heard from the white room after: the evening's own.
 *
 * Every take has its generator's hum (200 Hz and its multiples) taken out first; a stem with a line
 * left standing is refused.
 *
 *   npx vite-node scripts/woodland-stems.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BREEZE_KEYS, EVENING_AT, EVENING_OFFSET } from '../src/memory/defs';
import { heard, leavesPan } from '../src/memory/synthWoods';

const RATE = 48000;
const TAKES = 'audition/woodland';
const OUT = 'public/music';

type Stereo = [Float32Array, Float32Array];

/**
 * A take as stereo float at 48 kHz, its generator's hum taken out first: every sound-generation take
 * carries a steady line at 200 Hz and its multiples, 14–32 dB over the noise round it, which warming
 * the wind had raised to a fifth of its energy (the sound designer's evaluation, 2026-10-19).
 */
function decode(file: string, dehum = true): Stereo {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(RATE), '-'], { maxBuffer: 1 << 30 });
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const l = new Float32Array(all.length / 2), r = new Float32Array(all.length / 2);
  for (let i = 0; i < l.length; i++) (l[i] = all[2 * i]), (r[i] = all[2 * i + 1]);
  if (dehum) for (const c of [l, r]) for (let k = 1; k <= 6; k++) biquad(c, 'notch', 200 * k, 40);
  return [l, r];
}

/** How far a steady line at `f` Hz stands over the noise either side of it (dB; Goertzel). */
function lineDb(x: Float32Array, f: number): number {
  const power = (fr: number) => {
    const w = (2 * Math.PI * fr) / RATE, c = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < x.length; i++) {
      const s0 = x[i] + c * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    return s1 * s1 + s2 * s2 - c * s1 * s2;
  };
  const around = [-30, -24, -18, 18, 24, 30].map((d) => power(f + d));
  return 10 * Math.log10(power(f) / (around.reduce((a, b) => a + b, 0) / around.length));
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
function biquad(x: Float32Array, type: 'lowpass' | 'highpass' | 'peak' | 'highshelf' | 'notch', f: number, q: number, gainDb = 0): void {
  const w = (2 * Math.PI * f) / RATE, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), A = Math.pow(10, gainDb / 40);
  let c: number[];
  if (type === 'lowpass') c = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al];
  else if (type === 'notch') c = [1, -2 * cw, 1, 1 + al, -2 * cw, 1 - al];
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
 * A take's own swells and lulls brought in toward its middle level by `strength(t)` of the way (in
 * dB: 0.6 keeps four tenths of its movement; 1 levels it), its level over `win` samples, within
 * ±10 dB: so that the air it carries is the painting's, moving a little of its own (levelled
 * whole, it was filtered noise: the sound designer's evaluation, 2026-10-19).
 */
function levelled(s: Stereo, strength: (t: number) => number = () => 1, win = RATE): Stereo {
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
    const full = Math.min(3.16, Math.max(0.316, target / Math.max(1e-9, e)));
    const g = Math.pow(full, strength(i / RATE));
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
  // across the cut (14–24 s of it fall on 31–41 s). Each take brought to the same middle level
  // first, then the whole kept to four tenths of its own movement, but level across the cut (no
  // swell marks it) and through both looks (none crests on them).
  const A = levelled(decode(`${TAKES}/woodland-air-2.mp3`), () => 0.5), B = slice(levelled(decode(`${TAKES}/woodland-air-1.mp3`), () => 0.5), 3, 30);
  level(A, -36);
  level(B, -36);
  const still = (t: number, [a, b]: [number, number]) => smooth(a - 0.5, a, t) * (1 - smooth(b, b + 0.5, t));
  const strength = (t: number) => 0.6 + 0.4 * Math.max(still(t, [31.5, 38]), still(t, [17.0, 19.2]), still(t, [23.5, 25.0]));
  const air = levelled(join2(A, B, 21, 2, 47), strength);
  // (Its top softened and its body brought up: the takes are bright, close rustle, and the
  // afternoon's warmth is in the low middle; a little room left for the piano's tune, 600–1200 Hz.)
  for (const c of air) {
    biquad(c, 'highpass', 90, 0.7);
    biquad(c, 'peak', 300, 0.8, 12.5);
    biquad(c, 'peak', 850, 1, -3);
    biquad(c, 'highshelf', 5000, 0.7, -9);
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

/**
 * The evening's cicadas, far off in the trees, from slices of the takes (each a dense chorus at
 * one pitch, the same in both ears): two different slices in each ear, each swelling slowly on its
 * own (±3 dB over 4–8 s, out of step), so that it is wide and moves, never one band standing still;
 * a fuller forest round it (its tail 8 dB under), its top softened. `from` is the memory time of
 * the stem's first sample; it goes back into the wall with the painting (43–46.5 memory s).
 */
function evening(len: number, from: number, recede: boolean): Stereo {
  const takes = { a: decode(`${TAKES}/woodland-dusk-3.mp3`), b: decode(`${TAKES}/woodland-evening-1.mp3`), c: decode(`${TAKES}/woodland-dusk-2.mp3`) };
  const parts: [keyof typeof takes, number, number, number, number, number][] = [
    // [take, from (s), channel, gain, swell period (s), phase]
    ['a', 3.0, 0, 1.0, 6.3, 0.0],
    ['b', 9.5, 0, 0.7, 4.7, 2.1],
    ['a', 10.5, 1, 1.0, 7.4, 4.0],
    ['c', 4.0, 1, 0.7, 5.3, 1.2],
  ];
  const n = Math.round(len * RATE);
  const out: Stereo = [new Float32Array(n), new Float32Array(n)];
  for (const [k, at, ch, gain, period, phase] of parts) {
    const src = takes[k][0], i0 = Math.round(at * RATE);
    for (let i = 0; i < n && i0 + i < src.length; i++) {
      const t = i / RATE;
      out[ch][i] += src[i0 + i] * gain * Math.pow(10, (3 * Math.sin((2 * Math.PI * t) / period + phase)) / 20);
    }
  }
  const eve = forest(out, 1.8, -8);
  for (const c of eve) {
    if (recede) sweep(c, (t) => 7000 * Math.pow(2500 / 7000, smooth(43, 46.5, t)), from);
    else biquad(c, 'lowpass', 7000, 0.707);
  }
  level(eve, -23, 0, 6);
  return eve;
}

// ── The evening, from the cut ────────────────────────────────────────────────
{
  // (The cue begins 40 ms before the cut and is full on it, `EVENING_OFFSET` into its file.)
  const from = EVENING_AT - EVENING_OFFSET;
  const eve = evening(47 - from, from, true);
  for (let i = 0; i < eve[0].length; i++) {
    const g = 1 - smooth(43, 46.5, from + i / RATE);
    eve[0][i] *= g;
    eve[1][i] *= g;
  }
  fadeEnds(eve, 0, 0.05);
  encode('woodland-evening', eve);
}

// ── The revisit: the empty clearing at dusk, on the wall (its own 0–21 s) ──────
{
  const eve = evening(21, 0, false);
  for (let i = 0; i < eve[0].length; i++) {
    const t = i / RATE, g = smooth(0.5, 2.5, t) * (1 - smooth(16, 20, t));
    eve[0][i] *= g;
    eve[1][i] *= g;
  }
  encode('woodland-evening-empty', eve);
  const air = slice(levelled(decode(`${TAKES}/woodland-air-2.mp3`), () => 0.6), 4, 25);
  for (const c of air) {
    biquad(c, 'highpass', 90, 0.7);
    biquad(c, 'peak', 300, 0.8, 12.5);
    biquad(c, 'highshelf', 5000, 0.7, -9);
  }
  // (At the afternoon's own level, so the evening stands over its air as it does after the cut.)
  level(air, -36);
  for (let i = 0; i < air[0].length; i++) {
    // The evening's calm (as after the cut: 0.3 of the afternoon's breeze).
    const t = i / RATE, g = 0.3 * smooth(0.5, 2.5, t) * (1 - smooth(16, 20, t));
    air[0][i] *= g;
    air[1][i] *= g;
  }
  encode('woodland-air-empty', air);
}

// ── Two far birds: a phrase each, whole ──────────────────────────────────────
for (const [name, file, a, b] of [['woodland-bird-1', 'woodland-bird-2.mp3', 0.35, 1.4], ['woodland-bird-2', 'woodland-bird-3.mp3', 0.1, 3.45]] as const) {
  const s = slice(decode(`${TAKES}/${file}`), a, b);
  fadeEnds(s, 0.01, 0.1);
  level(s, -20);
  encode(name, s);
}

// ── One evening cicada, far off, heard from the white room: the evening's own ─────
{
  const src = decode(`${TAKES}/woodland-dusk-3.mp3`);
  const s = slice(src, 6.0, 10.5);
  const m = s[0].map((v, i) => (v + s[1][i]) / 2);
  for (let i = 0; i < m.length; i++) {
    const t = i / RATE;
    m[i] *= smooth(0, 0.6, t) * (1 - smooth(2.5, 4.5, t));
  }
  const one: Stereo = [m, m.slice()];
  level(one, -20);
  encode('woodland-cicada-last', one);
}

// Nothing of the generator's hum is left standing in any of them.
for (const f of ['woodland-air', 'woodland-evening', 'woodland-air-empty', 'woodland-evening-empty', 'woodland-bird-1', 'woodland-bird-2', 'woodland-cicada-last']) {
  const [l] = decode(join(OUT, `${f}.mp3`), false);
  const worst = Math.max(...[200, 400, 600].map((hz) => lineDb(l, hz)));
  console.log(`${f}: hum line ${worst.toFixed(1)} dB over its neighbours`);
  if (worst > 6) throw new Error(`${f}: a line at 200 Hz or a multiple stands ${worst.toFixed(1)} dB over its neighbours`);
}
