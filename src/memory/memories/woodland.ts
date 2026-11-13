import type { CueSheet } from '../cueSheet';
import type { SheetSeed } from '../seed';
import type { Sections } from '../types';
import { WOODLAND_SECTIONS, WOODLAND_FILM, CUT, EVENING_AT, EVENING_OFFSET, SCORE_FROM } from '../beats/woodland';
import { sectionMarkers, type MemoryDef } from '../memoryDef';

/** The woodland's recorded sound against its insects (dB on the files as baked), set by measure:
 *  the piano about 4.5 LU under the place round it. (There is no wind: it read as a noise louder
 *  than anything in the clearing, and the breeze is light: the artist, 2026-10-20.) */
const SCORE_DB = -28.5;
const EVENING_DB = -32;
// (The revisit stays on the wall, still: a short hold, its stillness the answer.)
const EMPTY_SECTIONS: Sections = { active: 6, exit: 16, residue: 21, end: 24 };

/**
 * Five More Minutes (docs/reviews/2026-10-woodland.md): two people lying in a summer clearing.
 * Nothing happens. Then they are gone. Since 2026-10-24 the afternoon is a film: four selected
 * animated shots, precomposed into the painting's own frame (scripts/woodland-film/,
 * references/woodland/film/), played as Almost's is (src/memory/living/FilmScene.ts), on the
 * 48.25 s editorial timeline the artist approved (the old 53 s one less 1.75 s of the two-shot's
 * tail, 2.25 s of the second wide's head, and 1.5 s of the ghost text's return; 0.75 s of the room
 * before it begins is not the memory's). 47.5 s and a cicada after:
 *
 *   0–6       1 the room remembers: a cicada beyond the wall (1.2); the pencil finds the clearing
 *             from the line outward from 2.0 (light lines first, the two of them last), the room's
 *             writing with it, while the visitor drifts toward the wall (their look
 *             their own; a look away holds it, a step held lets it go; they are taken in if they
 *             are looking at it when it would take them)
 *   5.4–9.5   2 crossing in: the drawing whole, the colour comes, from between the two of them
 *             outward as one light wash, the room's writing going to a trace just ahead of it;
 *             its light comes up (7.1–8.3), and the same move carries them on, square to it; it
 *             opens out until it is all there is (8.2–9.8). The film holds its first frame through
 *             all of it: what the wall resolves into is the opening shot itself. As it opens, a
 *             piano, already playing (8.5): someone at an upright, for nobody, a plain tune going
 *             round in its own time (scripts/woodland-score/)
 *   9.5–15.0  3 the film begins: an ordinary afternoon, the wide, both resting, looking up;
 *             cicadas in the trees, a far bird
 *   15.0–25.25 4 cut: the two of them close. Both looking up. Her eyes go to him (19.3) and her
 *             head follows (20.2–21.5), privately; he stays looking at the sky. She stays there.
 *             (The cicada over them, and the two either side, are quiet through it; the tune comes
 *             home once before her look, and her look falls inside its long high note.)
 *   25.25–30.5 5 the wide again, cut while she is already looking at him and he at the sky (no
 *             second turn); the cicada over them again; a far bird; the tune going round again,
 *             toward home
 *   30.5      6 a hard cut, on one frame: the same clearing, the same view, at dusk, and nobody
 *             there. The piano stops on it, a note before home, with everything of the afternoon's
 *             (its insects); the evening's cicadas are already singing, far off in the trees (the
 *             artist's brief of 2026-10-19; no wind)
 *   30.5–39.0 the empty clearing at dusk, its own small movement; the evening cicadas; no music
 *   38.5–43.5 out (the film's last half second under it): carried back, its last frame gathering
 *             itself to the wall
 *   41.8–43.8 the colour goes, the empty clearing's pencil alone a while; the graphite sinks and
 *             the room's writing comes back with it (44.7–45.8)
 *   44.2      one evening cicada, far off, heard in the white room
 *
 * What they might have said, never said (no line is spoken, written or captioned):
 *   "We should probably go." / "Yeah." / … / "Five more minutes?" (not answered)
 *
 * The revisit (empty): the same clearing at dusk, nobody in it, and it stays in the wall.
 */
