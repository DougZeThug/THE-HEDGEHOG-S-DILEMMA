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

## Evaluating the result (QA, creative director, cinematic director, sound designer, skeptic)

The first build (976eca6) was tested and evaluated. Their findings, and what the main session did with them:

- **Spacing became a machine of its own** (skeptic, creative director, cinematic director).
  - The per-tick gate, the rotation of the room's rules and the 10 s re-entry after an aftermath produced a 2.5 s ladder and an exact 10.0 s pulse: 77 gaps of exactly 10 s in 40 visits.
  - **Done.** All three are gone; one seeded, jittered scheduler gap (4–7 s) remains. After an aftermath the gaps shorten from 12–16 s through 8–11 s to 6–8 s. A rule's several cues count as one event. A phase turn is never held, but it does count for the gap.
  - The scheduler also spent the major slot on an event it then held back (skeptic, QA). Fixed and tested.
- **Held silences were broken by the room itself** (sound designer, creative director). Next-room laughter landed 10–21 s into "the table" in 7 of 7 first visits; a line about silence was spoken 7 s into the silence.
  - **Done.** Nothing of the room's own comes during a hold, and situations' sounds wait until 6 s after one. Music and the room's voices wait 6 s after a deep silence. The phase turn keeps 15 s clear of it.
  - Held silences the room broke into: 16 of 40 visits → 0 of 40.
  - The sound designer asked for a 10 s exhale and the skeptic for none (imposed quiet was creeping up: 34% → 42%). Resolved at 6 s; imposed quiet is now 36%, and the journey reports it.
- **"The table" reached people with their back to the chair, or came as F's tail** (creative director, who checked view angles: 0 of 7 first-visit tables reached a visitor looking at the chair).
  - **Done.** It needs the chair looked at for 3 s, and comes at least 45 s after any memory. Its "perceived" count now requires the chair in view and no sound anywhere in it.
  - The skeptic said it cost other visitors their held silence, deferred to 300 s. **Done.** It waits at most 45 s past its moment (two minutes while the visitor is with the chair).
  - The skeptic also wanted the cereal/biscuit condition removed, giving the chair silence to everyone. **Rejected.** The brief asks for authored threads between memories, and the creative director keeps it. Its cause is invisible by design: it is a resonance, not a cue.
  - Result: on second visits 7 of 40, all perceived (before the fix, 22 with 6 perceived). Rare, and true.
- **The lift was a proximity switch** (creative director, cinematic director, sound designer, QA).
  - **Done.** It lifts only past 3 m, not on speed, and 1.5 s after they cross. Sound returns over 10 s on an even-loudness ramp; light follows 2 s later over 10 s. At the silence's natural end, sound starts back about 4 s before light.
  - QA found the silence could sound after its own lift, and that a lift could swallow the turn into the last phase. **Done.** The silence's state is set when it sounds, not when it is queued. A held silence that never sounded is given back to the visit. A lift inside the turn waits for the turn's 14 s.
- **The kitchen light could be lost** after the visitor stayed with its line (QA). **Done.** A light that never sounded is not spent.
- **"Tomorrow" was written on the north wall** once the door had been offered: the `beside: 'door-open'` placement fell back to the line's authored home (QA). Writing it beside the door's line would also have read as a caption (creative director). **Done.** It is always beneath the drawn door.
- **Return.**
  - "Retreat → facing them" was a 12.6° change that no visitor could notice and no persona produced, and as defined it would label a curious first approach (all reviewers). **Done.** Cut; the trace stores `close` or nothing.
  - "Close" at 64° read as set aside, not turned away (cinematic director, skeptic). **Done.** Turned 1.9 rad (about 120° from facing the visitor). It is the artist's angle to choose: `CLOSE_TURN` in `src/state/Director.ts`.
  - The return also asked "Do you remember me?" on top of the pose (creative director). **Done.** It does not ask when the chair has been turned.
  - The README no longer spells out what the pose means.
  - The trace is also kept when a phone hides the tab, and while the visitor is writing (QA).
- **Residue turn seen happening** (cinematic director, skeptic). Its guard was the centre ray. **Done.** It needs the chair out of the view (more than about 50° off) for 1 s.
- **The bedroom also got the 1.5 s easy look** (skeptic): unrecorded scope creep. **Done.** Limited to the door.
- **Not done:**
  - B's offer path (creative director). B and "tomorrow" stay rare. Adding an offer did nothing measurable in the offer order without reordering the others, and reach at n=40 is noise.
  - The longer chair-alone beat on a return with a trace (cinematic director): the opening score is protected.
  - The residue glow, at 0.4 barely different from 0.6 (cinematic director): cut it if it is unnoticed on a real screen.
  - The door's priority costs the bedroom: in 40 visits the bedroom went 9 → 4 and the door 0 → 1. That trade is the artist's.

## Not done and why
- **The door is offered more but still opened rarely in simulation.** No scripted persona reads a line on the south wall. Whether real visitors find it there needs real visits.
- **Phones.** Whether the held silence at the chair is felt on a phone needs the artist with a phone. The vent layer is in its range; the hum is not.
