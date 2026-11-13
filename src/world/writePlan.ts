import { wordRanges } from './handwriting';

/** The write plan: where the hand is and how it follows a voice, and how receding writing answers a visitor. Pure maths, no rendering. */

/**
 * The hand keeps real time (the same clock the audio plays on), not the scene's clock, which
 * slows when frames are dropped: writing that follows a voice must not drift from it.
 */
export const wallClock = () => performance.now() / 1000;

/**
 * How the hand is moving: on its own from `start` (wall-clock seconds), or following a voice
 * through `segments` ([wall from, wall to, hand from, hand to], in order). It never goes
 * below `floor` (what is already written stays) or past `cap` (a sentence nobody finished).
 */
export interface WritePlan {
  start: number;
  segments?: [number, number, number, number][];
  floor: number;
  cap: number;
}

/**
 * The band of a piece of writing's red (time) channel that is word `k`: from halfway through the
 * gap before it to halfway through the gap after (so no ink of a neighbour is caught).
 */
export function wordBand(words: [number, number][], duration: number, k: number): [number, number] {
  const d = Math.max(1e-3, duration);
  const lo = k === 0 ? -1 : (words[k - 1][1] + words[k][0]) / 2 / d;
  const hi = k === words.length - 1 ? 2 : (words[k][1] + words[k + 1][0]) / 2 / d;
  return [lo, hi];
}

/**
 * Receding writing (E's line, once E has been heard) answers being come close to, rather than
 * fading with distance: whole beyond 2.2 m; someone within 1.7 m for 0.6 s and it withdraws
 * (over about 2 s; the very first time slower, so it is watched leaving); it comes back only once
 * they have stepped back past 2.6 m for 1.5 s, and slowly.
 */
export interface RecedeState {
  amount: number;
  k: number;
  near: number;
  far: number;
  away: boolean;
  /** It has withdrawn before (the first withdrawal is the slow one). */
  once: boolean;
}

export function recedeStep(r: RecedeState, dist: number, dt: number): RecedeState {
  const near = dist < 1.7 ? r.near + dt : 0;
  const far = dist > 2.6 ? r.far + dt : 0;
  let away = r.away, once = r.once;
  if (!away && near >= 0.6) away = true;
  if (away && far >= 1.5) {
    away = false;
    once = true;
  }
  const target = away ? r.amount : 0;
  const tau = target > r.k ? (once ? 0.8 : 3) : 2;
  const k = target + (r.k - target) * Math.exp(-dt / tau);
  return { ...r, near, far, away, once, k };
}

/** Where the hand is (its own seconds) at wall-clock time `now`. */
export function handAt(plan: WritePlan, now: number): number {
  let h: number;
  if (!plan.segments) h = now - plan.start;
  else {
    h = plan.floor;
    for (const [a, b, h0, h1] of plan.segments) {
      if (now < a) break;
      h = now >= b ? h1 : h0 + ((now - a) / Math.max(1e-3, b - a)) * (h1 - h0);
    }
  }
  return Math.min(plan.cap, Math.max(plan.floor, h));
}

/**
 * A hand following a voice. `speech` is the recording's timing for each character of this
 * exact text (seconds from the start of the file), `audioStart` when the file starts playing
 * (wall clock). Each word starts as it is heard; a hand can't write as fast as people speak,
 * so a long word may run on a little, and the next one waits — pauses in the speech stay
 * pauses in the writing.
 */
export function speechPlan(text: string, words: [number, number][], speech: [number, number][], audioStart: number, speedUp = 1.3): [number, number, number, number][] {
  const ranges = wordRanges(text);
  const out: [number, number, number, number][] = [];
  let free = -Infinity;
  ranges.forEach(([i0, i1], k) => {
    const hw = words[k];
    if (!hw) return;
    const s = audioStart + (speech[i0]?.[0] ?? 0);
    const e = audioStart + (speech[i1 - 1]?.[1] ?? 0);
    const start = Math.max(s, free);
    const end = start + Math.max(e - s, (hw[1] - hw[0]) / speedUp);
    out.push([start, end, hw[0], hw[1]]);
    free = end + 0.04;
  });
  return out;
}
