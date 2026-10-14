import type { CueSheet } from './cueSheet';
import type { SheetSeed } from './seed';
import type { Sway } from './behaviours';
import type { Marker, Sections } from './types';

/**
 * The living memories' playable definitions (docs/memories.md): what each one's authored
 * timeline starts as (its Theatre seed, saved over in Studio), what it sounds like (its cue
 * sheet; timing is on the timeline's markers), and the few procedural choices. Which phrase
 * opens which memory, and when, is the Director's (src/content/memories.ts).
 *
 * Loaded only with the memory runtime (a lazy chunk).
 */
export interface MemoryDef {
  id: string;
  /** Art folder in public/memories/<art>/<variant>/. */
  art: string;
  variants: string[];
  /** Layers, back to front, with their kinds (from the art manifest; repeated here for the seed). */
  layers: string[];
  /** Fallbacks if the sheet has no section or sound markers yet. */
  sections: Sections;
  markers: Marker[];
  seed: (variant: string) => SheetSeed;
  cues: (variant: string) => CueSheet;
  sways: Sway[];
  /** Seconds of a graceful early exit. */
  exit: number;
  /** The longest the living scene is held before it closes itself. */
  maxHold: number;
  /** Seconds sound may run on after the image has gone. */
  tail: number;
  /** What stays in the room after a natural close, and when it comes (seconds after `exit`). */
  bleed?: 'kitchen-light';
  bleedAt?: number;
  /** How deep the room hushes while it plays. */
  hush: number;
}

export const sheetId = (id: string, variant: string) => `${id}-${variant}`;

/**
 * Cereal: 22 s from the first graphite to the withdrawal, then the light goes down.
 *
 *   0.6      the kitchen is heard before anything is drawn
 *   0.6–3.6  the light finds the bowls and the spoon, then the rest of the drawing (graphite)
 *   1.5–5.5  the colour follows the light
 *   5.5      the scene is formed: the radio comes on, the spoons
 *   7.3      the spoons; 10.5 a laugh at the table
 *   5.5–22   living: one arc of light. The sun's pane slides off the words and down toward the
 *            table; it lifts a little after the laugh, then the evening goes down
 *   21.2     a spoon put down: the meal ends, and 0.8 s later the light answers
 *   22–28    the light recedes, taking the colour; the drawing stands alone, then sinks
 *   24       the kitchen's sun is in the room (the bleed), overlapping the painted one
 *   28–32    what stays
 *
 * A visitor who stays isn't held on a frozen frame: at 22 it closes itself.
 */
const CEREAL_SECTIONS: Sections = { active: 5.5, exit: 22, residue: 28, end: 32 };

