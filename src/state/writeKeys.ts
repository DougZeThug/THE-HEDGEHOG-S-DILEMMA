/**
 * Write keys: the id the Director gives a piece of writing it asks the world to put on a wall
 * (a `write` cue's `key`). The world reports back with `writeFailed(key)` when it finds no room, and
 * WallText and the App recognise some of them by prefix, so these shapes are a protocol: build and
 * parse them here and nowhere else.
 */

type WriteKey =
  | { kind: 'memory'; id: string }
  | { kind: 'heart'; id: string }
  | { kind: 'enc'; id: string; n: number }
  | { kind: 'stray'; id: string };

export const WriteKeys = {
  /** A memory's line, written alone where the visitor looks (and re-inked there). */
  memory: (phraseId: string): string => `memory:${phraseId}`,
  /** The visit's heart answer, beside the room's first line. */
  heart: (phraseId: string): string => `heart:${phraseId}`,
  /** An annotation written in a meeting's beat: the nth meeting with a phrase. */
  enc: (phraseId: string, n: number): string => `enc:${phraseId}:${n}`,
  /** A line that migrated to another wall. */
  stray: (phraseId: string): string => `stray:${phraseId}`,
  /** An ordinary line written on the wall the visitor faces instead of its own. */
  moved: (phraseId: string): string => `moved:${phraseId}`,
  /** A warm memory written again while the visitor is far away. */
  recall: (phraseId: string, at: number): string => `recall:${phraseId}:${Math.round(at)}`,
  recontext: (id: string): string => `rc:${id}`,
  contribution: (n: number): string => `contrib:${n}`,
  /** What a heard vignette leaves behind. */
  echo: (vignetteId: string, echoId: string): string => `echo:${vignetteId}:${echoId}`,
} as const;

/** The keys `writeFailed` acts on; any other key is not the Director's to retry. */
export function parseWriteKey(key: string): WriteKey | null {
  const enc = /^enc:([^:]+):(\d+)$/.exec(key);
  if (enc) return { kind: 'enc', id: enc[1], n: Number(enc[2]) };
  const m = /^(memory|heart|stray):(.+)$/.exec(key);
  return m ? { kind: m[1] as 'memory' | 'heart' | 'stray', id: m[2] } : null;
}

/** A memory's or the heart's line: decided on, and if never written, not spent. */
export const isMemoryOrHeartKey = (key: string): boolean => /^(memory|heart):/.test(key);
export const isHeartKey = (key: string): boolean => key.startsWith('heart:');
