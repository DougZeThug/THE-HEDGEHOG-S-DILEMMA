import type { Sections } from '../types';
import { sectionMarkers, type MemoryDef } from '../memoryDef';

/**
 * Cereal: 22 s from the first graphite to the withdrawal, then the light goes down.
 *
 *   0.6      the kitchen is heard before anything is drawn
 *   0.6–3.6  the light finds the bowls and the spoon, then the rest of the drawing (graphite)
 *   1.5–5.5  the colour follows the light
 *   5.5      the scene is formed: the radio comes on (a folk waltz, the artist's choice)
 *   7.3      two people eating; 10.5 a laugh at the table; 15.2 one of them eating on
 *   7.4, 8.8 (once its voices are kept) "That's my bowl." / "It's the clean one." (memory-voices.json)
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
    // Just past the minimum hold (10): a visitor who stays that long hears the people, and
    // the light lifts with them. With its voices (memory-voices.json: 7.4, 8.8), the laugh answers them.
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
        ...sectionMarkers(CEREAL_SECTIONS),
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
