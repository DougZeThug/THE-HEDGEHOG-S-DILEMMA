import type { CueSheet } from '../cueSheet';
import type { SheetSeed } from '../seed';
import { DRIVE_SECTIONS, DRIVE_AT, DRIVE_SECONDS, DRIVE_BEATS, DRIVE_PASSES } from '../beats/drive';
import { FILM_CUE, entryTracks, filmClock, sectionMarkers, type MemoryDef } from '../memoryDef';

/** Its sound's level (the film's mix as the artist heard it). */
const DRIVE_DB = -17;

const WALL_CUE = 'music:wall';

/**
 * The Drive Home (docs/drive-home.md): two grown brothers drive home at night after a difficult
 * gathering; the passenger looks out of his window and rubs his hands, the driver, without looking,
 * turns the heater vent toward him, and later the passenger turns it partway back. Neither says
 * anything. Traced from public-domain film (scripts/the-drive-home/), the room's cut from its second
 * shot (film.py room: its own second 0 is the film's 6.0, here at 6.0, so from there the memory's
 * seconds are the film's). It opens from "Are you angry with me?" (the room's own recording of that
 * line is "a small, afraid voice from the back seat": the line was already a car).
 *
 * Everything is on the wall the visitor faces (looking away while it forms ends it: src/app/livingMemory.ts):
 *   0-3       the room goes down to dusk, a cool night in its light (`room.night`); the patch of
 *             wall round the line darkens all together (`layer:scene.opacity`, the order map's G)
 *   2.4-9     three streetlights pass across the whole wall, right to left, slow at its edges and
 *             quick in its middle (`room.street`, src/world/StreetLight.ts): where each crosses the
 *             patch it finds faces in the dark, and leaves a little more of them found
 *             (`window.found`, the order map's B: the faces first); the first passes in silence
 *   6.0       the film begins in what they have found: the two of them side by side
 *   7.4-9     the third streetlight crosses the plaster and goes on inside the picture as the film's
 *             own (its lamp at 7.8)
 *   10.9-13.6 carried in as the passenger looks out of his window, there on the film's next lamp
 *   44-48.5   carried out as the car goes on into the dark
 *   48.5-52.5 the tail lamps fade into the plaster
 *   47.9-57.5 the indicator's relay goes on after the picture, heard, never drawn, while the night
 *             lifts; then it stops, as when a turn is made
 *   57.5      the room's light comes back to the visitor first, before the chair (`room.lean`,
 *             Lighting.leanTo: its own release, the half minute after the memory has ended)
 */
