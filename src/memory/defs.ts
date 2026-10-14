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

export const MEMORIES: Record<string, MemoryDef> = { cereal: CEREAL };
