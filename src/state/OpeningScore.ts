/**
 * The opening, as one score: what is seen, heard and allowed, second by second, from the
 * tap on the black threshold until the room is handed to the Director.
 *
 * Darkness, then a name; a sound in the dark (someone has just got up), a switch; a light
 * finding the chair, alone; the room coming up around it, nearly empty; a hand writing
 * "I wanted you to" — and stopping; then laughter, and what was said writing itself beside
 * it: "You've got crumbs on you." The unfinished wish and the ordinary intimacy are the
 * dilemma, said once, before anything is explained. (Decided in docs/reviews/2026-10-cinematic-opening.md.)
 *
 * Declarative and pure: `levelsAt` and `stageAt` are functions of time, so the score can be
 * inspected, tested and skipped. The App applies the levels to light, image and sound each
 * frame and performs the events once each. Time is wall-clock seconds since the tap.
 */

export type Stage = 'title' | 'dark' | 'chair' | 'room' | 'writing' | 'voice' | 'handoff' | 'done';

/** Everything the score holds, 0–1 unless noted. */
export interface Levels {
  /** Title card opacity. */
  title: number;
  /** The whole image covered in black. */
  black: number;
  /** Lights, as fractions of the room's own (Lighting.score). */
  key: number;
  area: number;
  hemi: number;
  glow: number;
  /** Key light's cone (radians): never narrower than a fixture's throw. */
  cone: number;
  /** Ceiling panel brightness and the ceiling's stand-in bounce (Room.setLit). */
  panel: number;
  ceiling: number;
  /** Extra darkening of the image (vignette and exposure) while the room is still dim. */
  dark: number;
  /** Room tone: the fixture's hum rises with its light; the air comes up with the walls. */
  hum: number;
  vent: number;
  /** What the visitor may do: look around; walk. */
  look: number;
  walk: number;
}

export type ScoreEvent =
  /** A sound from the existing library (a manifest key such as 'sfx:switch'), placed. */
  | { at: number; kind: 'sound'; key: string; where: 'chair' | 'door' | 'panel'; gain: number; caption?: string }
  /** Make the writing ready (in the dark, so writing it later costs nothing). */
  | { at: number; kind: 'prepare'; phrases: string[] }
  /** A hand writes a phrase, silently; `upto` words, then stops. */
  | { at: number; kind: 'write'; phrase: string; upto?: number; sound?: string }
  /** A voice, and its words written as they are heard, at `place` beside an existing phrase. */
  | { at: number; kind: 'voice'; phrase: string; file: string; text: string; hand: 'crayon' | 'pencil' | 'pen'; besideOf: string }
  | { at: number; kind: 'handoff' };

