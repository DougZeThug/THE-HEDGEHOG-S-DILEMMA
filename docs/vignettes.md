# Vignettes

Small remembered fragments, heard rather than seen: one or two voices, the pauses between them, and sometimes a trace left in the room. They are memories like cereal, the bedroom and the door. They are opened by a line on the wall (or by staying still at the chair) through the same `MemoryDirector`, and played on the same audio clock. What they are is in `src/content/vignettes.json`; their recording direction is in `src/content/vignettes.dialogue.json`. The decisions behind them are in `docs/reviews/2026-10-weight-of-absence.md`.

## How they behave

- **Opening.** A vignette opens beside a line, not on the line it would only act out. Reading that line for 2.5 s, or touching it, begins it once it may play. The chair's vignette opens from stillness by the chair (8 s within 1.15 m), or kneeling there, once "I wanted you to stay" has been finished.
- **Spacing.** At least 90 s from any memory's end, and 150 s after one of the same tone. Earliest times: B, D, G, H, I and J from 150 s; C and E from 240 s. C's and D's lines are rarely written, so they may be offered (written alone where the visitor looks). Offers are limited to two a visit, counting the painted memories' offers.
- **Visitors meet a vignette only once its recordings are kept.** Its voiced lines must all have takes the artist approved on the audition sheet. Until then the room is unchanged, apart from versions that have no voices.
- **In practice: one or two a visit.** In simulated 10-minute visits (`npx vite-node scripts/vignette-reach.ts`), there were 59 vignettes across 40 visits (8 seeds × 5 personas, all recordings assumed kept, each persona repeating the middle of its script once it runs out):
  - the chair visitor met F every time, and one more in half the visits;
  - the explorer met two or three, the reader and the phone persona one or two;
  - the still visitor met one in four visits;
  - C, D and G were never met. Their lines are read for 2.5 s in 1, 4 and 6 of 40 visits. C was offered 4 times, but scripted personas never look at newly written lines, so whether an offer is read is unknown here. D's offer slots go to the bedroom's line first.
- **Interruption.**
  - Turning away or touching the walls never ends one: turning toward a voice is attention.
  - Walking off (more than 3 m from where it began, for 1.5 s, moving or not; back within 2.5 m forgives) finishes the sentence being said, and nothing more is said. Opening the writing field does the same.
  - Settings, a hidden tab or suspended sound pause it. Back within 10 s, the interrupted sentence is said again from its start. Longer, and it ends uncounted.
  - Leaving cuts it.
- **Silence is authored, in four kinds.**
  - A **pause**: the conversation goes on.
  - An **interruption**: a line cut off.
  - A **deliberate silence**: the memory's own air falls away.
  - A **wait**: an answer that never comes, while the room carries on.
  - No caption narrates a silence. During a wait, the unanswered line stays on screen, dimmed.
