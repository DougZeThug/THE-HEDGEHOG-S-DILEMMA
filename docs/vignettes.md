# Vignettes

Small remembered fragments, heard rather than seen: one or two voices, the pauses between them, and sometimes a trace left in the room. They are memories like cereal, the bedroom and the door. They are opened by a line on the wall (or by staying still at the chair) through the same `MemoryDirector`, and played on the same audio clock. What they are is in `src/content/vignettes.json`; their recording direction is in `src/content/vignettes.dialogue.json`. The decisions behind them are in `docs/reviews/2026-10-weight-of-absence.md`.

## How they behave

- **Opening.** A vignette opens beside a line, not on the line it would only act out. Reading that line for 2.5 s, or touching it, begins it once it may play. The chair's vignette opens from stillness by the chair (8 s within 1.15 m), or kneeling there, once "I wanted you to stay" has been finished.
- **Spacing.** At least 90 s from any memory's end, and 150 s after one of the same tone. Earliest times: B, G, H, I and J from 150 s; C, D and E from 240 s. C's and D's lines are rarely written, so they may be offered (written alone where the visitor looks). Offers are limited to two a visit, counting the painted memories' offers.
- **Visitors meet a vignette only once its recordings are kept.** Its voiced lines must all have takes the artist approved on the audition sheet. Until then the room is unchanged, apart from versions that have no voices.
- **In practice: about one vignette a visit.** In simulated 10-minute visits, 32 vignettes across 40 visits (8 seeds × 5 personas, all recordings assumed kept):
  - the chair visitor met F every time;
  - the explorer and the reader met one or two;
  - the still visitor met three in eight visits, the phone persona one in eight;
  - D and H were never met, and C once: the two-offer limit leaves them almost no room.
- **Interruption.**
  - Turning away or touching the walls never ends one: turning toward a voice is attention.
  - Walking off (2.5 m from where it began, for 3 s) finishes the sentence being said, and nothing more is said. Opening the writing field does the same.
  - Settings or a hidden tab pause it. Back within 10 s, the interrupted sentence is said again from its start. Longer, and it ends uncounted.
  - Leaving cuts it.
- **Silence is authored, in four kinds.**
  - A **pause**: the conversation goes on.
  - An **interruption**: a line cut off.
  - A **deliberate silence**: the memory's own air falls away.
  - A **wait**: an answer that never comes, while the room carries on.
  - No caption narrates a silence. During a wait, the unanswered line stays on screen, dimmed.
