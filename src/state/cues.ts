import type { Hand, Size, Surface, VoiceStyle } from '../content/types';

/**
 * Cues are the only way the composer talks to the world and the sound.
 * They are plain data: inspectable, testable, and safe to produce from any source.
 */
export type VoicePosition =
  | { kind: 'chair' }
  | { kind: 'behind' }
  | { kind: 'nowhere' }
  | { kind: 'beyond'; surface: Surface }
  | { kind: 'surface'; phraseId: string }
  /** Starts far away in a corner and drifts towards the chair while it plays. */
  | { kind: 'approach' };

export type VoiceKind = VoiceStyle | 'laugh' | 'murmur' | 'breath' | 'hum';

export type Cue =
  | { type: 'reveal'; phraseId: string; mode: 'emerge' | 'still'; seconds: number }
  | { type: 'hide'; phraseId: string; seconds: number }
  | {
      type: 'write';
      key: string;
      text: string;
      hand: Hand;
      size: Size;
      /** Written beside this phrase (on its surface), or on `surface` if absent. */
      beside?: string;
      surface?: Surface;
      purpose: 'annotation' | 'recall' | 'recontext' | 'contribution';
      /** Phrase that gets a faint line struck through it. */
      strike?: string;
      ttl: number;
    }
  | { type: 'link'; a: string; b: string; ttl: number }
  | { type: 'voice'; kind: VoiceKind; text: string | null; caption: string; position: VoicePosition; gain: number; assetId?: string; phraseId?: string }
  | { type: 'music'; mood: 'warm' | 'tender' | 'uneasy' | 'sparse' | 'memory'; notes: number; truncate: boolean }
  | { type: 'silence'; depth: number; seconds: number }
  | { type: 'chairNudge'; dx: number; dz: number; dyaw: number }
  | { type: 'flash'; kind: 'warm' | 'cold'; amount: number; seconds: number };

export interface TimedCue {
  t: number;
  cue: Cue;
  rule: string;
}
