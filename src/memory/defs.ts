import type { CueSheet } from './cueSheet';
import type { Key, SheetSeed } from './seed';
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
  /**
   * The variant whose music is the room's last (the woodland's afternoon): the room's drone is
   * silent from its start (a chord of the room's under it, a semitone from its key), and once it
   * has been seen the room plays no music of its own again that visit, the drone, its piano, its
   * humming: the music that belonged to that afternoon never returns, and nothing stands in for it
   * (the artist's brief of 2026-10-19; the creative and cinematic directors' reviews).
   */
  lastMusic?: string;
  /** What the picture is, for a screen reader (announced once, when it has formed). */
  describe: (variant: string) => string;
  /**
   * What changes later, told to a screen reader at the moment it happens (sequence seconds): only
   * to someone taken in (`inside`), only to someone it stayed on the wall for (`wall`), or only
   * while a close-up is shown (`shot`).
   */
  announce?: (variant: string) => { at: number; text: string; inside?: boolean; wall?: boolean; shot?: number }[];
  /**
   * A line written where the painting was, as it goes (the woodland's: decisions 119–123): once, at
   * `at` (sequence seconds) of `variant`, in the hand and size of the memory's own line, under it
   * and inside the painting's former place; only for someone taken in, to a memory that played on
   * to there unbroken. Told to a screen reader as it is written.
   */
  coda?: { variant: string; at: number; text: string };
  /**
   * A living memory (animated, and entered): its scene's object names in the timeline (`scene`,
   * `figure:a`, `figure:b`) are added to the schema, and the variants that have a living scene in
   * the art manifest are drawn by it (src/memory/living/). The others play on the wall as usual,
   * but sunk in the plaster as the scene is, and over their words, which go to a trace as the
   * colour comes and come back with the pencil (src/App.ts).
   */
  living?: boolean;
}

export const sheetId = (id: string, variant: string) => `${id}-${variant}`;

