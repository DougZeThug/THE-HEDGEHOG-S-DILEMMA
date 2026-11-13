import type { CueSheet } from '../cueSheet';
import type { SheetSeed } from '../seed';
import { SHADOWS_SECTIONS, SHADOWS_AT, SHADOWS_SECONDS, SHADOWS_BEATS } from '../beats/shadows';
import { FILM_CUE, entryTracks, filmClock, sectionMarkers, type MemoryDef } from '../memoryDef';

/** Its sound's level (the film's mix is 8 dB louder than Almost's: the two sit together). */
const SHADOWS_DB = -17;

const WALL_CUE = 'music:wall';

/**
 * Memory VII, The Shape of Someone (docs/shadows.md): a shadow-puppet film, rendered offline
 * (scripts/memory-vii/render.py --room). Two people stand apart in a dim room; a warm light drifts
 * across the wall behind them, and their shadows, free of them, come closer, hesitate, meet and
 * hold each other, and part, a thread of shade between their hands for a moment. The people never
 * move nearer. It opens from "You understood me once, completely, for about a minute."
 *
 * The room's own shadows reveal it (the artist's brief, 2026-11-09):
 *   0.3-4     the chair's shadow, the room's one cast shadow, crosses the floor, climbs the skirting
 *             and stands on the wall round the line, enlarged: the room's key has come down behind
 *             the chair, low (`room.shadow`, src/world/Lighting.ts); the room's light goes down
 *   1-7       shade gathers out from it over a 3.2 x 1.8 m patch of the wall, the corners last (the
 *             order map's G by `window.reveal`, scripts/memory-vii/order.py), darkening all together
 *             as dusk does (`layer:scene.opacity`), over the film's first frame: the same plaster in
 *             a dim room
 *   5.5       the film begins on the wall: its warm light comes up in the gathered shade, and the
 *             chair's lamp gives way to it (`room.lamp`); her shadow is there
 *   8.5-11.7  carried in, as their shadows begin to come closer
 *   30.5-35.5 out as its light goes (the film's last second under it); the chair's lamp comes back
 *             as the film's light goes, its shadow alone on the wall again
 *   34-39.5   the shade goes back the way it came, draining into the chair's shadow (held a breath
 *             round it), and the room's light comes back
 *   39.5-43   last, the chair's shadow slides down the wall and home under the chair
 *
 * Its sound: a low room tone from the start (sound before the image), then the film's own mix (the
 * approved takes: scripts/memory-vii/room-sound.sh).
 */
export const SHADOWS: MemoryDef = {
  id: 'shadows',
  art: 'shadows',
  variants: ['film'],
  layers: ['scene'],
  sections: SHADOWS_SECTIONS,
  markers: [{ label: WALL_CUE, position: 0.3 }, { label: FILM_CUE, position: SHADOWS_AT }],
  seed: (): SheetSeed => {
    const S = SHADOWS_SECTIONS;
    return {
      tracks: {
        // The shade's reach, on order.py's clocks (tests/memory-defs.test.ts): no pencil, so the two are one.
        'window.sketch': [[1.0, 0, 'linear'], [4.0, 1]],
        // Out from the chair's shadow; going, back into it (order.py), held a breath round it.
        'window.reveal': [[1.0, 0, 'linear'], [4.0, 1], [S.exit + 3.5, 1, 'linear'], [S.exit + 5.0, 0.45], [S.exit + 6.5, 0.45, 'linear'], [S.exit + 9.0, 0]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        'window.wash': [[0, 0, 'hold'], [4.0, 0.35]],
        'light.x': [[0, 0]],
        'light.y': [[0, 0]],
        'light.radius': [[0, 0.6]],
        'light.soft': [[0, 0.14]],
        'light.warmth': [[0, 2700]],
        'light.intensity': [[0, 0]],
        'light.roomSpill': [[0, 0]],
        // Its darkness comes all together, as dusk does (a front of full shade read as damp: the
        // reviews of 2026-11-09), and lifts so as it goes back into the chair's shadow.
        'layer:scene.opacity': [[0.8, 0], [7.0, 1], [S.exit + 3.5, 1], [S.exit + 5.0, 0.7], [S.exit + 6.5, 0.7], [S.exit + 9.0, 0]],
        // The chair's shadow onto the wall, and home again last; its lamp gives way to the film's light.
        'room.shadow': [[0.3, 0], [4.0, 1], [S.exit + 9.0, 1], [S.exit + 12.5, 0]],
        'room.lamp': [[0, 1], [SHADOWS_AT, 1], [SHADOWS_AT + 3, 0.15], [SHADOWS_AT + SHADOWS_BEATS.dark - 0.5, 0.15], [S.exit + 0.5, 1]],
        ...entryTracks(S.exit, { approach: 11.5, begin: 8.5, rise: 10.3, full: 11.7 }),
        // Its first frame (the dim wall) while the shade gathers, then as a clock does, then its last.
        'scene.film': filmClock(SHADOWS_AT, SHADOWS_SECONDS),
      },
      markers: [
        ...sectionMarkers(S),
        ...SHADOWS.markers,
      ],
    };
  },
  cues: (): CueSheet => ({
    room: [0.3, 2, 0.04],
    cues: {
      [WALL_CUE]: { asset: 'music/shadows-wall.mp3', gainDb: SHADOWS_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, fadeOut: 1.5, caption: '[a low hum; the room goes quiet]', captionAt: 0.8 },
      [FILM_CUE]: { asset: 'music/shadows-film.mp3', gainDb: SHADOWS_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, fadeOut: 2, caption: '[glass, ringing faintly]', captionAt: 2.2,
        captions: [
          { at: 5.6, text: '[a low cello note]' },
          { at: 12.9, text: '[a cello, held low; one piano note]' },
          { at: 18.7, text: '[a breath]' },
          { at: 19.9, text: '[glass, ringing faintly]' },
        ] },
    },
  }),
  exit: 3,
  maxHold: 20,
  tail: 2,
  hush: 0.7,
  drone: false,
  roomDim: 0.6,
  roomDimOut: 9,
  living: true,
  describe: () => "The chair's shadow climbs the wall, and shade gathers round it.",
  // (Only what is seen, in order, at least 3.5 s apart, never what it means.)
  announce: () => [
    { at: SHADOWS_AT + SHADOWS_BEATS.bows, text: "Two people's shadows, apart. His reaches; hers bows away." },
    { at: SHADOWS_AT + SHADOWS_BEATS.meet, text: 'Their shadows meet, foreheads together.' },
    { at: SHADOWS_AT + SHADOWS_BEATS.hold + 2, text: 'The shadows hold each other; the people stay apart.', inside: true },
    { at: SHADOWS_AT + SHADOWS_BEATS.hold + 2, text: 'The shadows hold each other.', wall: true },
    { at: SHADOWS_AT + SHADOWS_BEATS.thread + 1.1, text: 'They let go; a thread of shade between them breaks.' },
    { at: SHADOWS_AT + SHADOWS_BEATS.dark + 0.2, text: 'The light goes out.' },
    { at: SHADOWS_SECTIONS.exit + 4, text: "The chair's shadow stands on the wall again." },
    { at: SHADOWS_SECTIONS.exit + 9, text: "The shade goes back into the wall, and the chair's shadow slides home." },
  ],
};
