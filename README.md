# The Hedgehog's Dilemma

An interactive audiovisual installation for the browser.

A white room. A small wooden chair at the centre. Writing on the walls — loneliness, affection, misunderstanding, a sandwich eaten slowly one afternoon. The room listens to how you move, what you look at, how close you come to the chair and how long you stay still, and it slowly changes in response. It never explains itself.

This work grew from a physical diorama made in childhood after watching *Neon Genesis Evangelion*: an enclosed white room, one dollhouse chair, words and phrases written across every wall. The digital room keeps that diorama's minimalism and tries to deepen it rather than replace it.

## Running it

Requirements: Node 18+ and a WebGL2 browser (desktop Chrome, Firefox, Safari, Edge; recent mobile browsers work at lower quality).

```bash
npm install
npm run dev          # http://localhost:5173
```

Production build:

```bash
npm run build        # typecheck + bundle into dist/
npm run preview      # serve dist/ at http://localhost:4173
```

Tests:

```bash
npm test             # unit tests (Vitest): emotional engine, selection, scheduling, layout, interpreter
npm run build && npx vite preview --port 4173 &
npm run smoke        # browser smoke test (Playwright + Chromium): full visit, screenshots in test-output/
```

Headphones are recommended. Sound starts only after you press **go in**.

## Being in the room

| | |
|---|---|
| Walk | `W A S D`, or `↑ ↓`; `Shift` to go slower |
| Look | mouse (click the room to capture the mouse; `Esc` releases it), or `← →` / `Q E` |
| Go toward what you are looking at | `F` (a gentle walk; moving yourself cancels it) |
| Turn to the next piece of writing | `Tab` / `Shift+Tab` |
| Turn to the chair | `C` |
| Kneel by the chair | `Space`, `Enter`, `K`, or click it when close |
| Leave something on the wall | `T`, or the ✎ button |
| Pause, settings, leave | `Esc`, or the ··· button |
| Touch | drag on the left half to walk/turn, the right half to look; tap writing or the chair to go to it |

Or do nothing. Standing still is a way of being here; the room does not need you to act.

For inspection: add `?debug` to the URL for a live overlay of the engine's state, or `?seed=N` to fix the variation seed.

## The room itself

Minimal, but authored. The emptiness is meant to look chosen, not default.

- **Surfaces** are painted once at load (`src/world/surfaces.ts`):
  - off-white, hand-trowelled plaster with broad mottling and faint horizontal passes;
  - a subtly varied matte floor, slightly smoother along the path people walk in, scuffed in arcs around the chair;
  - a ceiling a little cooler than the walls, with the faintest board joints;
  - soft grey trim: a skirting with a shadow gap above it, and a fine shadow gap where walls meet the ceiling.
- **Physical history**, at the edge of visibility:
  - writing that was rubbed out (a graphite ghost of "I'm sorry" in the empty space behind the chair);
  - masking-tape residue around paler rectangles where something once hung;
  - pencil height marks with an initial near one corner, and a few days counted in fives low on the wall behind you;
  - scuffs along the skirting, soft occlusion in every corner;
  - on the floor, a little to one side, the pressed marks of where the chair used to stand.
- **Light** comes almost entirely from one frosted overhead panel, hung slightly north of the chair.
  - The floor is brightest around the chair, the walls fall away gently toward the corners, and the ceiling stays dim.
  - The chair's shadow is soft-edged and stretches toward whoever arrives.
  - The shadow-casting source can still drift away from where the panel says it should be.
- **The chair** is a small hand-made ladder-back (`src/world/Chair.ts`, `src/world/wood.ts`):
  - turned legs that splay slightly, back posts that lean and end in finials;
  - an arched crest rail and slats bent to receive a back, and a dished, slightly trapezoidal seat;
  - oiled walnut with long calm grain;
  - wear baked into the wood: paler across the seat's front edge and the middle of the crest rail, where hands and bodies touched it, and darker at the feet.

## What the room does

All of this is implemented and running; none of it is shown to the visitor as numbers or goals.

