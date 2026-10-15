import { gust } from './living/performance';
import { WOODLAND } from './living/woodland';

/**
 * The woodland memory's sound, made in the engine (docs/reviews/2026-10-woodland.md): stand-ins
 * until the artist has listened (`review: pending`), and a place to put real recordings later
 * (the cue's asset).
 *
 * A summer clearing: cicadas. By day, the tymbal buzz of the common summer kind, rising and
 * falling in long phrases, one near them, two either side, and the shimmer of many more in the
 * trees; at evening (after the cut) the evening cicada comes in, its falling "kana-kana" call, as
 * the day's thin out. Not loops: each is one take laid along the memory's own timeline (from its
 * start), so the near cicada's phrases fall where they should (a lull while the hand moves, a
 * phrase carrying straight across the cut), and the leaves move with the same gust the grass
 * does. Pure functions of their seed, rendered at 24 kHz, in slices that yield to the page.
 *
 *   cicadas      the one near them (mono, placed)
 *   woods        the rest (stereo, wide): two more cicadas, the chorus in the trees, the evening
 *                cicadas after the cut, the leaves
 *   grass        grass and cloth moving under a hand (take 0), settling (take 1)
 *   cicada-last  one evening cicada, far off, heard from the white room after
 *
 * Take 0 is the afternoon's timeline, take 1 the empty clearing's (dusk, shorter).
 */
export const WOODS_KINDS = ['cicadas', 'woods', 'grass', 'cicada-last'] as const;
export type WoodsKind = (typeof WOODS_KINDS)[number];
export const RATE = 24000;

/** The afternoon's sound timeline (seconds from the memory's start; the picture's are in defs.ts). */
export const TIMES = {
  length: 44,
  /** The near cicada's phrases: first heard beyond the wall; a lull while the hand moves; one
   *  phrase carrying straight across the cut (28 s); the last ones into the evening. */
  near: [[1.2, 6.6], [8.2, 14.3], [25.4, 31.6], [33.2, 38.2]] as [number, number][],
  inside: [6.5, 11] as [number, number],
  chorusFrom: 2.5,
  /** The two either side: also quiet while the hand moves. */
  midQuiet: [15.2, 25.8] as [number, number],
  /** The touch: the chorus draws back a little. */
  touch: [19.8, 21.8] as [number, number],
  /**
   * After the cut (28 s), the evening, gradually: the day's chorus thins, the evening cicadas
   * come in (their first call at 29.5). Nothing marks the cut itself.
   */
  dusk: [28.5, 34] as [number, number],
  evening: [29.5, 33.2, 36.4] as number[],
  /** The air goes still (scene.breeze), and comes back. */
  breeze: [[0, 1], [14, 1], [15, 0.15], [21.5, 0.15], [23.5, 1]] as [number, number][],
  /** Going (from 35): the chorus first, the leaves, the two either side, the near one last. */
  chorusOut: [35.5, 38] as [number, number],
  leavesOut: [35.5, 37.5] as [number, number],
  midOut: [36.5, 38.5] as [number, number],
  nearOut: [37.5, 39.5] as [number, number],
};
const EMPTY = { length: 26, out: [20, 24] as [number, number], evening: [1.5, 6.5, 11.8, 16.4] };

// ─────────────────────────────── helpers ───────────────────────────────

function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** 1 outside [a, b], easing to 0 inside it over `edge` seconds. */
const quiet = (t: number, [a, b]: [number, number], edge = 0.25) => 1 - smooth(a - edge, a, t) * (1 - smooth(b, b + edge, t));
const fadeOut = (t: number, [a, b]: [number, number]) => 1 - smooth(a, b, t);
const curve = (pts: [number, number][], t: number) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * smooth(pts[i - 1][0], pts[i][0], t);
  return pts[pts.length - 1][1];
};

/** An RBJ biquad, run in place. */
function biquad(x: Float32Array, type: 'lowpass' | 'highpass' | 'bandpass' | 'peak', f: number, q: number, gainDb = 0): void {
  const w = (2 * Math.PI * f) / RATE, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === 'lowpass') [b0, b1, b2, a0, a1, a2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al];
  else if (type === 'highpass') [b0, b1, b2, a0, a1, a2] = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al];
  else if (type === 'bandpass') [b0, b1, b2, a0, a1, a2] = [al, 0, -al, 1 + al, -2 * cw, 1 - al];
  else [b0, b1, b2, a0, a1, a2] = [1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A];
  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  a1 /= a0;
  a2 /= a0;
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

