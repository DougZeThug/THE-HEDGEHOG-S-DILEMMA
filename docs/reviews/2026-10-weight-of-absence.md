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
