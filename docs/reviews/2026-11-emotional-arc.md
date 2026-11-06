# The emotional arc: the visit's heart (November 2026)

The artist asked whether the room creates a genuinely memorable emotional experience or a sophisticated series of responsive events, and asked for exploration, memories, silence, discovery and departure to become one whole: earlier moments gaining meaning from later ones, the strongest cinematic memories discoverable, their consequences lasting, a visit that works even in a few minutes. Full creative freedom; nothing sacred but the work's emotional identity and its restraint; no feature growth, no game.

Evidence is in `docs/reviews/emotional-arc/`:
- `brief.md`: the baseline and the first proposal, given to reviewers.
- `arms-1.md` … `arms-4.md`: the arms compared, in order.
- `approach-reviews.md`: the creative director, interaction designer and cinematic director on the proposal.
- `after.md`: the result, before against after on the same visitors.

## How it was measured

The November core-loop visitors (`tests/playtest/visitors.ts`: 216 genomes over six classes, 36 adversarial visits, 40 second visits), run through the real Director for **3, 5 and 10 minutes** by a new battery, `scripts/arc.ts`. It reports which memories a visit reaches and when, the heart and what it left, restraint, how visits end, and what a second visit finds. About 13,000 simulated visits over the round.

**What these numbers are not.** The visitors' reactions are assumptions. The interaction designer showed that reach leans on one of them: simulated visitors turn toward fresh writing. Without that turn, 5-minute reach falls by about a third (50% → 35% in their probe), and phone reach is unmeasured (simulated phones see the whole wall and tap what they read). Whether a person feels any of this is not something a simulation can say. Read the tables as differences between arms on the same visitors.

## What was found

1. **The strongest memories were almost never met.** Almost, Things and the woodland reached 0% of 3-minute first visits, 2% of 5-minute and 10% of 10-minute ones (Things 0% at every length). Each needed another painted memory first, an earliest time of 170–240 s, the contradiction phase, and a free place among three pointings a visit, 120 s apart, two new lines a visit; cereal and the kitchen light took those places.
2. **The room's best moment of meaning was left unanswered.** The recoil (the room flinching when the visitor comes back to the chair, decided in the core-loop round) happens in 56% / 77% / 85% of 3/5/10-minute visits. Almost, a film of exactly that gesture between two people, followed it in 0% / 0% / 7%.
3. **Nothing a memory showed came back.** After a memory, the room went on as before; nothing later referred to it.
4. **The ending described behaviour, mostly the same behaviour.** "Somebody came back for the umbrella." ended 62% of 5- and 10-minute visits.
5. **A short visit** had the opening, the unfinished line, the chair's answers and a one-in-four chance of cereal.

## What was tried, and what was discarded

| Arm | Any of Almost/Things/woodland at 3 / 5 / 10 min | Why not (or why) |
|---|---|---|
| before | 0% / 2% / 10% | |
| `loosen`: lower the strong memories' gates, no other change | 11% / 21% / 47%, mostly the door | No meaning added: more memories a visit (1.3 at 10 min), none of them answering anything. Discarded. |
| Almost as everyone's heart | 52% / 56% / 63% | One peak and one ending for everyone (45% of endings the same card); every second visit replays it. The upper bound of reach. Discarded. |
| Four-way rhyme: recoil/return → Almost, long stay → woodland, going away → Things, never coming → bedroom (first the door), each with an answer line beside "I wanted you to stay." | 40% / 48% / 57% | Reviewed (below). The skeptic: only one of the four rhymes is between two things a visitor actually saw. Three of the four answer lines were cut, and the heart's trigger changed to the recoil. |
| A 45 s clearing of the room's own life before the heart | no difference | Machinery nobody would feel. Cut. |
| Recoil only: Almost after a recoil, nothing else | 25% / 40% / 52% | The skeptic's simplest version. Almost for 44–54% of the visitors the room recoiled at. |
| **Chosen: recoil → Almost first; otherwise, from 150 s, woodland or Things** | **33% / 54% / 63%** | Almost for 46–50% of visitors the room recoiled at (recoil-only: 44–54%), plus the woodland and Things for visitors the room never recoiled at, which recoil-only leaves at 0%. |

## Reviews, and who was followed

