export interface Prefs {
  volume: number;
  muted: boolean;
  /** Captions for what is heard: off unless the visitor chooses them (the artist, 2026-10-19). */
  captions: boolean;
  /** The visitor chose captions on or off themselves (a default saved with another preference doesn't count). */
  captionsChosen?: boolean;
  speech: boolean;
  intensity: 'gentle' | 'full';
  reducedMotion: boolean;
  /** The visitor chose reduced motion themselves (otherwise it follows the system setting, always). */
  reducedMotionChosen?: boolean;
  quality: 'low' | 'medium' | 'high';
}

/**
 * Every key the room writes to localStorage. `forgetVisits` clears from this one table (preferences
 * aside), so a key added here is forgotten with the rest unless it is marked as a preference.
 */
const STORAGE_KEYS = {
  prefs: 'hh.prefs.v1',
  visits: 'hh.visits',
  memoryCounts: 'hh.memories',
  trace: 'hh.trace.v1',
  heart: 'hh.heart.v1',
  openingSeen: 'hh.opening-seen',
  touchHint: 'hh.touch-hint',
} as const;

/** Every key except the preferences: all of it is about having been visited, and "forget me" clears it. */
const VISIT_KEYS = Object.values(STORAGE_KEYS).filter((k) => k !== STORAGE_KEYS.prefs);

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: preferences simply aren't remembered */
  }
}

function defaultPrefs(): Prefs {
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return { volume: 0.75, muted: false, captions: false, speech: false, intensity: 'full', reducedMotion: reduced, quality: touch ? 'low' : 'medium' };
}

/** Reads a stored JSON value through `fromJson`; anything missing, unparseable or rejected reads as `fallback`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readJson<T>(key: string, fromJson: (value: any) => T, fallback: T): T {
  const raw = safeGet(key);
  if (raw === null) return fallback;
  try {
    return fromJson(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function loadPrefs(): Prefs {
  const d = defaultPrefs();
  return readJson(STORAGE_KEYS.prefs, (p: Partial<Prefs>): Prefs => {
    return {
      volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : d.volume,
      muted: typeof p.muted === 'boolean' ? p.muted : d.muted,
      // (Captions were on by default until 2026-10-19: one saved along with another preference
      // then is a default, not a choice.)
      captions: p.captionsChosen && typeof p.captions === 'boolean' ? p.captions : d.captions,
      captionsChosen: !!p.captionsChosen,
      speech: typeof p.speech === 'boolean' ? p.speech : d.speech,
      intensity: p.intensity === 'gentle' || p.intensity === 'full' ? p.intensity : d.intensity,
      // Only a choice the visitor made overrides the system setting; a default saved along with
      // some other preference must not freeze it.
      reducedMotion: p.reducedMotionChosen && typeof p.reducedMotion === 'boolean' ? p.reducedMotion : d.reducedMotion,
      reducedMotionChosen: !!p.reducedMotionChosen,
      quality: p.quality === 'low' || p.quality === 'medium' || p.quality === 'high' ? p.quality : d.quality,
    };
  }, d);
}

export function savePrefs(p: Prefs) {
  safeSet(STORAGE_KEYS.prefs, JSON.stringify(p));
}

export function readVisits(): number {
  const n = Number(safeGet(STORAGE_KEYS.visits));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
export function writeVisits(n: number) {
  safeSet(STORAGE_KEYS.visits, String(n));
}
/** How many times each living memory has been seen, across visits (its revisit variant). */
export function readMemoryCounts(): Record<string, number> {
  return readJson(STORAGE_KEYS.memoryCounts, (v) => (v && typeof v === 'object' ? v : {}), {});
}
export function writeMemoryCounts(c: Record<string, number>) {
  safeSet(STORAGE_KEYS.memoryCounts, JSON.stringify(c));
}
/** One more time `id` has been seen, remembered for the next visit. */
export function countMemory(id: string) {
  const counts = readMemoryCounts();
  counts[id] = (counts[id] ?? 0) + 1;
  writeMemoryCounts(counts);
}
/**
 * How the last visit ended, as one word the room can answer on a return (docs/reviews/
 * 2026-10-emotional-depth.md): nothing about where anyone stood, what they wrote or what they did,
 * only the kind of leaving. Versioned; anything unexpected reads as nothing.
 */
export type Leaving = 'close';
export function readTrace(): Leaving | null {
  return readJson(STORAGE_KEYS.trace, (v) => (v && v.v === 1 && v.leaving === 'close' ? v.leaving : null), null);
}
export function writeTrace(leaving: Leaving | null) {
  safeSet(STORAGE_KEYS.trace, leaving ? JSON.stringify({ v: 1, leaving }) : null);
}

/**
 * What the last visit's heart left beside the room's first line (a phrase id; docs/reviews/
 * 2026-11-emotional-arc.md): one of the room's own lines, never anything the visitor did or wrote.
 * The Director checks it is one it knows. Versioned; anything unexpected reads as nothing.
 */
export function readHeartAnswer(): string | null {
  return readJson(STORAGE_KEYS.heart, (v) => (v && v.v === 1 && typeof v.answer === 'string' && /^[a-z-]{1,40}$/.test(v.answer) ? v.answer : null), null);
}
export function writeHeartAnswer(answer: string) {
  safeSet(STORAGE_KEYS.heart, JSON.stringify({ v: 1, answer }));
}

/** Everything the room remembers about having been visited (preferences aside). */
export function forgetVisits() {
  for (const k of VISIT_KEYS) safeSet(k, null);
}

/** The opening has been seen to its end before (a visit abandoned in the dark doesn't count). */
export function readOpeningSeen(): boolean {
  return safeGet(STORAGE_KEYS.openingSeen) === '1';
}
export function writeOpeningSeen() {
  safeSet(STORAGE_KEYS.openingSeen, '1');
}

/** The one-time hint that words and the chair can be touched has been shown on this device. */
export function readTouchHintSeen(): boolean {
  return safeGet(STORAGE_KEYS.touchHint) !== null;
}
export function writeTouchHintSeen() {
  safeSet(STORAGE_KEYS.touchHint, '1');
}
