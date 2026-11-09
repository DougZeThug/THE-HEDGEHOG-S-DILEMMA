# Memory VII, The Shape of Someone: in the room

A 26 s shadow-puppet film: two people stand apart in a dim room, a warm light drifts across the
wall behind them, and their shadows, free of them, come closer, hesitate (he lifts a hand, she bows
her head away), meet forehead to forehead and hold each other, and part, a thread of shade between
their hands for a moment. The people never move nearer. It was made first as a standalone film
(2026-11-04: `scripts/memory-vii/render.py`, sound from ElevenLabs sound-effect takes laid by
`mix.sh`; the artist: "this is great"). This is how it lives in the room (2026-11-09).

The artist's brief for it: **"Shadow puppetry: the room's existing shadows begin behaving
differently and gradually reveal the memory."**

## What a visitor sees

It opens from "You understood me once, completely, for about a minute." (`understood-minute`,
east wall), kept off the walls until it is offered.

| Memory s | What happens | Where |
|---|---|---|
| 0.3–4 | The room's one cast shadow, the chair's, crosses the floor, climbs the skirting and stands on the wall round the line, enlarged: the room's key light has come down behind the chair, low, on the line from the wall through the chair, and narrowed onto the wall. The room's own light goes down (0.6). A low room tone. | `room.shadow`; `Lighting.holdShadow`, `LAMP`; `App.holdChairShadow`; `roomDim` |
| 1–7 | Shade spreads out from the chair's shadow over a 3.2 × 1.8 m patch (the room's wall in proportion), its corners last, darkening all together as dusk does, its edge a 45 cm feather. | `window.reveal` over `order.webp` (G), `layer:scene.opacity`; manifest `feather` |
| 5.5 | The film begins on the wall, in the gathered shade: its warm light comes up, her shadow is there; the chair's lamp gives way to it. | `scene.film`, `room.lamp` |
| 8.5–11.7 | Carried in as the two shadows begin to come closer. The edge is a shadow's: no raggedness. | `scene.immerse`; manifest `edge: "shade"` (`Immersion` `uShade`) |
| 11.7–30.5 | The film. On an upright phone the view follows her shadow while they are far apart and turns to where they meet, and stays there. | `src/memory/living/shadows.ts` `uprightAt` |
| 30.5–35.5 | Out as its light goes. The chair's lamp comes back as the film's light goes: the chair's shadow stands alone on the wall again. | `room.lamp` |
| 34–39.5 | The shade drains back into the chair's shadow, held a breath round it, and the room's light comes back. | `window.reveal`, `layer:scene.opacity`, `roomDimOut` |
| 39.5–43 | Last of all, the chair's shadow slides down the wall and home under the chair. | `room.shadow` |

Let go early, the chair's shadow goes home with the way in (`compose`: `shadow`), or eases home by
itself if the memory ends at once (`Lighting.heldShadow`).

It is a heart, shared with the woodland: someone who has stayed by the chair 45 s (or knelt) is
given one or the other (below).

## Making it

```
python3 scripts/memory-vii/render.py /tmp/room.mp4 --room     # the room's film (~10 min, 4 workers)
scripts/memory-vii/web.sh /tmp/room.mp4                         # webm + mp4, full and @low, order.webp, scene.webp
scripts/memory-vii/room-sound.sh                                # public/music/shadows-{wall,film}.mp3
npm run memories:seed -- --force=shadows-film                   # only to re-seed its timeline
```

- `--room`: the film opens and closes on the dim wall, never black (it is revealed on the wall
  and goes back into it); a little more ambient; the near-lens people lit only by the dim air (in
  the dark they are hardly there); no baked vignette or grain (on the wall a darker rim read as a
  stain, and the room's post adds both inside).
- `order.py`: the shade's order (out from the chair's shadow), its clocks (held to the timeline's
  by `tests/memory-defs.test.ts`), the poster (the held embrace, from the encoded film).
- No sound was generated for the room: the wall's cue is the approved room-tone take, the film's
  is the approved mix (the artist judges both by ear).

## Decisions (reviews of 2026-11-09)

Reviewed before building by the cinematic director, technical artist and interaction designer,
challenged by the skeptic; checked in the browser (`MEMORY=shadows node tests/playtest/memories.mjs`).

1. **The chair's shadow on the wall is the "existing shadow".** The proposal swung it across the
   floor only; the visitor reading a line faces away from the chair, so it would not be seen (the
   cinematic director). Thrown onto the line's wall by the room's own key brought low behind the
   chair, it stands where they are looking, enlarged: the shadow puppet's set-up itself. Not a new
   light: the key is already the room's hidden source that lets the chair's shadow "stop agreeing
   with the light" (skeptic); its warm tint was cut so it is the room's light, moved.
2. **The film begins on the wall at 5.5 s**, inside the gathered shade, not after the carry: the
   first version showed a blank grey patch for 12 s (cinematic director).
3. **Dusk, not a front.** A front of full shade with a noisy edge crossing bright plaster read as
   damp or burnt paper in the captures (cinematic, technical artist). Now a soft low front out from
   the chair's shadow under an opacity that rises everywhere at once; a 45 cm feather; a shadow's
   edge on the carry.
4. **The key goes round the chair**, angle, reach and height eased; a straight line passed over the
   chair for a north wall (technical artist). Its shadow camera is fitted to the narrowed cone, and
   the chair's contact shade judges the room's key, not the lamp.
5. **The room stays dim until the shade has gone** (`roomDimOut`): it lifted at 34.5 s, before the
   chair's shadow stood alone (skeptic).
6. **No sway.** Following the film's light with the chair's shadow while inside could never be
   seen (all four reviewers).
7. **Upright phones follow her, then hold where they meet** (interaction designer; skeptic: never
   follow one of them after).
8. **A shared heart** (interaction designer; the artist chose it on 2026-11-09): as an offered
   memory after another it played in 0–2% of simulated first visits. The skeptic measured the
   shared heart: woodland 16 → 12 and shadows 0 → 7 of 150 visits, painted reach 16 → 19. The reason
   is perceptual more than the line's rhyme: someone who has stayed 45 s by the chair is the visitor
   best placed to see its shadow move.

## Still needs a person

- Whether it reads as shadow theatre or as a projector: the chair's shadow is strong (lamp gain
  1.4); on a phone, and at real gamma.
- The sound, by ear (`public/music/shadows-*.mp3`).
- The visitor has no body: beside a low lamp, the absence of their own shadow may be noticed
  (skeptic). Meaning or gap?
- The woodland's music is the room's last; on a visit where the shadows take the heart, the visit
  ends without it.