/** Distance's smear: a short chain of allpasses (diffusion without a tail you'd hear as reverb). */
function smear(x: Float32Array, ms: number, seed: number): void {
  const r = rng(seed);
  for (const k of [0.13, 0.23, 0.37, 0.61]) {
    const d = Math.max(1, Math.round(((ms * k * (0.9 + 0.2 * r())) / 1000) * RATE));
    const buf = new Float32Array(d);
    let p = 0;
    const g = 0.6;
    for (let i = 0; i < x.length; i++) {
      const delayed = buf[p];
      const v = x[i] + g * delayed;
      x[i] = delayed - g * v;
      buf[p] = v;
      if (++p === d) p = 0;
    }
  }
}

/** One cycle of a sine, and of a tymbal click (a sine's positive half, sharpened), as tables. */
const TAB = 4096;
const SIN = new Float32Array(TAB), CLICK = new Float32Array(TAB);
for (let i = 0; i < TAB; i++) {
  SIN[i] = Math.sin((2 * Math.PI * i) / TAB);
  const p = Math.max(0, SIN[i]);
  CLICK[i] = p * p * p * p * p * p;
}

/** A slow envelope evaluated every 64 samples (under 3 ms: control rate), read per sample. */
function control(n: number, f: (t: number) => number, from = 0): Float32Array {
  const k = 64, out = new Float32Array(Math.ceil(n / k) + 1);
  for (let j = 0; j < out.length; j++) out[j] = f(from + (j * k) / RATE);
  return out;
}
const at64 = (env: Float32Array, i: number) => {
  const j = i >> 6, f = (i & 63) / 64;
  return env[j] + (env[Math.min(env.length - 1, j + 1)] - env[j]) * f;
};

function rms(xs: Float32Array[]): number {
  let s = 0, n = 0;
  for (const x of xs) for (let i = 0; i < x.length; i++) (s += x[i] * x[i]), n++;
  return Math.sqrt(s / Math.max(1, n));
}
function normalise(xs: Float32Array[], db: number): void {
  const k = Math.pow(10, db / 20) / Math.max(1e-9, rms(xs));
  for (const x of xs) for (let i = 0; i < x.length; i++) x[i] *= k;
}

// ─────────────────────────────── cicadas ───────────────────────────────

export interface Cicada {
  /** Where its buzz is (Hz), and how narrow (Q). */
  f: number;
  q: number;
  /** The tymbal's clicks per second (the buzz's grain). */
  pulse: number;
  /** The phrase's slow pulsing (the "meen-meen"), per second. */
  beat: number;
  seed: number;
}

/**
 * One summer cicada singing from `a` to `b` seconds (one phrase), added into `out`: tymbal
 * clicks (noise in short bursts at `pulse` a second) ringing at its body's resonance, with a
 * little tone in it, swelling in over a second and a half, pulsing slowly, falling away at the
 * end; `level(t)` scales it (a lull, the evening).
 */
export function cicada(out: Float32Array, c: Cicada, a: number, b: number, level: (t: number) => number): void {
  const r = rng(c.seed);
  const i0 = Math.max(0, Math.floor(a * RATE)), i1 = Math.min(out.length, Math.floor(b * RATE));
  if (i1 <= i0) return;
  const x = new Float32Array(i1 - i0);
  const len = b - a;
  const lv = control(x.length, level, a);
  const beatPh = r() * 6.28;
  let ph = 0, cp = r() * TAB;
  const dcp = (c.pulse * TAB) / RATE;
  const beat = control(x.length, (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * c.beat * (t - a) + beatPh) ** 2, a);
  const tone = control(x.length, (t) => (c.f * (1 + 0.004 * Math.sin(2 * Math.PI * 0.7 * (t - a))) * TAB) / RATE, a);
  const env = control(x.length, (t) => {
    const u = t - a;
    return smooth(0, Math.min(1.5, len * 0.3), u) * (1 - smooth(len - Math.min(1.8, len * 0.35), len, u));
  }, a);
  for (let i = 0; i < x.length; i++) {
    // The tymbal: sharp clicks, noise and a little tone ringing in its body.
    const click = CLICK[cp | 0];
    cp += dcp;
    if (cp >= TAB) cp -= TAB;
    ph += at64(tone, i);
    if (ph >= TAB) ph -= TAB;
    x[i] = ((r() * 2 - 1) * 0.8 + SIN[ph | 0] * 0.35) * click * at64(beat, i) * at64(env, i) * at64(lv, i);
  }
  biquad(x, 'bandpass', c.f, c.q);
  biquad(x, 'bandpass', c.f, c.q * 0.8);
  for (let i = 0; i < x.length; i++) out[i0 + i] += x[i];
}

