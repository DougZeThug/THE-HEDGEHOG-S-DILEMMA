# Brief for the approach review: the visit's heart

The artist's question: does the room create a genuinely memorable emotional experience, or a sophisticated series of responsive events? They asked for exploration, memories, silence, discovery and departure to form one whole: earlier moments gaining meaning from later ones, the strongest memories discoverable, their consequences lasting, and the visit working for someone who stays only a few minutes. Nothing is sacred except the work's emotional identity and its restraint. No feature growth, no game.

## Baseline (measured, simulated; `scripts/arc.ts`, `arms-1.md`, `arms-2.md`)

Same closed-loop visitors as the November core-loop battery (`tests/playtest/visitors.ts`: 216 genomes over 6 classes, 36 adversarial visits, 40 second visits), run for 3, 5 and 10 minutes. Their reactions are assumptions.

- **The strongest memories are effectively undiscoverable.** Almost, Things and the woodland reach 0% of 3-minute visits, 0–2% of 5-minute visits, and 0–6% of 10-minute ones (Things 0% at every length). Any of Almost/Things/woodland/door: 0% / 4% / 18%.
  - Why: each needs another painted memory first (`arc: 'afterAnother'`), an earliest time of 170–240 s, the contradiction phase, 120 s between pointings, three pointings a visit and two new lines a visit. Cereal (27%) and the kitchen light (21–48%) take those slots. Woodland and Almost also "end the arc".
- **Nothing a memory shows comes back.** After a memory, the room's next events are its usual life; nothing the visitor sees later refers to it, except two rare threads ("tomorrow", "the table").
- **The ending describes behaviour, and mostly the same behaviour.** "Somebody came back for the umbrella." ends 62% of 5- and 10-minute visits.
- **A 3-minute visit** gets the opening, the unfinished "I wanted you to" (finished in about half), the chair's answers, and a 27% chance of cereal. No painted memory other than cereal; the kitchen light from 150 s.

## The proposal (prototyped as `?exp=heart,bookend`)

One idea, built entirely from material already in the room: **each visit has a heart.** The heart is the painted memory whose story rhymes with how this visitor has been with the chair, so that what they did a minute ago is what they then see two people do:

| How they have been with the chair (decided once, from 60 s) | The heart | What it leaves beside "I wanted you to stay." |
|---|---|---|
| came to it, went away 20 s or more, came back and stayed (the recoil happens here) | **Almost**: a hand reaches, starts, is taken back | "I took my hand back." |
| stayed by it 45 s, or knelt 8 s | **the woodland**: company, then the clearing empty | "You did, for a while." |
| came to it, went away, and stayed away 50 s | **Things I Should Have Said**: a goodbye at a door | "I said goodnight instead." |
| never came to it, by 100 s | **the bedroom**: happiest when nobody needed anything | "I didn't ask." |

- **Discoverable.** The heart may be pointed at from 75 s, needs no memory before it, ignores the phase, and keeps 45 s (not 120 s) from the last pointing. While it waits, the room needs only a local quiet (4 s with nothing new) instead of an empty minute, because a visitor at the chair keeps the room answering. The other hearts and the kitchen light wait for it; if its line is pointed at and let be for 150 s it lapses and they may come.
- **One peak.** Once the heart has played, no other painted memory comes that visit (vignettes, the room's life and the visitor's answers go on as before).
- **Consequence.** After its aftermath, its answer is written in the answering pencil beside "I wanted you to stay." (the room's first line, written in the opening), on that wall only if the visitor isn't facing it (found, not watched; after 40 s it is written anyway).
- **Departure (bookend).** If the heart was seen, the departure card is the room's first line as the visit left it, and the answer under it: "I wanted you to stay. / I took my hand back." If they never stayed, the first line is still unfinished: "I wanted you to / I took my hand back." Otherwise the departure line is as now.
- **Return.** The answer is kept (`hh.heart.v1`) and is found beside the first line on the next visit, already there.
- No new recordings, sounds, light, shaders or memories. Four new lines of pencil (text only).

## Alternatives compared (same visitors and seeds)

| | any strongest memory at 3 / 5 / 10 min | painted memories a visit (10 min) | largest share of one ending | second visits: a different heart |
|---|---|---|---|---|
| base | 0% / 4% / 18% | 1.0 | 62% | — |
| `loosen`: the strong memories' gates lowered, no heart | 11% / 21% / 47% (mostly the door) | 1.3 | 64% | — |
| `heartAlmost`: Almost is everyone's heart | 52% / 56% / 63% | 0.9 | 45% (one bookend line for everyone) | 0 of 40 (17 the same again) |
| `heart` (rhyme), with bookend | 40–42% / 48–50% / 57–59% | 0.9 | 28% | 7 of 40 (9 the same again) |
| `heart` + 45 s clearing of the room's own life | no difference from `heart` | | | |

- Restraint, `heart` against base at 10 min: developments a minute 7.0 → 6.8; voices 10 → 10; overlapping sounds 0.1 → 0.2; held silence 98% → 98%. 30 s windows where an active visitor got nothing: 20% → 21%, all of it memory playing time; outside memories 19% → 17%. At 3 minutes the held silence comes in 58% (72%): the heart takes its place.
- The answer is written in 55% of 10-minute first visits; a simulated gaze comes back to it (or to the first line) in 84% of those, a median 29 s later.
- Kitchen light: 48% → 0% in a first visit with a heart (the heart replaces it); it remains for visits whose heart lapses.
- "Still rhymes at the end": the visit's chair shape at the end matches the heart's only 32% of the time (simulated visitors keep coming and going). The answers were written so they don't claim what the visitor did afterwards: three are in the first person of the writer; one ("You did, for a while.") stays true.

## Questions for reviewers

1. Is the rhyme meaningful or a mirror (the room "choosing" vs. a reward for behaviour)? Is any mapping wrong?
2. The four answer lines, and the bookend as the departure card. Too explicit? Better wording?
3. Losing the kitchen light on most visits that have a heart.
4. The heart arriving 75–125 s into a visit (median ~100–125 s), inside a stay at the chair.
5. What a short visit (3 minutes) now feels like; what a returning visitor finds.