- **Arrival.** The screen opens from white; the light-fitting hum arrives before the words. About 35 pieces of writing are on the walls, composed in authored regions with deliberate emptiness directly behind the chair and on most of the wall behind you, which holds only two lines.
- **Proximity.** Coming close to the chair is usually met by subtraction: the hum drops away for a few seconds and the light settles. ("It used to fit me." is written small on the floor beside it.) Sometimes there is breath. If you stay, the light warms — or, if you are restless or have retreated before, it hardens and cools instead, and at most twice in a visit a voice speaks: from the chair, or, when closeness has become exposure, an affectionate line spoken flatly from behind you. Settling near the chair turns exposure into company. Stepping away releases what built up as relief; staying far away becomes solitude.
- **Hesitation.** Approaching and retreating repeatedly forms a motif: "Come back. Don't." is written beside "I wanted you to stay.", a whisper asks "If I come closer, will you stay?", and the chair's shadow begins to drift away from where the light says it should fall. Nothing labels the drift.
- **Stillness.** Standing still thins the room. Writing that only exists while you are still may surface ("How long have I been standing here?") and dissolves the moment you move; in some visits a whisper drifts in from a far corner toward the chair; eventually the room goes almost silent, and sometimes a few piano notes follow. The timings, and which of these happen, differ from visit to visit.
- **Attention.** Holding a phrase in view darkens it slightly. The first time you settle on a line, nothing else happens. Meeting it again later can bring a different context each time: an answer written beside it in another hand, an echo revealed elsewhere, a faint pencil line to another phrase, its own words spoken from somewhere unexpected, a sound in another room — or nothing (see *Meeting the same words again*). Some phrases ("Look at me.", "Don't look at me.") are shy: legible only in peripheral vision. Small and faint writing needs you to come close.
- **Memory.** The visit forms motifs (hesitation, closeness, distance, stillness, warmth, wandering, reading, contributing) that bias what the room offers later. Warm memories you lingered on resurface, in faded cyan, when you are far from everything.
- **Contradiction and transformation.** The visit opens in phases gated by time *and* engagement (never forced). Later phases admit contradicting writing, re-write phrases you have read beside something that changes them ("There's nothing wrong with being alone." beside "That was a good day."), make the walls recede, and — once, when you aren't looking — move the chair a little. (Only on a later visit does anyone ask who keeps moving it.)
- **Life elsewhere.** Muffled laughter, two people talking in another room, someone humming. These now belong mostly to the authored situations below; the general rules only use them after long quiet stretches.
- **Your words.** `T` lets you write a word, sentence or memory. It is written on the wall where you are looking, in its own hand. The room does not answer. Often nothing else happens. Sometimes one thing does — the room goes quiet, or its light shifts in an authored (not sentiment-coloured) way — and sometimes, a minute or three later, related writing surfaces elsewhere, a voice beyond a wall says something that rhymes with it, or two phrases are drawn into relation, as if on their own.
- **Leaving.** "leave the room" in the menu dims everything to near-black, removes the sound, and offers one line about the room, chosen by how the visit went ("The chair, from the door.", "It is still warm where you were."). You can go back in: the room has kept everything, and has changed a little. Return visits on the same device (only a visit count is stored) begin differently.

## The walls are not partitioned

Each wall keeps a dominant character — north holds the dilemma itself, east the ordinary warm past, west being misread, south almost nothing — but the emotional spectrum leaks.

- Some lines begin out of place:
  - "You made me laugh so hard I couldn't breathe." is in amber crayon among the shame on the west wall.
  - "I didn't mean it. I meant some of it." is among the warm memories.
  - "I kept your jumper. I don't wear it." is on the dilemma wall.
  - The most intimate line in the room, "You fell asleep on my shoulder and my arm went dead and I didn't move it.", is alone on the wall behind you when you arrive.
- As the visit deepens, material migrates. From a little after two minutes, at most two lines while settling in, four once the room starts contradicting itself and seven late in the visit.
  - A line is written, unchanged, on a wall where it doesn't belong, beside the line that most belongs there. For example, "You always took the last biscuit and I let you." beside "sorry", or "I love you. Go away." beside "That was a good day."
  - It happens on a wall you aren't looking at, so it is found rather than watched.
  - Each line that hosts a stranger does so once, and floor and ceiling writing never wanders.
- Late in the visit, the line you held longest is written small on the empty wall behind you.

Walls' characters are in `src/content/walls.ts`; migration is `ruleContaminate` in `src/state/Director.ts`.

## Meeting the same words again

Meaning in the room accumulates through repeated context, not through more content. Every line has a history of being met: a settled look is a meeting, and looking away for a while and coming back is another. Each time, the line is the same. What happens around it is not.

"I wanted you to stay." is first just written there, with no sound. The second time, it is said quietly from behind you, and beside it, in lighter pencil, someone has written "I didn't know how." The third time, nothing new appears; somewhere else in the house a door closes. After that it is only itself again.

