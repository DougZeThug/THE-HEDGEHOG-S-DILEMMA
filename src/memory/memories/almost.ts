import type { CueSheet } from '../cueSheet';
import type { SheetSeed } from '../seed';
import { ALMOST_SECTIONS, FILM_AT, FILM_SECONDS, FILM_BEATS, KITCHEN_AT } from '../beats/almost';
import { FILM_CUE, entryTracks, filmClock, sectionMarkers, type MemoryDef } from '../memoryDef';

/** Its two sounds' levels (scripts/almost/sound.py lays both at the film mix's own balance, so the
 *  same gain for each). Set by what is heard, A-weighted: the kitchen's file is -52 dBFS(A), so -61
 *  on the memory bus, by the woodland's dusk (-59.6). (By loudness a 120 Hz hum counts for more
 *  than it sounds: the sound designer's review.) Stand-ins until the artist has listened. */
const KITCHEN_DB = -9;
const FILM_DB = -9;

/**
 * Almost (docs/almost.md): a felt stop-motion film. Two figures made of felt sit side by side at a
 * kitchen table under a hanging lamp, at night. He notices her sleeve is folded back at the cuff
 * and reaches to fold it down. His fingertip touches it, and she starts. He takes his hand back.
 * She lays her arm nearer him. His hands stay in his lap. Nothing is said. Photographed offline
 * from the puppets (scripts/almost/), played as a film (src/memory/living/FilmScene.ts).
 *
 *   0–5.5     the kitchen is heard first through the wall, the fridge and the clock (0.6). Pale wool
 *             fibres come through the plaster from the words outward, a cloud thinning unevenly
 *             toward its edges: the lamp first, the room, the two of them late, their hands last
 *             (scripts/almost/emergence.py)
 *   5.0–8.0   the colour comes up through the wool over the whole picture together, a little
 *             unevenly, as a print in the developer (mostly 5.7–7.0); the fibres sink into it
 *   6.2–9.8   they are carried in, square to it; it opens out until it is all there is. The film
 *             holds its first frame through all of this: the opening is seen, not passed through
 *   10.3–38.6 the film, 28.3 s, once the visitor is inside (`scene.film`, its seconds; FILM_BEATS):
 *               0     together; one slow breath each
 *               2.5   he notices the fold at her cuff
 *               3.75  he reaches, a little at a time; a hesitation
 *               6.5   his fingertip on the fold; its corner rises under it
 *               6.83  she starts: a flinch on ones, her arm snatched back, a faint creak of her chair;
 *                     she lays it down again nearer her
 *               6.96  then his hand comes off the cloth, and stays in the air where her sleeve was;
 *                     back across the table into his lap
 *               12.3  she looks at him, the first time
 *               14.3  she lifts her arm, a hesitation in the air, and lays it down nearer him
 *               17.3  his hand stays in his lap: one slow breath, his head turns a little toward her
 *                     and back, and nothing follows
 *               20.3  her eyes go down to the table between them; they sit, the fridge and the clock
 *   37.5–42.5 out (the film's last second under it): carried back, the picture gathers itself to
 *             the wall
 *   41.5–45.5 the colour sinks back into the wool all at once, then the wool into the plaster
 *
 * The film has no sound of its own: its soundtrack is two cues on the memory's audio, the
 * kitchen's (the fridge, the clock: the room's two indifferent clocks) and the film's (the wool, the
 * wood, the chair), both laid by scripts/almost/sound.py.
 */
