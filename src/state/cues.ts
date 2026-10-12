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
      /** For the floor: write near this point (chair-relative metres). */
      nearPoint?: { x: number; z: number };
      purpose: 'annotation' | 'recall' | 'recontext' | 'contribution';
      /** Phrase that gets a faint line struck through it. */
      strike?: string;
      ttl: number;
    }
  | { type: 'link'; a: string; b: string; ttl: number }
  | {
      type: 'voice';
      kind: VoiceKind;
      text: string | null;
      caption: string;
      position: VoicePosition;
      gain: number;
      assetId?: string;
      phraseId?: string;
      /** Handle so a later cue can cut this sound off. */
      tag?: string;
      /** For humming: the exact tune (semitones above the base), so it can recur elsewhere. */
      melody?: number[];
      /** Always synthesise (never substitute a recording), e.g. when the tune must be known. */
      synth?: boolean;
    }
  | {
      type: 'music';
      mood: 'warm' | 'tender' | 'uneasy' | 'sparse' | 'memory';
      notes: number;
      truncate: boolean;
      /** Play exactly these MIDI notes instead of composing. */
      melody?: number[];
      /** Stop after this many notes of the melody. */
      stopAt?: number;
    }
  | { type: 'silence'; depth: number; seconds: number }
  | { type: 'chairNudge'; dx: number; dz: number; dyaw: number }
  /** Turn the chair a fraction of the way toward a point (chair-relative metres). */
  | { type: 'chairTurn'; x: number; z: number; amount: number }
  | { type: 'flash'; kind: 'warm' | 'cold'; amount: number; seconds: number }
  /** Cut off a tagged sound, with a short fade. */
  | { type: 'stopVoice'; tag: string; fade: number }
  /** A faint warmth left at a place on the floor (chair-relative metres), fading over `seconds`. */
  | { type: 'glow'; x: number; z: number; amount: number; seconds: number }
  /** Rub out a piece of writing except for one word. */
  | { type: 'erode'; key: string; keep: string };

export interface TimedCue {
  t: number;
  cue: Cue;
  rule: string;
}