All four reviews are in `emotional-arc/approach-reviews.md` (the skeptic's below). In short:

- **Creative director:** keep the heart, "the first proposal that turns a visit into one sentence instead of a run of separate events"; the words were the risk. "I wanted you to stay." already has an answer, "I didn't know how."; "You did, for a while." is the mirror (it grants the wish and captions the clearing beside its own coda); two answers restated their films; the card should show only what the wall shows; the kitchen light should not simply give way.
- **Interaction designer:** at the chair the offered line was written above the frame (looking down at the seat) and twice in the same tick as a voice; half the pointed-at hearts were never begun; the recoil and "came back" were two different definitions; the answer faded (`ttl`); the "met" measure counted the resting gaze; reach rests on a simulated reflex.
- **Cinematic director:** a peak at about two minutes suits a 3–5 minute visit. The answer faded; the bedroom as heart came before the dark it answers; the woodland as heart doubles its ending; the card should be staged, not a couplet in one fade; the second half of a long visit has no shape (proposed: the door as an epilogue).
- **Skeptic:** the heart bundled two things: easier gates (measured and real) and a four-way rhyme (mostly invisible; "a visitor can only feel a rhyme between two things they actually saw"). The one felt rhyme is the recoil, then Almost; the prototype gave Almost to only 13–15% of the visitors it recoiled at, because their heart had been fixed at 60 s from another shape. Keep that branch and "I took my hand back."; cut the other answers, the door epilogue, the kitchen light after the heart, the staged card, writing the answer inside the held silence.

### Decisions (main session)

1. **The recoil decides.** "Came back" is now what the visitor saw: the room recoiling at them (`Director.answerReturn`), not a 20 s/8 s rule in the inspector. Almost's line is pointed at no sooner than 17 s after it (its 7 s hold, and a breath), from 75 s. *Skeptic and interaction designer.*
2. **The woodland and Things stay, later, for visits the room never recoiled at** (from 150 s: a long stay, or coming and going away). *Against the skeptic*, who would cut them: they reach a third of 10-minute visits that otherwise have no strong memory at all, and the artist asked for the strongest memories to be discoverable. The skeptic's objection is taken where it is right: they leave no line, because their rhyme is not one the visitor can be shown. The bedroom is not a heart (the cinematic director: it came before the dark it answers; the creative director: the weakest rhyme).
3. **Decided at the pointing, not before.** Until its line is written, a recoil can still make the heart Almost. *Interaction designer.*
4. **One line, Almost's: "I took my hand back."** Written beside "I wanted you to stay." after the memory's quiet, on that wall only while the visitor is turned away (after 40 s it is written anyway), and kept for the visit. With "I didn't know how." it reads as one confession: wanting, not knowing how, and owning the flinch. "You did, for a while.", "I said goodnight instead." and "I didn't ask." are cut (*creative director and skeptic*); so are the creative director's rewrites, with their branches.
5. **Seen where it is written.** The heart's line is placed by a level ray at eye height, only while the visitor looks level at a wall, into 4 s with nothing new and no voice. Pointed at and let be, it is written again once on that wall, 30 s later at the earliest (*interaction designer*; the skeptic asked for re-inking only if over ~30% were never begun after the visibility fix: 36–49% still were). It lapses after 120 s.
6. **The card says only what the wall says.** If the answer is on the wall when they leave, the card is the room's first line as the visit left it (still "I wanted you to" if they never stayed with it) and the answer under it, appearing 3.5 s later, upright and smaller. Otherwise the departure lines are as before. *Creative director;* the cinematic director's staging reduced to one CSS delay (*skeptic*: don't hold back someone who is leaving).
7. **Kept for the next visit**, and found, not watched: written beside the first line the first time the returning visitor faces another wall (*creative director, cinematic director*), not at the hand-off, where they face it. `hh.heart.v1`, cleared by "forget".
8. **One peak.** After the heart, no other painted memory; the kitchen light waits while a heart waits and doesn't come after one. *Skeptic*, against the creative director's case for the light after Almost.
9. **Not done:** the door as an epilogue at 360 s (cinematic; *skeptic*: feature growth, and the way out already ends the visit); writing the answer inside the held silence; the graphite sound under the card; preferring an unseen heart on a return.

## Before → after (simulated, same visitors and seeds; `emotional-arc/after.md`)

| | before | after |
|---|---|---|
| Any of Almost/Things/woodland, 3 / 5 / 10 min | 0% / 2% / 10% | **33% / 54% / 63%** |
| By class at 3 min (reader, chair, explorer, still, phone, mixed) | all 0% | 25%, 25%, 39%, 22%, 47%, 47% |
| Almost after the room recoiled at them (10 min) | 7% | **50%**, a median 51 s after the recoil |
| Painted memories a visit (10 min) | 1.0 | 1.1 |
| Kitchen light (10 min) | 48% | 17% (the heart takes its place) |
| Largest share of one ending (10 min) | 62% | **37%** |
| "I took my hand back." on the wall at the end (5 / 10 min) | — | 29% / 37% |
| Developments a minute, voices, overlaps (10 min) | 7.0, 10, 0.1 | 6.8, 10, 0.2 |
| 30 s windows an active visitor got nothing, outside memories | 17–19% | 17–18% |
| Held silence, 3 / 10 min | 72% / 98% | 62% / 98% (at 3 minutes the heart takes its place) |
| Second visits finding the last answer | — | 16 of 16 that had one |
| The core-loop measures (answers to meeting, returning, touching, coming, kneeling, withdrawing) | | unchanged within noise (`scripts/experiment.ts`, 688 visits) |

## What still needs a person

- **Whether anyone feels the rhyme.** The design rests on a visitor connecting the room's flinch with a hand taken back a minute later. Only people can say. If they don't, the change is still a reachable peak and a line that lasts; if they do, it is what the artist asked for.
- **Whether "I took my hand back." deepens Almost or captions it**, and how the three lines read together under "I wanted you to stay.". The artist's words to judge.
- **Whether the recoil reads as the room flinching or as a fault** (still open from the core-loop round); everything here depends on it.
- **Whether the offered line is noticed** at the edge of attention, on a real phone in portrait, by someone at the chair.
- **Whether the card's second line lands or explains.**
- **Reach is an upper bound.** A third lower without the simulated turn toward new writing; phones unmeasured.
- **Whether a returning visitor recognises the line as left from before.**
- **Memory VII and The Drive Home** stay standalone films. They are unreviewed by the artist, on their own branches, and adding two more memories to a room whose existing strongest ones were reached by 0–10% of visits would have diluted the arc this round builds.