About fifteen central lines have authored arcs like this (`src/content/encounters.ts`). Every other line with relations develops through them, restrained: alone; then one relation; then a different one, or its own words in a voice they weren't written in; then rest. Most meetings are deliberately empty, and empty ones are never delayed, so the visitor never learns that looking makes something happen. The same words met elsewhere (re-written on another wall, remembered on the floor by the chair) count as meeting them again.

The door, a cup set down next door and the chair creaking are recorded textures in `public/voices/` (generated offline like the others), with synthesised fallbacks.

## Situations

Underneath the room's general behaviour there is a second layer: a few authored episodes that bind together a sound, a place, a piece of writing and a moment later in the visit. Nothing announces them, and each visit holds a different few.

- **The next room.** Laughter through a wall. If you go to it, something happy is written there. Much later, at the chair, the same words appear small on the floor, and where the laughter was there is quiet. If you don't go, it calls once more from somewhere else, then lets go.
- **Someone humming.** While you stand still, someone hums beyond a wall. Walk toward it and it stops mid-phrase. Later the piano plays the same tune, and stops where the humming stopped; if you let them finish, it plays it through.
- **Listening.** Two voices next door. Go right up to the wall and stand still to hear them, and they stop. Much later, on another wall, a question.
- **Residue.** Kneel by the chair a while. When you leave, a faint warmth stays on the floor where you were, not at the chair. Come back later and the chair has turned toward that place.
- **Erosion.** Some minutes after you write something, while you are elsewhere, it is rubbed out except for one word. Sometimes the room's own writing shares that word and appears faintly beside it. Only that word is kept by the engine, never your whole sentence, and "forget" removes it.

Situations live in `src/state/situations/`: `Situation.ts` holds the runner, and `library.ts` holds the five episodes as small state machines. A situation claims the channels it uses (sound beyond the walls, voices at the chair, music), and the general rules keep out of its way. Any situation can be forced for inspection with `?situations=next-room,humming`.

## Architecture

```
src/
  content/      phrases.ts (119 authored phrases), relations.ts (re-contextualisations,
                voice fragments, interpretation lexicon, departure lines), types.ts
  state/        VisitorModel  observable behaviour: distance, stillness, approach/withdraw
                              cycles with hysteresis, attention and reading, surfaces visited
                EmotionalField latent "weather": warmth, exposure, solitude, relief, tension,
                              reminiscence, hush, dissonance — competing needs with inertia
                Memory        motifs and warm memories (session only)
                PhaseTracker  arrival → familiar → contradiction → transform
                PhraseSelector deterministic weighted choice: field affinity, contrast,
                              motif bias, relation boosts, recency
                Director      the composer: rules that turn all of the above into cues,
                              plus continuous environment targets (light, scale, sound)
                cues.ts       the only vocabulary between the composer and the world
  core/         seeded RNG, event scheduler (spacing of major events), maths
  world/        Room (procedural plaster/paper/floor, skirting, panel), Chair (lathe-turned
                legs, curved slats, procedural grain), Lighting (area light + shadow-casting
                spot that can drift), WallText (canvas handwriting on lit planes, dissolve
                shader, annotations, links, strikes, shy/near legibility, attention),
                layout (authored regions + deterministic packing), CameraRig, Post (grade)
  audio/        AudioEngine (buses, limiter, procedural reverbs, ducking), Ambience (hum,
                ventilation, outside, unresolved drone), Music (generative piano-like
                phrases that sometimes stop before resolving), Voices (recorded assets →
                synthesised formant whispers/murmurs/laughter/humming → optional browser speech)
  interpret/    schema.ts (validated Interpretation), LocalInterpreter, Interpreter interface
  ui/           preferences, captions
  App.ts        wiring: input, cues → world/audio, UI, departure/return
```

Design rules the code follows:

- **The engine is deterministic and inspectable.** Given a seed and a sequence of behaviour, the room produces the same cues (tested). `window.__hedgehog` exposes the live engine; `?debug` shows it.
- **Cues are data.** The world and sound only ever receive typed cues and continuous environment targets; nothing else reaches them.
- **Interpretation is structured and validated.** A contribution becomes an `Interpretation` (dimensions, related/contradicting phrase ids, a whitelisted set of gestures). `validateInterpretation` drops unknown ids, unknown gestures and any extra fields. A future model-backed interpreter would implement the `Interpreter` interface (none is included or wired) and could only ever return this shape — never code, styles or audio commands.

## Sound and voices

