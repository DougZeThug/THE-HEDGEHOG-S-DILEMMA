# Emotional depth: resonance, absence, aftermath, return

The artist asked for the room to become more emotionally impactful by improving how existing elements relate, not by adding content. Their final test: *does the visitor feel that something happened between them and this place?* Baseline measurements, before any change, are in `docs/reviews/emotional-depth/` (`baseline.json`, `journey-before.txt`, traces). They were measured with `scripts/journey.ts` on commit f0cbaf2.

## What was wrong, measured
- **Memories were isolated.** After a painted memory or a vignette, nothing later referred to it, except B's "tomorrow", written on some other wall.
- **Significant moments were covered over at once.**
  - The room's own next event came a median **6.2 s** after a memory ended.
  - There were **3.6** of the room's own events in the 30 s after.
  - Drift, accumulate, contaminate, recontext, music and situations all ignored the memory quiets. Several of the room's events could fire in the same tick: four at once in the still persona's trace at 251 s.
- **Absence was thin.** There was one residue light, which only the residue situation used, plus random chair nudges. Leaving after closeness, retreating and never approaching produced no different room.
- **The door was never reached.**
  - Its offer fired in 0 of 40 visits, because the bedroom's offer and the offer cap took the slots, and it also needed the visitor facing south at that tick.
  - Meanwhile its line drifted onto the north wall, where it could never open.
- **Return visits were generic.** They got a reveal and a random chair nudge.
- **Privacy bug.** Forget cleared storage, but this visit's in-memory counts were written back afterwards.

## Approach review
Five specialists reviewed the plan, then the skeptic challenged the draft reconciliation. Their findings in short:

- **Creative director.**
  - Don't override the door's `approach` ("someone comes to the door and stops", the work's central image) or the bedroom's `morning`. That would trade a contradiction for plain sadness.
  - The footsteps are a quest marker made of sound.
  - Move B's "tomorrow" echo beside the drawn door.
  - Keep "the table" as subtraction.
  - Seat warmth is sentimental, and it duplicates the residue situation ("warmth where you were, not at the chair").
  - Invert the return logic: closeness answered by distance, distance by reaching.
- **Cinematic director.**
  - A `chairGlow` drop is invisible (about 1 point of brightness). The seat residue light lights the floor *under* the chair, like a lamp.
  - Turns snap, so do them in the black.
  - The residue glow at 0.6 reads as a lamp.
  - The end of an aftermath must not release everything at once.
- **Sound designer.**
  - The hum (60–300 Hz) is inaudible on phones; only the vent layer carries.
  - The footsteps take ends on a stop, which is the horror cue.
  - The aftermath begins with a +12 dB swell (`memoryHush(0, 3.5)`).
  - Push chord changes and outside swells past it.
- **Interaction designer.**
  - The "retreat" class as specified labels walkers as retreating, and "close" duplicates residue.
  - The door offer never fires.
  - Visual gestures happen out of sight (the phone persona perceived 0 of 16 residue glows).
  - `journey.ts` perception was too generous; it is now device-aware.
- **Technical artist.**
  - Everything is buildable with no new programs.
  - Never add lights.
  - Chair yaw is never reset, so a pose set before the opening holds through it.
- **Skeptic.**
  - The new gestures are near-copies of the existing held silence, dims, nudges and residue.
  - Cut the footsteps, the retreat gesture and the never-approached light. Use one aftermath length; cut the early end and the release choreography.
  - Fold "the table" into the held silence.
  - Fix same-tick bursts with one room event per tick.
  - Give the door priority.
  - Make the return turn the *only* change to the chair on return.

## Decisions (main session)

1. **One room-initiated event per tick** (skeptic). It applies everywhere, not just after memories, and it removes the need for any authored release choreography.
2. **Aftermath, one rule.**
   - After a memory that was heard or watched, the room's own life waits **25 s**: drift, unprompted accumulate, contaminate, recontext, resurface, distant life, music, the room's voices, held silence, filler, chair nudges, phase turns, offers and situations' sounds.
   - The wait is 12 s if the memory was let go early.
   - Everything the visitor causes is still answered.
   - The room's sound comes back over about 20 s instead of 3.5 s (no swell).
   - Chord changes and outside swells wait it out.
   - **Rejected:** per-tone lengths (CD, cinematic) and the early end (interaction), as differences nobody can feel; the release order (cinematic), replaced by decision 1.
3. **Resonance: two threads, both through existing material. No variant overrides; no dialogue stitched together.**
   - **"tomorrow"** (B → the door). B's existing echo is found written on the south wall, beside the room's drawn door, not "some other wall". The goodbye leaves its word where someone once came and stopped. Two scenes, no story connecting them.
   - **"the table"** (cereal or I → being alone at the chair). Once a meal shared at a table has been heard, on this visit or an earlier one, the room's once-a-visit held silence comes *there*.
     - The trigger: the visitor stays still within 2.5 m of the chair for 8 s, in contradiction or transform, and F is not about to open at the chair.
     - The room's tone, vent included, goes under, and the light draws in to the chair.
     - It lifts when they move away: the room smaller around one person.
   - **Rejected:** the footsteps (CD, interaction, skeptic: never felt, and they spend the door's image), "stay" (CD), and "accepting closeness" (skeptic: no legible cause).
4. **Absence by how the visitor leaves.**
   - **Close:** the residue situation, already authored. Its warmth is lowered to 0.4 (cinematic: it read as a lamp). Its chair turn waits until the chair is out of view, never watched.
   - **Retreat:** answered in the visit by the existing withdraw responses ("withdraw-relief" / "withdraw-hesitant"), and on return (decision 6).
   - **Never approached:** answered in the visit by the existing distance motif and the departure line. On return there is nothing ("apart → nothing", protected by the skeptic: nothing to lose).
   - **Rejected:** seat warmth (CD, TA, cinematic); the never-approached light settle (skeptic: imperceptible as a slow fade, a copy of the dims, and a reward when lifted). The retreat vent drop was also rejected.
5. **Door discovery** (interaction, skeptic).
   - `door-open` is kept back until offered, so it no longer drifts onto the north wall.
   - The door is offered beneath the drawn door whichever way the visitor faces, ahead of other offers and outside the two-new-lines cap. It is still within the pointing guard: three a visit, 120 s apart.
   - After it is offered, a 1.5 s look begins it, as for vignettes.
   - Practice stays rare.
6. **Return** (CD, skeptic, TA).
   - **What is stored:** `hh.trace.v1` = `{v: 1, leaving}`, one word. Nothing about where anyone stood or what they wrote. Forget clears it.
   - **How it is classified:**
     - close: kneeling ≥ 8 s, or an approach that lasted ≥ 25 s;
     - retreat: a stop near the chair, a look at it, and leaving within 9 s (the interaction designer's definition, not passing by);
     - apart: never approached.
   - **On the next visit,** set in the dark before the opening, as the *only* change to the chair (the random return nudges are removed):
     - close → the chair is turned well away from where the visitor comes in;
     - retreat → it faces them squarely;
     - apart → unchanged.
7. **Privacy.** Forget also clears this visit's in-memory counts.

## Not done and why
- **The door is offered more but still opened rarely in simulation.** No scripted persona reads a line on the south wall. Whether real visitors find it there needs real visits.
- **Phones.** Whether the held silence at the chair is felt on a phone needs the artist with a phone. The vent layer is in its range; the hum is not.
