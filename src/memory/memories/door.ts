import type { Sections } from '../types';
import { sectionMarkers, type MemoryDef } from '../memoryDef';

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
        ...sectionMarkers(DOOR_SECTIONS),
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
