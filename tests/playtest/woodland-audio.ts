/**
 * The woodland memory's sound, mixed offline for the review film (tests/playtest/record-woodland.mjs):
 * its own cue sheet and markers (src/memory/defs.ts), its own renders (src/memory/synthWoods.ts) and
 * its recordings (`music/<file>` cues, from public/music/, decoded by ffmpeg), at their authored
 * levels; places approximated (a pan from where each sits, a little less for what is further off);
 * a cue's `stopAfter` or `until` cut where the room cuts it (40 ms, ending there). Raised as a
 * whole to a listening level: in the room it is quieter. 48 kHz (the synthesised renders, made at
 * 24 kHz, are brought up to it).
 *
 *   npx vite-node tests/playtest/woodland-audio.ts            (VARIANT=afternoon|empty PRE=2)
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { WOODLAND } from '../../src/memory/defs';
import { renderCicadas, renderWoods, renderLast, RATE as SYNTH_RATE } from '../../src/memory/synthWoods';
import { isSpot, type Cue } from '../../src/memory/cueSheet';

const RATE = 48000;
const VARIANT = process.env.VARIANT ?? 'afternoon';
const PRE = Number(process.env.PRE ?? 2);
const OUT = process.env.OUT ?? 'test-output/review/woodland/film';
const seed = WOODLAND.seed(VARIANT);
const cues = WOODLAND.cues(VARIANT).cues;
const end = (seed.markers.find((m) => m.label === 'end')?.position ?? 46) + 1;
const n = Math.ceil((PRE + end) * RATE);
const L = new Float32Array(n), R = new Float32Array(n);

/** A 24 kHz render at 48 kHz (each sample between two by a short windowed sinc). */
function twice(x: Float32Array): Float32Array {
  const y = new Float32Array(x.length * 2);
  const taps = 16;
  const h = Array.from({ length: taps }, (_, j) => {
    const k = j - taps / 2 + 0.5;
    return (Math.sin(Math.PI * k) / (Math.PI * k)) * (0.5 + 0.5 * Math.cos((Math.PI * k) / (taps / 2)));
  });
  for (let i = 0; i < x.length; i++) {
    y[2 * i] = x[i];
    let s = 0;
    for (let j = 0; j < taps; j++) {
      const idx = i + j - taps / 2 + 1;
      if (idx >= 0 && idx < x.length) s += x[idx] * h[j];
    }
    y[2 * i + 1] = s;
  }
  return y;
}

/** A recording as stereo float at 48 kHz (ffmpeg decodes it). */
function decode(file: string): Float32Array[] {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(RATE), '-'], { maxBuffer: 1 << 30 });
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const l = new Float32Array(all.length / 2), r = new Float32Array(all.length / 2);
  for (let i = 0; i < l.length; i++) {
    l[i] = all[2 * i];
    r[i] = all[2 * i + 1];
  }
  return [l, r];
}

async function render(c: Cue): Promise<Float32Array[]> {
  if (c.asset.startsWith('music/')) {
    const file = `public/${c.asset}`;
    if (!existsSync(file)) {
      console.warn(`(no ${file} yet: left out of the mix)`);
      return [];
    }
    return decode(file);
  }
  if (!c.asset.startsWith('synth:')) return [];
  const kind = c.asset.slice(6), take = c.take ?? 0;
  const ch = kind === 'cicadas' ? await renderCicadas(take) : kind === 'woods' ? await renderWoods(take) : kind === 'cicada-last' ? await renderLast() : [];
  if (SYNTH_RATE * 2 !== RATE) throw new Error('the synthesised renders are expected at half the mix rate');
  return ch.map(twice);
}

for (const m of seed.markers) {
  const c = cues[m.label];
  if (!c) continue;
  const ch = await render(c);
  if (!ch.length) continue;
  const d = isSpot(c.place) ? 2 : c.place.d;
  const dist = d > 1.5 ? 1.5 / (1.5 + 0.8 * (d - 1.5)) : 1;
  const g = Math.pow(10, c.gainDb / 20) * dist;
  const u = isSpot(c.place) ? 0 : c.place.u;
  const pl = Math.sqrt((1 - u * 0.8) / 2) * Math.SQRT2, pr = Math.sqrt((1 + u * 0.8) / 2) * Math.SQRT2;
  let lp = 0, rp = 0;
  const a = c.lowpass ? 1 - Math.exp((-2 * Math.PI * c.lowpass) / RATE) : 1;
  const from = Math.round((c.offset ?? 0) * RATE);
  // (As the room: a cue cut at `stopAfter` file seconds, or at `until` on the memory's timeline,
  // over 40 ms ending there.)
  const stop = Math.min(c.stopAfter !== undefined ? Math.round(c.stopAfter * RATE) : Infinity, c.until !== undefined ? from + Math.round((c.until - m.position) * RATE) : Infinity);
  const i0 = Math.floor((PRE + m.position) * RATE);
  for (let i = 0; from + i < ch[0].length && i0 + i < n; i++) {
    const t = i / RATE;
    const fin = c.fadeIn ? Math.min(1, t / c.fadeIn) : 1;
    const fs = from + i < stop - 0.04 * RATE ? 1 : Math.max(0, (stop - from - i) / (0.04 * RATE));
    if (fs <= 0) break;
    let l = ch[0][from + i], r = (ch[1] ?? ch[0])[from + i];
    if (c.lowpass) {
      lp += (l - lp) * a;
      rp += (r - rp) * a;
      l = lp;
      r = rp;
    }
    if (c.wide || ch.length > 1) {
      L[i0 + i] += l * g * fin * fs * (c.wide ? 1 : pl);
      R[i0 + i] += r * g * fin * fs * (c.wide ? 1 : pr);
    } else {
      L[i0 + i] += l * g * fin * fs * pl;
      R[i0 + i] += l * g * fin * fs * pr;
    }
  }
}
// To a listening level (RMS about −24 dBFS), peaks kept under −1 dBFS.
let s = 0, pk = 0;
for (let i = 0; i < n; i++) {
  s += L[i] * L[i] + R[i] * R[i];
  pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
}
const rms = Math.sqrt(s / (2 * n));
const k = Math.min(Math.pow(10, -24 / 20) / Math.max(1e-9, rms), Math.pow(10, -1 / 20) / Math.max(1e-9, pk));
const pcm = new Int16Array(n * 2);
for (let i = 0; i < n; i++) {
  pcm[2 * i] = Math.max(-1, Math.min(1, L[i] * k)) * 32767;
  pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i] * k)) * 32767;
}
const h = Buffer.alloc(44);
h.write('RIFF', 0);
h.writeUInt32LE(36 + pcm.byteLength, 4);
h.write('WAVEfmt ', 8);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(2, 22);
h.writeUInt32LE(RATE, 24);
h.writeUInt32LE(RATE * 4, 28);
h.writeUInt16LE(4, 32);
h.writeUInt16LE(16, 34);
h.write('data', 36);
h.writeUInt32LE(pcm.byteLength, 40);
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/woodland-${VARIANT}-audio.wav`, Buffer.concat([h, Buffer.from(pcm.buffer)]));
console.log(`${OUT}/woodland-${VARIANT}-audio.wav: ${(n / RATE).toFixed(1)} s, raised ${(20 * Math.log10(k)).toFixed(1)} dB`);