export interface Score {
  name: 'first' | 'return';
  stages: [Stage, number][];
  keys: { [K in keyof Levels]: [number, number][] };
  events: ScoreEvent[];
  /** Time of the hand-off to the Director. */
  handoff: number;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Value of a keyed track at `t` (eased between keys, held before the first and after the last). */
export function trackAt(keys: [number, number][], t: number): number {
  if (!keys.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * smooth((t - t0) / Math.max(1e-6, t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}

export function levelsAt(s: Score, t: number): Levels {
  const out = {} as Levels;
  for (const k of Object.keys(s.keys) as (keyof Levels)[]) out[k] = trackAt(s.keys[k], t);
  return out;
}

export function stageAt(s: Score, t: number): Stage {
  let st: Stage = s.stages[0][0];
  for (const [name, at] of s.stages) if (t >= at) st = name;
  return st;
}

/** The levels the room has once the opening is over. */
export const ROOM_LEVELS: Levels = { title: 0, black: 0, key: 1, area: 1, hemi: 1, glow: 1, cone: 0.82, panel: 1, ceiling: 1, dark: 0, hum: 1, vent: 1, look: 1, walk: 1 };

/**
 * The score for this visit. A first visit has the title; a phone's title is a second
 * shorter (the old phone build-up felt slow). A returning visitor goes straight to the light,
 * with the line written again and no voice.
 */
export function openingScore(o: { returning: boolean; touch: boolean }): Score {
  if (o.returning) {
    const T = 0.3;
    return {
      name: 'return',
      stages: [['dark', 0], ['chair', T + 0.4], ['room', T + 2.4], ['writing', T + 4.6], ['handoff', T + 8.5], ['done', T + 8.6]],
      keys: {
        title: [[0, 0]],
        black: [[0, 1], [T + 0.4, 1], [T + 0.5, 0]],
        key: [[T + 0.4, 0], [T + 2.4, 0.6], [T + 4.4, 1]],
        area: [[T + 2.4, 0], [T + 4.4, 1]],
        hemi: [[T + 0.4, 0.06], [T + 2.4, 0.1], [T + 4.4, 1]],
        glow: [[T + 1.2, 0], [T + 2.4, 0.5], [T + 4.4, 1]],
        cone: [[T + 2.4, 0.55], [T + 4.4, 0.82]],
        panel: [[T + 0.4, 0], [T + 1.0, 0.3], [T + 4.4, 1]],
        ceiling: [[T + 2.4, 0], [T + 4.4, 1]],
        dark: [[T + 0.4, 0.3], [T + 4.4, 0]],
        hum: [[T + 0.4, 0], [T + 2.4, 0.6], [T + 4.4, 1]],
        vent: [[T + 2.4, 0], [T + 4.4, 1]],
        look: [[T + 0.8, 0], [T + 0.9, 1]],
        walk: [[T + 2.4, 0], [T + 2.5, 1]],
      },
      events: [
        { at: 0, kind: 'prepare', phrases: ['stay'] },
        { at: T + 0.3, kind: 'sound', key: 'sfx:switch', where: 'door', gain: 0.55, caption: '[a switch]' },
        { at: T + 4.6, kind: 'write', phrase: 'stay', upto: 4, sound: 'sfx:graphite' },
        { at: T + 8.5, kind: 'handoff' },
      ],
      handoff: T + 8.5,
    };
  }
  // First visit. T: the title has gone and the screen is simply dark.
  const hold = o.touch ? 2.4 : 3.2;
  const T = 0.3 + 1.0 + hold + 1.0;
  // On a phone, everything after the title moves a little faster.
  const k = o.touch ? 0.85 : 1;
  const at = (x: number) => T + x * k;
  return {
    name: 'first',
    stages: [['title', 0], ['dark', T], ['chair', at(1.2)], ['room', at(5.4)], ['writing', at(9.8)], ['voice', at(14.2)], ['handoff', at(18.8)], ['done', at(18.9)]],
    keys: {
      title: [[0.3, 0], [1.3, 1], [1.3 + hold, 1], [T, 0]],
      black: [[0, 1], [at(1.2), 1], [at(1.3), 0]],
      // The chair, alone: a narrow-ish throw from the panel, the panel itself just glowing.
      key: [[at(1.2), 0], [at(1.9), 0.05], [at(5.4), 0.6], [at(9.4), 1]],
      area: [[at(5.4), 0], [at(9.4), 1]],
      // Never quite nothing: the walls are barely there, so it is a room, not a stage.
      hemi: [[at(1.2), 0.05], [at(5.4), 0.1], [at(9.4), 1]],
      glow: [[at(2.6), 0], [at(5.0), 0.5], [at(9.4), 1]],
      cone: [[at(5.4), 0.55], [at(9.4), 0.82]],
      // The fixture warming: a first glow, a small falter, then steady.
      panel: [[at(1.2), 0], [at(1.6), 0.18], [at(1.9), 0.1], [at(2.6), 0.3], [at(9.4), 1]],
      ceiling: [[at(5.4), 0], [at(9.4), 1]],
      dark: [[at(1.2), 0.35], [at(5.4), 0.2], [at(9.4), 0]],
      hum: [[at(1.2), 0], [at(2.6), 0.35], [at(5.4), 0.6], [at(9.4), 1]],
      vent: [[at(5.4), 0], [at(9.4), 1]],
      look: [[at(2.2), 0], [at(2.3), 1]],
      walk: [[at(6.4), 0], [at(6.5), 1]],
    },
    events: [
      // In the dark, while the title holds: the first lines are made ready.
      { at: 0.4, kind: 'prepare', phrases: ['stay'] },
      // Someone has just got up from the chair; then the switch by the door.
      { at: at(0.1), kind: 'sound', key: 'sfx:chair-creak', where: 'chair', gain: 0.22, caption: '[a chair, someone getting up]' },
      { at: at(1.0), kind: 'sound', key: 'sfx:switch', where: 'door', gain: 0.55, caption: '[a switch]' },
      { at: at(9.8), kind: 'write', phrase: 'stay', upto: 4, sound: 'sfx:graphite' },
      { at: at(14.2), kind: 'voice', phrase: 'crumbs', file: 'dialogue/crumbs--laughing.mp3', text: "You've got crumbs on you.", hand: 'crayon', besideOf: 'stay' },
      { at: at(18.8), kind: 'handoff' },
    ],
    handoff: at(18.8),
  };
}

/** What the opening leaves behind, for the Director to know at the hand-off. */
export const OPENING_WRITTEN = ['stay'];
export const OPENING_SPOKEN = ['crumbs'];
/** Left unfinished: "I wanted you to" — finished later by someone who stays with it, or never. */
export const OPENING_UNFINISHED = ['stay'];
