import { CUT, SHOTS } from './defs';
import { gustSway } from './living/performance';
import { WOODLAND } from './living/woodland';

/** A gust as it is heard: the leaves over the middle of the clearing as they sway with it, a
 *  moment before they are seen to. */
export const heard = (t: number) => gustSway(t + 0.4, 0.5, WOODLAND.gusts);

/**
 * Where the leaves are heard across (−1 left .. 1 right): where they are seen to sway, the
 * canopy's left against its right, so a gust starts on the left with the near oak and travels
 * right with its front (heard on the right all along, it was ahead of what was seen: cinematic
 * review, 2026-10-18); back to the middle as it dies away (by its strength: never a jump; QA).
 */
export function leavesPan(t: number): number {
  const l = gustSway(t + 0.4, 0.2, WOODLAND.gusts).strength, r = gustSway(t + 0.4, 0.8, WOODLAND.gusts).strength;
  if (l + r < 1e-6) return 0;
  // (Across only as far as the gust is heard: not hard over while it is barely there.)
  const k = Math.min(1, heard(t).strength / 0.35);
  return 0.8 * ((r - l) / (l + r)) * k * k * (3 - 2 * k);
}

/**
 * The woodland memory's day insects, made in the engine (docs/reviews/2026-10-woodland.md): stand-ins
 * until the artist has listened (`review: pending`). The rest of its sound is recorded: the wind in
 * the leaves and the grass, two far birds, the evening's cicadas, and the piano (public/music/
 * woodland-*.mp3: scripts/woodland-stems.ts, scripts/woodland-score/).
 *
 * A summer afternoon's insects: the tymbal buzz of the common summer cicada, rising and falling in
 * long phrases, one near them, two either side, and the shimmer of many more in the trees, under
 * the wind and the piano (demoted: the evening's cicadas are the dusk's defining sound, and the
 * afternoon is the wind's, the birds' and the piano's: the reviews of 2026-10-19). Not loops: each
 * is one take laid along the memory's own timeline, so the near cicada's phrases fall where they
 * should (a lull while the two of them are close; back a second into the second wide), and all of
 * it ends on the cut, with the piano: the afternoon's sounds stop on one instant, and the evening's
 * begin there. Pure functions of their seed, rendered at 24 kHz, in slices that yield to the page.
 *
 *   cicadas      the one near them (mono, placed)
 *   woods        the rest of the day's (stereo, wide): two cicadas either side, the chorus in the trees
 */
export const WOODS_KINDS = ['cicadas', 'woods'] as const;
export type WoodsKind = (typeof WOODS_KINDS)[number];
export const RATE = 24000;

/** The afternoon's insects' timeline (seconds from the memory's start; the picture's, which these
 *  follow, are in defs.ts). */
export const TIMES = {
  /** They end on the cut: the render is the afternoon and nothing after it. */
  length: CUT,
  cut: CUT,
  /** The near cicada's phrases: first heard beyond the wall; through the first wide; a lull while
   *  the two of them are close (her look, his); one long phrase from a second into the second
   *  wide, cut off by the cut, at its height. (Never begun or ended within 0.7 s of a shot's cut.) */
  near: [[1.2, 6.6], [8.2, SHOTS.two - 0.7], [SHOTS.wideAgain + 1, 37.8]] as [number, number][],
  inside: [6.5, 10.5] as [number, number],
  chorusFrom: 2.5,
  /** The two either side: also quiet while the two of them are close. */
  midQuiet: [SHOTS.two - 0.9, SHOTS.wideAgain + 0.8] as [number, number],
  /**
   * The chorus shallow while the two of them are close (to `depth`): with the cicadas over and
   * beside them quiet, they were the only sound moving, and they crested under both looks (+4.8 dB
   * through hers, +7.6 through his), the woods scoring them (all three evaluations of the film,
   * 2026-10-18). Eased in under the gust, out under the cicadas' return.
   */
  shallow: { from: [11.0, 13.5] as [number, number], to: [SHOTS.wideAgain + 0.8, SHOTS.wideAgain + 3.0] as [number, number], depth: 0.3 },
};

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
export function renderCicadas(): Float32Array[] {
  const x = new Float32Array(Math.ceil(TIMES.length * RATE));
  const T = TIMES;
  const level = (t: number) => 0.5 + 0.5 * smooth(T.inside[0], T.inside[1], t);
  T.near.forEach(([a, b], i) => cicada(x, { ...NEAR, seed: NEAR.seed + i }, a, b, level));
  normalise([x], -45);
  return [x];
}

