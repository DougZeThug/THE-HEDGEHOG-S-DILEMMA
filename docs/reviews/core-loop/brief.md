# Core loop: evidence and proposal for review (2026-11-06)

The artist asked for a deep audit of the core experiential loop, then for the strongest improvements to be built and validated. The goal is a room that is compelling to explore, emotionally affecting, intuitive and worth revisiting. In their words: "more than a collection of beautiful memories".

This file is the shared evidence for the specialist reviewers. The full baseline tables are in `baseline.md` (same folder).

## How it was measured

- **Engine.** `scripts/experiment.ts` runs `tests/playtest/visitors.ts`: closed-loop visitors that react to what they perceive.
  - 162 genomes in six classes (reader, chair, explorer, still, phone, mixed) × 5 seeds.
  - 8 adversarial visitors × 15 seeds; 60 second visits; 600 s each.
  - 990 visits in total.
  - Their reactions (turning to new writing, following a sound beyond a wall, backing off) are **assumptions**.
- **Real browser.** Chromium with swiftshader at 880×520, low quality, at about 15 fps; room time runs at about 0.4× the clock.
  - `tests/playtest/core-loop.mjs` uses the real keyboard to: rush at the chair, step back, approach gently (stop at about 1.9 m, then Shift), kneel, read and click a line, and stand facing the door.
  - Output: `test-output/core-loop/observed-base/` (not committed; screenshots and JSON).
  - `tests/playtest/browser.mjs` was also run with a phone persona.

## What we found

**1. Most of what a visitor does gets no perceptible answer in place.** First visits, engine. "Answered" means a perceived development at the same line, wall or chair within 8 s.

| action | n | answered | no answer |
|---|---|---|---|
| reading a line (first meeting) | 14,930 | 28% | 80% |
| coming back to a line | 11,273 | 35% | 70% |
| tapping or clicking a line | 5,738 | 39% | 67% |
| coming near the chair | 13,395 | 18% | 83% |
| kneeling | 1,622 | 28% | 72% |
| tapping the chair | 1,039 | 16% | 85% |
| being still at the chair | 5,376 | 17% | 84% |
| stepping back from the chair | 11,266 | 42% | 58% |
| **placebo** (nothing done for 8 s; was there "an answer" on the faced wall anyway?) | | **20%** | |

Reading a line is answered barely more often than chance (28% vs 20%).

**Observed in the browser** (room time). This is the clearest evidence:
- Rushing at the chair: a 0.4 hush. The light on the chair did not change (key 0.94→0.97).
- 7 s later, *as the visitor stepped back*, a voice came from the chair ("You understood me once…").
- Stepping back: nothing.
- Coming back gently: nothing. The first-approach answer happens once a visit.
- Kneeling: "still warm" was written by the stillness rule, then "Let me be small for a minute." 5 s later. That voice is a 40% chance once a visit, and this seed drew it.
- Reading a line, then clicking it: nothing perceptible.
- Standing facing the door for 15 s: only the stillness reveal.

**2. How you come near makes no difference.**
- Desktop approaches answered: gentle 24%, abrupt 21%.
- Phone approaches answered: 13%. The answer to an approach is a hush of the hum, and the hum (60–300 Hz) is inaudible on a phone speaker.
- The first-approach answer is otherwise random: a 20% creak, or a breath only in transform.
- `K` kneels anywhere. `ruleKneel` and the "close" trace don't check distance, so kneeling across the room makes the chair speak.

**3. Passing the chair counts as approaching it.**
- The chair stands in the middle of a 6.4 m room, and walking between walls passes within the 1.15 m band.
- Even readers log about 8 "approaches" a visit (5 passes). Hesitations follow, so the hesitation motif forms for almost everyone.
- As a result the departure line is nearly constant: 716 of 930 first visits got "The chair, from the door." or "Somebody almost knocked."
- The "close" trace is set on 78% of first visits, so most returning visitors find the chair turned away. That was meant as the special case. (Our visitors also read the floor lines from 0.9 m, which inflates it.)

**4. The set pieces are rare, and their order is accidental.** First visits, any class:
- Any painted memory: 45%. Cereal 30%, bedroom 13%, door 10%, woodland 3%, Almost 0%, Things 0%.
- Visitors who centre on the chair: any painted memory 15%.
- Kitchen light 43%. Writing in the air 1%. "The table" 2%.
- After the kitchen light has been offered, the single remaining offer slot always goes to the woodland (array order), and woodland's `last` ends the arc. Almost and Things are reserved and never on a wall, so they are unreachable.

