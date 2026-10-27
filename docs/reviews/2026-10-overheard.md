# Overheard voices in the painted memories (2026-10-27)

The brief: when a visual memory forms, let the visitor sometimes overhear a few seconds of somebody else's life (people talking to each other, never explaining), then leave them with the room's silence. The artist chose to put voices inside the painted memories (rather than more heard-only vignettes), with lighter writing (humour, affection, domestic bickering) recorded in the kept, held-back register (`BRIGHT_TAGS` stays).

Much of the original issue already existed when it was taken up: nine voiced vignettes (`docs/vignettes.md`) and six painted memories (`docs/memories.md`), none of which spoke. What was missing was a memory with both a picture and overheard speech.

Reviewed by the creative director, cinematic director, sound designer and interaction designer, then challenged by the skeptic.

## Decisions

1. **One scheduling authority.** A painted memory's voices are `voice:` cues on its own cue sheet and markers on its own timeline (`src/content/memory-voices.ts`, merged in `src/memory/runtime.ts`), played by its MemoryAudio on its clock. There is no second engine. The MemoryDirector chooses the version as the memory begins (deterministic: `chooseVoices`) and carries it on the `memory-scene` cue.
2. **Only kept takes reach visitors.** A version is heard only if every one of its lines has a take the artist kept. Otherwise the memory plays exactly as before: wordless, with no captions and no murmur standing in for speech. `?memory=<id>&variant=<v>&voices=<version>` previews it with takes not kept yet, or a wordless voice and its caption.
3. **Cereal's first sitting speaks; nothing else does.**
   - **Lines:** "That's my bowl." (restrained, the left bowl, 7.4 s), then "It's the clean one." (sarah, the right bowl, 8.8 s). The laugh at 10.5 (two people, together) answers both, and the light still lifts on it.
   - **Why two lines, not three:** the three-line version ("It's mine, though.") would have had to move the laugh and the light (cinematic). A third line also explains the joke (skeptic), and two lines leave the wordless and voiced cereal sharing one Theatre sheet (sound).
   - **Radio:** −18 dB instead of −15.5 in the voiced version only, so the lines sit in its troughs.
   - **Casting:** away from biscuit's liam/sarah pair, so no single couple forms across memories (creative). Sarah is the writer in seven of the nine vignettes: the writer in her own kitchen.
4. **Cereal later stays wordless.** The same laugh in an empty kitchen, with the light not answering it, is its rhyme with the first (cinematic, creative). "You're still here?" on a return visit would have read as addressed to the visitor.
5. **The bedroom stays wordless.** A call from downstairs puts a need into "happiest when nobody needed anything from me". The piano downstairs is already the other person, wordless. The bedroom opened in 1 of 40 scripted visits, so a line there would also have cost a 9 s longer hold for almost nobody (skeptic).
6. **Cut:**
   - Two cups, which the room already has five ways (creative).
   - The cereal version chosen by the visitor having withdrawn, which would punish behaviour with a sadder memory and is meaningless that early (creative, interaction).
7. **Rain is deferred, not dropped.** Its line `raining-anyway` reaches the walls only through an encounter arc, so it could open only through an offer, and offers (two a visit) would take the place of the rare C, D and G (interaction). Before adding a tenth vignette, re-anchor the two of the nine nobody reaches (decision 10). The creative director's rewrite is kept for when it comes: "Close that, will you?" / "It's nice." / [the rain starts] / "…It's nice."
8. **The picture leads, and nothing is chopped.**
   - **Quiet windows:** each voiced variant lists the windows of its picture's beats that no voice may enter (cereal: the laugh and the light's lift, 10.5–11.6), and no line comes within 1.5 s of the scene forming. Both are tested.
   - **Soft releases:** looking away, walking off or a tap elsewhere lets a sentence already begun finish, and nothing new begins. A hard release (switch, departure, hidden tab) still cuts.
   - **Hold:** a voiced memory holds against a turned head until its last line is said, plus a second.
   - **Stray taps:** while someone in it is speaking, a stray tap counts as staying.