/**
 * Cereal: 22 s from the first graphite to the withdrawal, then the light goes down.
 *
 *   0.6      the kitchen is heard before anything is drawn
 *   0.6–3.6  the light finds the bowls and the spoon, then the rest of the drawing (graphite)
 *   1.5–5.5  the colour follows the light
 *   5.5      the scene is formed: the radio comes on (a folk waltz, the artist's choice)
 *   7.3      two people eating; 10.5 a laugh at the table; 15.2 one of them eating on
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
    { label: 'sfx:eating', position: 7.3 },
    // Inside the minimum hold: a visitor who gives it only that still hears the people.
    { label: 'sfx:laugh', position: 10.5 },
    { label: 'sfx:eating-later', position: 15.2 },
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
        // Years later the bowls are empty: no radio, nobody eating, only the spoon put down.
        ...CEREAL.markers.filter((m) => !(later && /^(music:radio|sfx:eating)/.test(m.label))),
      ],
    };
  },
  cues: (variant) => ({
    // A small, bright kitchen.
    room: [0.5, 3, 0.18],
    cues: {
      // Levels are for the files as recorded, set by the sound designer from an offline render of
      // this chain, the air under everything. The air is made in the engine (synthAir.ts): the
      // recorded room tone came back as rumble. The radio and the eating are the artist's choices
      // from the options on the audition sheet (14 Oct); the first radio and spoons were turned down.
      'bed:kitchen': { asset: 'synth:air', gainDb: variant === 'later' ? -4 : 0, place: { u: 0.3, v: 0, d: 1 }, fadeIn: 3, fadeOut: 5 },
      // Two people, two bowls (recorded quiet: mean −41 dB), then one of them eating on (−34).
      'sfx:eating': { asset: 'mem:eating', take: 1, gainDb: 10, place: { u: -0.05, v: -0.25, d: 0.5 }, caption: '[two people eating]' },
      'sfx:eating-later': { asset: 'mem:eating', take: 0, gainDb: -1, place: { u: 0.05, v: -0.25, d: 0.6 } },
      'sfx:laugh': { asset: 'mem:laugh', gainDb: -12, place: { u: 0.15, v: -0.1, d: 1.2 }, lowpass: 5000, caption: '[a laugh at the table]' },
      'sfx:spoon-down': { asset: 'mem:spoon-bowl', take: 0, gainDb: -12, place: { u: 0.1, v: -0.25, d: 0.5 }, caption: '[a spoon put down]' },
      // The kitchen radio on the windowsill: a small speaker (no bass, no air), half-heard. A folk
      // waltz, guitar and fiddle (mean −16 dB, as the first radio was).
      'music:radio': { asset: 'music/memory-radio-folk-c.mp3', gainDb: -15.5, place: { u: 0.42, v: 0.05, d: 0.8 }, highpass: 380, lowpass: 3400, fadeIn: 1.5, fadeOut: 4, caption: '[a radio, low]' },
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

/**
 * Five More Minutes (docs/reviews/2026-10-woodland.md): two people lying in a summer clearing.
 * Nothing happens. Then they are gone. The artist's shot list (2026-10-17), about 50 s and a
 * cicada after:
 *
 *   0–6       1 the room remembers: a cicada beyond the wall (1.2); the pencil finds the clearing
 *             from the line outward from 2.0 (light lines first, the two of them last), the room's
 *             writing with it, while the visitor drifts toward the wall (their look
 *             their own; a look away holds it, a step held lets it go; they are taken in if they
 *             are looking at it when it would take them)
 *   5.4–10.5  2 crossing in: the drawing whole, the colour comes, from between the two of them
 *             outward as one light wash, the room's writing going to a trace just ahead of it;
 *             the painting begins to live (5.5–7), its light comes up (7.1–8.3), and the same move
 *             carries them on, square to it; it opens out until it is all there is (8.2–9.8); as
 *             it opens, a piano, already playing (8.5): someone at an upright, for nobody, a plain
 *             tune going round in its own time (scripts/woodland-score/)
 *   10.5–15.0 3 an ordinary afternoon: the wide, both looking up; breathing; cicadas in the trees,
 *             a far bird; a light gust crosses the clearing (11.5: seen, not heard); her crossed
 *             foot rocks a while; his blink
 *   15.0–27.0 4 cut: the two of them close, one frame, held (the artist's own panel: both faces,
 *             and their hands lying almost touching in the grass between them, as drawn, never
 *             moved). Both looking up, each breathing in their own time; he blinks (16.2). Her eyes
 *             go to him (17.5) and her head follows, a little (18.0–19.0: her own head from the
 *             panel, turned 14° toward him, on twos), and she stays looking at him; he is looking
 *             at the sky. His eyes go to her (24.0), his head a little after (24.5), and he stays
 *             too. (Where there is only the wide, on an upright screen, his look is too small to
 *             see there: her look goes unanswered.)
 *             (The cicada over them, and the two either side, are quiet through it; the tune comes
 *             home once between her look and his, 21.2, and both looks fall in its long notes. The
 *             artist's shot list had him look first and her notice: reversed, and recorded, in the
 *             review of 2026-10-18.)
 *   27.0–34.5 5 the wide again, cut while they are looking at each other: the longest shot
 *             (nothing in its first second); the cicada over them again (28.0); a far bird; the
 *             air dying down; still from 32, both between breaths at the cut; the tune going round
 *             again, the same, toward home
 *   34.5      6 a cut, on one frame, in that stillness: the same clearing, the same view, at dusk,
 *             and nobody there. The piano stops on it, a note before home (due at 34.77), with
 *             everything of the afternoon's (its insects); the evening's cicadas are already
 *             singing, far off in the trees (the artist's brief of 2026-10-19; no wind: the breeze is
 *             light, seen and not heard, the artist, 2026-10-20)
 *   34.5–42.5 the empty clearing at dusk, held; the evening cicadas; the evening's breeze dying
 *             down in the grass; no music
 *   42.5–46.5 out: carried back, the painting gathers itself to the wall
 *   46–49.5   the colour goes, the empty clearing's pencil alone a while; the graphite sinks and
 *             the room's writing comes back with it (49.8–51.3)
 *   48.5–52.5 one evening cicada, far off, heard in the white room
 *
 * What they might have said, never said (no line is spoken, written or captioned):
 *   "We should probably go." / "Yeah." / … / "Five more minutes?" (not answered)
 *
 * The revisit (empty): the same clearing at dusk, nobody in it, and it stays in the wall.
 */
