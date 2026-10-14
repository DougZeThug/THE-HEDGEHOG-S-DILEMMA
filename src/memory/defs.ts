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
  residue?: { rise: number; hold: number; fall: number };
  /** The longest the living scene is held before it closes itself. */
  maxHold: number;
  /** Seconds sound may run on after the image has gone. */
  tail: number;
  /** What stays in the room after a natural close. */
  bleed?: 'kitchen-light';
  /** How deep the room hushes while it plays. */
  hush: number;
}

export const sheetId = (id: string, variant: string) => `${id}-${variant}`;

/**
 * Cereal: about 22 s from the first graphite to the dissolve, held while the visitor stays.
 *
 *   0–3      the light finds the drawing (graphite)
 *   1.5–5.5  the colour follows the light; the room's air comes in
 *   5.5      the scene is formed: the radio comes on (music:radio), a spoon
 *   5.5–22   living: the sun's pane slides slowly down the wall (late afternoon), the laugh at 13
 *   22       withdrawal: the light recedes, taking the colour; a spoon is put down
 *   26       residue: the kitchen-light patch stays on the wall
 */
const CEREAL_SECTIONS: Sections = { active: 5.5, exit: 22, residue: 26, end: 30 };

export const CEREAL: MemoryDef = {
  id: 'cereal',
  art: 'cereal',
  variants: ['first', 'later'],
  layers: ['wall', 'curtain', 'table', 'things', 'pencil', 'sun'],
  sections: CEREAL_SECTIONS,
  markers: [
    { label: 'bed:kitchen', position: 2 },
    { label: 'music:radio', position: 5.5 },
    { label: 'sfx:spoons', position: 6.2 },
    { label: 'sfx:laugh', position: 13 },
    { label: 'sfx:spoon-down', position: 22.6 },
  ],
  seed: (variant) => {
    const later = variant === 'later';
    return {
      tracks: {
        'window.sketch': [[0, 0], [3, 1]],
        'window.reveal': [[1.5, 0], [5.5, 1]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        // The light: a warm late-afternoon sun, its pool centred on the table, growing as it
        // finds the drawing; later in the evening it is lower and warmer.
        'light.x': [[0, 0.08], [22, -0.02]],
        'light.y': [[0, 0.02]],
        'light.radius': [[0, 0.3], [5.5, 0.5]],
        'light.soft': [[0, 0.14]],
        'light.warmth': [[0, later ? 2600 : 3200], [22, later ? 2400 : 2900]],
        'light.intensity': [[0, 0], [4, later ? 0.45 : 0.6], [22, later ? 0.4 : 0.65]],
        'light.roomSpill': [[0, 1]],
        // The sun's pane slides slowly down and along the wall, as the sun does.
        'layer:sun.x': [[0, 0], [22, -0.035]],
        'layer:sun.y': [[0, 0], [22, -0.02]],
        'layer:sun.opacity': [[0, 0], [3.5, 1]],
        'layer:pencil.opacity': [[0, 0.9]],
        'layer:wall.opacity': [[0, 1]],
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
      // Levels are for the files as recorded (measured mean, dB): toward a bed at about −41, spoons
      // about −32, the laugh at about −36. The air came back at −69 and is lifted a long way.
      'bed:kitchen': { asset: 'mem:kitchen-air', gainDb: variant === 'later' ? 24 : 28, place: { u: 0.3, v: 0, d: 1 }, fadeIn: 3, fadeOut: 5, lowpass: variant === 'later' ? 2500 : undefined },
      'sfx:spoons': { asset: 'mem:spoon-bowl', take: 0, gainDb: 0, place: { u: -0.05, v: -0.25, d: 0.5 }, caption: '[spoons in two bowls]' },
      'sfx:laugh': { asset: 'mem:laugh', gainDb: -16, place: { u: 0.15, v: -0.1, d: 1.2 }, lowpass: 5000, caption: '[two people laughing]' },
      'sfx:spoon-down': { asset: 'mem:spoon-bowl', take: 1, gainDb: -9, place: { u: 0.1, v: -0.25, d: 0.5 }, caption: '[a spoon put down]' },
      // The kitchen radio on the windowsill (generated after the timing is set; silent until then).
      'music:radio': { asset: 'music/memory-radio.mp3', gainDb: -14, place: { u: 0.42, v: 0.05, d: 0.8 }, lowpass: 3200, fadeIn: 1.5, fadeOut: 4, caption: '[a radio playing in the kitchen]' },
    },
  }),
  sways: [],
  exit: 1.6,
  residue: { rise: 1.5, hold: 2.5, fall: 3 },
  maxHold: 30,
  tail: 3,
  bleed: 'kitchen-light',
  hush: 0.5,
};

export const MEMORIES: Record<string, MemoryDef> = { cereal: CEREAL };