9. **Nothing talks over it, and its words are captioned as speech.**
   - **Other sounds:** nothing of the room's (not even a finished line) sounds while a memory with voices of its own plays.
   - **Captions:** its lines are captioned as speech, each by the side of the painting it is said from. Phones play one channel, so the caption is how a phone visitor knows who is speaking. Its sound captions go beneath the words rather than replacing them.
   - **Level:** its lines are levelled as a vignette's are.
10. **Found on the way, not fixed here.** `npx vite-node scripts/vignette-reach.ts` now gives 67 vignettes in 40 visits with **the charger and the washing up at 0/40**. `docs/vignettes.md` reports otherwise, so that should be looked into separately.

## QA (qa-accessibility, after implementing)

Fixed:
- **The Director's view of the memory.** The Director treated cereal as speaking although nothing was kept. It now counts a version as speaking only once the App names it among what may speak (`setAvailable`, `voicesId`), so a wordless cereal is wordless to both.
- **Speaker sides in captions.** The sides never rendered: the vignettes' caption backing centred every line, a bug older than this change. Both people's lines now lean apart, on phones too (measured: left 16–109 px, right 273–374 px at 390 px), and so do the vignettes'.
- **Pauses.** A pause mid-sentence lost the sentence. It is now said again from its start, the scene stepping back to just before it, as a vignette's does, and nothing already heard is played twice (tested).
- **Previews.** A `?memory=` preview counted as a real viewing on that device. It is now never counted, and the Director knows a voiced preview has voices.
- **Stray taps.** A tap in the pause between the two lines released the memory. The whole exchange is now covered.
- **The preview's whisper.** Its stand-in voice no longer begins after the memory is let go.

Left as they are:
- **Caption density.** A screen reader may re-announce the caption region as the laugh's caption joins the words; vignettes already do this. To be checked on a real screen reader before changing `aria-atomic`.
- **Line lengths in the tests.** The tests estimate them until measured timings exist for vignette takes (`voice-timings.json` has none). The audition sets the real gaps.

## Recording

- **Direction:** four takes in `src/content/vignettes.dialogue.json` (two seeds per line). Both lines are `[quietly, flat]`: dry, deadpan, unhurried, mouth half full. The scene context carries the humour; no tag asks for it. "Held back" is not "sad": read sad, "That's my bowl." sounds hurt, and the laugh then arrives as strangers.
- **Dry run:** `node scripts/generate-dialogue.mjs --vignettes --dry-run --only=cereal--my-bowl,cereal--my-bowl-b,cereal--clean-one,cereal--clean-one-b` plans 4 takes, about 132 credits estimated (recent vignette runs have billed about 0.45 of their estimate). Without `--only`, the run would also generate five `-c` takes queued earlier for other vignettes (about 113 more).
- **Approval:** nothing is generated without the artist's approval.
- **At audition:** judge the two lines **and the laugh together** in the read-through (`node scripts/audition.mjs`, "cereal (painted memory, its voices)").
  - If it plays as a hurt exchange followed by strangers laughing, keep nothing: the memory stays wordless at no cost.
  - Check the laugh's level against the lines. The version's `gains` can set it.
  - Real take lengths decide the final gaps. If two kept takes together run longer than about 2.65 s, choose a shorter take rather than moving the laugh.
- **Recorded (2026-10-27, with the artist's approval):** the four takes, 58 credits billed (132 estimated). Each was heard back word for word by the speech-to-text check.
- **Kept, by the artist:**
  - `cereal--my-bowl-b`: speech from 0.15 to 1.06 s into the file, so heard at about 7.55–8.46.
  - `cereal--clean-one`: speech to 1.29 s, heard at about 8.8–10.09.
  - That leaves a third of a second between them and about half a second before the laugh. No beat moved.
  - The other two takes stay unkept.
- **Live:** cereal's first sitting speaks for visitors. Checked in an ordinary visit (no preview): the Director chose the voices, and the lines were captioned left (7.5 s) and right (8.85 s) on a phone.
