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
  /** Writing already on the wall is written again in front of the visitor (it fades out at once and comes back). */
  | { type: 'redraw'; phraseId: string; seconds: number }
  | {
      type: 'write';
      key: string;
      text: string;
      hand: Hand;
      size: Size;
      /** Written beside this phrase (on its surface), or on `surface` if absent. */
      beside?: string;
      surface?: Surface;
      /** Written beneath this drawing (a memory's line under the drawing it opens from). */
      under?: string;
      /** For the floor: write near this point (chair-relative metres). */
      nearPoint?: { x: number; z: number };
      /** The phrase these words come from: looking at them is meeting that phrase again. */
      source?: string;
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
      /** The recorded performance chosen for this moment (an id from src/content/dialogue.json). */
      performance?: string;
      /** Recorded files for this phrase, best first for this moment. */
      performances?: string[];
      /** Seconds the room holds its breath before the voice starts (a hush that belongs to the voice, so it never happens without it). */
      lead?: number;
      /** The words write themselves onto their place on the wall as they are heard. */
      write?: boolean;
      /** The line was left unfinished on the wall: the hand finishes it as the words are heard. */
      finish?: boolean;
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
  /**
   * The room goes quiet. With `dim`, its light also goes back to the chair alone for the first
   * `dimSeconds` (the room's own light, the sky and the fixture down to `dim`), as at the start of the visit.
   */
  | { type: 'silence'; depth: number; seconds: number; dim?: number; dimSeconds?: number }
  | { type: 'chairNudge'; dx: number; dz: number; dyaw: number }
  /** Turn the chair a fraction of the way toward a point (chair-relative metres). */
  | { type: 'chairTurn'; x: number; z: number; amount: number }
  | { type: 'flash'; kind: 'warm' | 'cold'; amount: number; seconds: number }
  /** A small household sound: a door closing somewhere, a cup set down, the chair creaking. */
  | { type: 'sound'; kind: 'door' | 'chair-creak' | 'cup'; position: VoicePosition; gain: number }
  /** Cut off a tagged sound, with a short fade. */
  | { type: 'stopVoice'; tag: string; fade: number }
  /** A faint warmth left at a place on the floor (chair-relative metres), fading over `seconds`. */
  | { type: 'glow'; x: number; z: number; amount: number; seconds: number }
  /**
   * Write a phrase in the air between the chair and the visitor, `toward` metres from the
   * chair, `aside` metres to the visitor's left, at `height` above the floor, facing them.
   * It goes as they come near.
   */
  | { type: 'air'; phraseId: string; toward: number; aside: number; height: number }
  /**
   * A memory intruding on the room as light: late-afternoon window light falls across the wall
   * where a line is written, rises over `attack` seconds, holds, and leaves over `release`.
   */
  | { type: 'memory'; phraseId: string; attack: number; hold: number; release: number }
  /** A living memory opens round its line (src/memory; the App plays it and reports its end). */
  | { type: 'memory-scene'; id: string; phraseId: string; variant: string; minHold: number; maxHold: number }
  /** A drawing drawn on the wall, stroke by stroke (src/content/drawings.ts). */
  | { type: 'draw'; id: string }
  /** Rub out a piece of writing except for one word. */
  | { type: 'erode'; key: string; keep: string };

export interface TimedCue {
  t: number;
  cue: Cue;
  rule: string;
}
