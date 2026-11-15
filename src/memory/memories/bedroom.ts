import type { Sections } from '../types';
import { sectionMarkers, type MemoryDef } from '../memoryDef';

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
        ...sectionMarkers(BEDROOM_SECTIONS),
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
