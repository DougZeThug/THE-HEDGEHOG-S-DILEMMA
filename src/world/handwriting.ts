import type { Hand } from '../content/types';
import { Rng, hashString } from '../core/rng';

/**
 * When each character of a piece of writing is put down: pure, deterministic timing, no
 * rendering. The baked texture records, for every inked pixel, which word it belongs to and
 * how far through that word it lies; the shader shows a pixel once the hand has reached it.
 *
 * Two kinds of timing:
 *  - a hand writing on its own: letter by letter at the pace of that implement, slower on
 *    wide letters, a breath between words, a longer pause at a comma or a full stop, and now
 *    and then a hesitation before a word;
 *  - a hand writing down what a voice is saying: each word starts when it is heard (never
 *    before), but a hand can't write as fast as people speak, so it falls a little behind and
 *    catches up in the pauses. Pauses in the speech stay pauses in the writing.
 */

/** Seconds per character of an average letter, by implement. */
const PACE: Record<Hand, number> = {
  pencil: 0.13, faint: 0.15, pen: 0.11, marker: 0.15, typed: 0.07, child: 0.2, crayon: 0.17, cyan: 0.13, visitor: 0.12,
};

const WIDE = /[mwMWOQ@]/;
const NARROW = /[iljtfrI1!'.,:;|]/;

/** Relative time a character takes to write. */
function weight(ch: string): number {
  if (ch === ' ') return 0;
  if (WIDE.test(ch)) return 1.45;
  if (NARROW.test(ch)) return 0.6;
  if (/[A-Z]/.test(ch)) return 1.25;
  return 1;
}

export interface Word {
  /** Index of the first and one past the last character, in the text. */
  i0: number;
  i1: number;
  start: number;
  end: number;
}

export interface Timing {
  /** [start, end] seconds for every character of the text (spaces are zero-length). */
  chars: [number, number][];
  words: Word[];
  /** Seconds from the first stroke to the last. */
  duration: number;
  /** True when the hand is following a recorded voice. */
  speech?: boolean;
}

/** The words of a text as character ranges. */
export function wordRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]);
  return out;
}

function finish(text: string, chars: [number, number][]): Timing {
  const words = wordRanges(text).map(([i0, i1]) => ({ i0, i1, start: chars[i0][0], end: chars[i1 - 1][1] }));
  const duration = chars.reduce((m, c) => Math.max(m, c[1]), 0);
  return { chars, words, duration };
}

/** A hand writing on its own. */
export function handTiming(text: string, hand: Hand, key: string): Timing {
  const r = new Rng(hashString(`${key}:write`));
  const pace = PACE[hand];
  const chars: [number, number][] = [];
  let t = 0;
  const ranges = wordRanges(text);
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (w < ranges.length && i === ranges[w][0] && w > 0) {
      // Between words the pen lifts and moves on.
      t += r.range(0.12, 0.3);
      const prev = text.slice(ranges[w - 1][0], ranges[w - 1][1]);
      if (/[,;:]$/.test(prev)) t += r.range(0.25, 0.45);
      if (/[.?!]$/.test(prev)) t += r.range(0.45, 0.75);
      if (/(…|\.\.\.)$/.test(prev)) t += r.range(0.7, 1.1);
      // Sometimes a hesitation before a word, more often before a long one.
      const len = ranges[w][1] - ranges[w][0];
      if (r.chance(len > 5 ? 0.22 : 0.08)) t += r.range(0.3, 0.7);
    }
    if (w < ranges.length && i >= ranges[w][1]) w++;
    const d = weight(ch) * pace * r.range(0.82, 1.2);
    chars.push([t, t + d]);
    t += d;
  }
  return finish(text, chars);
}

/**
 * A hand writing down speech. `speech` is the recording's character timing (start, end in
 * seconds from the start of the file), aligned to exactly this text.
 */
export function speechTiming(text: string, hand: Hand, key: string, speech: [number, number][]): Timing {
  const own = handTiming(text, hand, key);
  const chars: [number, number][] = text.split('').map(() => [0, 0]);
  let free = 0;
  for (const wd of own.words) {
    const heardStart = speech[wd.i0]?.[0] ?? free;
    const heardEnd = speech[wd.i1 - 1]?.[1] ?? heardStart;
    // Never before it is heard; never faster than about 1.6× the hand's own pace.
    const start = Math.max(heardStart, free);
    const ownDur = Math.max(0.05, wd.end - wd.start);
    const dur = Math.max(heardEnd - heardStart, ownDur / 1.6);
    const scale = dur / ownDur;
    for (let i = wd.i0; i < wd.i1; i++) chars[i] = [start + (own.chars[i][0] - wd.start) * scale, start + (own.chars[i][1] - wd.start) * scale];
    free = start + dur + 0.05;
  }
  // Spaces sit at the end of the word before them.
  for (let i = 0; i < text.length; i++) if (text[i] === ' ' && i > 0) chars[i] = [chars[i - 1][1], chars[i - 1][1]];
  return { ...finish(text, chars), speech: true };
}

/** Maximum words a single piece of writing can time separately (the shader's array size). */
export const MAX_WORDS = 32;

/**
 * Per-word [start, end] for the shader, with words past `upto` never written (a sentence
 * nobody finished). Longer texts share the last slot.
 */
export function wordSlots(t: Timing, upto = Infinity): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < MAX_WORDS; k++) {
    const wd = t.words[k];
    if (!wd) out.push([1e6, 1e6]);
    else if (k >= upto) out.push([1e6, 1e6]);
    else if (k === MAX_WORDS - 1 && t.words.length > MAX_WORDS) out.push([wd.start, t.words[t.words.length - 1].end]);
    else out.push([wd.start, wd.end]);
  }
  return out;
}

/** Index of a word's slot in the shader (words beyond the array share the last slot). */
export function slotOf(wordIndex: number): number {
  return Math.min(wordIndex, MAX_WORDS - 1);
}
