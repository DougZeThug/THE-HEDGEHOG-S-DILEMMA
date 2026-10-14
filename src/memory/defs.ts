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
  /** A drawing on the room's wall the painting opens from, registered onto its lines. */
  opensFrom?: string;
  /** The white room's own light goes down to this while it plays (the door: evening). */
  roomDim?: number;
  /** What the picture is, for a screen reader (announced once, when it has formed). */
  describe: (variant: string) => string;
}

export const sheetId = (id: string, variant: string) => `${id}-${variant}`;

/**
 * Cereal: 22 s from the first graphite to the withdrawal, then the light goes down.
 *
 *   0.6      the kitchen is heard before anything is drawn
 *   0.6–3.6  the light finds the bowls and the spoon, then the rest of the drawing (graphite)
 *   1.5–5.5  the colour follows the light
 *   5.5      the scene is formed: only the kitchen's air under it (the artist turned down the
 *            radio and the spoons in the bowls); 10.5 a laugh at the table
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
        ...CEREAL.markers,
      ],
    };
  },
  cues: (variant) => ({
    // A small, bright kitchen.
    room: [0.5, 3, 0.18],
    cues: {
      // Levels are for the files as recorded, set by the sound designer from an offline render of
      // this chain, the air under everything. The air is made in the engine (synthAir.ts): the
      // recorded room tone came back as rumble. The radio (music/memory-radio.mp3) and the take of
      // spoons in two bowls were turned down by the artist on the audition sheet.
      'bed:kitchen': { asset: 'synth:air', gainDb: variant === 'later' ? -4 : 0, place: { u: 0.3, v: 0, d: 1 }, fadeIn: 3, fadeOut: 5 },
      'sfx:laugh': { asset: 'mem:laugh', gainDb: -12, place: { u: 0.15, v: -0.1, d: 1.2 }, lowpass: 5000, caption: '[a laugh at the table]' },
      'sfx:spoon-down': { asset: 'mem:spoon-bowl', take: 0, gainDb: -12, place: { u: 0.1, v: -0.25, d: 0.5 }, caption: '[a spoon put down]' },
    },
  }),
  sways: [],
  exit: 2.4,
  maxHold: 22,
  tail: 3,
  bleed: 'kitchen-light',
  bleedAt: 2,
  describe: (v) => v === 'later'
    ? 'A drawing forms in the wall under the words: the same kitchen table later on, both bowls empty, the cereal box on its side.'
    : 'A drawing forms in the wall under the words: a kitchen table in late sun, two bowls that do not match, a spoon, the cereal box left out.',
  hush: 0.5,
};

/**
 * The bedroom ("I was happiest when nobody needed anything from me"): the longest, about 26 s.
 *
 *   0.3      a bird outside, over bare plaster (sound leads)
 *   1.5–4    the light finds the window, then the bed (graphite)
 *   2.5–7    the colour follows the light
 *   8        someone downstairs starts playing (the first note through the floor is an event)
 *   7–24     living: the morning gets on. The sun's pane slides along the bed and reaches the
 *            pillow's dent (where someone slept) at about 22; at 10.4 the curtain lifts once, on
 *            its sound, and the window brightens with it
 *   26–32    the light recedes, taking the colour; the drawing alone; the piano rings out
 *
 * At dusk (a revisit): no birds, no piano; the sun lies on the wall above the bed and goes down.
 */
const BEDROOM_SECTIONS: Sections = { active: 7, exit: 26, residue: 32, end: 35 };