/**
 * The two either side's phrases: random, and their quiet is never a fade: a phrase under way as it
 * begins ends there, on its own fall-away, and none is under way as it ends: they come back out of
 * it at a phrase's start, each with its own swell (one already under way came back as a fade, half
 * a phrase, on the cut's heels: the sound designer's review, 2026-10-18; the creative director's,
 * on the way in). One under way at the cut is cut there, with everything else of the afternoon.
 */
export function midPhrases(): [number, number][][] {
  const [start, end] = TIMES.midQuiet;
  return [MID_L, MID_R].map((c) => {
    const list = phrases(c.seed, 2, TIMES.length + 3, [4, 9], [2, 6])
      .filter(([a, b]) => !(a < end && b > end))
      .map(([a, b]): [number, number] => (a < start && b > start ? [a, Math.max(a + 2, start)] : [a, b]));
    // Back a few seconds after the quiet, at a phrase's start (not left until the cut is near).
    const k = list.findIndex(([a]) => a >= end);
    if (k >= 0 && list[k][0] > end + 3.5) list[k] = [end + 1.5, end + 1.5 + (list[k][1] - list[k][0])];
    // And nothing begins in the afternoon's last seconds: a sound coming in as the cut nears leans
    // toward it.
    return list.filter(([a]) => !(a > TIMES.cut - 3 && a < TIMES.cut));
  });
}

/** The rest of the afternoon's insects: two cicadas either side, the trees' chorus (stereo). */
export async function renderWoods(): Promise<Float32Array[]> {
  const n = Math.ceil(TIMES.length * RATE);
  const L = new Float32Array(n), R = new Float32Array(n);
  const T = TIMES;
  const r = rng(77);
  const opened = (t: number) => smooth(T.inside[0], T.inside[1], t);
  // Two cicadas, left and right of them, a little further off.
  const mid = new Float32Array(n);
  const midLevel = (t: number) => (0.4 + 0.6 * opened(t)) * quiet(t, T.midQuiet, 0.6);
  const lists = midPhrases();
  for (const [k, c] of [[0, MID_L], [1, MID_R]] as [number, Cicada][]) {
    mid.fill(0);
    for (const [a, b] of lists[k]) cicada(mid, c, a, b, midLevel);
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
    const { from: sf, to: st, depth } = T.shallow;
    const swell = control(n, (t) => {
      const dep = 1 - (1 - depth) * smooth(sf[0], sf[1], t) * (1 - smooth(st[0], st[1], t));
      return 0.55 + dep * (0.25 * Math.sin(2 * Math.PI * s1 * t + p1) + 0.2 * Math.sin(2 * Math.PI * s2 * t + p2));
    });
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
  // The wind carries it (a little louder in the gust); a third less than it was against the two
  // either side (demoted with them: the reviews of 2026-10-19).
  const chorusLv = control(n, (t) => Math.pow(10, (3 * heard(t).strength) / 20) * smooth(T.chorusFrom, T.chorusFrom + 2.5, t) * (0.45 + 0.55 * opened(t)));
  for (let i = 0; i < n; i++) {
    const lv = at64(chorusLv, i);
    L[i] += chorusL[i] * lv * 0.42;
    R[i] += chorusR[i] * lv * 0.42;
  }
  normalise([L, R], -45);
  return [L, R];
}

/** One of the woodland's sounds as an AudioBuffer (rendered on first use; cached by the host's loader). */
export async function synthWoods(ctx: BaseAudioContext, kind: WoodsKind): Promise<AudioBuffer> {
  const ch = kind === 'cicadas' ? renderCicadas() : await renderWoods();
  const buf = ctx.createBuffer(ch.length, ch[0].length, RATE);
  ch.forEach((c, i) => buf.copyToChannel(c, i));
  return buf;
}