- **Places.** Voices are placed in the white room from where the visitor is when it begins:
  - beside them (left or right);
  - close and dry (the visitor's own side of a conversation);
  - beyond the wall;
  - at the door;
  - at the chair.
  Phones collapse stereo, so the captions also mark which side is speaking.
- **Everyday sounds.** The car, the indicator, the shop's fridge, the till, the drip and the biscuit packet are made in the engine (`src/memory/synthSounds.ts`). The party is the room's own murmur and laughter, recorded earlier.

## The catalogue

### B. The charger · sad

*The last thing said to someone was about a charger, said without looking up; nobody knew it was the last thing.*

- **Opens from:** "Nobody tells you how ordinary it feels." (`ordinary`).
- **Who:** someone leaving for the day (liam); the one who stays (sarah).
- **First time** (16 s):
  - 0.0: *the air of the place (flat)*
  - 0.4: someone leaving for the day (beyond): “Have you seen my charger?”
  - 2.8: the one who stays (close): “By the toaster.”
  - 4.2: *pause, 1.6 s*
  - 6.0: someone leaving for the day (door): “I'll see you tomorrow.”
  - 8.2: the one who stays (close): “Yeah. Tomorrow.”
  - 9.8: *[a door closes]*
  - 10.6: *silence, 5 s*
- **Heard before** (14 s):
  - 0.0: *the air of the place (flat)*
  - 0.4: someone leaving for the day (beyond): “Have you seen my charger?”
  - 2.8: the one who stays (close): “By the toaster.”
  - 4.2: *pause, 1.6 s*
  - 6.0: someone leaving for the day (door): “I'll see you tomorrow.”
  - 7.6: *[a door closes]*
  - 8.2: *wait, 5 s*
- **Echo:** 60–180 s after it was heard, “tomorrow” is found written faintly on a wall the visitor isn't facing, as if it had always been there.

### C. Alone together · sad

*Two people side by side in a car at night; a question asked, answered, and not believed.*

- **Opens from:** "Are you angry with me?" (`angry-with-me`).
- **Who:** the passenger (sarah); the driver (restrained).
- **First time** (15 s):
  - 0.0: *[a car, at night]*
  - 1.6: the passenger (left): “Are you angry with me?”
  - 4.2: the driver (right): “No.”
  - 5.4: *indicator*
  - 5.4: *pause, 1.6 s*
  - 7.0: the passenger (left): “Okay.”
  - 8.0: *wait, 6 s*
- **Heard before, or after keeping one's distance** (17 s):
  - 0.0: *[a car, at night]*
  - 1.6: the passenger (left): “Are you angry with me?”
  - 3.6: *pause, 3 s*
  - 6.8: the driver (right): “No.”
  - 8.0: *indicator*
  - 9.6: the passenger (left): “Okay.”
  - 10.6: *wait, 6 s*

### D. Practice · sad

*Rehearsing a call that is never made: wanting to be found while staying hard to reach.*

- **Opens from:** "I keep almost calling." (`keep-calling`).
- **Who:** someone, alone (sarah).
- **First time** (18 s):
  - 0.0: *the air of the place (room)*
  - 1.0: someone, alone (close): “Hey. It's me.”
  - 2.8: *pause, 2 s*
  - 4.8: someone, alone (close): “Hiya! …No.”
  - 7.0: *pause, 3 s*
  - 10.0: someone, alone (close): “Hey. It's me. Nothing's wrong. I just—”
  - 13.6: *silence, 4.4 s*
- **Heard before** (10 s):
  - 0.0: *the air of the place (room)*
  - 1.0: someone, alone (close): “Hey. It's me.”
  - 3.0: *silence, 6 s*

### E. Washing up · sad

*Kindness felt as intrusion; a boundary kept, and regretted only once it is respected.*

- **Opens from:** "far enough to miss you" (`far-enough`).
- **Who:** someone who came round (bill); the one being helped (sarah).
- **First time** (15 s):
  - 0.0: *the air of the place (kitchen)*
  - 0.8: someone who came round (left): “I did your washing up.”
  - 3.2: the one being helped (close): “You don't have to keep doing that.”
  - 5.6: someone who came round (left): “Doing what?”
  - 7.0: *silence, 5 s*
  - 9.6: *[a tap drips]*
  - 12.5: *its line becomes harder to read up close, for the rest of the visit*
- **Heard before** (18 s):
  - 0.0: *the air of the place (kitchen)*
  - 0.8: someone who came round (left): “I did your washing up.”
  - 3.2: the one being helped (close): “You don't have to keep doing that.”
  - 5.6: someone who came round (left): “Doing what?”
  - 7.0: *silence, 6 s*
  - 13.4: the one being helped (beyond): “…Thank you.”
  - 15.5: *its line becomes harder to read up close, for the rest of the visit*

### F. Just for a minute · sad

*A child asks someone to stay; the answer is kind, and already leaving.*

- **Opens from:** stillness by the chair, or kneeling there, once “stay” is finished.
- **Who:** the writer, small, remembered (small-voice); whoever put them to bed (matilda).
- **First time** (28 s):
  - 0.0: *the room goes down to the chair alone (0.5)*
  - 0.0: *the air of the place (night)*
  - 3.5: the writer, small, remembered (chair): “Can you stay until I fall asleep?”
  - 6.4: whoever put them to bed (right): “Just for a minute.”
  - 8.6: the writer, small, remembered (chair): “Promise?”
  - 9.6: *wait, 6 s*
  - 13.0: *[the chair creaks]*
  - 16.0: *silence, 5 s*
  - 22.0: whoever put them to bed (door): “Oh— I thought you'd be asleep.”
- **Heard before** (16 s):
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
  - 1.4: *till*
  - 3.2: a shop assistant, a stranger (left): “Do you want a bag for that, love?”
  - 5.4: *pause, 3 s*
  - 8.6: a customer (close): “Sorry. No. Thank you.”
  - 11.0: *till2*
- **Heard before** (13 s):
  - 0.0: *[a small shop]*
  - 1.4: *till*
  - 3.2: a shop assistant, a stranger (left): “Do you want a bag for that, love?”
  - 5.4: *wait, 5 s*
  - 11.0: *till2*

### H. Come over · bittersweet

*Declining is easy while someone keeps asking; the loss is when they stop.*

- **Opens from:** "I'm not going anywhere." (`not-going`).
- **Who:** an old friend (warm); the one who never comes (sarah).
- **First time** (10.5 s):
  - 0.0: *the air of the place (street)*
  - 0.5: an old friend (right): “You should come over sometime.”
  - 3.0: the one who never comes (close): “Yeah. I will.”
  - 4.4: *pause, 1.2 s*
  - 5.6: an old friend (right): “You always say that.”
- **Heard before, or the room lonely, or after a withdrawal** (10 s):
  - 0.0: *the air of the place (street)*
  - 0.5: an old friend (right): “You should come over sometime.”
  - 3.0: the one who never comes (close): “Yeah. I will.”
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
  - 3.1: the one who lets them (close): “Have it.”
  - 4.5: someone across the table (right): “Go halves.”
  - 6.0: the one who lets them (close): “Just have it.”
- **Heard before** (9.5 s):
  - 0.0: *the air of the place (afternoon)*
  - 0.4: *[a biscuit packet]*
  - 1.4: someone across the table (right): “Is that the last one?”
  - 3.1: the one who lets them (close): “Have it.”
  - 4.5: someone across the table (right): “Go halves.”
  - 6.0: the one who lets them (close): “…Go on, then.”
- **On trial:** “Stop. I can't breathe.” is directed as one audition line. Only if the artist keeps it does the room ever laugh here.

### J. Gone quiet · sad

*Present but invisible at a party; the second time, nobody even asks.*

- **Opens from:** "I was loneliest at my own birthday." (`lonely-birthday`).
- **Who:** a friend at the party (young); the one whose party it is (sarah).
- **First time** (13 s):
  - 0.0: *[a party, people talking]*
  - 1.6: *[people laughing at something]*
  - 4.6: a friend at the party (right): “You alright? You've gone quiet.”
  - 7.0: the one whose party it is (close): “I'm fine! It's just loud.”
- **Heard before, or after a withdrawal** (14 s):
  - 0.0: *[a party, people talking]*
  - 1.6: *[people laughing at something]*
  - 7.5: *laughter2*
  - 8.5: *the word “loneliest” fades from its line, leaving a ghost*

## Recording

- **Direction.** Ordinary acting: distracted, defensive, amused, tired, plain. No crying, whispering or breaking voices; the direction validator refuses those tags here. One voice per take; the other person is unspoken scene context.
- **Casting.** The writer is `sarah` by default. The others vary: `liam`, `restrained`, `bill`, `matilda`, `warm` and `young`. The kept designs are used only for the child (`small-voice`) and the shop assistant (`older-woman`). The room's intimate voice never appears inside a memory.
- **Takes.** 80 in all, two or three readings or seeds where a line turns. Dry run: `node scripts/generate-dialogue.mjs --vignettes --dry-run` plans 73 takes, about 1,931 credits estimated (recent v4 runs have billed well under their estimates). The 7 takes in the two designed voices wait until those voices are saved to the account.
- **Audition.** On the audition sheet: read-throughs of each version at its own times (unrecorded lines silent with their words), then each take to keep or not. Kept takes go in with `--vignettes --approve=…`. Only kept takes reach the room.

## Preview

`?vignette=<id>&variant=<name>` plays one a few seconds after the room opens, recorded or not. An unrecorded line is a wordless voice with its caption.
