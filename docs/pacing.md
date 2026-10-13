# Pacing: how the room recognises attention, and what changed

The artist tested on a phone and spent too long standing around waiting. The room took up to a minute (or, for someone exploring, two) to answer anything, phases opened on fixed timers (40/95, 140/290, 320/520 s), and taps on writing did nothing at all.

## What it is now

- **Engagement** (`src/state/Engagement.ts`). What a visitor does becomes signals: reading a line, coming back to one after looking away, touching writing or the chair, approaching, staying with the chair, kneeling, looking around, crossing the room, pausing on purpose, writing. Attending to the writing counts for more than moving about. The visit's *depth* grows from these, and slowly by itself.
- **Phases** (`src/state/Phase.ts`) open by depth, with low time floors (so depth decides) and time fallbacks (so a still visitor still gets there).
- **Rhythm** (`src/state/Pacing.ts`) tells chosen quiet (recovering after something strong, a held silence, or simply not long yet) from waiting (someone *doing things* and nothing answering), notices repetition, and holds the room's own life back when enough is happening.
- **Answers** (`src/state/Director.ts`): an authored opening in the first seconds; first approach answered at once; meetings with lines (encounter arcs) that outrank everything; voices prompted by actions (turning away from a line, returning to one, leaving the chair, reading line after line); a response rule for real stalls; one held silence; sometimes a deliberate withholding.

## Method

`npx vite-node scripts/playtest.ts` runs five personas — *hardly moves*, *actively explores*, *approaches the chair at once*, *reads several phrases*, *phone with touch* (`tests/playtest/personas.ts`) — through the real Director on eight seeds and reports medians at 15, 30, 60, 90 and 180 s (`tests/playtest/measure.ts`):

- **first response**: the first development caused by something the visitor did *and* seen or heard (the opening, drift, migration, ambience and filler don't count);
- **per min**: developments per minute (everything: writing, voices, sounds, music, light);
- **longest gap (seen/heard)**: longest stretch with nothing happening, and with nothing the visitor could perceive (a deliberately held silence is not a gap);
- voices heard (with a recorded performance), other sounds/music, writing (appearing out of view), recognised interactions.

The "before" figures were produced by the same harness against the merge-base (20ba58b). Full tables: [engine-before.md](playtest/engine-before.md), [engine-after.md](playtest/engine-after.md). `tests/pacing.test.ts` holds the targets.

## Before → after (engine time, median of 8 seeds)

| Persona | First response | Recorded voices by 90 s | Longest perceptible gap, first 90 s | Per minute (180 s) | Contradiction / transformation |
|---|---|---|---|---|---|
| Hardly moves | 12.4 s → 16.2 s | 0 → 2 | 22.4 → 21 s | 6.0 → 7.0 | 140 / ≥320 → 120 / 300 s |
| Actively explores | 124 s → 16.8 s | 0 → 2 | 58 → 20 s | 5.7 → 7.0 | 140 / ≥320 → 60 / 127 s |
| Chair at once | 12.8 s → 10.9 s | 0 → 2 | 25.1 → 20.5 s | 7.7 → 8.0 | 140 / ≥320 → 57 / 238 s |
| Reads several | 18.1 s → 13.1 s | 0 → 1 | 26 → 21.2 s | 7.3 → 7.3 | 140 / ≥320 → 52 / 138 s |
| Phone, touch | 47.9 s → 18.5 s | 0 → 4 | 47.9 → 20.7 s | 5.7 → 8.3 | 140 / ≥320 → 50 / 126 s |

On ten seeds the tests never use (11–20): first response 10–19 s, 1–3 recorded voices by 90 s, longest perceptible gap in the first 90 s ≤ 21 s, 7–8.3 developments a minute.

Notes, honestly:
- The still visitor's first response is slightly *later* (16 s vs 12 s): reading now pauses the stillness ladder rather than feeding it, and the room no longer answers stillness at a fixed early moment. Something still happens in the first seconds for everyone (the opening).
- The density went *up* from about 6 to 7–8 a minute — less than the 11–12 an intermediate version reached before review, and with a cap — because the first minute used to be empty. Much of it is writing appearing on a wall the visitor isn't facing at that moment (found on turning round).
- These are engine-time simulations with scripted gaze; the real-time browser runs below are the check that the same holds when rendered.

## Real-time browser runs (phone emulation)

`node tests/playtest/browser.mjs` (iPhone-sized viewport, touch emulation through CDP, real swipes and taps, wall-clock time). Software rendering runs at about 10 fps here, so the engine advances more slowly than the clock and scripted gestures slip; treat timings as upper bounds.

<!-- REALTIME -->

## Still to validate on real devices

- Frame rate and thermals on actual phones at the 1.5 pixel ratio now used for 'low' on touch.
- iOS: audio with the ringer switch on silent before iOS 16.4 (no `audioSession`), after a call or app switch; wake lock; the back-swipe guard; where the writing field sits with the keyboard open.
- Android gesture navigation; landscape notch and home-indicator overlap.
- Whether a half-screen swipe feels right for looking, and whether the touch hint is ever needed.
- Whether the hush before a voice and the dips when touching words are perceptible on phone speakers.
- And above all: whether the room *feels* alive within the first minute — which only a person in it can say.