export const ALMOST: MemoryDef = {
  id: 'almost',
  art: 'almost',
  variants: ['film'],
  layers: ['scene', 'fibres'],
  sections: ALMOST_SECTIONS,
  markers: [
    { label: 'music:kitchen', position: KITCHEN_AT },
    { label: FILM_CUE, position: FILM_AT },
  ],
  seed: (): SheetSeed => {
    const S = ALMOST_SECTIONS;
    return {
      tracks: {
        // The wool through the plaster, then the colour through the wool (the two clocks are
        // scripts/almost/emergence.py's: tests/memory-defs.test.ts). Back, nothing runs in order:
        // the colour sinks into the wool all at once, then the wool into the plaster (the layers'
        // opacities, below). Run backwards, the two of them went first and left the lamp over an
        // empty table: the woodland's ending again (the skeptic's review, 2026-10-20).
        'window.sketch': [[1.5, 0], [5.5, 1]],
        'window.reveal': [[5.0, 0, 'linear'], [8.0, 1]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        // The room's writing under the picture goes to a trace as the colour reaches it, and comes
        // back with the plaster.
        'window.wash': [[0, 0, 'hold'], [7.2, 1]],
        'light.x': [[0, 0]],
        'light.y': [[0, 0]],
        'light.radius': [[0, 0.6]],
        'light.soft': [[0, 0.14]],
        'light.warmth': [[0, 2700]],
        'light.intensity': [[0, 0]],
        'light.roomSpill': [[0, 0]],
        'layer:scene.opacity': [[0, 1], [S.exit + 4, 1], [S.exit + 6, 0]],
        // The wool sinks as the colour comes (the film is felt, not a drawing over it), comes back
        // up as the colour goes, and goes into the plaster after it.
        'layer:fibres.opacity': [[0, 1], [7.2, 1], [8.6, 0], [S.exit + 4, 0], [S.exit + 5.6, 1], [S.exit + 6.5, 1], [S.exit + 8, 0]],
        // The way in, one move, as the woodland's (shaped in Inside.ts).
        ...entryTracks(S.exit, { approach: 10.0, begin: 6.2, rise: 8.2, full: 9.8 }),
        // The film's own time: its first frame until it opens out, then as a clock does, then its
        // last frame held.
        'scene.film': filmClock(FILM_AT, FILM_SECONDS),
      },
      markers: [
        ...sectionMarkers(S),
        ...ALMOST.markers,
      ],
    };
  },
  cues: (): CueSheet => ({
    // A small kitchen: its room is in the files (scripts/almost/sound.py), none added.
    room: [0.3, 2, 0.04],
    cues: {
      // The fridge and the clock, through the wall first (muffled in the file until the picture
      // opens), then the kitchen itself; they go on after the picture has gone, on the memory's own
      // release, until the room's hum (the same mains) takes over.
      'music:kitchen': { asset: 'music/almost-kitchen.mp3', gainDb: KITCHEN_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, fadeIn: 2.5, caption: '[a fridge humming; a clock ticking]', captionAt: 1.2 },
      // The wool, the wood and the chair, laid to the film's frames (it begins with the film).
      [FILM_CUE]: { asset: 'music/almost-film.mp3', gainDb: FILM_DB, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, fadeOut: 2, caption: '[her chair creaks]', captionAt: FILM_BEATS.startle + 0.05 },
    },
  }),
  exit: 3,
  maxHold: 20,
  tail: 2,
  hush: 0.7,
  drone: false,
  living: true,
  describe: () => 'Wool, then colour, comes through the wall: a kitchen at night.',
  // (Only what is seen, in order, at least 3.5 s apart, never what it means; each short enough to
  // be read before the next: tests/film-scene.test.ts.)
  announce: () => [
    { at: FILM_AT + 0.5, text: 'Two felt figures sit side by side.', inside: true },
    { at: FILM_AT + 0.5, text: 'On the wall, two felt figures sit together.', wall: true },
    { at: FILM_AT + FILM_BEATS.reach + 0.3, text: 'His hand reaches toward her folded cuff.' },
    { at: FILM_AT + FILM_BEATS.startle + 0.75, text: 'He touches it; she draws her arm back.' },
    { at: FILM_AT + FILM_BEATS.lap + 0.5, text: 'His hand hangs, then returns to his lap.' },
    { at: FILM_AT + FILM_BEATS.offer + 0.4, text: 'She looks at him, lays her arm nearer.' },
    { at: FILM_AT + FILM_BEATS.tooLate + 0.95, text: 'His hand stays in his lap.' },
    { at: FILM_AT + FILM_BEATS.almost + 1.5, text: 'Her eyes go down to the table between them. They sit.' },
    { at: ALMOST_SECTIONS.exit, text: 'The picture goes back into the wall.' },
  ],
};