- Everything in the ambience and music is synthesised live with the Web Audio API.
- Positional sound uses HRTF panners: the hum comes from the ceiling panel, ventilation from a high corner, voices from the chair, from a wall, from behind you, from beyond a wall (muffled), or from nowhere (drifting, unpositioned).
- `public/voices/` holds **recorded textures** (laughter through a wall, breathing, humming, murmured conversation, whispers) generated once, offline, with the ElevenLabs sound-effects API via `scripts/generate-voices.mjs`. They are loudness-normalised at load time. The app makes no network calls to any service at runtime.
- **Spoken lines** — 20 central phrases have recorded, intelligible performances (26 in all), in `public/voices/dialogue/` (see *Recorded voices* below). The room chooses which performance of a line to use from its emotional field, and plays it from a place in the room. Lines without a recording keep the earlier unintelligible textures; captions carry the words either way.
- Where a voice comes from, in order: the recorded performance chosen for this moment → another recorded performance of the same phrase → the browser's own speech, only if the visitor turns that setting on → a recorded texture or synthesis. A recording always wins over browser speech (`src/audio/selection.ts`).
- The optional **browser speech** setting speaks unrecorded lines intelligibly with the system voice. It is off by default and non-spatial.
- Safety: a limiter before the output, all level changes ramped, at most four voices at once, generous headroom (measured peaks for every voice type and the music were between −18 and −35 dBFS in headless Chromium).

To regenerate the recorded textures: `ELEVENLABS_API_KEY=sk_... node scripts/generate-voices.mjs` (the key is read from the environment and never stored). Sound-effect output from ElevenLabs is subject to their terms for your plan.

## Recorded voices

The voices are meant to sound like fragments of somebody's life, not a narrator reading the walls. They are generated **offline** with ElevenLabs text-to-speech (`eleven_v3`). The browser never contacts ElevenLabs; it only plays files listed in `public/voices/manifest.json`.

**Voice palette** (`src/content/dialogue.json`). These are ElevenLabs default voices; Voice Design isn't available on the current plan.

| | Voice | Purpose |
|---|---|---|
| intimate | Jessica | Young adult, gentle, hesitant; speaks to one person at close range. |
| restrained | Chris | Ordinary and grounded; composure that emotion gets through anyway. |
| warm | Laura | Spontaneous, laughs easily; happy memories without sentiment. |
| distant | River | Remembering a conversation from years ago; ambiguous rather than sad. |
| young | Will | Youthful vulnerability (a young adult stock voice, not a child). |

**Direction.** Each performance names its phrase, voice, the exact authored text (which is the caption), the model input, a written direction, the emotional context it was directed for, and its file.
- Audio tags are used sparingly: at most one per line, in about half the lines, and never "whispers" by default.
- "I wanted you to stay." has three performances:
  - tender (intimate), chosen when warmth dominates;
  - guarded (restrained), chosen when exposure and tension dominate;
  - remembered (distant), chosen when reminiscence dominates.
- Other key lines have two performances each.
- The Director picks a performance with `rankPerformances` (`src/state/performance.ts`), using the existing EmotionalField and the manner the moment asks for. Speech is no more frequent than before; the recordings only change *how* a line sounds when the room already chose to speak it.

**Generation** (`scripts/generate-dialogue.mjs`, logic in `scripts/dialogue-lib.mjs`):
```bash
node scripts/generate-dialogue.mjs --dry-run                       # plan and estimated credits, no key needed
ELEVENLABS_API_KEY=… node scripts/generate-dialogue.mjs --pilot     # three contrasting lines
ELEVENLABS_API_KEY=… node scripts/generate-dialogue.mjs --budget=900
node scripts/generate-dialogue.mjs --approve=stay--tender --reject=closer--flat   # after listening
```
- **Idempotent.** A request is identified by voice, model, input, stability and seed. Identical requests are never repeated.
- **Protected.** Approved recordings are never overwritten without `--regenerate=<id>`.
- **Budget.** Jobs beyond `--budget` stay queued.
- **Failures.** Rate limits are retried with back-off. Invalid voices are recorded and skipped. Quota and permission failures stop the run and leave the remaining jobs queued.
- **Checks.** Every file is checked to be valid MP3, and transcribed with ElevenLabs speech-to-text. A recording whose words don't match the authored text, or that speaks its tag aloud, is marked `needs-review` and kept out of the manifest.
- **Ledger.** Status, hashes, estimated and actual credits, request ids, transcripts and review decisions go to `scripts/dialogue-ledger.json`. Generation status lives there rather than in the direction file, so authored direction and machine state stay separate.