/**
 * One evening cicada's call (the "kana-kana"), starting at `at`: quick notes, each a fast
 * pulsing tone, falling in pitch and in strength over about five seconds.
 */
export function eveningCall(out: Float32Array, at: number, seed: number, gain = 1): void {
  const r = rng(seed);
  const f0 = 4300 + r() * 500;
  const len = 4.6 + r() * 1.4;
  const rate = 7 + r() * 1.5;
  let ph = 0;
  const i0 = Math.floor(at * RATE), n = Math.floor(len * RATE);
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / RATE;
    const k = t / len;
    const f = f0 * (1 - 0.2 * k);
    ph += (2 * Math.PI * f) / RATE;
    const note = (t * rate) % 1;
    const noteEnv = Math.min(1, note / 0.08) * Math.max(0, 1 - (note - 0.08) / 0.5) ** 2;
    const am = 0.55 + 0.45 * Math.sin(2 * Math.PI * 42 * t);
    const phrase = smooth(0, 0.4, t) * (1 - 0.7 * k) * (1 - smooth(len - 0.6, len, t));
    if (i0 + i >= 0) out[i0 + i] += Math.sin(ph) * noteEnv * am * phrase * gain;
  }
}

const NEAR: Cicada = { f: 5200, q: 3.2, pulse: 230, beat: 2.6, seed: 101 };
const MID_L: Cicada = { f: 4700, q: 2.8, pulse: 190, beat: 2.1, seed: 202 };
const MID_R: Cicada = { f: 5900, q: 3.4, pulse: 260, beat: 3.1, seed: 303 };

const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

/** Random phrases from `from` to `to`: a few seconds singing, a few not. */
function phrases(seed: number, from: number, to: number, sing: [number, number], rest: [number, number]): [number, number][] {
  const r = rng(seed);
  const out: [number, number][] = [];
  let t = from + r() * rest[1];
  while (t < to) {
    const len = sing[0] + r() * (sing[1] - sing[0]);
    out.push([t, Math.min(to, t + len)]);
    t += len + rest[0] + r() * (rest[1] - rest[0]);
  }
  return out;
}

/** The near cicada: beyond the wall at first (quieter), full once inside, its phrases authored. */
export function renderCicadas(take: number): Float32Array[] {
  const empty = take === 1;
  const len = empty ? EMPTY.length : TIMES.length;
  const x = new Float32Array(Math.ceil(len * RATE));
  const T = TIMES;
  const level = (t: number) => (empty ? 0.7 * fadeOut(t, EMPTY.out) : (0.5 + 0.5 * smooth(T.inside[0], T.inside[1], t)) * (1 - 0.35 * smooth(T.dusk[0], T.dusk[1], t)) * fadeOut(t, T.nearOut));
  const list = empty ? [[1.5, 7.5], [10, 15.5]] as [number, number][] : T.near;
  list.forEach(([a, b], i) => cicada(x, { ...NEAR, seed: NEAR.seed + i }, a, b, level));
  normalise([x], -45);
  return [x];
}

