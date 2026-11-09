/**
 * Small everyday sounds for the vignettes, made in the engine (no recording, no credits): the
 * inside of a car at night, an indicator, a shop's fridge, a till, a tap dripping once, a
 * biscuit packet, rain through an open window and a drop on its sill. Plain and close, generated dry at an even level; place, distance and room come
 * from the vignette's cue sheet, as for every memory sound (src/memory/cueSheet.ts).
 *
 * Beds (`road`, `fridge`, `rain`) are seamless loops normalised to about −45 dBFS RMS, as `synthAir` is;
 * one-shots peak at about −12 dBFS. What carries each sound sits above 200 Hz, where a phone can play it.
 * Seeded: the same sound every time.
 */
export type SynthKind = 'road' | 'indicator' | 'fridge' | 'till' | 'drip' | 'rustle' | 'rain' | 'sill';

export const SYNTH_KINDS: SynthKind[] = ['road', 'indicator', 'fridge', 'till', 'drip', 'rustle', 'rain', 'sill'];

const made = new Map<string, AudioBuffer>();

export function synthSound(ctx: Pick<BaseAudioContext, 'createBuffer' | 'sampleRate'>, kind: SynthKind, seed = 1): AudioBuffer {
  const key = `${ctx.sampleRate}:${kind}:${seed}`;
  let b = made.get(key);
  if (!b) {
    const data = render(kind, ctx.sampleRate, seed);
    b = ctx.createBuffer(1, data.length, ctx.sampleRate);
    b.getChannelData(0).set(data);
    made.set(key, b);
  }
  return b;
}