export const BEDROOM: MemoryDef = {
  id: 'bedroom',
  art: 'bedroom',
  variants: ['morning', 'dusk'],
  layers: ['room', 'curtain', 'bed', 'pencil', 'sun'],
  sections: BEDROOM_SECTIONS,
  markers: [
    { label: 'sfx:bird-1', position: 0.3 },
    { label: 'bed:air', position: 1 },
    { label: 'music:piano', position: 8 },
    { label: 'sfx:curtain', position: 9.8 },
  ],
  seed: (variant) => {
    const dusk = variant === 'dusk';
    return {
      tracks: {
        'window.sketch': [[1.5, 0], [4, 1]],
        'window.reveal': [[2.5, 0], [7, 1]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        // The light finds the window first, then opens over the bed.
        'light.x': [[1.5, 0.26], [7, 0], [26, 0.04]],
        'light.y': [[1.5, 0], [7, -0.08]],
        'light.radius': [[1.5, 0.14], [7, 0.52]],
        'light.soft': [[0, 0.16]],
        // Morning: pale, nearly white, warming a little as it gets on. Dusk: a sunset.
        'light.warmth': dusk ? [[0, 3300], [26, 2400]] : [[0, 5000], [22, 5400]],
        'light.intensity': dusk
          ? [[0, 0], [5, 0.9], [26, 0.3], [32, 0]]
          : [[0, 0], [6, 1.0], [10.4, 1.05], [11.4, 1.3], [12.6, 1.1], [22, 1.4], [26, 1.3], [32, 0]],
        'light.roomSpill': [[0, 0]],
        // The sun's pane slides along the bed toward the pillow (dusk: up the wall, fading).
        'layer:sun.x': dusk ? [[0, 0], [26, 0.04]] : [[0, 0], [22, -0.15]],
        'layer:sun.y': dusk ? [[0, 0], [26, 0.03]] : [[0, 0], [22, 0.02]],
        'layer:sun.opacity': [[0, 0], [3, 1]],
        // The curtain: one lift, its top on the rod, on the sound of it.
        'layer:curtain.skew': dusk ? [[0, 0], [12, 0], [13.2, 0.02], [15, 0]] : [[0, 0], [10.4, 0], [11.4, 0.035], [12.6, 0.012], [14.5, 0]],
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
        ...(dusk ? [{ label: 'bed:air', position: 1 }, { label: 'sfx:curtain', position: 11.4 }] : BEDROOM.markers),
      ],
    };
  },
  cues: (variant) => ({
    // A small, soft, rather dead room (bedding, curtains).
    room: [0.3, 2, 0.12],
    // Levels set from the files as measured (mean: bird −23, curtain −36, piano −21).
    cues: {
      'bed:air': { asset: 'synth:air', take: 3, gainDb: variant === 'dusk' ? -6 : -2, place: { u: 0.3, v: 0, d: 1 }, fadeIn: 3, fadeOut: 5 },
      // A bird outside, beyond the window: distance made here, not in the recording.
      'sfx:bird-1': { asset: 'mem:bird', take: 0, gainDb: -10, place: { u: 0.3, v: 0.1, d: 4 }, lowpass: 6000, fadeIn: 0.04, caption: '[a bird outside]' },
      'sfx:curtain': { asset: 'mem:curtain-breeze', gainDb: 3, place: { u: 0.13, v: 0, d: 0.4 }, caption: '[the curtain stirs]' },
      // Someone downstairs, playing for themselves: below, muffled by the floor. The first note
      // is heard, not faded in.
      'music:piano': { asset: 'music/memory-bedroom.mp3', gainDb: -14, place: { u: -0.1, v: -1.3, d: 2 }, lowpass: 1000, fadeIn: 0.3, fadeOut: 6, caption: '[a piano, downstairs]' },
    },
  }),
  // The curtain at rest, barely breathing at its foot (none under reduced motion).
  sways: [{ key: 'sway:curtain.skew', amp: 0.004, period: 7, at: 7 }],
  exit: 2.6,
  maxHold: 26,
  tail: 4,
  hush: 0.5,
  describe: (v) => v === 'dusk'
    ? 'A drawing forms in the wall by the words: the small bedroom at dusk, the bed still unmade, the last light on the wall above it.'
    : 'A drawing forms in the wall by the words: a small bedroom in the morning, an unmade bed with the sun across it, a mug on the floor, a curtain at the window.',
};

/**
 * The door ("the door, slightly open"), opened from the room's own drawn door. About 18 s.
 *
 * Approach (the first meeting):
 *   0–4.5    the white room goes to evening; the light finds the gap in the door (its two lines
 *            first), then the door, the floor, the blanket's edge
 *   5        footsteps on the landing, coming nearer
 *   ≈9.5     they stop outside; their shadow comes into the light and stays there
 *   14       a floorboard, just outside: someone shifting their weight
 *   18       the light recedes while they are still there. Nobody comes in. The door never closes.
 *
 * Passing (a return visit): someone walks along the landing; their shadow crosses the light.
 */
const DOOR_SECTIONS: Sections = { active: 4.5, exit: 18, residue: 22, end: 24 };

export const DOOR: MemoryDef = {
  id: 'door',
  art: 'door',
  variants: ['approach', 'passing'],
  layers: ['room', 'door', 'pencil', 'strip', 'shadow'],
  sections: DOOR_SECTIONS,
  markers: [
    { label: 'sfx:steps', position: 5 },
    { label: 'sfx:settle', position: 14 },
  ],
  seed: (variant) => {
    const passing = variant === 'passing';
    const exit = DOOR_SECTIONS.exit;
    return {
      tracks: {
        'window.sketch': [[0.6, 0], [3, 1]],
        'window.reveal': [[1.4, 0], [4.5, 1]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        // The light starts at the gap.
        'light.x': [[0, 0.13], [4.5, 0.1]],
        'light.y': [[0, 0.05], [4.5, -0.05]],
        'light.radius': [[0, 0.1], [4.5, 0.55]],
        'light.soft': [[0, 0.12]],
        // The landing's bulb: warm, and brighter than the evening room around it.
        'light.warmth': [[0, 2900]],
        'light.intensity': passing
          ? [[0, 0], [3, 1.6], [8.1, 1.6], [8.4, 1.25], [9.3, 1.6], [16, 1.5], [20, 0]]
          : [[0, 0], [3, 1.6], [18, 1.5], [22, 0]],
        // The shadow: approach comes into the light and stays (it is still there as the light
        // goes); passing crosses it, left to right, with the steps.
        'layer:shadow.x': passing ? [[0, -0.3, 'linear'], [7.7, -0.3, 'linear'], [9.1, 0.32]] : [[0, -0.3], [8.8, -0.3], [10.1, 0], [14, 0.006], [14.6, 0]],
        'layer:shadow.opacity': passing ? [[0, 0], [7.6, 0], [7.8, 0.8], [9.1, 0.8], [9.3, 0]] : [[0, 0], [8.7, 0], [9.6, 0.75]],
        'layer:strip.opacity': [[0, 0], [2.5, 1]],
        'layer:pencil.opacity': [[0, 0.9]],
        'layer:room.opacity': [[0, 1]],
        'layer:door.opacity': [[0, 1]],
      },
      markers: [
        { label: 'active', position: DOOR_SECTIONS.active },
        { label: 'exit', position: exit },
        { label: 'residue', position: exit + 4 },
        { label: 'end', position: exit + 6 },
        // (The approach's last step lands at about 9.7, as the shadow arrives; passing, the
        // loudest steps fall either side of the gap, at the light's lowest.)
        { label: 'sfx:steps', position: passing ? 7 : 5.3 },
        { label: 'sfx:settle', position: passing ? 13 : 14 },
      ],
    };
  },
  cues: (variant) => {
    const passing = variant === 'passing';
    return {
      // A narrow landing beyond the door: hard, a little reflective.
      room: [0.9, 2.2, 0.22],
      // Levels from the files as measured (mean: steps −28/−35, floorboard −34). The artist kept
      // the weight-shift creak and turned down the house settling, so passing uses the creak too.
      cues: {
        // Approach: from the far end of the landing to just outside the door, stopping there.
        // Passing: along the landing behind the wall, left to right.
        'sfx:steps': passing
          ? { asset: 'mem:footsteps', take: 0, gainDb: -5, place: { u: -1.0, v: -0.3, d: 2 }, to: { u: 2.7, v: -0.3, d: 2 }, lowpass: 3000, cutOnInterrupt: true, caption: '[footsteps on the landing]' }
          : { asset: 'mem:footsteps', take: 0, gainDb: -3, place: { u: -0.6, v: -0.3, d: 10 }, to: { u: 0.15, v: -0.3, d: 0.5 }, lowpass: 1500, lowpassTo: 5000, cutOnInterrupt: true, caption: '[footsteps on the landing]' },
        'sfx:settle': passing
          ? { asset: 'mem:floorboard', take: 0, gainDb: -7, place: { u: -0.5, v: -0.3, d: 5 }, lowpass: 2500 }
          : { asset: 'mem:floorboard', take: 0, gainDb: -2, place: { u: 0.15, v: -0.3, d: 0.8 }, lowpass: 5000, caption: '[a floorboard, just outside]' },
      },
    };
  },
  sways: [],
  exit: 2,
  maxHold: 18,
  tail: 2,
  hush: 0.75,
  opensFrom: 'ghost-door',
  roomDim: 0.55,
  describe: (v) => v === 'passing'
    ? 'The drawn door fills with evening: the landing light through the gap, and a shadow crossing it as someone passes.'
    : 'The drawn door fills with evening: the landing light through the gap; someone comes to the door and stops, their shadow in the light. Nobody comes in.',
};

export const MEMORIES: Record<string, MemoryDef> = { cereal: CEREAL, bedroom: BEDROOM, door: DOOR };
