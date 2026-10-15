export interface Prefs {
  volume: number;
  muted: boolean;
  captions: boolean;
  speech: boolean;
  intensity: 'gentle' | 'full';
  reducedMotion: boolean;
  /** The visitor chose reduced motion themselves (otherwise it follows the system setting, always). */
  reducedMotionChosen?: boolean;
  quality: 'low' | 'medium' | 'high';
}

const KEY = 'hh.prefs.v1';
const VISITS = 'hh.visits';

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

export function defaultPrefs(): Prefs {
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return { volume: 0.75, muted: false, captions: true, speech: false, intensity: 'full', reducedMotion: reduced, quality: touch ? 'low' : 'medium' };
}

export function loadPrefs(): Prefs {
  const d = defaultPrefs();
  const raw = safeGet(KEY);
  if (!raw) return d;
  try {
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : d.volume,
      muted: typeof p.muted === 'boolean' ? p.muted : d.muted,
      captions: typeof p.captions === 'boolean' ? p.captions : d.captions,
      speech: typeof p.speech === 'boolean' ? p.speech : d.speech,
      intensity: p.intensity === 'gentle' || p.intensity === 'full' ? p.intensity : d.intensity,
      // Only a choice the visitor made overrides the system setting; a default saved along with
      // some other preference must not freeze it.
      reducedMotion: p.reducedMotionChosen && typeof p.reducedMotion === 'boolean' ? p.reducedMotion : d.reducedMotion,
      reducedMotionChosen: !!p.reducedMotionChosen,
      quality: p.quality === 'low' || p.quality === 'medium' || p.quality === 'high' ? p.quality : d.quality,
    };
  } catch {
    return d;
  }
}

export function savePrefs(p: Prefs) {
  safeSet(KEY, JSON.stringify(p));
}

export function readVisits(): number {
  const n = Number(safeGet(VISITS));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
export function writeVisits(n: number) {
  safeSet(VISITS, String(n));
}
const MEMORY_COUNTS = 'hh.memories';
/** How many times each living memory has been seen, across visits (its revisit variant). */
export function readMemoryCounts(): Record<string, number> {
  try {
    const v = JSON.parse(safeGet(MEMORY_COUNTS) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function writeMemoryCounts(c: Record<string, number>) {
  safeSet(MEMORY_COUNTS, JSON.stringify(c));
}
export function forgetVisits() {
  safeSet(VISITS, null);
  safeSet(MEMORY_COUNTS, null);
  safeSet('hh.opening-seen', null);
}

const OPENING_SEEN = 'hh.opening-seen';
/** The opening has been seen to its end before (a visit abandoned in the dark doesn't count). */
export function readOpeningSeen(): boolean {
  return safeGet(OPENING_SEEN) === '1';
}
export function writeOpeningSeen() {
  safeSet(OPENING_SEEN, '1');
}