/** The samples of a sound (exported for tests). */
export function render(kind: SynthKind, rate: number, seed = 1): Float32Array {
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const len = (sec: number) => Math.floor(sec * rate);
  /** A one-pole band: `lo` and `hi` in Hz, applied in place. */
  const band = (x: Float32Array, lo: number, hi: number) => {
    const a = Math.exp((-2 * Math.PI * hi) / rate), c = Math.exp((-2 * Math.PI * lo) / rate);
    let y = 0, z = 0, prev = 0;
    for (let i = 0; i < x.length; i++) {
      y = (1 - a) * x[i] + a * y; // lowpass at hi
      z = c * (z + y - prev); // highpass at lo
      prev = y;
      x[i] = z;
    }
    return x;
  };
  const noise = (n: number) => {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = rnd();
    return x;
  };
  const rms = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / Math.max(1, x.length));
  const peak = (x: Float32Array) => x.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
  const toRms = (x: Float32Array, db: number) => {
    const k = Math.pow(10, db / 20) / Math.max(1e-9, rms(x));
    for (let i = 0; i < x.length; i++) x[i] *= k;
    return x;
  };
  const toPeak = (x: Float32Array, db: number) => {
    const k = Math.pow(10, db / 20) / Math.max(1e-9, peak(x));
    for (let i = 0; i < x.length; i++) x[i] *= k;
    return x;
  };
  /** A seamless loop: the last `f` seconds are crossfaded into the start, then cut off. */
  const loop = (x: Float32Array, f: number) => {
    const n = x.length - len(f), m = len(f);
    const out = x.slice(0, n);
    for (let i = 0; i < m; i++) {
      const t = i / m;
      out[i] = x[i] * Math.sin((t * Math.PI) / 2) + x[n + i] * Math.cos((t * Math.PI) / 2);
    }
    return out;
  };
  /** A short struck tone: frequency, decay (s), with a little noise at its start. */
  const click = (x: Float32Array, at: number, f: number, decay: number, amp: number) => {
    const i0 = len(at);
    for (let i = 0; i < len(decay * 5) && i0 + i < x.length; i++) {
      const t = i / rate;
      const env = Math.exp(-t / decay);
      x[i0 + i] += amp * env * (Math.sin(2 * Math.PI * f * t) * 0.7 + rnd() * 0.3 * Math.exp(-t / 0.002));
    }
  };

  switch (kind) {
    case 'road': {
      // A car at night, from inside: a low road roar (what a phone keeps of it) and tyre hiss
      // that swells a little now and then, never on a beat.
      // The roar is kept above 250 Hz (a phone's speaker plays nothing much lower), with a second,
      // lower band only for headphones.
      const x = band(noise(len(17)), 250, 900);
      const low = band(noise(len(17)), 120, 300);
      const hiss = band(noise(len(17)), 1200, 3500);
      for (let i = 0; i < x.length; i++) {
        const t = i / rate;
        x[i] = (x[i] + low[i] * 0.5) * (1 + 0.15 * Math.sin(t * 0.7 + 1.3)) + hiss[i] * 0.22 * (1 + 0.3 * Math.sin(t * 0.43));
      }
      return toRms(loop(x, 1), -45);
    }
    case 'indicator': {
      // An indicator's relay: tick, tock, about 0.38 s apart, for seven seconds.
      const x = new Float32Array(len(7.2));
      for (let k = 0, t = 0.05; t < 7; k++, t += 0.38) click(x, t, k % 2 ? 1700 : 2300, 0.008, k % 2 ? 0.8 : 1);
      return toPeak(x, -12);
    }
    case 'fridge': {
      // A shop's chiller: a 50 Hz mains hum is heard by its harmonics (200–600 Hz, what a phone
      // plays), two of them a hair apart so it slowly beats, a compressor's band, a little air.
      const x = band(noise(len(17)), 400, 2500);
      const h = [[200, 0.22, 0], [300, 0.4, 0.4], [400, 0.3, 1.1], [401, 0.2, 2], [500, 0.14, 0.7], [600, 0.08, 2.6]];
      for (let i = 0; i < x.length; i++) {
        const t = i / rate;
        let v = x[i] * 0.35;
        for (const [f, a, p] of h) v += a * Math.sin(2 * Math.PI * f * t + p);
        x[i] = v;
      }
      return toRms(loop(x, 1), -45);
    }
    case 'till': {
      // A scanner's beep at a till: one short square-ish tone.
      const x = new Float32Array(len(0.5));
      for (let i = 0; i < len(0.11); i++) {
        const t = i / rate;
        const env = Math.min(1, t / 0.004) * Math.min(1, (0.11 - t) / 0.01);
        x[i] = env * (Math.sin(2 * Math.PI * 2650 * t) + 0.3 * Math.sin(2 * Math.PI * 7950 * t));
      }
      return toPeak(x, -12);
    }
    case 'drip': {
      // One drop into a sink: a bright blip that rises in pitch as the bubble rings, a tiny splash.
      const x = new Float32Array(len(0.6));
      let ph = 0;
      for (let i = 0; i < len(0.08); i++) {
        const t = i / rate;
        const f = 1100 + 1600 * Math.min(1, t / 0.03);
        ph += (2 * Math.PI * f) / rate;
        x[i] = Math.exp(-t / 0.018) * Math.sin(ph);
      }
      const splash = band(noise(len(0.05)), 2000, 6000);
      for (let i = 0; i < splash.length; i++) x[i] += splash[i] * 0.25 * Math.exp(-i / rate / 0.01);
      return toPeak(x, -12);
    }
    case 'rustle': {
      // A biscuit packet: crinkles, dense then thinning, over about a second and a half.
      const x = new Float32Array(len(1.6));
      const base = band(noise(x.length), 1500, 7000);
      for (let i = 0; i < x.length; i++) {
        const t = i / rate;
        x[i] = base[i] * 0.15 * Math.exp(-t / 0.9);
      }
      for (let t = 0.02; t < 1.4; t += 0.012 + Math.abs(rnd()) * 0.07 * (1 + t)) click(x, t, 3000 + rnd() * 2500, 0.0025, (0.5 + Math.abs(rnd()) * 0.5) * Math.exp(-t / 0.8));
      return toPeak(x, -12);
    }
    case 'rain': {
      // Rain through an open window, steady and light: a banded wash (the far field), a little
      // sheen, and drops at random (Poisson: never a rhythm) for the near field. Three passes of
      // the band: one left too much above 6 kHz (harsh on a phone). Nothing much below 250 Hz.
      const T = 17, n = len(T);
      const band3 = (x: Float32Array, lo: number, hi: number) => band(band(band(x, lo, hi), lo, hi), lo, hi);
      const wash = toRms(band3(noise(n), 350, 4000), 0);
      const sheen = toRms(band3(noise(n), 1800, 4000), 0);
      const drops = new Float32Array(n);
      const RATE = 30; // drops a second
      for (let t = 0; ; ) {
        t += -Math.log(Math.max(1e-6, (rnd() + 1) / 2)) / RATE;
        if (t >= T - 0.01) break;
        // Most drops faint (0 to −24 dB, even in dB), each its own pitch and ring (3–8 ms).
        click(drops, t, 1500 + (2500 * (rnd() + 1)) / 2, 0.0006 + (0.001 * (rnd() + 1)) / 2, Math.pow(10, (-24 * (rnd() + 1)) / 2 / 20));
      }
      toRms(band(band(drops, 900, 5000), 900, 5000), -6); // the drops 6 dB under the wash
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        x[i] = wash[i] * (1 + 0.12 * Math.sin(2 * Math.PI * 0.23 * t + 0.7) + 0.08 * Math.sin(2 * Math.PI * 0.071 * t + 2.1)) + sheen[i] * 0.35 + drops[i];
      }
      return toRms(loop(x, 1), -45);
    }
    case 'sill': {
      // One heavy drop on a windowsill: a short knock and a splash (each seed another drop). Not
      // `drip`, whose rising bubble is water into water: a tap.
      const x = new Float32Array(len(0.4));
      click(x, 0.005, 1700 + (700 * (rnd() + 1)) / 2, 0.004, 1);
      const splash = band(noise(len(0.04)), 2000, 6000), o = len(0.008);
      for (let i = 0; i < splash.length; i++) x[o + i] += splash[i] * 0.35 * Math.exp(-i / rate / 0.008);
      return toPeak(x, -12);
    }
  }
}
