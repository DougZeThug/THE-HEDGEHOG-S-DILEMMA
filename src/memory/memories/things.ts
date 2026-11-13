import type { CueSheet } from '../cueSheet';
import type { SheetSeed } from '../seed';
import { THINGS_SECTIONS, THINGS_AT, THINGS_SECONDS, THINGS_BEATS } from '../beats/things';
import { FILM_CUE, entryTracks, filmClock, sectionMarkers, type MemoryDef } from '../memoryDef';

/** Its sound's level (soundscape.py places its layers from Memory II's figures' loudness: the same gain). */
const THINGS_DB = -9;

/** The wall's own sound is the drawing's, and begins as the pencil does. */
const WALL_CUE = 'music:wall';
const WALL_AT = 1.5;

/**
 * Things I Should Have Said (docs/things.md): a charcoal and pencil film on one sheet (v2, the
 * artist's review of 2026-10-22). A young man says goodbye to his mother at the door of her flat:
 * she waves, small; he lifts the bag she packed, turns his back and goes; the door swings shut on its
 * closer. Then the drawing tries the moment again, in graphite where what happened is charcoal: he
 * is drawn in the doorway as he left, turns back toward her, his hand begins to rise; it is taken
 * back. Then her: a lean after him, her hand rising toward the doorway; taken back. Then they are
 * both taken, and what is left is the doorway with their two hands' impressions. Drawn offline on a
 * simulated sheet (scripts/things/), played as a film (src/memory/living/FilmScene.ts).
 *
 *   0-7.5     the wall draws the goodbye itself, as the film did: the doorway's construction in hard
 *             pencil, then each of them, tone and then lines, in the film's own order (the pencil
 *             by `window.sketch` over the order map's R, the tone by `window.reveal` over its G:
 *             scripts/things/emergence.py); the room's writing stays under the pencil until the
 *             tone reaches it
 *   7.8-11    carried in, square to it; the film holds the goodbye finished
 *   11.5-54.25 the film, 42.75 s (`scene.film`, its seconds; THINGS_BEATS): the goodbye; his walk
 *             out; the door and the latch; a silence; his almost, found, turning back, his hand
 *             rising, held, taken back; a breath; hers; both of them taken; the empty doorway, six
 *             seconds still
 *   53-58     out (the film's last second and a quarter under it), its edge soft (a sheet rubbed,
 *             not torn); on the wall the drawing goes to a trace of itself, then into the plaster
 *
 * The film has no sound of its own: its sound is two cues made from the same list of marks
 * (scripts/things/soundscape.py, Mix B, the artist's choice): the wall's goodbye drawing itself, close; then,
 * carried in, the flat (its air, his coat, the bag, his steps, the door on its closer, the latch),
 * which withdraws as the eraser lifts the door; the pencil; the rubber taking each almost back, hers
 * heavier; two soft piano notes while his hand is held, the first alone while hers is; the people
 * taken, each erasure quieter; then the room's own hushed air, the second note not played again.
 */