const WOODLAND_SECTIONS: Sections = { active: 6, exit: 42.5, residue: 49.5, end: 53 };
/** The cut: the people gone and the evening come, on the same frame. */
export const CUT = 34.5;
/** The evening comes up over the afternoon's 40 ms cut, full on it (the two cross over the same
 *  40 ms, so nothing dips: a hole of 9.5 dB had opened with the wind gone), this far into its file
 *  (past an MP3's first moments). */
export const EVENING_AT = CUT - 0.04;
export const EVENING_OFFSET = 0.03;
/** Where the score's file begins (its first note, the turnaround of a go-round already under way,
 *  falls at 8.5, as the painting opens out: scripts/woodland-score/score.py). */
export const SCORE_FROM = 8.2;
/**
 * The two-shot (scripts/two-shot.py; the artist's brief of 2026-10-18 and its reviews): the two
 * of them close, one locked frame, in the old close-ups' slot (the memory stays 53 s: nothing after
 * the second wide's cut moved). Nothing in its first second; every head is a cut, on twos; her
 * eyes lead her head toward him, and she stays there, and so does he once his eyes find her: no
 * gesture undoes the moment before the cut to the empty clearing (the artist: "She should glance
 * toward him, settle into that gaze, and simply remain there"). `scene.shot` 1 is this shot.
 */
export const TWO_SHOT = { from: 15.0, hisBlink: 16.2, herEyes: 17.5, herTurn: 18.0, hisEyes: 24.0, hisRoll: 24.5, to: 27.0 };
/**
 * Her turn (`scripts/her-turn.py`; the artist's production brief, 2026-10-20): her own painted head,
 * as a drawing carried in depth, turned a little toward him, drawn on twos. `figure:b.turn` is how
 * far through its drawings she is (0 the panel's own head, 1 settled toward him); the scene shows the
 * nearest drawing.
 * - Her eyes go to him first: drawings from `herEyes` (`eyes`: their share of the way, a soft dart).
 * - A moment.
 * - Her head from `herTurn`: `drawings` of it, a twelfth of a second apart. Its speed rises gently,
 *   is greatest at about a quarter of a second, then dies away as she settles (velocity
 *   t² e^(−t/`ease`), its last drawing all the way). It is 90% of the way at about two thirds of a
 *   second.
 * - As her head comes round her eyes ease back in their sockets, still on him.
 * - The hair on the grass follows a beat behind, its far ends last.
 * - Never back (the artist: "She should glance toward him, settle into that gaze, and simply remain
 *   there").
 *
 * All of it lies inside 17.5–19.0: the score leaves her look clear from 17.0 to 19.5 (its notes
 * either side are composed to the picture: scripts/woodland-score/score.py `MOMENTS`).
 */
export const TURN = { eyes: [0.6, 1], ease: 0.13, drawings: 12 };
/** How far the ease has gone `t` s after `herTurn`, 0..1 (scripts/her-turn.py `turn_head`). */
export function turnHead(t: number): number {
  const x = Math.max(0, t) / TURN.ease;
  return 1 - Math.exp(-x) * (1 + x + (x * x) / 2);
}
/** One of her turn's drawings: when it is shown (s), her eyes' and her head's share of the way, and the `figure:b.turn` that shows it. */
export interface TurnDrawing {
  at: number;
  eyes: number;
  head: number;
  turn: number;
}
/** Her turn's drawings (scripts/her-turn.py `schedule` makes the same; tests check its turn.json against these). */
export function turnDrawings(): TurnDrawing[] {
  const T = TWO_SHOT;
  const out = TURN.eyes.map((eyes, i) => ({ at: T.herEyes + i / 12, eyes, head: 0 }));
  const all = turnHead(TURN.drawings / 12);
  for (let i = 1; i <= TURN.drawings; i++) out.push({ at: T.herTurn + i / 12, eyes: 1, head: turnHead(i / 12) / all });
  const r = (x: number, d: number) => Math.round(x * d) / d;
  return out.map((d, k) => ({ at: r(d.at, 1e4), eyes: d.eyes, head: r(d.head, 1e6), turn: r((k + 1) / out.length, 1e4) }));
}
/**
 * The artist's shot list (2026-10-17): 1 the room remembers (the pencil, the lean), 2 crossing
 * in, 3 the wide afternoon, 4 he looks toward her, 5 she notices, 6 their hands, 7 the wide
 * again, 8 the cut to the same place empty at dusk. Since 2026-10-18 shots 4–6 are one two-shot
 * (her look, then his; their hands as drawn); everything else is the living painting.
 */