**Account capabilities, as tested** (October 2026):
- Text-to-speech works with ElevenLabs default voices on every model tried (`eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2_5`, `eleven_turbo_v2_5`), as do the dialogue and speech-to-text endpoints.
- Community/library and legacy voices (e.g. Rachel) return `402 paid_plan_required`; Sarah and Callum return `404 voice_not_found`.
- Voice Design returns `403 feature_not_available` ("only available on a paid plan").
- The key is restricted: it lacks `user_read`, `voices_read` and `models_read`, so the remaining credit balance and the voice list can't be read through the API.
  - Costs are tracked from each response's `character-cost` header instead.
  - Adding `user_read` to the key would let the script check the balance before a batch.
- The first batch (26 performances, 20 phrases) cost **815 credits**, exactly as estimated. Capability probing used about 64 more.

**What has and hasn't been checked.**
- **Technical** (automated):
  - every file decodes;
  - durations are 0.9–4.0 s;
  - each transcript matches the authored words, and no tag was spoken;
  - levels are normalised at load;
  - each performance plays from the right place, is chosen for the right context, carries the exact caption, and respects mute.
- **Artistic:** not yet done. None of the recordings has been auditioned by a person, so their status is `validated`, not `approved`. Listen, then approve or reject with the flags above; rejected takes leave the manifest immediately.

## Accessibility, comfort and privacy

- Settings (`Esc`): volume, mute, captions (on by default), browser speech fallback, intensity (*gentle* halves light flashes, holds back the darkest extremes, softens voices and music, and makes silences less deep), reduced motion (follows the OS setting by default; removes head-bob, sway and grain animation, shortens transitions), quality.
- Keyboard-only exploration is complete (`Tab` to writing, `F` to approach, `C` for the chair). Touch is supported. The settings dialog traps focus.
- No flashing; all light changes take seconds.
- Privacy: nothing leaves the browser. Contributions exist only in memory for the current tab and vanish when it is closed; "forget what I wrote, and that I was here" removes them immediately and clears the visit count. The microphone is never used. Only preferences and a visit count are stored (localStorage).

## What is incomplete or uses fallback content

- **Spoken lines**: 20 phrases have recorded performances that have been technically validated but not auditioned; everything else uses unintelligible textures with captions.
- **Recorded textures** were generated, not performed; I could check their duration and levels but not audition them. One clip that came back near-silent was discarded.
- **Visual verification** was done in headless Chromium with software rendering (slow, so behaviour over time was checked with the engine's fast-forward). Real-GPU performance and look on varied hardware still need a human eye.
- **Speech/microphone input** is intentionally not implemented.
- **Remote AI interpretation** exists only as a typed interface plus a strict validator.

## Testing and review

- 105 unit tests (Vitest) cover the visitor model (stillness, approach/withdraw hysteresis, reading), the emotional field (non-monotonic closeness, relief after withdrawal, hush), the phrase selector, the scheduler, deterministic and divergent experiences for scripted visitors (still, hesitant, close, wandering, warm), contributions (always written, never answered within a minute, at most one gesture), the interpreter and its validator, the corpus, wall layout, each authored situation (followed and ignored paths, absences, what generic rules must not do while a situation holds a channel), contamination (lines start out of place, migrate gradually beside what belongs, vary between visits; the held line reaching the empty wall), recorded voices (direction matches the corpus; idempotent, budgeted generation; rate-limit, invalid-voice, quota and invalid-audio handling with a simulated API; transcript checks; manifest compatibility; playback priority; context-based performance choice; no credentials anywhere and no API calls from the browser), and encounters (the three meetings with "I wanted you to stay.", what counts as a new meeting, default arcs, variants that depend on the visit, pacing).
- `npm run smoke` drives a full visit in headless Chromium: entering, walking, kneeling, every wall, stillness, a contribution, settings, leaving and returning. It fails on any console error or on any overlapping writing.
- Two separate reviews were run on the finished build. A critical artistic review led to cutting lines that stated the dilemma outright or sounded like therapy, removing a rule that put jokes on a timer, making the chair's responses mostly subtraction, varying stillness per visit, and making contributions unanswered. A QA/accessibility review found 15 bugs, all fixed and re-verified in the browser. They included contributions that could silently fail to appear, still-only writing that never vanished, auto-walk continuing while paused, the inspector log keeping visitors' words, an abrupt dark-to-white return, speech ignoring mute and pause, a quality setting that only half applied, low-contrast controls, the passing-traffic swell never sounding, and the voice limit being exceedable.

## Credits

Fonts (bundled, SIL Open Font License): Reenie Beanie, Caveat, Nothing You Could Do, Cormorant Garamond — via Fontsource. 3D: three.js. All writing in the room is original.
