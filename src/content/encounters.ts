import type { Hand, Phase, VoiceStyle } from './types';
import type { Motif } from '../state/Memory';

/**
 * Encounters.
 *
 * Meaning accumulates through repeated context, not additional content. A phrase met a
 * second or third time is the same sentence; what surrounds it is not. Each arc lists, for
 * the 1st, 2nd, 3rd… meeting with a phrase, what (often nothing) happens around it.
 * A meeting with no listed beat is simply the phrase, alone.
 */

export type Gesture =
  | { voice: VoiceStyle; from: 'behind' | 'chair' | 'surface' | 'beyond' | 'nowhere'; gain?: number }
  /** Write the text of another phrase beside this one (usually an annotation-tier line). */
  | { annotate: string; hand?: Hand; strike?: boolean }
  | { reveal: string; link?: boolean }
  | { sound: 'door' | 'chair-creak' | 'cup'; gain?: number }
  | { silence: number; seconds: number }
  | { breath: 'behind' | 'chair' };

export interface EncounterBeat {
  /** [] means: deliberately nothing. */
  gestures: Gesture[];
  /** Seconds after the meeting begins. */
  delay?: number;
  when?: { phase?: Phase[]; motif?: Motif; near?: boolean };
}

/** Per encounter (index 0 = first meeting), a list of variants; the first whose `when` holds is used. */
export type Arc = EncounterBeat[][];

const alone: EncounterBeat[] = [{ gestures: [] }];

export const ARCS: Record<string, Arc> = {
  // The visitor's own example: alone; then said from behind, with an answer written beside it;
  // then nothing new — only a door, somewhere else, closing.
  stay: [
    alone,
    [{ gestures: [{ voice: 'tender', from: 'behind', gain: 0.55 }, { annotate: 'didnt-know-how', hand: 'pencil' }], delay: 2 }],
    [{ gestures: [{ sound: 'door', gain: 0.5 }], delay: 3 }],
  ],
  closer: [
    alone,
    [{ gestures: [{ silence: 0.5, seconds: 6 }], delay: 2 }],
    [{ gestures: [{ annotate: 'come-back-dont', hand: 'faint' }], when: { motif: 'hesitation' } }, { gestures: [] }],
  ],
  'alone-ok': [
    alone,
    alone,
    [{ gestures: [{ voice: 'tender', from: 'nowhere', gain: 0.45 }], when: { phase: ['transform'] } }, { gestures: [{ sound: 'cup', gain: 0.45 }], delay: 2 }],
    [{ gestures: [{ annotate: 'raining-anyway', hand: 'faint' }] }],
  ],
  laugh: [
    alone,
    [{ gestures: [{ silence: 0.5, seconds: 6 }], delay: 0.5 }],
    [{ gestures: [{ annotate: 'two-cups', hand: 'cyan' }], delay: 2 }],
  ],
  'happy-then': [
    alone,
    [{ gestures: [{ voice: 'tender', from: 'surface', gain: 0.45 }], delay: 2 }],
    // (No third beat: "Nobody tells you how ordinary it feels." beside this line glossed the charger,
    // which now opens from it. The two still meet late, on the west wall: rc-happy-ordinary.)
  ],
  'why-understand': [
    alone,
    [{ gestures: [{ annotate: 'didnt-explain', hand: 'pencil' }], delay: 2 }],
    [{ gestures: [{ voice: 'flat', from: 'surface', gain: 0.5 }], delay: 1 }],
  ],
  'need-no-one': [
    alone,
    alone,
    [{ gestures: [{ annotate: 'this-bit', hand: 'faint' }], delay: 2 }],
  ],
  'good-day': [
    alone,
    [{ gestures: [{ sound: 'cup', gain: 0.4 }], delay: 3 }],
  ],
  'not-going': [
    alone,
    [{ gestures: [{ voice: 'tender', from: 'chair', gain: 0.5 }], delay: 2 }],
    [{ gestures: [{ silence: 0.6, seconds: 8 }], delay: 1 }],
  ],
  'afraid-leave': [
    alone,
    [{ gestures: [{ annotate: 'maybe-wanted', hand: 'pencil' }], delay: 2 }],
    [{ gestures: [{ sound: 'door', gain: 0.4 }], delay: 4 }],
  ],
  'remember-me': [
    alone,
    [{ gestures: [{ voice: 'child', from: 'beyond', gain: 0.4 }], delay: 3 }],
  ],
  'im-fine': [
    alone,
    alone,
    [{ gestures: [{ sound: 'cup', gain: 0.35 }], delay: 2 }],
  ],
  'look-at-me': [
    alone,
    [{ gestures: [{ voice: 'whisper', from: 'surface', gain: 0.4 }], delay: 1 }],
  ],
  'used-to-fit': [
    alone,
    [{ gestures: [{ sound: 'chair-creak', gain: 0.45 }], delay: 2 }],
  ],
  'still-here': [
    alone,
    [{ gestures: [{ voice: 'tender', from: 'nowhere', gain: 0.4 }], delay: 2 }],
  ],
};
