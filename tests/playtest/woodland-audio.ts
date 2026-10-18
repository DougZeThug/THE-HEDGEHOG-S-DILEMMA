/**
 * The woodland memory's sound, mixed offline for the review film (tests/playtest/record-woodland.mjs):
 * its own cue sheet and markers (src/memory/defs.ts), its own renders (src/memory/synthWoods.ts),
 * at their authored levels; places approximated (a pan from where each sits, a little less for
 * what is further off). Raised as a whole to a listening level: in the room it is quieter.
 *
 *   npx vite-node tests/playtest/woodland-audio.ts            (VARIANT=afternoon|empty PRE=2)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { WOODLAND } from '../../src/memory/defs';
import { renderCicadas, renderWoods, renderLast, RATE } from '../../src/memory/synthWoods';
import { isSpot, type Cue } from '../../src/memory/cueSheet';

const VARIANT = process.env.VARIANT ?? 'afternoon';
const PRE = Number(process.env.PRE ?? 2);
const OUT = process.env.OUT ?? 'test-output/review/woodland/film';
const seed = WOODLAND.seed(VARIANT);
const cues = WOODLAND.cues(VARIANT).cues;
const end = (seed.markers.find((m) => m.label === 'end')?.position ?? 46) + 1;
const n = Math.ceil((PRE + end) * RATE);
const L = new Float32Array(n), R = new Float32Array(n);

async function render(c: Cue): Promise<Float32Array[]> {
  const kind = c.asset.slice(6), take = c.take ?? 0;
  if (kind === 'cicadas') return renderCicadas(take);
  if (kind === 'woods') return renderWoods(take);
  if (kind === 'cicada-last') return renderLast();
  return [];
}

for (const m of seed.markers) {
  const c = cues[m.label];
  if (!c || !c.asset.startsWith('synth:')) continue;
  const ch = await render(c);
  if (!ch.length) continue;
  const d = isSpot(c.place) ? 2 : c.place.d;
  const dist = d > 1.5 ? 1.5 / (1.5 + 0.8 * (d - 1.5)) : 1;
  const g = Math.pow(10, c.gainDb / 20) * dist;
  const u = isSpot(c.place) ? 0 : c.place.u;
  const pl = Math.sqrt((1 - u * 0.8) / 2) * Math.SQRT2, pr = Math.sqrt((1 + u * 0.8) / 2) * Math.SQRT2;
  let lp = 0, rp = 0;
  const a = c.lowpass ? 1 - Math.exp((-2 * Math.PI * c.lowpass) / RATE) : 1;
  const i0 = Math.floor((PRE + m.position) * RATE);
  for (let i = 0; i < ch[0].length && i0 + i < n; i++) {
    const t = i / RATE;
    const fin = c.fadeIn ? Math.min(1, t / c.fadeIn) : 1;
    let l = ch[0][i], r = (ch[1] ?? ch[0])[i];
    if (c.lowpass) {
      lp += (l - lp) * a;
      rp += (r - rp) * a;
      l = lp;
      r = rp;
    }
    if (c.wide) {
      L[i0 + i] += l * g * fin;
      R[i0 + i] += r * g * fin;
    } else {
      L[i0 + i] += l * g * fin * pl;
      R[i0 + i] += l * g * fin * pr;
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