export const DRIVE: MemoryDef = {
  id: 'drive',
  art: 'drive',
  variants: ['film'],
  layers: ['scene'],
  sections: DRIVE_SECTIONS,
  markers: [{ label: WALL_CUE, position: 4.4 }, { label: FILM_CUE, position: DRIVE_AT }, { label: 'music:relay', position: 47.9 }],
  seed: (): SheetSeed => {
    const S = DRIVE_SECTIONS;
    const P = DRIVE_PASSES;
    return {
      tracks: {
        // The dusk's reach, on order.py's clocks (tests/memory-defs.test.ts): no pencil, so the two are one.
        'window.sketch': [[0.6, 0, 'linear'], [3.0, 1]],
        'window.reveal': [[0.6, 0, 'linear'], [3.0, 1]],
        // What the passing light leaves found (the order map's B): a little more as each crosses.
        'window.found': [[0, 0, 'hold'], [P[0][0] + 0.6, 0, 'linear'], [P[0][1], 0.3, 'hold'], [P[1][0] + 0.6, 0.3, 'linear'], [P[1][1], 0.62, 'hold'], [P[2][0] + 0.6, 0.62, 'linear'], [P[2][1], 1]],
        // Not yet found, the picture is the dark of a car at night.
        'window.dark': [[0, 0.25]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        'window.wash': [[0, 0, 'hold'], [3.0, 0.35]],
        'light.x': [[0, 0]],
        'light.y': [[0, 0]],
        'light.radius': [[0, 0.6]],
        'light.soft': [[0, 0.14]],
        'light.warmth': [[0, 2700]],
        'light.intensity': [[0, 0]],
        'light.roomSpill': [[0, 0]],
        // Dark all together, as dusk is; going, the tail lamps go into the plaster with it.
        'layer:scene.opacity': [[0.6, 0], [3.0, 1], [S.exit + 4.5, 1], [S.residue, 0]],
        // The streetlights: each whole number is one gone by (src/world/StreetLight.ts).
        'room.street': [[0, 0, 'hold'], [P[0][0], 0, 'linear'], [P[0][1], 1, 'hold'], [P[1][0], 1, 'linear'], [P[1][1], 2, 'hold'], [P[2][0], 2, 'linear'], [P[2][1], 3, 'hold']],
        // The room's night (its light a cool moon-blue), lifting under the relay.
        'room.night': [[0, 0], [3.0, 1], [S.residue - 0.5, 1], [57.5, 0]],
        // As the relay stops, the room's light comes to the visitor first (App takes it from here).
        'room.lean': [[0, 0, 'hold'], [57.4, 0, 'linear'], [57.6, 1]],
        ...entryTracks(S.exit, { approach: 13.0, begin: 10.9, rise: 12.4, full: 13.6, back: 4.5 }),
        // Its first frame (the two of them, in the dark) while the faces are found, then as a clock does.
        'scene.film': filmClock(DRIVE_AT, DRIVE_SECONDS),
      },
      markers: [
        ...sectionMarkers(S),
        ...DRIVE.markers,
      ],
    };
  },
  cues: (): CueSheet => ({
    room: [0.3, 2, 0.04],
    cues: {
      [WALL_CUE]: { asset: 'music/drive-wall.mp3', gainDb: DRIVE_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, fadeOut: 1, caption: '[tyres on a wet road]', captionAt: 0.3 },
      [FILM_CUE]: { asset: 'music/drive-film.mp3', gainDb: DRIVE_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, fadeOut: 2, caption: '[an engine, low; the hiss of tyres]', captionAt: 0.5,
        captions: [
          { at: DRIVE_BEATS.hands - DRIVE_AT, text: '[hands rubbed together]' },
          { at: DRIVE_BEATS.vent - DRIVE_AT, text: '[the vent clicks round; warm air]' },
          { at: DRIVE_BEATS.ventBack - DRIVE_AT, text: '[the vent clicks]' },
          { at: DRIVE_BEATS.indicator - DRIVE_AT, text: '[the indicator ticking]' },
        ] },
      'music:relay': { asset: 'music/drive-relay.mp3', gainDb: DRIVE_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, fadeOut: 0.3, inWithdrawal: true, caption: '[the indicator ticking, then stopping]', captionAt: 4 },
    },
  }),
  exit: 3,
  maxHold: 44,
  tail: 2,
  hush: 0.7,
  drone: false,
  roomDim: 0.5,
  roomDimOut: 13.5,
  living: true,
  // (Said as the film begins, so it holds what was found and what is there, true under reduced
  // motion too, where no streetlight crosses; the first announce is 5 s after it: QA, 2026-11-09.)
  describe: () => 'Night falls in the room, and two faces are found in the dark: two men side by side in a car at night. Neither looks at the other.',
  // (Only what is seen, in order, at least 3.5 s apart, never what it means.)
  announce: () => [
    { at: DRIVE_BEATS.window + 0.6, text: 'The passenger looks out of his window.', inside: true },
    { at: DRIVE_BEATS.hands, text: 'He rubs his hands together for warmth.' },
    { at: DRIVE_BEATS.vent, text: 'Without looking over, the driver turns the heater vent toward him.' },
    { at: DRIVE_BEATS.ventBack, text: 'Later the passenger turns it partway back, toward the driver.' },
    { at: DRIVE_BEATS.indicator + 1.0, text: 'The indicator ticks. Town lights pass over them.' },
    { at: DRIVE_BEATS.away + 0.6, text: 'The car goes on into the dark.' },
    { at: DRIVE_SECTIONS.residue - 2, text: 'Its red tail lamps fade into the wall.' },
  ],
};