/** The clearing's air: two cicadas either side, the trees' chorus, the evening's, the leaves (stereo). */
export async function renderWoods(take: number): Promise<Float32Array[]> {
  const empty = take === 1;
  const len = empty ? EMPTY.length : TIMES.length;
  const n = Math.ceil(len * RATE);
  const L = new Float32Array(n), R = new Float32Array(n);
  const T = TIMES;
  const r = rng(77 + take);
  const opened = (t: number) => (empty ? 1 : smooth(T.inside[0], T.inside[1], t));
  const going = (t: number, span: [number, number]) => (empty ? fadeOut(t, EMPTY.out) : fadeOut(t, span));
  const day = (t: number) => (empty ? 0.25 : 1 - 0.7 * smooth(T.dusk[0], T.dusk[1], t));
  // Two cicadas, left and right of them, a little further off.
  const mid = new Float32Array(n);
  const midLevel = (t: number) => (0.4 + 0.6 * opened(t)) * (empty ? 1 : quiet(t, T.midQuiet, 0.6)) * day(t) * going(t, T.midOut);
  for (const [k, c] of [[0, MID_L], [1, MID_R]] as [number, Cicada][]) {
    mid.fill(0);
    for (const [a, b] of phrases(c.seed, 2, len - 1, [4, 9], [2, 6])) cicada(mid, c, a, b, midLevel);
    smear(mid, 40, 5 + k);
    const [gl, gr] = k === 0 ? [0.8, 0.25] : [0.3, 0.75];
    for (let i = 0; i < n; i++) (L[i] += mid[i] * gl), (R[i] += mid[i] * gr);
    await yieldNow();
  }
  // The chorus in the trees: too many, too far off to be one by one: four bands of the
  // tymbals' shimmer, each with its own grain and its own slow swell, spread across.
  const chorusL = new Float32Array(n), chorusR = new Float32Array(n);
  const one = new Float32Array(n);
  for (let k = 0; k < 4; k++) {
    const f = 4400 + k * 520 + r() * 150, pulse = 170 + r() * 110;
    const s1 = 0.05 + r() * 0.08, s2 = 0.13 + r() * 0.1, p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28;
    const swell = control(n, (t) => 0.55 + 0.25 * Math.sin(2 * Math.PI * s1 * t + p1) + 0.2 * Math.sin(2 * Math.PI * s2 * t + p2));
    let cp = (p3 / 6.2832) * TAB;
    const dcp = (pulse * TAB) / RATE;
    for (let i = 0; i < n; i++) {
      one[i] = (r() * 2 - 1) * (0.35 + 0.65 * CLICK[cp | 0]) * at64(swell, i);
      cp += dcp;
      if (cp >= TAB) cp -= TAB;
    }
    biquad(one, 'bandpass', f, 2.2);
    biquad(one, 'bandpass', f, 1.8);
    const pan = (k / 3) * 1.4 - 0.7;
    const gl = Math.sqrt((1 - pan) / 2), gr = Math.sqrt((1 + pan) / 2);
    for (let i = 0; i < n; i++) (chorusL[i] += one[i] * gl), (chorusR[i] += one[i] * gr);
    await yieldNow();
  }
  for (const ch of [chorusL, chorusR]) {
    smear(ch, 140, ch === chorusL ? 11 : 12);
    biquad(ch, 'lowpass', 7500, 0.7);
  }
  const chorusLv = control(n, (t) => {
    const g = gust(t + 0.4, WOODLAND.gusts).strength;
    // The wind carries it; it draws back at the touch; it thins in the evening; it goes first.
    let lv = day(t) * Math.pow(10, (3 * g) / 20);
    lv *= empty ? 1 : 1 - 0.5 * (1 - quiet(t, T.touch, 0.4));
    return lv * smooth(T.chorusFrom, T.chorusFrom + 2.5, t) * (0.45 + 0.55 * opened(t)) * going(t, T.chorusOut);
  });
  for (let i = 0; i < n; i++) {
    const lv = at64(chorusLv, i);
    L[i] += chorusL[i] * lv * 0.6;
    R[i] += chorusR[i] * lv * 0.6;
  }
  await yieldNow();
  // The evening cicadas: after the cut (or all through the empty clearing), far off, one then another.
  const eve = new Float32Array(n);
  (empty ? EMPTY.evening : T.evening).forEach((at, i) => eveningCall(eve, at, 600 + i + take * 10, i === 0 ? 0.7 : 1));
  smear(eve, 90, 21);
  biquad(eve, 'lowpass', 6500, 0.7);
  const eveLv = control(n, (t) => going(t, T.chorusOut));
  for (let i = 0; i < n; i++) {
    const v = eve[i] * at64(eveLv, i);
    L[i] += v * 0.55;
    R[i] += v * 0.35;
  }
  // The leaves: band-limited, out of the cicadas' way, fluttering, carried by the gust from the left.
  const nl = new Float32Array(n), nr = new Float32Array(n), flutter = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, c0 = 0, c1 = 0, c2 = 0;
  for (let i = 0; i < n; i++) {
    // Pink-ish (Kellet's economy filter), left and right apart.
    const w1 = r() * 2 - 1, w2 = r() * 2 - 1;
    b0 = 0.99765 * b0 + w1 * 0.099;
    b1 = 0.963 * b1 + w1 * 0.2965;
    b2 = 0.57 * b2 + w1 * 1.0527;
    c0 = 0.99765 * c0 + w2 * 0.099;
    c1 = 0.963 * c1 + w2 * 0.2965;
    c2 = 0.57 * c2 + w2 * 1.0527;
    nl[i] = b0 + b1 + b2 + w1 * 0.1848;
    nr[i] = c0 + c1 + c2 + w2 * 0.1848;
    flutter[i] = r() * 2 - 1;
  }
  await yieldNow();
  biquad(flutter, 'lowpass', 14, 0.7);
  const fk = 1 / Math.max(1e-6, rms([flutter]));
  for (const ch of [nl, nr]) {
    biquad(ch, 'highpass', 500, 0.7);
    biquad(ch, 'lowpass', 3500, 0.7);
    biquad(ch, 'peak', 5000, 1.5, -6);
  }
  const leaves = [new Float32Array(n), new Float32Array(n)];
  const air = control(n, (t) => {
    const gs = gust(t + 0.4, WOODLAND.gusts);
    return (0.15 * (empty ? 0.6 : curve(T.breeze, t)) + Math.pow(gs.strength, 1.5)) * (empty ? 0.6 : 0.25 + 0.75 * opened(t)) * going(t, T.leavesOut);
  });
  // From the left as the front comes in, toward the right as it passes.
  const panEnv = control(n, (t) => {
    const gs = gust(t + 0.4, WOODLAND.gusts);
    return Math.min(1, Math.max(-1, gs.strength > 0.01 ? gs.front * 1.6 - 0.8 : 0));
  });
  for (let i = 0; i < n; i++) {
    const lv = at64(air, i) * (1 + 0.6 * flutter[i] * fk * 0.35);
    const pan = at64(panEnv, i);
    leaves[0][i] = nl[i] * lv * Math.sqrt((1 - pan * 0.6) / 2);
    leaves[1][i] = nr[i] * lv * Math.sqrt((1 + pan * 0.6) / 2);
  }
  // Balanced against the cicadas by ear-free measure: the leaves sit about 4 dB under them.
  const kc = rms([L, R]), kl = rms(leaves);
  const lk = kl > 0 ? (kc / kl) * Math.pow(10, -4 / 20) : 0;
  for (let i = 0; i < n; i++) (L[i] += leaves[0][i] * lk), (R[i] += leaves[1][i] * lk);
  normalise([L, R], -45);
  return [L, R];
}

