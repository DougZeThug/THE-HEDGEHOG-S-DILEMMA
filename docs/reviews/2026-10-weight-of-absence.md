# The Weight of Absence: sad, lonely and intimate memory vignettes

The artist asked for 8–10 small remembered fragments to deepen the room's loneliness. The guide was about 70% sad, 20% bittersweet and 10% warm. The fragments should use voices, pauses, unfinished speech, silences and quiet traces in the room, and some should come back changed on later visits. The full brief is summarised in the approved plan. These are "vignettes": memories heard rather than painted. They run through the same memory system as cereal, the bedroom and the door (`src/content/vignettes.ts`, `docs/vignettes.md`).

The artist's decisions before the review:
- no per-visit cap;
- the child in F is the "small voice" kept on the audition sheet, remembered;
- visitors meet a vignette only once all its lines have takes the artist kept, with captioned previews until then;
- no paid generation without approval.

## Approach review

Six specialists reviewed the plan and the draft scripts (A–I) before anything was written. The core (selection through `MemoryDirector`, a `VignettePlayer` on the memory audio clock) was built and tested alongside, with no content. The reports are summarised here.

**Interaction designer** (measured, 600 s × 8 seeds, own harness over the real Director):
- **P0: half the draft anchors are unreachable.**
  - `angry-with-me` was written in 0/40 visits and `im-fine` in 1/40.
  - `keep-calling` and `forgot-voice` were met by the explorer only.
  - `two-cups` was never looked at for 3 s, so the `cups` drawing (A's gate) was never drawn.
  - Reachable lines: `lonely-birthday` (8/8 for every persona), `laugh-breathe`, `jumper`, `ordinary`, `far-enough`.
- **Audio vignettes need their own interruption rules.** The paintings' rules (a tap off the painting, looking away) would cut them on a phone. Turning toward a voice is attention.
- **Spacing.** Spacing alone keeps a visit to 2–4 vignettes. More than two "offers" (a line written alone where the visitor looks) per visit teaches "a lone line means a memory".
- **Anchor lines went dead before their memory could open:** reading them got no answer for minutes.
- **The chair is crowded.** `ruleKneel` speaks the child's `small-minute` at the same moment F would open.

**Creative director:**
- The starting scripts explain themselves: "I just can't remember how she sounded", "Acting like you don't want me here", and "tomorrow" as stock irony.
- Three images repeat what the room already has three or four times: two cups, a phone left ringing, laughter.
- One couple across four memories becomes a plot.
- They proposed small, ordinary, mildly embarrassing exchanges: a charger, the back seat, a rehearsed call, washing up, five minutes, a shop assistant, "a thing", the last biscuit, and a party.
- A cut. No death named or implied, because the approved wall takes are already heavy with funerals and bedsides.

**Cinematic director:**
- The vignettes should be **sound-led in a plain room, the camera free**. Image only as aftermath, a trace seen leaving and never arriving.
- Only F dims, since it is bedtime. The room already has four dims, each with its own meaning.
- Vary the openings: hush first, cold open, or sound first.
- Effects to cut:
  - the cup rings: about 11 px on a phone;
  - the second shadow: a horror device;
  - the seat glow: verified as underlighting.
- Effects worth keeping: word loss, the sun (A only), recede on approach, "tomorrow", and the unsaid line written.

**Sound designer:**
- **Casting:** the stock voices with proven ordinary range carry the conversations. The designed voices are used only where their character is the point: the child, an older woman.
- **Pacing:** a pause, an interruption (the next line overlapping the cut), a deliberate silence (the memory's air falls away) and a wait (no duck: the room carries on) must each sound different.
- **Captions:** no captions for pauses. A cut line is captioned with only the words heard.
- **Levels:** per-take level normalisation. Cuts are made at word boundaries from each take's timings, not in seconds.
- **Generation:** stage it, starting with the designed voices.
- **Laughter:** laughter through a wall comes from four paths, not one.

**Technical artist:**
- Every effect can be built without new shader programs (verified for the floor quads). Word loss on the text's time channel is precise enough for every anchor.
- These don't produce the image the plan describes:
  - the seat glow lights the floor under the chair;
  - the seat-shade deepening is invisible;
  - the cup rings read as pencil circles.
- **Found a real bug:** the chair's own shadow ends in a straight cut in front of its front legs.

**Skeptic:**
- **The creative director's rewrites act out the wall's lines.** The shop acts out `forgot-voice`, the biscuit `biscuit`, the party `lonely-birthday`, the rehearsal `keep-calling`, the kettle `breathe-out`. The wall line is the compressed, better version.
  - Anchor each vignette **beside** a line, not on the line it illustrates.
  - Keep the artist's lines verbatim wherever they are subtext; cut them only where they name the feeling.
- **Reach depends on how a memory begins.** Look-back fires almost never except for the explorer. Offering is necessary but should stay rare.
- **Most effects already exist in the room:**
  - writing goes when approached (the air writing);
  - two cups (the drawing);
  - lingering sun (cereal's residue and kitchen-light);
  - chair warmth.
- **Cut:** A, every echo, the hidden-state variants and the hesitation trigger. Keep one effect: word loss on J's anchor.
- **Protect:** the overlap fix, word-boundary cuts, level normalisation, "Hiya! …No.", and F at the chair.

## Decisions (main session)

1. **Anchors are adjacent, and reachable.** Each vignette sits beside a line, not on the line it acts out (skeptic). The lines are the ones the visitor actually meets (interaction designer).

   | Vignette | Anchor | How it opens |
   |---|---|---|
   | B | `ordinary` | read |
   | C | `angry-with-me` | offered |
   | D | `keep-calling` | offered |
   | E | `far-enough` | read |
   | F | the chair | stillness or kneeling |
   | G | `jumper` | read |
   | H | `not-going` | read |
   | I | `laugh-breathe` | read |
   | J | `lonely-birthday` | read |

   - C and D are offered only if fewer than two offers have been made that visit.
   - A vignette begins on a read of its line, or a touch. There is no look-back; that rule is kept for cereal, whose job is to teach.
2. **Scripts follow the skeptic's rule.** The artist's lines are kept verbatim where they are subtext (16 of them). The creative director's ordinary business gives each scene somewhere to stand. Cut: "I just can't remember how she sounded", "Acting like you don't want me here", "I don't know what you want me to say". Kept, because the artist asked for it: C as adults (skeptic), set in the car (creative director).
3. **A is cut**, and nothing replaces it: two cups is already in the room four times. **J (the party) is added**, the "among others" form the brief asks for. Nine vignettes in all.
4. **Effects.**
   - Kept:
     - **word loss** on `lonely-birthday` when J comes back with nobody asking ("I was at my own birthday.");
     - **recede**: E's line becomes harder to read as the visitor comes closer, after E has been heard. It is the dilemma performed by the room, and the artist named it;
     - **F's dim**, the only dim (bedtime, the chair alone lit);
     - **"tomorrow"** written faintly on a wall the visitor isn't facing, after B. The artist's own idea; the cinematic director keeps it and the creative director and skeptic would cut it. It appears as if it had always been there.
   - **Cut:** `Traces.ts` (cup rings, second shadow), the seat glow, seat-shade deepening, the sun after a vignette, H's written line, and the chair nudge.
   - **The brief's lingering sun** already exists as cereal's residue and kitchen-light.
   - **The chair-shadow bug** was fixed separately and checked on a phone capture.
5. **Echoes.**
   - Only "tomorrow" remains as an echo. F's "I thought you'd be asleep." moves inside F, spoken from the door. I's laugh echo is cut.
   - The echo code stays (it carries "tomorrow").
6. **Variants.**
   - One revisit variant each, chosen by how many times it has been heard.
   - Three also follow what the visitor did this visit, as the brief asks:
     - C's longer pause, after the visitor has kept their distance;
     - H's "Okay.", when the room is lonely (solitude high) or the visitor withdrew;
     - J's "nobody asks", after a withdrawal.
   - Hesitation as a trigger is cut, because it holds up a mirror.
7. **Casting.**
   - One writer by default, `sarah`. Others vary: `liam` (B, I), `restrained` (C), `bill` (E), `matilda` (F's parent), `warm` (H), `young` (J).
   - The kept designs are used only for the child (F) and the shop assistant (G, an older-woman design, a stranger).
   - The intimate voice (Jessica) is the room's present tense and never appears inside a memory.
   - Mother-across-memories was rejected: it builds a plot and implies a death.
8. **Rhythm.**
   - The built rule stays: 90 s after any memory, 150 s after one of the same tone.
   - Earliest times: B, G, H, I and J from 150 s; C, D and E from 240 s; F at the chair, once "stay" is finished.
   - **"No cap" means about 1–2 vignettes per visit in practice.**
   - Reach is reported, not tuned to a target.
9. **Interruption** (interaction designer):
   - Turning away or tapping never ends one.
   - Walking off finishes the sentence being said, and nothing more is said.
   - Opening the writing field does the same.
   - Settings or a hidden tab pause it. Back within 10 s, the cut sentence is said again from its start. Longer, and it ends uncounted.
   - Leaving cuts it.
10. **Sound.**
    - Pause, interrupt, silence and wait are distinct in the player. A silence ducks the memory's beds; a wait does not.
    - Voices fall off as room speech does.
    - Everyday sounds are synthesised where nothing recorded fits (the indicator, the fridge hum, the till, a drip). No new paid sound effects.
    - The laughter coupling applies only if a laughing I is ever approved: "Stop. I can't breathe." goes to the dry run as one audition line.
11. **Captions.**
    - Speech is captioned per line, with the speaker's side marked.
    - A cut line ends in a dash.
    - No caption narrates a silence. During a wait, the last spoken caption stays on screen, dimmed, until the vignette ends.
    - Sounds that define a silence are captioned as sounds.
12. **Directions.** The vignette directions ban crying, whispering and voice-cracking tags. The vignettes are where the room learns to sound ordinary.
13. **Fixes taken from the reviews into the core:**
    - Nothing sounds over a memory, situations included.
    - A vignette's line is answered normally until its memory could open.
    - Only lines a vignette speaks itself are kept from the room's voices.
    - `ruleKneel` stays silent while F may still come.

## Finished: QA, evaluation and fixes

`qa-accessibility` tested the build. Then the creative director, sound designer, interaction designer and cinematic director evaluated it from captures, engine traces and the captioned previews. No recording exists yet, so nobody has heard a vignette: everything below concerns the scripts, timing, placement, light and selection, not how anything sounds.

### QA (fixed before the evaluation)

- **A graceful end cut the sentence being said.** It now waits for the voice (at most 15 s).
- **A pause replayed audio already heard.** Resuming now rewinds to the interrupted sentence.
- **F's dim was never lifted when F was interrupted.**
- **Captions.**
  - A vignette's sound captions hid its words; they now show alongside.
  - Speech is on a light backing.
  - The waiting line is readable (0.85, italic).
  - The side follows who speaks, not where they stand.
- **Spent and claimed vignettes.** A vignette unseen twice is now spent for the visit. The chair's claim on the kneeling voice begins only when F could.
- **Previews are registered with the Director**, so the room waits with them.
- **Time in settings is measured by the wall clock.**
- **J's `withdrew` version was unreachable**, so it was removed.
- **Browser harness:** 29/29 on desktop and phone, plus the hidden-tab and leaving checks.

### What the evaluators found, and what was done

**Openings (interaction designer, skeptic's rule).**
- **H** opened on `not-going`, which is its own subject. It now opens beside `good-day`.
- **D** opened on `keep-calling`, the line it acts out. It now opens beside `this-bit` (from 150 s), and is still offered.
- **C** now opens beside `didnt-know-say`, not on "Are you angry with me?", which it speaks.
- **H's `withdrew` rule was a mirror.** It was cut: H's second version follows having heard it, or a lonely room.

**Interruption.**
- Walking off was measured as "moving" (`rig.moving`), so a visitor who stepped away and stood still never ended a vignette.
- It now ends at more than 3 m from where it began for 1.5 s, moving or not, and coming back within 2.5 m forgives.
- Audio suspended for more than 10 s (a call, a locked phone) lets it go, uncounted, as settings already did.

**Direction and scenes (creative director, sound designer).** These changed in the direction file:
- the shop's context ("She hadn't been listening; she was miles away.");
- C's "She turned the radio back up.";
- J's `[brightly]` and its hallway setting;
- "Before she's finished asking.";
- F's door line `[surprised]`;
- B's next line as context;
- H without `[warmly]`;
- I's `[teasing]` Sunday afternoon;
- D's `[too bright] Hiya! [flat] …No.`;
- E's "Thank you" directed plainly.

Two other changes:
- **B's leaver is recast** (`young`), so B and I don't sound like one couple. J's friend is `warm`.
- **B's intent** no longer implies a death.

**I's trial laugh line is cut** (creative director and sound designer). It acted out a line the room already says.

**Readings and places.**
- **Readings by name.** Lines with two readings now choose theirs per version, by reading name (`reading` on the line, matched to the approved file), for example C's quick "No." first and the tired one on return. If that reading isn't kept, any kept reading stands in.
- **A new `self` place.** The writer's own lines were placed `close` (at one ear, like a phone). They are now `self`: a step ahead, centred. Only D, the rehearsed call, keeps the ear.

**Level.**
- Recordings arrive at arbitrary levels, so a score's gains meant nothing.
- Vignette and phrase lines are now brought to −24 dBFS RMS **over the voiced frames only**, peaks ≤ −3 dBFS. A one-word "No." is no longer boosted for the silence round it.

**J, reframed (sound designer).** The party was a party in the room. It is now heard **through a wall**, from the hallway:
- lowpassed at about 1.2 kHz, placed beyond the wall;
- the laughter further off and captioned "[laughter, through the wall]".

**Silence.**
- A deliberate silence now also takes the white room's own sound further down for its length.
- A pause and a wait leave the room's sound as it was.
- Captions now cover the sounds that mark a pause or a wait: the indicator in C, the till in G, J's laughter.

**Synthesised sounds.**
- The road and the fridge carried most of their energy below what a phone plays. They were re-voiced above 200 Hz (the hum heard by its 200–600 Hz harmonics, slowly beating).
- The biscuit packet is 4 dB lower.

**Offers.**
- The kitchen-light offer now respects the quiet a vignette leaves.
- The offer cap counts every memory's offers.

**Light and rhythm (cinematic director).**
- **The visit's turn landed on vignettes' tails.** The transform's deep dark came 1–20 s after a vignette, so the chair visitor got three darks in about 100 s, and the warm one (I) cut straight to the dark. Now:
  - the turn waits until 25 s after any vignette (45 s after F);
  - after F, within 90 s, it comes without its dark: F was the dark;
  - checked over 40 simulated visits: the closest is now 26 s after a vignette.
- **Recede read as a distance fade.** It is now an answer:
  - whole beyond 2.2 m;
  - within 1.7 m for 0.6 s it withdraws (slowly the first time, so it is seen leaving), with more of it in the ink breaking up and less in an even fade;
  - it comes back only after stepping back past 2.6 m for 1.5 s, over about 5 s.
- **F's light came back before the parent spoke.**
  - The lift now starts just after "Oh—".
  - The dark is held 1 s longer before the child speaks.
  - F's first dim is deeper (0.35, the opening's chair-alone frame); gentle intensity keeps it at 0.5.
  - The heard-before version's light returns after the room's air.
- **J's word** now goes over 5.5 s, gone on the frame the party stops. The rubbed-out ghost keeps a little more graphite (floor 0.08), so the patches survive from across the room.
- **"tomorrow"** is found on the wall behind the visitor, not an adjacent one at the edge of the view.
- **B is a cold open:** no settling hush, the room cuts straight in on "Have you seen my charger?".
- **F's heard-before version** is heard once. After that the chair belongs to the room again.
- **The hint is held back during a vignette.** On a phone it sat where the captions are.
- **The room finished "I wanted you to stay." just after a vignette (found by the browser run on the phone).** A finished line was exempt from both the quiet over a memory and the quiet after one. Over a vignette and for 20 s after it (a preview too), the room now waits to finish its line, and a finish that never sounded leaves the line unfinished.

### Not done, and why

- **A visible eraser smear across J's lost word, seen from 4 m.** It needs alpha outside the glyphs' coverage, and the band comes from the time channel, which is empty between strokes. This needs the technical artist's design; the skeptic's question (is a blank stronger?) stays open.
- **F's dim runs on scene time** while its voices run on the audio clock. They diverge only below 10 fps; a real low-end phone should be checked first.
- **Re-timing lines from their measured lengths.** It waits for recordings: the scores are timed for the planned reads.
- **"tomorrow" at size m on touch.** The Director doesn't know the device; left as found.

### Reach (measured, not tuned)

`npx vite-node scripts/vignette-reach.ts`: 5 personas × 8 seeds × 600 s, all recordings assumed kept. The personas' scripts end after 2–4 minutes, so here each repeats the middle of its own script.

- **59 vignettes in 40 visits**, about 1.5 a visit:
  - chair visitor: 12 (F every visit);
  - explorer: 19;
  - reader: 11;
  - phone: 15;
  - still visitor: 2.
- **Never met: C, D and G.**
  - Their anchor lines are read for 2.5 s in only 1, 4 and 6 of the 40 visits.
  - C was offered 4 times. The scripted personas never look at newly written lines, so the simulation can't say whether an offer is read; in the browser an offer is written where the visitor is looking.
  - D's offer slots go to the bedroom's line, which is offered first.
- This is reported as it is. The artist decides whether rarely met memories are a loss or the point. The anchor reads per line are measured in the same harness (see `docs/vignettes.md`).