// (The second wide the longest shot after the two-shot, paid for from the first: the cut lands
// once the visitor has stopped expecting one, and lingering is what the title promises: the
// skeptic's second review, 2026-10-17.)
export const SHOTS = { two: TWO_SHOT.from, wideAgain: TWO_SHOT.to };
/** The air (`scene.breeze`): never still; steady and gustless into the cut and across it; the
 *  evening's calm. Seen, not heard (the artist: "the breeze is supposed to be super light"). */
export const BREEZE_KEYS: [number, number][] = [[0, 0.6], [5.5, 0.6], [10.5, 1], [SHOTS.wideAgain, 1], [32.0, 0.5], [37, 0.5], [39, 0.3]];
/** The woodland's recorded sound against its insects (dB on the files as baked), set by measure:
 *  the piano about 4.5 LU under the place round it. (There is no wind: it read as a noise louder
 *  than anything in the clearing, and the breeze is light: the artist, 2026-10-20.) */
const SCORE_DB = -28.5;
const EVENING_DB = -32;
// (The revisit stays on the wall, still: a short hold, its stillness the answer.)
const EMPTY_SECTIONS: Sections = { active: 6, exit: 16, residue: 21, end: 24 };

export const WOODLAND: MemoryDef = {
  id: 'woodland',
  art: 'woodland',
  variants: ['afternoon', 'empty'],
  layers: ['scene', 'sketch', 'sketch-after', 'light'],
  sections: WOODLAND_SECTIONS,
  markers: [
    { label: 'music:cicadas', position: 0.05 },
    { label: 'music:woods', position: 0.05 },
    { label: 'music:score', position: SCORE_FROM },
    { label: 'sfx:bird-1', position: 10.9 },
    { label: 'sfx:bird-2', position: 29.0 },
    { label: 'music:evening', position: EVENING_AT },
    { label: 'sfx:cicada-last', position: 48.5 },
  ],
  seed: (variant): SheetSeed => {
    if (variant === 'empty') {
      const S = EMPTY_SECTIONS;
      return {
        tracks: {
          'window.sketch': [[1.5, 0], [3.5, 1]],
          'window.reveal': [[2.5, 0], [6, 1]],
          // (The room's writing under it goes as the colour comes and stays a trace until it goes:
          // over the empty clearing, the opening's unfinished line said what the absence meant.)
          'window.wash': [[0, 0, 'hold'], [6, 1]],
          'window.presence': [[0, 1]],
          'window.parallax': [[0, 0]],
          'light.x': [[0, -0.05]],
          // It finds where they lay first, then opens to the sky's gap and the tree (the same place).
          'light.y': [[0, -0.2], [6, -0.05]],
          'light.radius': [[0, 0.2], [6, 1.2]],
          'light.soft': [[0, 0.16]],
          'light.warmth': [[0, 2800], [16, 2300]],
          'light.intensity': [[0, 0], [4, 0.35], [16, 0.2], [21, 0]],
          'light.roomSpill': [[0, 0]],
          'layer:scene.opacity': [[0, 1]],
          'layer:sketch.opacity': [[0, 0.9]],
          'layer:sketch-after.opacity': [[0, 0]],
          'layer:light.opacity': [[0, 1]],
        },
        markers: [
          { label: 'active', position: S.active },
          { label: 'exit', position: S.exit },
          { label: 'residue', position: S.residue },
          { label: 'end', position: S.end },
          { label: 'music:evening', position: 0.05 },
        ],
      };
    }
    const S = WOODLAND_SECTIONS;
    const C = SHOTS;
    const T = TWO_SHOT;
    return {
      tracks: {
        // Shot 1, the room remembers: the pencil finds the clearing on the plaster stroke by
        // stroke (scripts/stroke-order.py), while the visitor drifts toward the wall (the lean,
        // their look their own); shot 2: once the drawing is whole the colour comes, out from the
        // two of them (the words lie over them) as a wash, the painting spreads, they are carried
        // in, and it opens out until it is all there is.
        // (The cicada first, beyond the wall (1.2 s); then the first stroke (2.0); the two of them
        // are found last, ~4.2–5.0: cinematic review. The colour waits for
        // them: begun while they were still to be drawn, it went round them, a figure-shaped gap
        // of bare plaster in the painting (the crossing's frames, 2026-10-17). The two clocks are
        // scripts/stroke-order.py's too: tests/memory-defs.test.ts.)
        // (The colour washes in by 7.6, as the painting's own light begins to come up over it; on the
        // way back it washes out by 47.8, and the empty clearing in pencil is alone a while, then
        // sinks: cinematic and creative reviews, 2026-10-17.)
        'window.sketch': [[2.0, 0], [6.0, 1], [49.8, 1], [51.3, 0]],
        // (The colour straight: as much of the painting takes it in each moment as in any other.)
        'window.reveal': [[5.4, 0, 'linear'], [7.6, 1], [45.8, 1], [47.8, 0]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        // The room's writing under the painting: going as the colour reaches it, then held a trace
        // until the pencil goes (src/world/living/wash.ts), so the empty clearing's pencil is
        // alone a while on the way back and the words come back to a white wall: the creative
        // director's and the skeptic's reviews, 2026-10-18.
        'window.wash': [[0, 0, 'hold'], [7.6, 1]],
        // The light finds the people first (painting metres from its centre).
        'light.x': [[0, -0.05]],
        'light.y': [[0, -0.24]],
        'light.radius': [[1, 0.15], [6, 0.55]],
        'light.soft': [[0, 0.14]],
        // The afternoon's warmth, then (at the cut) the evening's.
        'light.warmth': [[0, 4300, 'hold'], [CUT, 2900]],
        // The painting's light (with its colour: before it, on bare plaster, it read as two pale
        // smears); low while inside; it goes last.
        'light.intensity': [[0, 0], [1.4, 0], [2.6, 0.5], [6, 0.45], [10.5, 0.3], [42.5, 0.2], [46.5, 0.3], [49.5, 0]],
        'light.roomSpill': [[0, 0]],
        'layer:scene.opacity': [[0, 1]],
        'layer:sketch.opacity': [[0, 0.9, 'hold'], [CUT, 0]],
        'layer:sketch-after.opacity': [[0, 0, 'hold'], [CUT, 1]],
        'layer:light.opacity': [[0, 1]],
        // The scene.
        'scene.life': [[0, 0], [5.5, 0], [7, 1]],
        // The way in, one move (shaped in Inside.ts): from the cicada, slowly; the body only until
        // they are taken in (~6.2 s); the painting's own light up over it 7.1–8.3, then opening out
        // to all there is over its own straight 1.6 s, 8.2–9.8 (cinematic review, 2026-10-18: it
        // was the threshold's briefest phase); still by 10.5. Back: steadily (never a jolt), the
        // plaster re-forming as they are carried back.
        'scene.approach': [[1.2, 0, 'linear'], [10.5, 1], [S.exit + 1, 1, 'linear'], [S.exit + 5, 0]],
        'scene.immerse': [[0, 0, 'hold'], [6.2, 0, 'linear'], [8.2, 0.68, 'linear'], [9.8, 1, 'hold'], [S.exit, 1, 'linear'], [S.exit + 2, 0.72, 'linear'], [S.exit + 5, 0]],
        // The air.
        'scene.breeze': BREEZE_KEYS,
        // The cut: the afternoon and the two of them until it, then the same place later, empty.
        'scene.after': [[0, 0, 'hold'], [CUT, 1]],
        'scene.people': [[0, 1, 'hold'], [CUT, 0]],
        // The two of them close (a cut), then the wide again (a cut, while he is still looking).
        'scene.shot': [[0, 0, 'hold'], [C.two, 1, 'hold'], [C.wideAgain, 0]],
        // Him and her: looking up, breathing, unhurried. Her crossed foot rocks a while in the
        // first wide, as the gust settles (still before the cut to them); still after.
        'figure:a.breath': [[0, 1]],
        'figure:b.breath': [[0, 1]],
        'figure:b.foot': [[0, 0], [12.4, 0], [12.9, 0.8], [13.8, 0.8], [14.3, 0]],
        // Her look: her eyes go to him (drawings of her eyes on him), her head follows (her own
        // head turned a little toward him, a drawing a twelfth of a second: held, never mixed), and
        // stays, in both shots, to the cut. (The eyes are forced still while a drawing is shown:
        // its eyes are drawn on him. `figure:b.eyes` moves them only without the drawings.)
        'figure:b.eyes': [[0, 0, 'hold'], [T.herEyes, 1, 'hold']],
        'figure:b.turn': [[0, 0, 'hold'], ...turnDrawings().map((d): Key => [d.at, d.turn, 'hold'])],
        // His look: his eyes go to her (a drawing), his head rolls a little toward her after them
        // (about 2°: the rig was made for the wide), and he stays looking at her, across the cut
        // back to the wide, to the cut to dusk.
        'figure:a.eyes': [[0, 0, 'hold'], [T.hisEyes, 1, 'hold']],
        'figure:a.look': [[0, 0, 'hold'], [T.hisRoll, 0], [T.hisRoll + 0.5, 0.3]],
        // Her hand lies by his as the artist drew it, almost touching, never moved (its default,
        // 0, is drawn back along her forearm: reviews of 2026-10-18).
        'figure:b.hand': [[0, 1]],
      },
      markers: [
        { label: 'active', position: S.active },
        { label: 'exit', position: S.exit },
        { label: 'residue', position: S.residue },
        { label: 'end', position: S.end },
        ...WOODLAND.markers,
      ],
    };
  },
  cues: (variant): CueSheet => {
    // Outdoors: almost no room at all, a little air (for the birds; all that sounds at the cut is
    // dry: nothing of the afternoon rings on past it).
    const room: [number, number, number] = [0.4, 3, 0.06];
    if (variant === 'empty') {
      // The revisit: the empty clearing at dusk, on the wall: the evening's cicadas.
      return {
        room,
        cues: {
          'music:evening': { asset: 'music/woodland-evening-empty.mp3', gainDb: EVENING_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, fadeOut: 4, caption: '[evening cicadas, far off]', captionAt: 1.5 },
        },
      };
    }
    // Levels measured against each other, not normalised (the files' own levels:
    // scripts/woodland-stems.ts, scripts/woodland-score/): stand-ins until the artist has listened
    // (`review: pending`). The afternoon ends on the cut, every sound of it (`until`), on the same
    // instant of the audio clock as the evening begins (its marker).
    return {
      room,
      cues: {
        // The cicada nearest them, in the tree over them, first heard from beyond the wall; a lull
        // while the two of them are close (her look, his); cut off by the cut, mid-phrase.
        'music:cicadas': { asset: 'synth:cicadas', gainDb: -20, place: { u: -0.3, v: 0.25, d: 1.5 }, dry: true, until: CUT, fadeOut: 3, caption: '[cicadas, beyond the wall]' },
        // The rest of the day's insects: two more cicadas, the chorus in the trees. Named once, as
        // the place (the piano a part of it), when the painting has come to rest and gone again
        // before the cut to the two of them; never with a note.
        'music:woods': { asset: 'synth:woods', gainDb: -14, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, until: CUT, fadeOut: 3, caption: '[cicadas in the trees; a piano]', captionAt: 9.85 },
        // Two far birds in the trees at the clearing's edge, in the wides (none while they are close).
        'sfx:bird-1': { asset: 'music/woodland-bird-1.mp3', gainDb: -12, place: { u: -0.4, v: 0.35, d: 14 }, lowpass: 5500, until: CUT },
        'sfx:bird-2': { asset: 'music/woodland-bird-2.mp3', gainDb: -12, place: { u: 0.45, v: 0.3, d: 18 }, lowpass: 7500, until: CUT },
        // The piano: centred, dry, coming into hearing with the clearing as the painting opens out,
        // keeping its distance from the place to the cut (its file: scripts/woodland-score/).
        'music:score': { asset: 'music/woodland-score.mp3', gainDb: SCORE_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, until: CUT, fadeOut: 3 },
        // The evening: already singing, far off in the trees, nothing of it in front; full on the
        // cut (crossed with the afternoon's last 40 ms). Named a second and a half after the cut,
        // what is there first, the piano's absence a plain fact (a deaf visitor otherwise never
        // learns that the music ended: the reviews of 2026-10-19).
        'music:evening': { asset: 'music/woodland-evening.mp3', gainDb: EVENING_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, offset: EVENING_OFFSET, fadeIn: CUT - EVENING_AT, fadeOut: 4, caption: '[evening cicadas, far off; no piano]', captionAt: CUT + 1.5 - EVENING_AT },
        // One evening cicada, far off, heard from the white room (as through a window): the evening's own.
        'sfx:cicada-last': { asset: 'music/woodland-cicada-last.mp3', gainDb: -41, place: { u: 0.2, v: 0.3, d: 6 }, lowpass: 5000, caption: '[an evening cicada, far off]' },
      },
    };
  },
  sways: [],
  // An early leaving reverses the way in (about 1.5 s) and lets the rest go after.
  exit: 3,
  maxHold: 20,
  tail: 2,
  hush: 0.7,
  living: true,
  lastMusic: 'afternoon',
  // (The artist's idea, the words ours as they asked: in the afternoon's voice, saying only what
  // they had; under "five more minutes". Written as the far cicada ends and the room's writing is
  // back, done as the aftermath begins: the skeptic, 2026-10-20.)
  coda: { variant: 'afternoon', at: 52.5, text: 'we had all afternoon' },
  describe: (v) => v === 'empty'
    ? 'A painting forms in the wall by the words: a clearing in a wood at dusk, a fallen log, a tree, the grass. Nobody is there.'
    : 'A pencil drawing forms in the wall by the words: a clearing in a wood, two young people lying in the grass.',
  // (Short, at least 3.5 s apart; only what is seen, in order, never what it means: interaction,
  // QA and creative reviews. The close shot's own line only while it is shown; what she does is
  // told to anyone inside, whichever shot shows it: upright screens and a turned visitor see it in
  // the wide. His look can be seen only close (in the wide it is too small), so it is told only
  // there: the creative director, 2026-10-19.)
  announce: (v) => v === 'empty' ? [] : [
    { at: 10.5, text: 'It opens until it is all there is: a summer afternoon, a light breeze in the trees.', inside: true },
    { at: 10.5, text: 'The painting comes alive on the wall: a summer afternoon, a light breeze in the trees.', wall: true },
    { at: TWO_SHOT.from, text: 'Closer: the two of them side by side in the grass, looking up.', shot: 1 },
    { at: TWO_SHOT.herTurn + 0.5, text: 'Her eyes go to him, then her head, a little.', inside: true },
    { at: TWO_SHOT.hisEyes + 1.5, text: 'He turns his eyes to her.', shot: 1 },
    { at: CUT, text: 'The same clearing, at dusk. Nobody is there.' },
    { at: WOODLAND_SECTIONS.exit, text: 'The painting goes back into the wall.' },
  ],
};

export const MEMORIES: Record<string, MemoryDef> = { cereal: CEREAL, bedroom: BEDROOM, door: DOOR, woodland: WOODLAND };
