import dialogue from './dialogue.json';

/**
 * The recorded performances of the phrases (src/content/dialogue.json, authored; the files are
 * generated offline, scripts/generate-dialogue.mjs). One typed way in for the Director's choice
 * (src/state/performance.ts) and the audio (src/audio/Voices.ts).
 */
export interface DialoguePerformance {
  id: string;
  phraseId: string;
  voice: string;
  text: string;
  input: string;
  direction: string;
  /** The emotional field it was directed for: field key → weight. */
  context: Partial<Record<string, number>>;
  fits: string[];
  file: string;
  interpretation?: string;
  /** Loudness correction (dB) the audio applies to the take. */
  levelDb?: number;
  /** Kept on disk and in the ledger, but no longer played. */
  retired?: boolean;
  /** An alternative reading for listening; played only once approved. */
  audition?: boolean;
}

export const DIALOGUE_PERFORMANCES: readonly DialoguePerformance[] = dialogue.performances as unknown as DialoguePerformance[];
