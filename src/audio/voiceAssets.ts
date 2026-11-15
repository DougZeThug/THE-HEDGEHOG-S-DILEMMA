import dialogue from '../content/dialogue.json';

/** The recordings' bookkeeping: the key files that list them, and the loudness maths that levels them. */

/**
 * A file of `key → recordings` (the manifest, the previews). Missing, or unreachable, is how a room
 * with no recordings looks, and quietly empty. Present but not valid JSON is a mistake someone should
 * hear about: said in the console, then the same empty fallback.
 */
export async function loadKeyFile(url: string): Promise<Record<string, string[]>> {
  let r: Response;
  try {
    r = await fetch(url, { cache: 'no-cache' });
  } catch (e) {
    console.warn(`${url} could not be fetched; using no recordings from it`, e);
    return {};
  }
  if (!r.ok) return {};
  try {
    return await r.json();
  } catch (e) {
    console.warn(`${url} is not valid JSON; using no recordings from it`, e);
    return {};
  }
}

export function measure(buf: AudioBuffer) {
  let sum = 0, peak = 0, n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i] * d[i];
      peak = Math.max(peak, Math.abs(d[i]));
      n++;
    }
  }
  return { rms: Math.sqrt(sum / Math.max(1, n)) || 1e-6, peak: peak || 1e-6 };
}

/** Loudness every recording is levelled to (RMS, dBFS), the peak ceiling (dBFS) and the most gain ever applied. */
const TARGET_RMS = Math.pow(10, -24 / 20);
const PEAK_CEILING = Math.pow(10, -3 / 20);
const MAX_GAIN = 16;

/** Dialogue performances are the files under `dialogue/`; they are levelled only halfway (see `normaliseGain`). */
export const isPerformance = (file: string): boolean => file.startsWith('dialogue/');

/**
 * Gain to bring a recording toward -24 dBFS RMS without pushing its peak past -3 dBFS.
 * Performances are only half-corrected: a take whispered "very quietly" should stay quieter
 * than one where the voice rises, and their authored `levelDb` is applied on top.
 */
export function normaliseGain(buf: AudioBuffer, partial = false): number {
  const { rms, peak } = measure(buf);
  const full = TARGET_RMS / rms;
  return Math.min(partial ? Math.sqrt(full) : full, PEAK_CEILING / peak, MAX_GAIN);
}

/**
 * Gain to bring spoken words to -24 dBFS RMS measured over the frames where someone is speaking
 * (20 ms frames within 30 dB of the loudest), peaks no higher than -3 dBFS. For a vignette's
 * lines: a one-word "No." and a sentence with breaths around it come out at the same level, so
 * the authored `gainDb` of a score means the same thing on every take.
 */
export function voicedGain(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  const n = Math.max(1, Math.round(buf.sampleRate * 0.02));
  const frames: number[] = [];
  let peak = 0;
  for (let i = 0; i + n <= d.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) {
      s += d[j] * d[j];
      peak = Math.max(peak, Math.abs(d[j]));
    }
    frames.push(s / n);
  }
  const loud = Math.max(0, ...frames);
  if (!loud || !peak) return 1;
  const voiced = frames.filter((f) => f >= loud * 1e-3);
  const rms = Math.sqrt(voiced.reduce((a, f) => a + f, 0) / voiced.length);
  return Math.min(TARGET_RMS / rms, PEAK_CEILING / peak, MAX_GAIN);
}

/** Authored relative level of each performance file, in dB. */
export const LEVEL_DB = new Map<string, number>((dialogue.performances as { file: string; levelDb?: number }[]).map((p) => [p.file, p.levelDb ?? 0]));
