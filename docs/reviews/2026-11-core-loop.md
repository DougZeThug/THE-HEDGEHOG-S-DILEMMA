# The core loop: an audit, experiments, and what changed (November 2026)

The artist asked for a deep, experimental audit of the whole experience, focused on its core loop. The goal was a room that is compelling to explore, emotionally affecting, intuitive and worth revisiting: "more than a collection of beautiful memories". The improvements were to be built and validated, not only recommended.

Evidence is in `docs/reviews/core-loop/`:
- `brief.md`: the baseline evidence and first proposal, given to reviewers.
- `baseline.md`: the first battery.
- `approach-reviews.md`: four specialists, the skeptic's challenge and the decisions.
- `arms.md`: nine arms compared.
- `after.md`: the result.

## How it was measured

**Simulated, in the engine.** The five scripted personas never react to the room, so they cannot test a loop. `tests/playtest/visitors.ts` adds closed-loop visitors.
- Each visitor has a genome: how they move (keys, Shift, walking to a target, a phone's drag), what they are drawn to, how long they stay with a line, whether they tap, kneel, write, and how they leave.
- They are drawn from six classes (reader, chair, explorer, still, phone, mixed), plus eight chosen to break things: a speed-walker, an idle visitor, a tap-spammer, one who kneels anywhere, a wall-hugger, one who never goes to the chair, an early leaver, a floor-reader.
- They perceive what the room does, with a field of view, and react to it: they turn to new writing, go toward a sound beyond a wall, come to the chair when it is spoken from, and back off when the room recoils.
- **Those reactions are assumptions.** They make the loop testable; they do not say what a person feels.

`scripts/experiment.ts` runs about a thousand such visits in under two minutes:
- 162 genomes × 5 seeds, plus 120 adversarial visits and 60 second visits.
- Experiments are compared on identical visitors and seeds.

**About 24,000 simulated visits in all,** across the baseline, the first A/B, two batteries of eight and nine arms, departure runs at 300 s, the final battery and 300 second visits.

**Observed, in a real browser.** Chromium with software rendering, about 15 fps, so room time runs at about 0.4× the clock. About fifteen runs, using the real keyboard, clicks and touch emulation:
- `tests/playtest/core-loop.mjs` (before) and `core-loop-after.mjs` (after) rush to the chair, step back, come back, kneel, read and click a line, and take the way out.
- They record every cue, the light on the chair, the room tone and frames, and the frames' luminance is measured.
- Also: the existing smoke test, the phone playtest and the opening check.

**What counted.** The skeptic found that the first version of the instrument credited a warm colour swing and a hush on every desktop, and missed the recoil. After that review:
- Light counts as seen only where the frame changes by about 8% or more.
- A hush counts as heard only when deep, and never on a phone (whose speaker can't carry the hum).
- Approaches count when the visitor arrives.
- Every act is measured against its own placebo: the same test at quiet moments.
- An act's own acknowledgement isn't counted as an answer.

**What decides:**
- perceptible answers per device against their placebo;
- identical answers to a repeated act (the vending-machine counter);
- false triggers;
- reach of the central images;
- the largest share of any one departure line.

Density, overlaps and held silences are guard rails, not goals.

## What was found (before)

1. **Most of what a visitor did got no perceptible answer where they did it.**
   - Reading a line: 19% against a 19% placebo (desktop).
   - Coming to the chair: 15% (placebo 8%).
   - Kneeling: 23%; stepping back: 41%.
   - Observed in the browser:
     - Rushing to the chair, the light on it didn't change (key light 0.94 → 0.97). Seven seconds later, as the visitor stepped *back*, the chair spoke.
     - Coming back gently, nothing; clicking a line, nothing.
     - Standing at the door facing out, nothing but the stillness answer.
   - The cause: answers were coin flips (40%, 50%, 55%, 90%), out of view, 60–180 s late, or a hush on a phone that can't play the hum. The README's rule was that "the visitor never learns that looking makes something happen".
2. **Passing the chair counted as approaching it.** In a 6.4 m room with the chair in the middle, crossing between walls passes within 1.15 m.
   - Readers logged about 8 "approaches" a visit, and the hesitation motif formed for nearly everyone.
   - So the departure line was nearly the same for everyone: "The chair, from the door." or "Somebody almost knocked." in 716 of 930 visits.
   - The "close" trace (the chair turned away on the next visit) was set on 78% of visits.
3. **The set pieces were rare and their order accidental.**
   - Painted memory on a first visit: 44%. Cereal 30%, bedroom 12%, door 10%, woodland 3%, Almost 1%, Things 1%. Writing in the air: 3%.
   - Once the kitchen light was offered, the one remaining offer always went to the woodland, by array order, and the woodland ended the arc.
4. **The visit had no ending of its own.** You left from the settings menu.
5. **Variation was lower than claimed.**
   - Every first visit anyone ever made used seed 8919.
   - Situations were chosen by visit count, so "listening" came on 0 of 930 first visits.
6. **Dead paths.**
   - The `contribute` signal was never raised.
   - `flash` was never emitted.
   - `K` kneeled anywhere, and the chair answered someone kneeling across the room.
   - A click on writing only took the mouse.
7. **A latent race.** The words in the air set their own hold as they were decided, so a cue held back a tick could be kept waiting by its own hold until it expired. Seen in tests after an unrelated timing change.

**Protected throughout:**
- the opening (its real-time check passes unchanged);
- the held silences: 98% of visits, none broken;
- the restraint: about 7 developments a minute, no overlapping sounds;
- the aftermath after memories;
- second visits: about 60% of their answers are new.

## The thesis, and how it changed

The first proposal said the room should behave like someone caught in the dilemma toward the visitor. Small answers should become reliable, local and immediate; large ones should stay rare. The creative director sharpened it: **reliable in kind (light, sound, shadow), never in content (a line, a voice, a memory), and changing when repeated.** The room answers bodies, not words.

## What was tried, what was discarded, and why

| Tried | Measured or observed | Outcome |
|---|---|---|
| A cold flash when the visitor rushes the chair; a warm flash for a gentle approach | The interaction designer measured holding W from the spawn: 1.04 m/s, "abrupt", so every desktop visitor's first step was graded. A phone's thumb decides the manner in about 6 mm. The cinematic director found the flash a colour swing at constant brightness (auto white balance), with the chair already out of frame. The creative director: a warm flash for gentleness teaches a moral. | **Discarded** |
| Grading approaches by speed (gentle, abrupt) on any device | The skeptic: 64 of 111 desktop visits would flinch, 0 of 33 phone visits. Visitors can't see speed as a cause; those who work it out learn "be gentle". | **Discarded.** The return, not the speed, is graded. |
| A slow warm swell for the first arrival | Counted as seen only by fiat. It moves the warmth channel the field already drifts. | **Cut** |
| A 12 s "held breath" for later gentle arrivals | Inaudible on phones and most laptops | **Cut** |
| Graphite sound on every tap | The clip is 4 s of writing. Played into held silences, it held a voice slot and promised writing that never came. | **Replaced** by the ink taking the touch |
| Rewriting "It used to fit me." at kneeling eye level | A copy of a line already there, out of frame where people kneel | **Not done** |
| Memories mapped to behaviour (Almost / Things / woodland) | The skeptic: a rhyme needs the alternatives known. The creative director: meaningful only if Almost goes to the visitor who came back. | **Kept for Almost only** (see below) |
| Detecting someone leaving (turning to the south wall and standing still) | No door in the room: any departure would be an accident. The still-1 rule writes on the faced wall. The ebb fades a blank wall. | **Discarded** for a touched line |
| A way out taken by touching once and standing still for 9 s | 2 unintended departures in about 700 visits by non-leavers (readers who clicked the line and read on) | **Changed** to two touches |
| The air line within 10 s of stepping back | Missed visitors who stepped back early, and regressed a tested case | **Loosened** to "while they stay back" |

## Decisions (main session), with who was followed

1. **Passing is not coming.**
   - An approach counts when the visitor was heading for the chair (±25°) as they came within reach, then stopped by it, reached it, or came straight in and backed straight out (the hesitation itself).
   - Passes make no withdrawals, hesitations or trace.
   - Raised by the interaction designer; all reviewers agreed.
2. **The room recoils at a return, not at speed.**
   - The first arrival is met as it always was.
   - Coming back after going away (4 s or more) brings a recoil: a 70 ms fall of the room's sound, held 1.2 s and given back, and the room's own light pulled back toward the chair (0.9 s in, 1 s held, 5 s out), the chair's glow with it.
   - The second return gets 0.6 of that; then never again. The room gets used to you.
   - It works on every device. It never happens inside a memory, a held silence or an aftermath, nor straight after the words in the air were rubbed out.
   - The skeptic's design. The light is the cinematic director's, the sound the sound designer's.
   - The creative director wanted the chair's *shadow* to draw back. Not done: drift has a 6 s time constant, costs shadow redraws, and is out of frame after a rush. The room light pulling back is the same subtraction, and it can be seen.
3. **The words in the air answer stepping back from a stay** (6 s or more), while the visitor stays back with the chair in view. The never-came-near case is kept. Their hold now comes when they appear. Creative director and skeptic.
4. **Small answers.**
   - Kneeling is kneeling within 1.5 m of the chair.
   - A touch is felt in the ink. The hum dip it used to get half the time is removed.
   - A read line keeps a quarter of its look, fading over minutes ("handled paper"; the skeptic's).
5. **The departure line says how the visit went with the chair:** close, came back, refused, apart, still, otherwise.
   - The creative director's mapping, with one new line, "Somebody came back for the umbrella."
   - "Close" now means kneeling 8 s or one stay of 45 s, not 25 s.
   - The motif-based lines that could no longer be reached were removed (contributor, warmth, wandering, the two defaults). "Nothing moved for a long time." stays, for one who never came near and stood still.
6. **The way out.**
   - From the middle of a visit, touching "I left the party early and walked home and it was lovely." begins the room letting the visitor go, once they stand there.
   - The line was moved to eye height above the drawn door.
   - Touching it again leaves. Anything else, a pause, or twelve seconds of nothing keeps them.
   - The skeptic proposed a touched line instead of a detector; two touches came from the battery's false departures.
   - The line was chosen because it is already on the wall they came in by, and makes leaving a relief, not a moral.
   - **The artist should judge the line and the placement.**
7. **Memories.**
   - The door's line, written in its own place, no longer spends one of the visit's three pointings.
   - Almost (a hand reaches, starts, is taken back) is preferred for a visitor who came back to the chair at least two minutes earlier.
   - The memory prefetch now knows when the kitchen light has played.
8. **Hygiene.**
   - Each visit draws its own seed (`?seed=` fixes it).
   - Situations are drawn per visit, so "listening" comes.
   - The `contribute` signal is raised.
   - A deeper, shorter silence inside a longer one now returns to the longer one instead of lifting it (the sound designer's finding).
   - A click on the middle of the view acts on it as it takes the mouse.

## Before → after (engine, simulated)

Same instrument and the same 930 first visits: the 9-arm battery's `base` against `after.md`. "Caused" means a perceived development in place within 8 s, not the room's own life; the placebo is in brackets.

| | before (desktop / phone) | after (desktop / phone) |
|---|---|---|
| Coming to the chair | 15% / 18% (8% / 3%) | **35% / 37%** (8% / 4%) |
| Coming *back* to it | 12% / 15% | **35% / 37%** |
| Kneeling | 23% / 31% | **36% / 44%** |
| Tapping the chair (phone) | 16% | **34%** |
| Stepping back | 41% / 40% | 46% / 49% |
| Reading a line (first meeting) | 19% / 24% | 20% / 24%: unchanged in the engine (its answer, the read trace, is visual) |
| Active 30 s windows with nothing perceived in answer | 21% | 18% |
| Identical answer to a repeated act | 0% | 9% (the recoil, twice, then never) |
| Developments a minute, imposed quiet, overlapping sounds | 6.8, 40%, 0 | 7.1, 41%, 0 |
| Writing in the air reached | 3% | **31%** |
| Any painted memory; Almost | 44%; 1% | 45%; 5% |
| "Listening" situation | 0 of 930 | 562 of 930 |
| Visits whose trace turns the chair away next time | 78% | 65% |
| Largest share of one departure line | 40%, the same two lines for every kind of visitor | 53%, by behaviour: chair-seekers 100% "still warm", explorers 52% "umbrella" |
| The way out | (none) | taken by 150 of 225 visitors who went to leave; **0 unintended** among about 700 who didn't |

## Observed in the browser (real input, measured frames)

- **The recoil.** Coming back with the W key, the frame's mean luminance went 0.524 → 0.448 (−14.5%) and was back within about 6 s. The second return: −7.5%. Both happened at once, on arrival.
- **The way out.**
  - Touched by click, the frame went to 0.17 with the chair lit (the leaving palette).
  - Turned back: the opening's image, the chair alone in a dark room under "I wanted you to stay." (top 0.20, bottom 0.42).
  - Kept: back to 0.53.
  - Touched, then touched again: gone, with "The chair, from the door."
  - Touched once and left alone: the room came back on its own.
- **The read trace.** After 6 s on "I wanted you to stay.", emphasis 0.67 and the trace 0.25. Eight seconds after looking away the look had gone (0.05) and the trace remained (0.24).
- **A click on writing** pressed the ink (0.88, settling).
- **No console errors.** The opening's real-time check passes. The smoke test and the phone playtest pass.

## What still needs a person

- **Whether the recoil reads as the room flinching or as a fault**, at real frame rate, on an OLED phone with auto-brightness. Stills at about 15 fps can't say.
- **Whether a 70 ms drop in the room tone reads as a flinch or a dropout.** That needs the artist's ears, on headphones and on a phone.
- **Whether anyone finds the way out, and whether the second touch feels like a choice or a confirmation dialog.** Only people can say. A screen reader is told what to do; sighted visitors are not.
- **Whether the read trace reads as a hand's trace or as a "visited link".** Tune it by eye (`HANDLED` in `WallText.ts`).
- **The departure lines are now honest but uneven.** In this simulated population many visitors kneel, so "It is still warm where you were." is the most common line. Real visitors may kneel far less.
- **Second visits meeting a new painted memory:** 42% → 34% (60, then 300 visits). Within noise, unexplained, and worth watching.
- **Reading, the most frequent act, still has no engine-visible answer beyond chance.** That is deliberate (the README's rule survives for words); the read trace is its only answer.