export const THINGS: MemoryDef = {
  id: 'things',
  art: 'things',
  variants: ['film'],
  layers: ['scene', 'lines'],
  sections: THINGS_SECTIONS,
  // (The wall's sound with the wall's drawing, its `window.sketch`; the film's with the film.)
  markers: [{ label: WALL_CUE, position: WALL_AT }, { label: FILM_CUE, position: THINGS_AT }],
  seed: (): SheetSeed => {
    const S = THINGS_SECTIONS;
    return {
      tracks: {
        // The pencil, then the tone, both on the draw-on's own 6 s (scripts/things/emergence.py's
        // clocks: tests/memory-defs.test.ts).
        'window.sketch': [[WALL_AT, 0, 'linear'], [7.5, 1]],
        'window.reveal': [[WALL_AT, 0, 'linear'], [7.5, 1]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        // Earlier marks remain beneath: the room's writing stays under the pencil, and goes only
        // a little way as the tone comes (the artist's brief, the emergence; held to a trace, it
        // was lost for the film's whole length: the creative director).
        'window.wash': [[0, 0, 'hold'], [7.5, 0.35]],
        'light.x': [[0, 0]],
        'light.y': [[0, 0]],
        'light.radius': [[0, 0.6]],
        'light.soft': [[0, 0.14]],
        'light.warmth': [[0, 2700]],
        'light.intensity': [[0, 0]],
        'light.roomSpill': [[0, 0]],
        // Back on the wall, the drawing goes to a trace of itself, then into the plaster.
        // (At 0.14 it was gone to the eye a second after the words came back: the cinematic director.)
        'layer:scene.opacity': [[0, 1], [S.exit + 4, 1], [S.exit + 6, 0.4], [S.end - 1, 0.28], [S.end, 0]],
        // The wall's own pencil sinks into the film's (the same lines) once it is all there.
        'layer:lines.opacity': [[0, 1], [8.0, 1], [9.0, 0]],
        ...entryTracks(S.exit, { approach: 10.5, begin: 7.8, rise: 9.6, full: 11 }),
        // The film's own time: its first frame (the goodbye finished) until it is entered, then as
        // a clock does, then its last frame held.
        'scene.film': filmClock(THINGS_AT, THINGS_SECONDS),
      },
      markers: [
        ...sectionMarkers(S),
        ...THINGS.markers,
      ],
    };
  },
  cues: (): CueSheet => ({
    // (Its room is the white room: the file has none of its own.)
    room: [0.3, 2, 0.04],
    cues: {
      // The wall drawing the goodbye, at the film's own gain: as a point 2 m in the wall it came out
      // 10 dB under it, barely over the room's hush (QA); stopped with the picture if the visitor goes.
      [WALL_CUE]: { asset: 'music/things-wall.mp3', gainDb: THINGS_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, fadeOut: 0.8, caption: '[pencil, then charcoal, on the wall]', captionAt: 0.3 },
      [FILM_CUE]: { asset: 'music/things-film.mp3', gainDb: THINGS_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, fadeOut: 2, caption: '[an eraser on paper]', captionAt: THINGS_BEATS.lift + 0.3,
        // (one caption at a time: each held until the next, long enough to read (0.4 s a word, at
        // least 1.2 s: tests/film-scene.test.ts; the notes in the holds are shorter than the 2.5 s
        // every caption had before them); the pencil
        // when it is first heard, not when its faint construction begins; every taking back named:
        // QA, 2026-10-22)
        captions: [
          { at: 1.2, text: '[a quiet flat; a coat, a bag lifted]' },
          { at: THINGS_BEATS.gone, text: '[footsteps going; a door swings shut]' },
          { at: THINGS_BEATS.latch, text: '[a door latch clicks]' },
          { at: THINGS_BEATS.turnsBack + 0.05, text: '[a pencil on paper]' },
          { at: THINGS_BEATS.held, text: '[two soft piano notes]' },
          { at: THINGS_BEATS.takenBack, text: '[an eraser, rubbing it out]' },
          { at: THINGS_BEATS.hers, text: '[a pencil on paper]' },
          { at: THINGS_BEATS.hersHeld, text: '[one piano note]' },
          { at: THINGS_BEATS.hersTaken, text: '[an eraser, rubbing it out]' },
          { at: THINGS_BEATS.erased, text: '[an eraser, softer]' },
        ] },
    },
  }),
  exit: 3,
  maxHold: 20,
  tail: 2,
  hush: 0.7,
  drone: false,
  living: true,
  describe: () => 'A charcoal drawing comes onto the wall: a goodbye.',
  // (Only what is seen, in order, at least 3.5 s apart, never what it means.)
  announce: () => [
    { at: THINGS_AT + 0.3, text: 'A young man with a bag says goodbye to an older woman.', inside: true },
    { at: THINGS_AT + 0.3, text: 'On the wall, a young man says goodbye to an older woman.', wall: true },
    { at: THINGS_AT + THINGS_BEATS.gone, text: 'He turns his back and goes. The door swings shut.' },
    { at: THINGS_AT + THINGS_BEATS.lift, text: 'An eraser lifts the door. In pencil, he is in the doorway.' },
    { at: THINGS_AT + THINGS_BEATS.hand, text: 'He turns back toward her. His hand begins to rise.' },
    { at: THINGS_AT + THINGS_BEATS.takenBack + 0.3, text: 'The eraser takes it back.' },
    { at: THINGS_AT + THINGS_BEATS.hers + 0.5, text: 'In pencil, she leans after him, her hand reaching toward the doorway.' },
    { at: THINGS_AT + THINGS_BEATS.erased, text: 'Her reach is taken back. Then she is erased.' },
    { at: THINGS_AT + THINGS_BEATS.empty + 1.0, text: 'The doorway is empty; faint marks where their hands nearly met.' },
    { at: THINGS_SECTIONS.exit, text: 'The drawing goes back into the wall.' },
  ],
};