/** Grass and cloth under a moving hand (take 0, 1.4 s) or settling back (take 1, 1.8 s). */
export function renderGrass(take: number): Float32Array[] {
  const settle = take === 1;
  const len = settle ? 1.8 : 1.4;
  const n = Math.ceil((len + 0.2) * RATE);
  const x = new Float32Array(n), body = new Float32Array(n);
  const r = rng(500 + take);
  const density = (t: number) => smooth(0, 0.3, t) * (1 - smooth(len - 0.5, len, t));
  let t = 0;
  while (t < len) {
    const d = density(t);
    if (r() < 0.25 + 0.75 * d) {
      const g = 0.006 + r() * 0.019;
      const i0 = Math.floor(t * RATE), m = Math.floor(g * RATE);
      const a = (0.4 + 0.6 * r()) * (0.2 + 0.8 * d);
      for (let i = 0; i < m && i0 + i < n; i++) x[i0 + i] += (r() * 2 - 1) * a * Math.exp(-i / (m * 0.3));
    }
    t += len / (settle ? 60 : 45);
  }
  biquad(x, 'bandpass', settle ? 1100 : 1600, 0.55);
  for (let i = 0; i < n; i++) body[i] = (r() * 2 - 1) * density(i / RATE);
  biquad(body, 'bandpass', 550, 0.8);
  const kb = rms([x]) / Math.max(1e-9, rms([body]));
  for (let i = 0; i < n; i++) x[i] += body[i] * kb * Math.pow(10, -10 / 20);
  // Peak at −12 dBFS (a one-shot).
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(x[i]));
  const k = Math.pow(10, -12 / 20) / Math.max(1e-9, pk);
  for (let i = 0; i < n; i++) x[i] *= k;
  return [x];
}

/** One evening cicada, far off, heard from the white room: a single call. */
export function renderLast(): Float32Array[] {
  const x = new Float32Array(Math.ceil(6.4 * RATE));
  eveningCall(x, 0.1, 777);
  smear(x, 60, 31);
  normalise([x], -45);
  return [x];
}

/** One of the woodland's sounds as an AudioBuffer (rendered on first use; cached by the host's loader). */
export async function synthWoods(ctx: BaseAudioContext, kind: WoodsKind, take: number): Promise<AudioBuffer> {
  const ch = kind === 'cicadas' ? renderCicadas(take) : kind === 'woods' ? await renderWoods(take) : kind === 'grass' ? renderGrass(take) : renderLast();
  const buf = ctx.createBuffer(ch.length, ch[0].length, RATE);
  ch.forEach((c, i) => buf.copyToChannel(c, i));
  return buf;
}
