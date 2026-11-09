# The Drive Home: in the room

A 45.6 s cut of a traced rotoscope film. Two grown brothers drive home at night after a difficult
gathering. The passenger looks out of his window and rubs his hands; the driver, without looking,
turns the heater vent toward him; later the passenger turns it partway back, so it reaches the
driver's hands too. Neither says anything. It was made first as a standalone film (2026-11-04,
rebuilt as true rotoscope 2026-11-09: `scripts/the-drive-home/`, sound from ElevenLabs sound-effect
takes laid by `mix.sh`). This is how it lives in the room (2026-11-09).

The artist's brief for this: **"figure out how we can build this into the hedgehog's dilemma, how it
will first manifest in the room, and how it will disappear as the user returns to the room - this
should be creative."** The design, with the reviews behind it, is the Claude Doc "The Drive Home in
the room" (2026-11-09).

## What a visitor sees

It opens from **"Are you angry with me?"** (`angry-with-me`, kept off the walls until it is offered).
The room's own recording of that line was directed "a small, afraid voice from the back seat", its
scene "The car was silent all the way home": the line was already a car. Its line is written alone
on the wall the visitor faces, so everything happens there.

| Memory s | What happens | Where |
|---|---|---|
| 0-3 | The room goes down to dusk (to half its light) with a cool, moon-blue cast; the patch of wall round the line darkens all together. | `room.night`, `Lighting.night`; `roomDim`; `window.reveal` over `order.webp` (G), `layer:scene.opacity` |
| 2.4-9 | Three streetlights pass. Each is a soft sodium band across the whole wall, right to left (the film's direction), into the corner: slowest in its middle, where the faces are, and quick at its edges (its angle goes evenly, its light along the wall as the tangent), sheared, wider where it falls obliquely. The first passes in silence; tyres on a wet road come under the next two. | `room.street`, `src/world/StreetLight.ts`; cue `music:wall` |
| 2.4-9 | Where a band crosses the patch, it finds faces in the dark: the picture's values lift in its light. Each pass leaves a little more found, the faces first. | `uBand`, `window.found` over `order.webp` (B), `window.dark` (`src/world/MemoryWindow.ts`) |
| 6.0 | The film begins in what they have found: the two of them side by side. From here the memory's seconds are the film's. | `scene.film`; cue `music:film` |
| 7.4-9 | The third streetlight crosses the plaster as the film's own lamp crosses the picture (7.8). | `DRIVE_PASSES` |
| 10.9-13.6 | Carried in as the passenger looks out of his window, arriving on the film's next lamp. | `scene.immerse`; manifest `edge: "shade"` |
| 13.6-44 | The film. On an upright phone the view follows each shot's subject, held across its cuts; in the second two-shot it pans slowly from one brother to the other. | `src/memory/living/drive.ts` `uprightAt` |
| 44-48.5 | Carried out as the car goes on into the dark. | `scene.immerse` |
| 48.5-52.5 | The tail lamps fade into the plaster with the picture; the room keeps its night until they have gone. | `layer:scene.opacity` |
| 47.9-57.5 | The indicator's relay goes on after the picture has gone, heard, never drawn, while the night lifts under it; then it stops, as when a turn is made. | cue `music:relay`; `room.night`; `roomDimOut` |
| 57.5 on | The room's light comes back to the visitor first: the key light's aim goes off the chair onto where they are looking (the wall they face, a little over a metre up, or the floor 3 m ahead), over 6 s, holds 4 s, and goes back to the chair by itself over 30 s, after the memory has ended. Nothing is written, nothing is said; a screen reader hears "The light moves a little toward you." | `room.lean`; `App.leanToVisitor`; `Lighting.leanTo` |

Let go early, the night lifts with the way in, no streetlight is left crossing, and the light never
comes to them (`compose`: `night`, `street`, `lean`). Under reduced motion no streetlight crosses,
the faces are found all the same, the upright pan is a cut at its middle, and the light does not
come to them. Under the gentle intensity a streetlight brightens the wall by about ×1.6 at its
peak, not ×2.5.

## Where it sits in a visit

Only ever a heart (`offer.phases` is empty): **the recoil's heart on a return visit, once Almost has
been seen** (the artist chose it, 2026-11-09). The room recoils when a visitor comes back to the
chair after going away; on a first visit that leads to Almost, as before. Later, `heartOf` gives
the recoil to whichever of Almost and The Drive Home has been seen fewer times, Almost on a tie
(`HEART_SHARED.recoiled`, `HEART_FIRST_ON_TIE`). After the room has flinched at them, "Are you angry
with me?" is their own question, and the light that comes toward them at the end is the reverse of
the flinch they saw.

Measured before building (the skeptic's arm of `scripts/arc.ts`, 120 simulated second visits at
10 min): first visits unchanged; about 27 of 120 second visits meet it instead of replaying Almost
("same heart again" 31 → 4). The alternatives: sharing the "stayed away" heart with Things reached
1/2/4% of first visits at 3/5/10 min and took Things from 4/8/11% to 3/5/7%; offered after another
memory, 0%.

It counts as seen once entered and played to the driver's turn of the vent (`seenAt` 29); looking
away cannot end it before the carry in (`minHold` 17).

## Making it

```
export DRIVE_HOME_CACHE=/path/to/the/drawings        # film.py trace (README.md beside it)
python3 scripts/the-drive-home/film.py room /tmp/room.mp4     # the room's cut, from film 6.0 s
scripts/the-drive-home/web.sh /tmp/room.mp4                   # webm + mp4, full and @low; order.webp, scene.webp
scripts/the-drive-home/room-sound.sh                          # public/music/drive-{wall,film,relay}.mp3
npx vite-node scripts/seed-memories.ts -- --force=drive-film  # only to re-seed its timeline
CHROMIUM_PATH=/opt/pw-browsers/chromium MEMORY=drive node tests/playtest/memories.mjs
```

- `film.py room`: from the second shot (`ROOM_FROM` 6.0), no fade from or to black of its own: the
  wall takes it in and gives it back.
- `order.py`: G, the dusk out from the middle; B, what the streetlights leave found, the two faces
  first, then their hands and shoulders, then the car. Its clocks are held to the timeline's by
  `tests/memory-defs.test.ts`.
- `room-sound.sh`: no sound was generated for the room. The wall's cue is the approved tyres take,
  the film's is the approved mix from 6.0 s, and the relay is the approved relay take carried on in
  step with the film's ticks (measured: one every 0.6 s). The artist judges all three by ear.

## Decisions (reviews of 2026-11-09)

Reviewed before building by the cinematic director, technical artist, interaction designer and
creative director, then challenged by the skeptic.

1. **Everything on the wall the visitor faces.** The first draft made the skylight the car's roof
   and wheeled the chair's shadow round the floor under passing lights. All of it was behind
   someone reading a wall (all four), the chair's shadow would swing about 15 cm under a key
   inside the skylight (technical artist), and looking away 6 s while a memory forms ends it.
2. **"Are you angry with me?"**, not "the long way home" (creative director: the others open from
   an inner state; "the long way home" is nearly the film's title). Its line is written only: the
   back-seat recording before a film with no child in it suggests a third person, or a father and
   son (skeptic). The artist can audition the opening with it.
3. **Light finds faces in the dark.** A lit band revealing a dark picture would have darkened the
   wall where the light is (cinematic director). Now the patch goes to dusk first and the band
   lifts the picture's values.
4. **Full-wall bands with a passing light's motion.** Bands bounded by the patch read as a scanner
   (skeptic); this also keeps them apart from the kitchen-light memory.
5. **The room's cut begins at the second shot.** The road at night is near black (mean luma 17-45
   of 255): carried in on it, the view filled with black (cinematic director). The third
   streetlight is timed to cross as the film's own lamp does.
6. **The relay as sound only, the night lifting smoothly.** Amber pulses on white walls and a
   stepped return read as a hazard light or a faulty dimmer (cinematic director).
7. **The light comes to them, then eases back to the chair by itself.** The creative and cinematic
   directors wanted the visitor's own turn toward the chair to send it partway back, completing the
   exchange as the passenger does. The skeptic: in the film the gift is made without looking, and
   a light that answers a glance is the opposite gesture; it also needed five more rules. The
   skeptic was followed. Its position only, no warm tint: Memory VII took the warm tint off the
   room's light.
8. **Nothing written after it**, as the woodland and Things leave nothing (creative director).
9. **The tail lamps as the film has them**, small, fading with the picture (skeptic; the
   technical artist wanted them redrawn larger, the creative director cut).
10. **No "passing" revisit**: a heart that never reaches `seenAt` is offered again (interaction
    designer). A return plays the film again.
11. **The recoil's heart on return visits** (the artist's choice, above), not the "stayed away"
    heart (it split Things' reach without adding any: interaction designer, skeptic).

## Still to be judged by people

- Whether the full-wall bands read as passing streetlights or as a scanner, on a real screen.
- Whether the light coming to them reads as care or as a fault (the README lists a drifting
  shadow source among the room's known faults).
- The three sound cues, by ear, and the opening with and without the back-seat voice.
- `angry-with-me` is now reserved: it appears only when this memory is offered.