export const WOODLAND: MemoryDef = {
  id: 'woodland',
  art: 'woodland',
  variants: ['afternoon', 'empty'],
  layers: ['scene', 'sketch', 'sketch-after', 'light', 'light-after'],
  sections: WOODLAND_SECTIONS,
  markers: [
    { label: 'music:cicadas', position: 0.05 },
    { label: 'music:woods', position: 0.05 },
    { label: 'music:score', position: SCORE_FROM },
    { label: 'sfx:bird-1', position: 10.9 },
    // (One far bird, in the first wide. The second, in the second wide, is gone with its length: in
    // the film's 5.25 s it sang over the piano's last phrase and its call's end emptied the clearing
    // before the cut did: the sound designer, 2026-10-24.)
    { label: 'music:evening', position: EVENING_AT },
    { label: 'sfx:cicada-last', position: 44.2 },
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
          // (Its own light is the dusk's already.)
          'layer:light-after.opacity': [[0, 0]],
        },
        markers: [
          ...sectionMarkers(S),
          { label: 'music:evening', position: 0.05 },
        ],
      };
    }
    const S = WOODLAND_SECTIONS;
    const F = WOODLAND_FILM;
    const filmSeconds = F.frames / F.fps;
    return {
      tracks: {
        // Shot 1, the room remembers: the pencil finds the clearing on the plaster stroke by
        // stroke (scripts/stroke-order.py), while the visitor drifts toward the wall (the lean,
        // their look their own); shot 2: once the drawing is whole the colour comes, out from the
        // two of them (the words lie over them) as a wash, the painting spreads, they are carried
        // in, and it opens out until it is all there is.
        // (The cicada first, beyond the wall (1.2 s); then the first stroke (2.0); the two of them
        // are found last, ~4.2–5.0: cinematic review. The colour waits for them. The two clocks are
        // scripts/stroke-order.py's too: tests/memory-defs.test.ts.)
        // (The way back is the 53 s timeline's, retimed as the artist's 48.25 s edit retimed it: the
        // colour gone by 43.8, the pencil alone a while, then sinking 44.7–45.8.)
        'window.sketch': [[2.0, 0], [6.0, 1], [44.73, 1], [45.8, 0]],
        // (The colour straight: as much of the painting takes it in each moment as in any other.)
        'window.reveal': [[5.4, 0, 'linear'], [7.6, 1], [41.8, 1], [43.78, 0]],
        'window.presence': [[0, 1]],
        'window.parallax': [[0, 0]],
        // The room's writing under the painting: going as the colour reaches it, then held a trace
        // until the pencil goes (src/world/living/wash.ts), so the empty clearing's pencil is
        // alone a while on the way back and the words come back to a white wall: the creative
        // director's and the skeptic's reviews, 2026-10-18.
        'window.wash': [[0, 0, 'hold'], [7.6, 1]],
        // The light finds the people first (painting metres from its centre). (Drawn in order, as the
        // film is, the pool reveals nothing: the order map does. If the film can't be had, the
        // memory is the wall's still, revealed by this pool: it opens over the whole painting as the
        // colour comes; held at 0.55 m it left a lit blot under the line for the whole memory: QA,
        // 2026-10-24.)
        'light.x': [[0, -0.05]],
        'light.y': [[0, -0.24]],
        'light.radius': [[1, 0.15], [6, 0.55], [7.6, 2.2]],
        'light.soft': [[0, 0.14]],
        // The afternoon's warmth, then (at the cut) the evening's.
        'light.warmth': [[0, 4300, 'hold'], [CUT, 2900]],
        // The painting's light (with its colour: before it, on bare plaster, it read as two pale
        // smears); low while inside; it goes last.
        'light.intensity': [[0, 0], [1.4, 0], [2.6, 0.5], [6, 0.45], [10.5, 0.3], [S.exit, 0.2], [S.exit + 4, 0.3], [S.residue, 0]],
        'light.roomSpill': [[0, 0]],
        'layer:scene.opacity': [[0, 1]],
        'layer:sketch.opacity': [[0, 0.9, 'hold'], [CUT, 0]],
        'layer:sketch-after.opacity': [[0, 0, 'hold'], [CUT, 1]],
        // The painting's light: the afternoon's dapple until the cut, then the dusk's own (the
        // afternoon's sun came back over the empty clearing as it went into the wall: the cinematic
        // director, 2026-10-24).
        'layer:light.opacity': [[0, 1, 'hold'], [CUT, 0]],
        'layer:light-after.opacity': [[0, 0, 'hold'], [CUT, 1]],
        // The way in, one move (shaped in Inside.ts): from the cicada, slowly; the body only until
        // they are taken in (~6.2 s); the painting's own light up over it 7.1–8.3, then opening out
        // to all there is over its own straight 1.6 s, 8.2–9.8 (cinematic review, 2026-10-18: it
        // was the threshold's briefest phase); still by 10.5. Back: steadily (never a jolt), the
        // plaster re-forming as they are carried back.
        'scene.approach': [[1.2, 0, 'linear'], [10.5, 1], [S.exit + 1, 1, 'linear'], [S.exit + 5, 0]],
        'scene.immerse': [[0, 0, 'hold'], [6.2, 0, 'linear'], [8.2, 0.68, 'linear'], [9.8, 1, 'hold'], [S.exit, 1, 'linear'], [S.exit + 2, 0.72, 'linear'], [S.exit + 5, 0]],
        // The film's own time: its first frame (the opening wide) through the way in, then as a
        // clock does, its four shots at their own speed, then its last frame (the empty clearing at
        // dusk) held as it goes back to the wall. One clock: never looped, never restarted.
        'scene.film': [[0, 0, 'hold'], [F.at, 0, 'linear'], [F.at + filmSeconds, filmSeconds, 'hold']],
        // The cut, for what reads it (the captions go light over the dusk): the afternoon until
        // it, the same place later from it. (The film cuts there itself, on its frame 504.)
        'scene.after': [[0, 0, 'hold'], [CUT, 1]],
      },
      markers: [
        ...sectionMarkers(S),
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
    // instant of the audio clock as the evening begins (its marker). The film is silent.
    return {
      room,
      cues: {
        // The cicada nearest them, in the tree over them, first heard from beyond the wall; a lull
        // while the two of them are close (her look); cut off by the cut, mid-phrase.
        'music:cicadas': { asset: 'synth:cicadas', gainDb: -20, place: { u: -0.3, v: 0.25, d: 1.5 }, dry: true, until: CUT, fadeOut: 3, caption: '[cicadas, beyond the wall]' },
        // The rest of the day's insects: two more cicadas, the chorus in the trees. Named once, as
        // the place (the piano a part of it), when the painting has come to rest and gone again
        // before the cut to the two of them; never with a note.
        'music:woods': { asset: 'synth:woods', gainDb: -14, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, until: CUT, fadeOut: 3, caption: '[cicadas in the trees; a piano]', captionAt: 9.85 },
        // A far bird in the trees at the clearing's edge, in the first wide (none while they are close).
        'sfx:bird-1': { asset: 'music/woodland-bird-1.mp3', gainDb: -12, place: { u: -0.4, v: 0.35, d: 14 }, lowpass: 5500, until: CUT },
        // The piano: centred, dry, coming into hearing with the clearing as the painting opens out,
        // keeping its distance from the place to the cut (its file: scripts/woodland-score/, made
        // for the 53 s timeline and joined for this one by scripts/woodland-score/retime.py).
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
  // An early leaving reverses the way in (about 1.5 s) and lets the rest go after.
  exit: 3,
  maxHold: 20,
  tail: 2,
  hush: 0.7,
  living: true,
  lastMusic: 'afternoon',
  // (The artist's idea, the words ours as they asked: in the afternoon's voice, saying only what
  // they had; under "five more minutes". Written as the room's writing is back, done as the
  // aftermath begins: the skeptic, 2026-10-20; at the 53 s timeline's 52.5, retimed.)
  coda: { variant: 'afternoon', at: 47.0, text: 'we had all afternoon' },
  describe: (v) => v === 'empty'
    ? 'A painting forms in the wall by the words: a clearing in a wood at dusk, a fallen log, a tree, the grass. Nobody is there.'
    : 'A pencil drawing forms in the wall by the words: a clearing in a wood, two young people lying in the grass.',
  // (Short, at least 3.5 s apart; only what is seen, in order, never what it means: interaction,
  // QA and creative reviews. The film shows the same shots inside and on the wall, so what they do
  // is told to everyone; how it opens is told as it is seen.)
  announce: (v) => v === 'empty' ? [] : [
    { at: 10.0, text: 'It opens until it is all there is: a summer afternoon.', inside: true },
    { at: 10.0, text: 'The painting comes alive on the wall: a summer afternoon.', wall: true },
    { at: WOODLAND_FILM.shots.close, text: 'Closer: the two of them side by side in the grass, looking up.' },
    { at: WOODLAND_FILM.glance.head + 0.5, text: 'Her eyes go to him, then her head. He keeps looking up.' },
    { at: CUT, text: 'The same clearing, at dusk. Nobody is there.' },
    { at: WOODLAND_SECTIONS.exit, text: 'The painting goes back into the wall.' },
  ],
};