- **Places.** Voices are placed in the white room from where the visitor is when it begins:
  - beside them (left or right);
  - a step ahead, centred (`self`: the one remembering, the visitor's own side of a conversation);
  - at the ear (`close`: only the rehearsed call, D);
  - beyond the wall;
  - at the door;
  - at the chair.
  Phones collapse stereo, so the captions also mark which side is speaking.
- **Everyday sounds.** The car, the indicator, the shop's fridge, the till, the drip and the biscuit packet are made in the engine (`src/memory/synthSounds.ts`). The party is the room's own murmur and laughter, recorded earlier.

## The catalogue

### B. The charger · sad

*An ordinary goodbye on an ordinary morning, said without looking up.*

- **Opens from:** "Nobody tells you how ordinary it feels." (`ordinary`).
- **Who:** someone leaving for the day (young); the one who stays (sarah).
- **First time** (16 s):
  - 0.0: *the air of the place (flat)*
  - 0.4: someone leaving for the day (through the wall): “Have you seen my charger?”
  - 2.8: the one who stays (ahead): “By the toaster.”
  - 4.2: *pause, 1.6 s*
  - 6.0: someone leaving for the day (door): “I'll see you tomorrow.”
  - 8.2: the one who stays (ahead, read *distracted*): “Yeah. Tomorrow.”
  - 9.8: *[a door closes]*
  - 10.6: *silence, 5 s*
- **Heard before** (14 s):
  - 0.0: *the air of the place (flat)*
  - 0.4: someone leaving for the day (through the wall): “Have you seen my charger?”
  - 2.8: the one who stays (ahead): “By the toaster.”
  - 4.2: *pause, 1.6 s*
  - 6.0: someone leaving for the day (door): “I'll see you tomorrow.”
  - 7.6: *[a door closes]*
  - 8.2: *wait, 5 s*
- **Echo:** 60–180 s after it was heard, “tomorrow” is found written faintly on a wall the visitor isn't facing, as if it had always been there.

### C. Alone together · sad

*Two people side by side in a car at night; a question asked, answered, and not believed.*

- **Opens from:** "I didn't know what to say." (`didnt-know-say`), or offered (written alone where the visitor looks) if it hasn't come by itself.
- **Who:** the passenger (sarah); the driver (restrained).
- **First time** (15 s):
  - 0.0: *[a car, at night]*
  - 1.6: the passenger (left): “Are you angry with me?”
  - 4.2: the driver (right, read *quick*): “No.”
  - 5.4: *[the indicator ticking]*
  - 5.4: *pause, 1.6 s*
  - 7.0: the passenger (left): “Okay.”
  - 8.0: *wait, 6 s*
- **Heard before, or after keeping one's distance** (17 s):
  - 0.0: *[a car, at night]*
  - 1.6: the passenger (left): “Are you angry with me?”
  - 3.6: *pause, 3 s*
  - 6.8: the driver (right, read *tired*): “No.”
  - 8.0: *[the indicator ticking]*
  - 9.6: the passenger (left): “Okay.”
  - 10.6: *wait, 6 s*

### D. Practice · sad

*Rehearsing a call that is never made: wanting to be found while staying hard to reach.*

- **Opens from:** "Don't go yet, this bit's good." (`this-bit`), or offered (written alone where the visitor looks) if it hasn't come by itself.
- **Who:** someone, alone (sarah).
- **First time** (18 s):
  - 0.0: *the air of the place (room)*
  - 1.0: someone, alone (at the ear): “Hey. It's me.”
  - 2.8: *pause, 2 s*
  - 4.8: someone, alone (at the ear): “Hiya! …No.”
  - 7.0: *pause, 3 s*
  - 10.0: someone, alone (at the ear): “Hey. It's me. Nothing's wrong. I just—”
  - 13.6: *silence, 4.4 s*
- **Heard before** (10 s):
  - 0.0: *the air of the place (room)*
  - 1.0: someone, alone (at the ear): “Hey. It's me.”
  - 3.0: *silence, 6 s*

### E. Washing up · sad

*Kindness felt as intrusion; a boundary kept, and regretted only once it is respected.*

- **Opens from:** "far enough to miss you" (`far-enough`).
- **Who:** someone who came round (bill); the one being helped (sarah).
- **First time** (15 s):
  - 0.0: *the air of the place (kitchen)*
  - 0.8: someone who came round (left): “I did your washing up.”
  - 3.2: the one being helped (ahead, read *light*): “You don't have to keep doing that.”
  - 5.6: someone who came round (left): “Doing what?”
  - 7.0: *silence, 5 s*
  - 9.6: *[a tap drips]*
  - 12.5: *its line becomes harder to read up close, for the rest of the visit*
- **Heard before** (18 s):
  - 0.0: *the air of the place (kitchen)*
  - 0.8: someone who came round (left): “I did your washing up.”
  - 3.2: the one being helped (ahead, read *tired*): “You don't have to keep doing that.”
  - 5.6: someone who came round (left): “Doing what?”
  - 7.0: *silence, 6 s*
  - 13.4: the one being helped (through the wall): “…Thank you.”
  - 15.5: *its line becomes harder to read up close, for the rest of the visit*

### F. Just for a minute · sad

*A child asks someone to stay; the answer is kind, and already leaving.*

- **Opens from:** stillness by the chair, or kneeling there, once “stay” is finished.
- **Who:** the writer, small, remembered (small-voice); whoever put them to bed (matilda).
- **First time** (29 s):
  - 0.0: *the room goes down to the chair alone (0.35)*
  - 0.0: *the air of the place (night)*
  - 4.5: the writer, small, remembered (chair): “Can you stay until I fall asleep?”
  - 7.4: whoever put them to bed (right, read *fond*): “Just for a minute.”
  - 9.6: the writer, small, remembered (chair): “Promise?”
  - 10.6: *wait, 6 s*
  - 14.0: *[the chair creaks]*
  - 17.0: *silence, 5 s*
  - 23.0: whoever put them to bed (door): “Oh— I thought you'd be asleep.”
- **Heard before (once: after 2 hearings it no longer comes)** (17.5 s):
  - 0.0: *the room goes down to the chair alone (0.5)*
  - 0.0: *the air of the place (night)*
  - 6.0: *[the chair creaks]*
  - 7.0: *silence, 7 s*

### G. A bag for that · bittersweet

*A stranger's ordinary kindness lands too close, and is refused politely.*

- **Opens from:** "I kept your jumper. I don't wear it." (`jumper`).
- **Who:** a shop assistant, a stranger (older-woman); a customer (sarah).
- **First time** (15 s):
  - 0.0: *[a small shop]*
  - 1.4: *[the till beeps]*
  - 3.2: a shop assistant, a stranger (left): “Do you want a bag for that, love?”
  - 5.4: *pause, 3 s*
  - 8.6: a customer (ahead): “Sorry. No. Thank you.”
  - 11.0: *[the till beeps]*
- **Heard before** (13 s):
  - 0.0: *[a small shop]*
  - 1.4: *[the till beeps]*
  - 3.2: a shop assistant, a stranger (left): “Do you want a bag for that, love?”
  - 5.4: *wait, 5 s*
  - 11.0: *[the till beeps]*

### H. Come over · bittersweet

*Declining is easy while someone keeps asking; the loss is when they stop.*

- **Opens from:** "That was a good day." (`good-day`).
- **Who:** an old friend (warm); the one who never comes (sarah).
- **First time** (10.5 s):
  - 0.0: *the air of the place (street)*
  - 0.5: an old friend (right): “You should come over sometime.”
  - 3.0: the one who never comes (ahead, read *automatic*): “Yeah. I will.”
  - 4.4: *pause, 1.2 s*
  - 5.6: an old friend (right): “You always say that.”
- **Heard before, or the room lonely** (10 s):
  - 0.0: *the air of the place (street)*
  - 0.5: an old friend (right): “You should come over sometime.”
  - 3.0: the one who never comes (ahead, read *unsure*): “Yeah. I will.”
  - 4.4: *pause, 2.2 s*
  - 6.6: an old friend (right): “Okay.”

### I. The last one · warm

*An ordinary afternoon and a habit of giving way, love and self-erasure at once; happy, and gone.*

- **Opens from:** "You made me laugh so hard I couldn't breathe." (`laugh-breathe`).
- **Who:** someone across the table (liam); the one who lets them (sarah).
- **First time** (9.5 s):
  - 0.0: *the air of the place (afternoon)*
  - 0.4: *[a biscuit packet]*
  - 1.4: someone across the table (right): “Is that the last one?”
  - 3.1: the one who lets them (ahead): “Have it.”
  - 4.5: someone across the table (right): “Go halves.”
  - 6.0: the one who lets them (ahead): “Just have it.”
- **Heard before** (9.5 s):
  - 0.0: *the air of the place (afternoon)*
  - 0.4: *[a biscuit packet]*
  - 1.4: someone across the table (right): “Is that the last one?”
  - 3.1: the one who lets them (ahead): “Have it.”
  - 4.5: someone across the table (right): “Go halves.”
  - 6.0: the one who lets them (ahead): “…Go on, then.”

### J. Gone quiet · sad

*Present but invisible at a party; the second time, nobody even asks.*

- **Opens from:** "I was loneliest at my own birthday." (`lonely-birthday`).
- **Who:** a friend from the party (warm); the one whose party it is (sarah).
- **First time** (13 s):
  - 0.0: *[a party, through the wall]*
  - 1.6: *[laughter, through the wall]*
  - 4.6: a friend from the party (right): “You alright? You've gone quiet.”
  - 7.0: the one whose party it is (ahead): “I'm fine. It's just loud.”
- **Heard before** (14 s):
  - 0.0: *[a party, through the wall]*
  - 1.6: *[laughter, through the wall]*
  - 7.5: *[laughter, further off]*
  - 8.5: *the word “loneliest” fades from its line, leaving a ghost*

## Recording

- **Direction.** Sad, like the wall lines the artist kept: quiet and held back, close to tears where it fits, whispered where close. The other speakers are subdued and tired. Nothing bright, amused or laughing: the validator refuses those tags. One voice per take; the other person is unspoken scene context, opening with a sad framing.
- **Casting.** The writer is `sarah` by default. The others vary: `liam`, `restrained`, `bill`, `matilda`, `warm` and `young`. The kept designs are used only for the child (`small-voice`) and the shop assistant (`older-woman`). The room's intimate voice never appears inside a memory.
- **Takes.** 78 in all, two or three readings or seeds where a line turns. A version can ask for a reading by name (`reading` on a line); the approved file whose name ends `--<reading>` is used, or any kept reading if that one wasn't. Dry run: `node scripts/generate-dialogue.mjs --vignettes --dry-run --budget=5000` plans 71 takes, about 1,838 credits estimated (recent v4 runs have billed well under their estimates; the default budget is lower and queues the rest). The 7 takes in the two designed voices wait until those voices are saved to the account.
- **Level.** Lines are levelled in the engine to −24 dBFS RMS over their voiced frames, peaks ≤ −3 dBFS, so a score's gains are relative to one voice speaking normally.
- **First batch (recorded).** One take of every line and reading, 36 takes for 426 credits. The two designed voices were saved to the account first (`small-voice` from small-voice-1, `older-woman` from older-woman-2). None is kept yet. Second seeds come only where the artist wants a line said another way.
- **Audition.** On the audition sheet, each version has a read-through at its own times. It plays the kept take of each line, or failing that the take generated for it, marked "not kept yet", placed roughly (left, right, through a wall). Then each take is listed to keep or not. Kept takes go in with `--vignettes --approve=…`, and only kept takes reach visitors.
- **Previews in the room.** `?vignette=<id>` also plays takes not kept yet, from `public/voices/vignette-preview.json`, which `generate-dialogue.mjs --vignettes` writes. That file is read only by previews: what visitors meet still depends on the manifest alone.

## Preview

`?vignette=<id>&variant=<name>` plays one a few seconds after the room opens, recorded or not. An unrecorded line is a wordless voice with its caption.
