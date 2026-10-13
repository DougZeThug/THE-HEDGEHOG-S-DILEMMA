#!/usr/bin/env node
/**
 * Acoustic measurements of recorded performances, to support (never replace) listening.
 *
 * These numbers say whether takes are *measurably different* — in pitch movement,
 * timing, pauses, loudness and voicing — not whether they are convincing. A take can
 * score "expressive" and still sound false; only a person can approve a performance.
 *
 *   node scripts/voice-analysis.mjs audition/lab/*.mp3
 *   node scripts/voice-analysis.mjs --json public/voices/dialogue/stay--tender.mp3
 *
 * Needs ffmpeg on PATH (decoding only).
 */
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

const SR = 16000;

export function decode(file) {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 64 << 20 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** YIN fundamental frequency of one frame, or 0 if unvoiced. */
function yin(x, start, n, minLag, maxLag) {
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const v = x[start + i] - x[start + i + tau];
      s += v * v;
    }
    d[tau] = s;
  }
  let run = 0;
  let best = -1, bestV = 1;
  for (let tau = 1; tau <= maxLag; tau++) {
    run += d[tau];
    const c = run > 0 ? (d[tau] * tau) / run : 1;
    if (tau >= minLag && c < bestV) {
      bestV = c;
      best = tau;
    }
    if (tau >= minLag && c < 0.15) {
      // First dip under the threshold: walk to its local minimum.
      let t = tau;
      while (t + 1 <= maxLag) {
        const run2 = run + d[t + 1];
        const c2 = (d[t + 1] * (t + 1)) / run2;
        if (c2 >= (d[t] * t) / run) break;
        run = run2;
        t++;
      }
      return { f0: SR / t, aperiodicity: c };
    }
  }
  return bestV < 0.3 ? { f0: SR / best, aperiodicity: bestV } : { f0: 0, aperiodicity: bestV };
}

const pct = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
};
const st = (a, b) => 12 * Math.log2(a / b);

export function analyse(file, wordCount = 0) {
  const x = decode(file);
  const hop = SR / 100, win = Math.round(SR * 0.025);
  const minLag = Math.floor(SR / 450), maxLag = Math.ceil(SR / 65), yinN = Math.round(SR * 0.03);
  const frames = [];
  for (let s = 0; s + win + maxLag + yinN < x.length; s += hop) {
    let e = 0;
    for (let i = 0; i < win; i++) e += x[s + i] * x[s + i];
    frames.push({ t: s / SR, db: 10 * Math.log10(e / win + 1e-12), s });
  }
  const peak = Math.max(...frames.map((f) => f.db));
  const floor = Math.max(-50, peak - 32);
  for (const f of frames) f.speech = f.db > floor;
  // Fill gaps shorter than 120 ms (consonant closures are not pauses).
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].speech) continue;
    let j = i;
    while (j < frames.length && !frames[j].speech) j++;
    if (i > 0 && j < frames.length && j - i < 12) for (let k = i; k < j; k++) frames[k].speech = true;
    i = j;
  }
  const sp = frames.filter((f) => f.speech);
  const first = sp[0]?.t ?? 0, last = sp[sp.length - 1]?.t ?? 0;
  const pauses = [];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].speech || frames[i].t < first || frames[i].t > last) continue;
    let j = i;
    while (j < frames.length && !frames[j].speech) j++;
    pauses.push((j - i) / 100);
    i = j;
  }
  let voiced = 0, ap = 0;
  const f0 = [];
  for (const f of sp) {
    const r = yin(x, f.s, yinN, minLag, maxLag);
    ap += r.aperiodicity;
    if (r.f0 > 0) {
      voiced++;
      f0.push({ t: f.t, hz: r.f0 });
    }
  }
  // Octave-error guard: keep pitches within an octave and a half of the median.
  const med = pct(f0.map((p) => p.hz), 0.5);
  const good = f0.filter((p) => Math.abs(st(p.hz, med)) < 18);
  const semis = good.map((p) => st(p.hz, med));
  let jump = 0;
  for (let i = 1; i < semis.length; i++) if (good[i].t - good[i - 1].t < 0.015) jump += Math.abs(semis[i] - semis[i - 1]);
  const tail = good.slice(Math.floor(good.length * 0.75)), body = good.slice(Math.floor(good.length * 0.4), Math.floor(good.length * 0.75));
  const speechSeconds = sp.length / 100;
  const dbs = sp.map((f) => f.db);
  return {
    file: basename(file),
    seconds: +(x.length / SR).toFixed(2),
    speechSeconds: +speechSeconds.toFixed(2),
    pauses: pauses.filter((p) => p >= 0.15).length,
    pauseSeconds: +pauses.filter((p) => p >= 0.15).reduce((a, b) => a + b, 0).toFixed(2),
    f0Median: Math.round(med),
    /** Pitch range, 10th–90th percentile, semitones. */
    pitchRange: +(pct(semis, 0.9) - pct(semis, 0.1)).toFixed(1),
    /** How much the pitch moves, semitones per voiced second. */
    pitchMotion: +(jump / Math.max(0.1, good.length / 100)).toFixed(1),
    /** Last quarter against the middle: rising (+) or falling (−), semitones. */
    ending: +(st(pct(tail.map((p) => p.hz), 0.5), pct(body.map((p) => p.hz), 0.5)) || 0).toFixed(1),
    /** Loudness range among speech frames, dB. */
    dynamics: +(pct(dbs, 0.9) - pct(dbs, 0.1)).toFixed(1),
    /** Share of speech that is voiced; low means breathy, whispered, laughing. */
    voicing: +(voiced / Math.max(1, sp.length)).toFixed(2),
    /** Mean aperiodicity (0 clean tone … 1 noise). */
    breath: +(ap / Math.max(1, sp.length)).toFixed(2),
    rate: wordCount ? +(wordCount / Math.max(0.1, speechSeconds)).toFixed(1) : null,
  };
}

export const FEATURES = ['speechSeconds', 'pauseSeconds', 'pitchRange', 'pitchMotion', 'ending', 'dynamics', 'voicing', 'f0Median'];

/** Distance between two takes in z-scored feature space (scale from the set they belong to). */
export function distance(a, b, set) {
  let s = 0;
  for (const k of FEATURES) {
    const xs = set.map((r) => r[k]).filter(Number.isFinite);
    const mean = xs.reduce((p, q) => p + q, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((p, q) => p + (q - mean) ** 2, 0) / xs.length) || 1;
    s += ((a[k] - b[k]) / sd) ** 2;
  }
  return +Math.sqrt(s / FEATURES.length).toFixed(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const rows = files.map((f) => analyse(f));
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else {
    const cols = ['file', 'seconds', 'speechSeconds', 'pauses', 'pauseSeconds', 'f0Median', 'pitchRange', 'pitchMotion', 'ending', 'dynamics', 'voicing', 'breath'];
    console.log(cols.map((c) => c.slice(0, 12).padEnd(c === 'file' ? 34 : 12)).join(''));
    for (const r of rows) console.log(cols.map((c) => String(r[c]).slice(0, 33).padEnd(c === 'file' ? 34 : 12)).join(''));
  }
}