**5. No ending.**
- One leaves through the settings menu.
- Turning to the door and standing there for 15 s produced nothing (observed).

**6. Variation is lower than claimed.**
- Every first visit uses seed 8919, so the same "random" choices for everyone.
- Situations are seeded by visit count alone. "Listening" never appears on visits 1–2 (0 of 930).

**7. Dead paths.**
- The `contribute` engagement signal is never raised.
- The closeness, reading and contributor motifs have no handler.
- The `flash` cue is never emitted.

**What works, and should be protected:**
- The opening.
- Held silences: 98% of visits get one, and none was broken.
- Restraint: a median of 6.8 developments a minute, 0 overlaps.
- The aftermath after memories.
- Second visits: 60% of their answers are new.

## The thesis

The room should behave like someone caught in the dilemma toward the visitor: it wants them close and is afraid of it. Small answers become reliable, local and immediate; large answers stay rare and ambiguous. The aim is to keep the mystery of *what* happens and remove the doubt about *whether* the room noticed. This deliberately challenges the README's rule that "the visitor never learns that looking makes something happen".

## Proposed experiments

Each is behind `experiments` in the Director's options (`?exp=` in the browser), so it can be compared on identical seeds and visitors.

**A1. The manner of approach** (`approachManner`).
- Each approach *leg* is classified as gentle, abrupt or neutral. Passes aren't approaches.
  - Gentle: stopped ≥ 0.8 s at 1.2–2.2 m, or ≤ 0.6 m/s over the last metre (Shift; F; tap the chair).
  - Abrupt: ≥ 0.85 m/s over the last metre with no stop.
- **Abrupt, the room flinches:** a cold `flash` (the key light hardens and cools within about 1 s), a short fast hush, and exposure nudged up. It eases back within seconds.
- **Gentle, the room lets them in:** a warm flash and the current slow hush, warmth nudged up.
- The near-dwell voice follows the manner: abrupt → the affectionate line said flatly from nowhere; gentle → the warm voice from the chair.
- Later approaches are answered only when the manner changes, or after 45 s.
- The first-approach answer stays a silence: tests pin it.

**A2. The air line, freed** (`airLine`).
- "Please don't come any closer." written in the air follows the first withdrawal once "stay" is finished. Today it is once, late, and reached by 1% of visits.
- Coming close quickly rubs it out. Coming slowly lets it stay a moment and thin away.

**B. A grammar of small answers** (`kneelAtChair`, `tapMark`).
- Kneeling counts only within 1.5 m of the chair, for its answers, residue and the trace. There, it is always answered quietly: the room lowers, as now, and "It used to fit me." is written again on the floor at kneeling eye level. The voice stays rare.
- A tap on writing gives the graphite touch (an existing recording), played at the line every time, at most once per 9 s per line. This replaces a 50% hum dip on the first two taps, which phones can't hear.
- Contributions keep "no reveal or voice within a minute".

**C. Leaving.**
- *First:* the departure line is chosen by how the visit went (closeness given or refused, coming back, the memory met), not by the motif that formed for everyone.
- *Then* (`leaving`): turning to the door the visitor came in by and standing still there, after the visit has some depth, starts the room letting them go. The room's light ebbs and the chair stays lit (the leaving palette). Any turn, step or look at writing cancels it. After about 10 s more, they leave. The menu stays.
- Strict conditions guard it: facing within ±35° of south, z ≥ 2.2, chair out of view ≥ 3 s, not reading, at least 1.5 m from the spawn in the last 40 s, phase contradiction or later, no memory.
- Zero false departures are required in the battery.

**D. What closeness earns** (`offerOrder`).
- Wall offers stop spending one of the three pointings.
- The single later slot is chosen by the relationship, not array order: Almost after a gentle approach or "stay" finished; Things if they never came near; woodland if they stayed close or after 7 min.
- Fix the prefetch call that misses the kitchen light.

**E. Hygiene.**
- A per-visit random seed.
- The situation repertoire seeded per visit, so "listening" can appear.
- Raise the dead `contribute` signal.

Nothing new is recorded or generated: only existing recordings and handwriting are used.