export const CEREAL: MemoryDef = {
  id: 'cereal',
  art: 'cereal',
  variants: ['first', 'later'],
  layers: ['curtain', 'table', 'things', 'pencil', 'sun'],
  sections: CEREAL_SECTIONS,
  markers: [
    { label: 'bed:kitchen', position: 0.6 },
    { label: 'music:radio', position: 5.5 },
    { label: 'sfx:spoons', position: 7.3 },
    // Inside the minimum hold: a visitor who gives it only that still hears the people.
    { label: 'sfx:laugh', position: 10.5 },
    // (The file has 0.6 s of quiet before the clink: heard at about 21.8, just before the light goes.)
    { label: 'sfx:spoon-down', position: 21.2 },
  ],
  seed: (variant) => {
    const later = variant === 'later';
    return {
      tracks: {
        'window.sketch': [[0.6, 0], [3.6, 1]],
        'window.reveal': [[1.5, 0], [5.5, 1]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        // The light: it finds the spoon first, opens over the table, then drifts with the sun.
        'light.x': [[0, -0.03], [5.5, 0.06], [22, -0.08]],
        'light.y': [[0, -0.13], [5.5, 0]],
        'light.radius': [[0, 0.15], [5.5, 0.5]],
        'light.soft': [[0, 0.14]],
        // Late sun (about the kitchen-light memory's colour), warmer as the evening goes down.
        'light.warmth': [[0, later ? 3600 : 4000], [22, later ? 3200 : 3500]],
        'light.intensity': later
          ? [[0, 0], [4, 0.45], [22, 0.35], [28, 0]]
          : [[0, 0], [4, 0.6], [10, 0.6], [11.5, 0.7], [22, 0.5], [28, 0]],
        'light.roomSpill': [[0, 1]],
        // The sun's pane slides off the words and down toward the table, as the sun does.
        'layer:sun.x': [[0, 0], [22, -0.09]],
        'layer:sun.y': [[0, 0], [22, -0.05]],
        'layer:sun.opacity': [[0, 0], [3.5, 1]],
        'layer:pencil.opacity': [[0, 0.9]],
        'layer:curtain.opacity': [[0, 1]],
        'layer:table.opacity': [[0, 1]],
        'layer:things.opacity': [[0, 1]],
      },
      markers: [
        { label: 'active', position: CEREAL_SECTIONS.active },
        { label: 'exit', position: CEREAL_SECTIONS.exit },
        { label: 'residue', position: CEREAL_SECTIONS.residue },
        { label: 'end', position: CEREAL_SECTIONS.end },
        ...CEREAL.markers.filter((m) => !(later && m.label === 'music:radio')),
      ],
    };
  },
  cues: (variant) => ({
    // A small, bright kitchen.
    room: [0.5, 3, 0.18],
    cues: {
      // Levels are for the files as recorded, set by the sound designer from an offline render of
      // this chain: the laugh about 6 dB over the radio in a phone's band, the spoons about 2 dB
      // over it, the air under everything. The air is made in the engine (synthAir.ts): the
      // recorded room tone came back as rumble.
      'bed:kitchen': { asset: 'synth:air', gainDb: variant === 'later' ? -4 : 0, place: { u: 0.3, v: 0, d: 1 }, fadeIn: 3, fadeOut: 5 },
      'sfx:spoons': { asset: 'mem:spoon-bowl', take: 0, gainDb: 2, place: { u: -0.05, v: -0.25, d: 0.5 }, caption: '[two spoons]' },
      'sfx:laugh': { asset: 'mem:laugh', gainDb: -12, place: { u: 0.15, v: -0.1, d: 1.2 }, lowpass: 5000, caption: '[a laugh at the table]' },
      'sfx:spoon-down': { asset: 'mem:spoon-bowl', take: 1, gainDb: -12, place: { u: 0.1, v: -0.25, d: 0.5 }, caption: '[a spoon put down]' },
      // The kitchen radio on the windowsill: a small speaker (no bass, no air), half-heard.
      'music:radio': { asset: 'music/memory-radio.mp3', gainDb: -16, place: { u: 0.42, v: 0.05, d: 0.8 }, highpass: 380, lowpass: 3400, fadeIn: 1.5, fadeOut: 4, caption: '[a radio, low]' },
    },
  }),
  sways: [],
  exit: 2.4,
  maxHold: 22,
  tail: 3,
  bleed: 'kitchen-light',
  bleedAt: 2,
  hush: 0.5,
};

/**
 * The bedroom ("I was happiest when nobody needed anything from me"): the longest, about 26 s.
 *
 *   0.5      the morning's air before anything is drawn
 *   0.5–3.5  the light finds the window, then the bed (graphite)
 *   1.5–6    the colour follows the light; a bird outside at 4.5
 *   8        someone downstairs starts playing the piano (music:piano); the curtain breathes
 *   8–26     living: the sun lies across the bed and moves a little along it; one more bird
 *   26–32    the light recedes, taking the colour; the drawing alone, then plaster
 *
 * At dusk (a revisit): lower, warmer light; no birds, no piano; the curtain once.
 */
const BEDROOM_SECTIONS: Sections = { active: 6, exit: 26, residue: 32, end: 35 };

export const BEDROOM: MemoryDef = {
  id: 'bedroom',
  art: 'bedroom',
  variants: ['morning', 'dusk'],
  layers: ['room', 'curtain', 'bed', 'pencil', 'sun'],
  sections: BEDROOM_SECTIONS,
  markers: [
    { label: 'bed:air', position: 0.5 },
    { label: 'sfx:bird-1', position: 4.5 },
    { label: 'music:piano', position: 8 },
    { label: 'sfx:curtain', position: 10.2 },
    { label: 'sfx:bird-2', position: 17.3 },
  ],
  seed: (variant) => {
    const dusk = variant === 'dusk';
    return {
      tracks: {
        'window.sketch': [[0.5, 0], [3.5, 1]],
        'window.reveal': [[1.5, 0], [6, 1]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        // The light finds the window first, then opens over the bed.
        'light.x': [[0, 0.26], [6, 0], [26, 0.04]],
        'light.y': [[0, 0], [6, -0.08]],
        'light.radius': [[0, 0.14], [6, 0.52]],
        'light.soft': [[0, 0.16]],
        // Morning: pale, nearly white (not kitchen-light's amber). Dusk: low and warm.
        'light.warmth': dusk ? [[0, 3300], [26, 2800]] : [[0, 5000], [26, 4600]],
        'light.intensity': dusk ? [[0, 0], [5, 0.35], [26, 0.25], [32, 0]] : [[0, 0], [5, 0.5], [26, 0.55], [32, 0]],
        'light.roomSpill': [[0, 0]],
        // The sun's pane moves a little along the bed, at the sun's own pace.
        'layer:sun.x': [[0, 0], [26, dusk ? 0.03 : 0.06]],
        'layer:sun.y': [[0, 0], [26, dusk ? 0.03 : 0.01]],
        'layer:sun.opacity': [[0, 0], [3, 1]],
        'layer:pencil.opacity': [[0, 0.9]],
        'layer:room.opacity': [[0, 1]],
        'layer:curtain.opacity': [[0, 1]],
        'layer:bed.opacity': [[0, 1]],
      },
      markers: [
        { label: 'active', position: BEDROOM_SECTIONS.active },
        { label: 'exit', position: BEDROOM_SECTIONS.exit },
        { label: 'residue', position: BEDROOM_SECTIONS.residue },
        { label: 'end', position: BEDROOM_SECTIONS.end },
        ...BEDROOM.markers.filter((m) => !(dusk && /^(music:piano|sfx:bird)/.test(m.label))),
      ],
    };
  },
  cues: (variant) => ({
    // A small, soft, rather dead room (bedding, curtains).
    room: [0.3, 2, 0.12],
    // Levels set from the files as measured (mean: birds −22/−23, curtain −36, piano −21).
    cues: {
      'bed:air': { asset: 'synth:air', take: 3, gainDb: variant === 'dusk' ? -6 : -2, place: { u: 0.3, v: 0, d: 1 }, fadeIn: 3, fadeOut: 5 },
      // Birds outside, beyond the window: distance made here, not in the recording.
      'sfx:bird-1': { asset: 'mem:bird', take: 0, gainDb: -10, place: { u: 0.3, v: 0.1, d: 4 }, lowpass: 6000, caption: '[a bird outside]' },
      'sfx:bird-2': { asset: 'mem:bird', take: 1, gainDb: -12, place: { u: 0.36, v: 0.12, d: 5 }, lowpass: 5500 },
      'sfx:curtain': { asset: 'mem:curtain-breeze', gainDb: -3, place: { u: 0.13, v: 0, d: 0.4 }, caption: '[the curtain stirs]' },
      // Someone downstairs, playing for themselves: below, muffled by the floor.
      'music:piano': { asset: 'music/memory-bedroom.mp3', gainDb: -10, place: { u: -0.1, v: -1.3, d: 2 }, lowpass: 1700, fadeIn: 5, fadeOut: 6, caption: '[a piano, downstairs]' },
    },
  }),
  sways: [{ key: 'sway:curtain.x', amp: 0.006, period: 7, at: 8 }],
  exit: 2.6,
  maxHold: 26,
  tail: 3,
  hush: 0.5,
};

/**
 * The door ("the door, slightly open"): the shortest, about 16 s, and the quietest.
 *
 *   0.4      a floorboard somewhere (sound leads); the light finds the gap in the door
 *   0.4–4.5  the drawing, then the evening room; the landing's light through the gap
 *   6        someone walks along the landing; at about 8 their shadow crosses the light
 *   8–16     stillness; the house settles
 *   16–20    the light recedes
 *
 * Approach (a revisit): the steps come nearer and stop outside; the light stays half-blocked.
 * Nobody comes in. The door never closes.
 */
const DOOR_SECTIONS: Sections = { active: 4.5, exit: 16, residue: 20, end: 22 };

export const DOOR: MemoryDef = {
  id: 'door',
  art: 'door',
  variants: ['passing', 'approach'],
  layers: ['room', 'door', 'pencil', 'strip'],
  sections: DOOR_SECTIONS,
  markers: [
    { label: 'sfx:floorboard', position: 0.4 },
    { label: 'sfx:steps', position: 6 },
    { label: 'sfx:settle', position: 13 },
  ],
  seed: (variant) => {
    const approach = variant === 'approach';
    return {
      tracks: {
        'window.sketch': [[0.4, 0], [3, 1]],
        'window.reveal': [[1.2, 0], [4.5, 1]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        'light.x': [[0, 0.1], [4.5, 0.05]],
        'light.y': [[0, -0.12], [4.5, -0.06]],
        'light.radius': [[0, 0.12], [4.5, 0.5]],
        'light.soft': [[0, 0.12]],
        // The landing's bulb: warm.
        'light.warmth': [[0, 2700]],
        'light.intensity': [[0, 0], [3, 0.75], [16, 0.7], [20, 0]],
        'light.roomSpill': [[0, 0]],
        // The shadow is only the light in the gap dimming as someone crosses it.
        'layer:strip.opacity': approach
          ? [[0, 0], [2.5, 1], [9.4, 1], [10, 0.45]]
          : [[0, 0], [2.5, 1], [7.7, 1], [8.3, 0.3], [9.1, 1]],
        'layer:pencil.opacity': [[0, 0.9]],
        'layer:room.opacity': [[0, 1]],
        'layer:door.opacity': [[0, 1]],
      },
      markers: [
        { label: 'active', position: DOOR_SECTIONS.active },
        { label: 'exit', position: DOOR_SECTIONS.exit },
        { label: 'residue', position: DOOR_SECTIONS.residue },
        { label: 'end', position: DOOR_SECTIONS.end },
        ...(approach
          ? [
              { label: 'sfx:steps', position: 5 },
              { label: 'sfx:settle', position: 13 },
            ]
          : DOOR.markers),
      ],
    };
  },
  cues: (variant) => {
    const approach = variant === 'approach';
    return {
      // A narrow landing beyond the door: hard, a little reflective.
      room: [0.9, 2.2, 0.22],
      // Levels from the files as measured (mean: steps −28/−35, floorboards −34/−32).
      cues: {
        'sfx:floorboard': { asset: 'mem:floorboard', take: 1, gainDb: -9, place: { u: 0.4, v: -0.3, d: 3 }, lowpass: 3500, caption: '[a floorboard]' },
        // Passing: along the landing, behind the wall, left to right. Approach: from the far end
        // of the landing to just outside the door, and stopping there.
        'sfx:steps': approach
          ? { asset: 'mem:footsteps', take: 1, gainDb: 1, place: { u: -0.6, v: -0.3, d: 6 }, to: { u: 0.1, v: -0.3, d: 0.8 }, lowpass: 1500, lowpassTo: 5000, cutOnInterrupt: true, caption: '[footsteps, coming closer, stopping]' }
          : { asset: 'mem:footsteps', take: 0, gainDb: -5, place: { u: -0.8, v: -0.3, d: 2.5 }, to: { u: 0.9, v: -0.3, d: 2.5 }, lowpass: 3000, cutOnInterrupt: true, caption: '[footsteps, passing outside]' },
        'sfx:settle': approach
          ? { asset: 'mem:floorboard', take: 0, gainDb: -6, place: { u: 0.1, v: -0.3, d: 0.8 }, lowpass: 5000, caption: '[a floorboard, just outside]' }
          : { asset: 'mem:floorboard', take: 1, gainDb: -14, place: { u: -0.5, v: -0.3, d: 5 }, lowpass: 2500 },
      },
    };
  },
  sways: [],
  exit: 2,
  maxHold: 16,
  tail: 2,
  hush: 0.75,
};

export const MEMORIES: Record<string, MemoryDef> = { cereal: CEREAL, bedroom: BEDROOM, door: DOOR };
