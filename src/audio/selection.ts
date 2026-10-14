/**
 * Where a voice comes from, in order:
 *  1. the recorded performance chosen for this moment;
 *  2. another recorded performance of the same phrase;
 *  3. the browser's own speech, only if the visitor turned it on;
 *  4. a recorded texture for this manner of speaking, or synthesis.
 * Recordings always win over browser speech.
 */
export type Source =
  | { kind: 'recording'; file: string; exact: boolean }
  | { kind: 'speech' }
  | { kind: 'texture'; key: string }
  | { kind: 'synth' };

export interface SourceQuery {
  manifest: Record<string, string[]>;
  /** e.g. `phrase:stay` or a fragment id. */
  assetKey?: string;
  /** Recorded files for this phrase, best first for the current context. */
  performances?: string[];
  text: string | null;
  kind: string;
  speechFallback: boolean;
  speechAvailable: boolean;
  /** Never substitute a recording (e.g. a hummed tune that must be known exactly). */
  synthOnly?: boolean;
  pick?: (n: number) => number;
}

const NON_VERBAL = new Set(['laugh', 'murmur', 'breath', 'hum']);

export function chooseSource(q: SourceQuery): Source {
  if (q.synthOnly) return { kind: 'synth' };
  const available = (q.assetKey && q.manifest[q.assetKey]) || [];
  if (available.length) {
    const wanted = (q.performances ?? []).filter((f) => available.includes(f));
    if (wanted.length) return { kind: 'recording', file: wanted[0], exact: wanted[0] === q.performances?.[0] };
    const pick = q.pick ?? (() => 0);
    return { kind: 'recording', file: available[Math.min(available.length - 1, Math.max(0, pick(available.length)))], exact: false };
  }
  if (q.text && q.speechFallback && q.speechAvailable && !NON_VERBAL.has(q.kind)) return { kind: 'speech' };
  if (q.manifest[`style:${q.kind}`]?.length) return { kind: 'texture', key: `style:${q.kind}` };
  return { kind: 'synth' };
}

/**
 * What to fetch first on arrival, and what can wait. Every texture and sound, and the first
 * take of each phrase, come first (with 37 recorded lines, two each would be about 3.8 MB on a
 * phone); the other takes follow a few at a time while the room is quiet, and any take chosen
 * before then is fetched when it is needed.
 */
export function preloadStages(manifest: Record<string, string[]>, perPhrase = 1): { first: string[]; rest: string[] } {
  const first: string[] = [], rest: string[] = [];
  for (const [key, files] of Object.entries(manifest)) {
    // A memory's sounds are fetched when the memory is prepared, never on arrival.
    if (key.startsWith('mem:')) continue;
    if (!key.startsWith('phrase:')) first.push(...files);
    else {
      first.push(...files.slice(0, perPhrase));
      rest.push(...files.slice(perPhrase));
    }
  }
  return { first, rest };
}
