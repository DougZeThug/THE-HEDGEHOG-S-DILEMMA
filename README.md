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
npm run perf         # startup, frame pacing, shader programs, GPU memory, fixed-state frames (BASE, OUT)
npm run style        # each look from fixed places and through the opening, beside the reference image (BASE, OUT)
```

Playwright is a pinned devDependency (`1.56.1`, Chromium 1194). It downloads no browser on install; point it at one with `PLAYWRIGHT_BROWSERS_PATH` or `CHROMIUM_PATH` (perf).

**Tuning.** Add `?tune` to the URL for a small panel (loaded only then): the room's light (key, room, sky, glow, cone), the look (`original`, `subtle`, `reference`, and each of its values: fill, area, key, cone, glow, warmth, ceiling, exposure, vignette, grain, plaster relief, the chair's contact and shadow softness), the memory's light, a button that calls the memory now, and *copy values*. It changes how things look, never what the Director decides, and stores nothing.

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
| Touch | drag on the left half to walk/turn, the right half to look; tap writing to read it closely, tap the chair to go to it and again to kneel |

Or do nothing. Standing still is one way of being here among many; the room answers looking, reading, coming back to a line, touching, crossing the room, and pausing just as much.

For inspection: add `?debug` to the URL for a live overlay of the engine's state, or `?seed=N` to fix the variation seed.

## The room itself

Minimal, but authored. The emptiness is meant to look chosen, not default.

- **Surfaces** are painted once at load (`src/world/surfaces.ts`):
  - off-white, hand-trowelled plaster: broad gentle mottling, faint horizontal passes, a fine tooth a few centimetres across, specks, small pits and hairline scratches;
  - sealed concrete, a shade darker than the walls: cloudy, with a soft sheen where people stand by the chair, slightly smoother along the path people walk in, scuffed in arcs around the chair, duller and greyer further from it;
  - a ceiling a little cooler than the walls, with the faintest board joints;
  - a grey painted skirting, and a soft shadow a few centimetres deep above it and where the walls meet the ceiling (not a ruled line).
  - the writer's hand: graphite dragged along under the lines on the walls and a thumb at their ends; a few smudges elsewhere, an eraser's paler halo.
- **Physical history**, faint, but there to be found from a metre or two:
  - writing that was rubbed out: a single "you" in the empty space behind the chair, an apology lower and off to one side, and not only confessions (somewhere, a shopping list);
  - masking-tape residue around paler rectangles where something once hung;
  - pencil height marks with an initial near one corner, and a few days counted in fives low on the wall behind you;
  - scuffs along the skirting, graphite dust settled above it under the busiest writing, soft occlusion in every corner;
  - on the floor, a little to one side, the pressed marks of where the chair used to stand.
- **Light** comes almost entirely from one frosted overhead panel, hung slightly north of the chair, set back in the ceiling (its reveal catches the light).
  - The floor is brightest around the chair. The wall you read is the brightest wall, washed from its top centre by the skylight's glow; the side walls, the corners and the ceiling fall away from it, the ceiling brightest round the opening.
  - The light is cream rather than white. The warmth is in the light alone, never the plaster or the grade, so when the room cools (someone too close) it cools as far as it ever did.
  - The chair's shadow is soft-edged (a few centimetres of penumbra, the same on a phone) and stretches toward whoever arrives. Under the seat lies the panel's own shade, and its feet press small dark contacts into the floor.
  - Where this came from, and what was left out (outlines, tonal banding, damp stains, a sepia grade): `docs/reviews/2026-10-illustrated.md`. `?style=original|subtle|reference` compares the light before and after; reference is the room.
  - The shadow-casting source can still drift away from where the panel says it should be.
- **The chair** is a small hand-made ladder-back (`src/world/Chair.ts`, `src/world/wood.ts`), seat at 34 cm, posts to 72 cm:
  - square legs eased at the edges, slimmer at the foot; back posts raked back, one a little short;
  - a top rail and two slats (one set in not quite level), square stretchers, a dished, slightly trapezoidal seat;
  - oiled walnut (no lacquer, no sheen), its figure broad enough to read from across the room; the seat two boards glued side by side, its top worn to amber;
  - wear baked into the wood: paler across the seat's front edge, the middle of the top rail and every arris, where hands and bodies touched it; darker in the joints and at the feet.

## What the room does

All of this is implemented and running; none of it is shown to the visitor as numbers or goals.

- **The opening.** One authored score (`src/state/OpeningScore.ts`), first visit:
  - **0 s.** You tap the black threshold, which is also the title card; that tap lets the room be heard.
  - **0.3–5 s.** "The Hedgehog's Dilemma" holds on black and fades.
  - **In the dark.** A chair creaks, then a switch clicks by the door.
  - **Where you are.** Low (a child's eye height, 1.1 m), centred on the chair two and a half metres back: the room as a box around it, its light at the top. Your first deliberate step stands you up, in one slow movement; looking around doesn't. With reduced motion you start standing.
  - **The chair.** A wide, soft throw of light finds it alone, and the walls are barely there. The fixture stays dim, the source rather than the subject. You can look around from here.
  - **The room.** It comes up nearly empty: plaster with old erased marks, and small writing on the floor by the chair. You can walk from here.
  - **A hand writes.** "I wanted you to", in pen, in silence, then stops. The stop is held for two seconds.
  - **Laughter.** It comes from the wall to the right of the chair, and "You've got crumbs on you." writes itself there as it is heard, pausing through the laugh. Its caption follows the writing rather than giving it away.
  - **Hand-off.** Once the voice and its writing are done, at about 23 s on a phone and 24 s on a wider screen, the room is yours. Nothing of the room's own life starts before then, nothing is owed afterwards, and nothing answers the unfinished line until you do.

  Returning visitors skip the title and are in the room in about 9 s. A tap advances the title; **Skip**, Esc or a hidden tab ends the opening at once, easing the light up rather than cutting. Why this and not another opening is recorded in `docs/reviews/2026-10-cinematic-opening.md`.
- **Accumulation.** The room fills over the visit:
  - **A few lines soon after the hand-off.** Ordinary ones first (cereal for dinner, half a sandwich), written on the wall you face, wherever they first belonged.
  - **Then more slowly.** Lines held in view are answered by a related line written near them: something they echo or contradict.
  - **Some spoken lines write themselves**, about one in three, onto their place on the wall as they are heard. Most leave nothing.
  - **The unfinished line is finished** when someone stays with it: a long look at it, or being still at the chair, facing it, for a while. A voice from the line says the whole sentence, the hand writes "stay." as the word is heard, and the room is quiet for a while afterwards. Until then, nothing answers it.
- **Handwriting.** New writing is written, not faded in:
  - **Stroke order.** Each piece is baked once, when it is first needed, with the moment the hand reaches each pixel. Within each letter, the ink is followed from where a pen would touch down; dots and crossbars come after the word (`src/world/strokes.ts`).
  - **Pace.** The hand writes at the pace of its implement (`handwriting.ts`), pausing at commas and stops and now and then before a word.
  - **Following a voice.** Each word starts when it is heard, never before, using character timings from forced alignment that are stored with the recordings (`src/content/voice-timings.json`). A hand can't write as fast as people speak, so the line ends up to a second after the voice. Rubbing out is still a patchy dissolve, like an eraser.
  - **Crayon is wax.** Two faint passes land a little off each letter and leave flecks; the edges are ragged; the wax skips over the plaster's tooth in short slanted streaks; and the pressure comes and goes along the line, which still shows from across the room (`HandStyle.waxy` in `textures.ts`). Stroke order is worked out from the letters before tooth and wax break them up.
- **Proximity.** Coming close to the chair is met at once, and usually by subtraction: the hum drops away for a few seconds and the light settles. ("It used to fit me." is written small on the floor beside it.) Occasionally the chair creaks; breath from the empty chair belongs only late in a visit. If you stay, the light warms — or, if you are restless or have retreated before, it hardens and cools instead, and up to three times in a visit a voice speaks: from the chair, or, when closeness has become exposure, an affectionate line spoken flatly from nowhere in particular. Settling near the chair turns exposure into company. Stepping away releases what built up as relief; staying far away becomes solitude.
- **Hesitation.** Approaching and retreating repeatedly forms a motif: "Come back. Don't." is written beside "I wanted you to stay.", a whisper asks "If I come closer, will you stay?", and the chair's shadow begins to drift away from where the light says it should fall. Nothing labels the drift.
- **Drawings.** A few small drawings were left on the walls, by more than one hand, over the years (`src/content/drawings.ts`). They are found, not shown: from the middle of the room they are almost nothing.
  - **Already there:**
    - a child's sun beside the pencil ticks of someone's height, half cleaned off with one swipe;
    - a game of noughts and crosses nobody finished;
    - doodles that stop dead along the edges of a pale rectangle where a sheet once hung;
    - a biro tested low on the south wall;
    - three half-erased ghosts: the chair, drawn round side on at its own size when it stood against the west wall; a door ajar; an eye with nothing looking out of it.
  - **Drawn while you watch:** stay a few seconds with "I still say 'we' by accident." and a hand draws two cups beside it, the second never finished.
  - **Where:** the north wall, where the visit opens, has none. Their places are kept before any writing is laid out, so nothing is ever written over them.
  - **How they are made:** baked by stamping soft graphite along each stroke (`src/world/sketch.ts`) into the writing's own texture format, so they are lit, drawn and rubbed out like the writing. The old ones are baked in the black after the tap, not while the page loads.
- **A memory, as light.** Once a visit, late (from about 150 s, once the room has turned to contradiction), "the light in the kitchen at four in the afternoon" is written on the wall you face. It is held back from the first writing for this. Stay with it for 2.5 s, or touch it, and the room hushes; then low sun comes through a window that isn't there and lies across the words: warm, slanted, a sash's shadow in it, sliding a few centimetres. Three seconds in, six held, four out. The words wash pale under it and come back. The room's own light gives way a little, and nothing else happens until well after it has gone. While you stay with the line, the room waits with you. It is drawn as light added to the plaster in proportion to what is there (`src/world/MemoryLight.ts`), so the ink and shadows keep their contrast. Under reduced motion it rises over 4 s and doesn't slide; under gentle intensity it is fainter.
- **Writing in the air.** Once a visit, and never while "I wanted you to" is unfinished: someone who has been close to the chair, has stepped back from it and looks at it (or who has kept away a long time, two and a half minutes or more) may see "Please don't come any closer." written in the air beside the chair, in three short lines, over the lit floor. If those words are already on a wall, it is "far enough to miss you", or "Come back. Don't.". It is fainter than writing on a wall, holds still, and can only be read from about where it was written to: edge-on it is gone, and from behind there is nothing. The light over the chair casts it as a soft grey band on the floor, no letters in it. Coming within about 1.4 m rubs it out of the air in under a second, with the sound of an eraser and a breath ("[rubbed out]"); left alone, it thins away after about 45 s. (In the scripted playtest personas it is rare, because they don't look at the chair from a distance; a person at the door usually does.)
- **Stillness.** Standing still (not reading — reading has its own answers) thins the room. Writing that only exists while you are still may surface ("How long have I been standing here?") and dissolves the moment you move; usually a voice drifts in from a far corner toward the chair; then the room goes almost silent, and sometimes a few piano notes follow. The first answer comes within five to nine seconds; each later stillness is answered a little later, so it never becomes a trick. The timings, and which of these happen, differ from visit to visit.
- **Attention.** Holding a phrase in view darkens it slightly; touching or clicking it counts as reading it at once, and the room's hum dips a little as you read. The first time you settle on a line, nothing else happens. Looking away for ten seconds and coming back is a new meeting. Meeting it again later can bring a different context each time: an answer written beside it in another hand, an echo revealed elsewhere, a faint pencil line to another phrase, its own words spoken from somewhere unexpected, a sound in another room — or nothing (see *Meeting the same words again*). Some phrases ("Look at me.", "Don't look at me.") are shy: legible only in peripheral vision. Small and faint writing needs you to come close.
- **Memory.** The visit forms motifs (hesitation, closeness, distance, stillness, warmth, wandering, reading, contributing) that bias what the room offers later. Warm memories you lingered on resurface, in faded cyan, when you are far from everything.
- **Pacing.** The room keeps its own sense of rhythm (`src/state/Pacing.ts`).
  - It tells *chosen* quiet from *waiting*. Quiet is chosen just after something strong (about 20 s after a voice, 12 s after other strong moments), inside a deliberately held silence, or simply when it hasn't lasted long (10 s on arrival, rising to 36 s late in the visit, shorter the more actively you engage). Waiting only exists for someone who is doing something: a visitor who stands and listens is never "kept waiting"; stillness has its own answers.
  - When you are waiting, it answers what you are doing — a related line comes up on the wall you are reading, the chair creaks (twice a visit at most), writing appears on a wall you have just turned from, a cup is set down next door — never the same kind of answer twice running. About one time in four the answer is that nobody speaks: the room hushes, as if about to, and doesn't.
  - Once, after the first couple of minutes, it holds a long silence (30–42 s): hum almost gone, nothing written, nobody speaking, nothing allowed to interrupt. For its first sixteen seconds the light goes back to how the visit began: the room's light, the sky and the fixture itself go down until only the chair is lit, then return. The turn to the last phase does the same, for about eleven seconds, unless it comes inside that silence.
  - It notices when enough is happening (six things in a minute) and holds its own life back; answers to what you do still come.
  - Voices are prompted by what you do, never by the clock: turning away from a line you held, coming back to one, stepping away from the chair, or reading line after line with nothing answering (the first time that happens, the room always speaks; after that, sometimes). What is said is usually not the line itself but its echo or its contradiction, from where that writing is or from beyond a wall, a recorded reading where there is one. "From behind you" is kept for one authored moment.
  - Once in a visit, late, a line already heard comes back in a *different* recorded reading, from somewhere else.
  - A meeting with a line outranks everything else: its beat waits while you keep looking, and if it can't sound it is owed to the next meeting, never lost.
  - How this was measured, before and after: [docs/pacing.md](docs/pacing.md).
- **Contradiction and transformation.** The visit opens in phases by *depth of engagement* (`src/state/Engagement.ts`, `src/state/Phase.ts`): every kind of attention adds to it, and time adds a little by itself. Reading and coming back to lines count for more than walking about, and the time floors are low, so depth decides: in the playtests a reader reaches contradiction at about 50 s and an explorer at 60 s; transformation comes at about 2–2½ minutes for engaged visitors, 4 for one who stays at the chair, and by 5 for one who barely moves. Later phases admit contradicting writing, re-write phrases you have read beside something that changes them ("There's nothing wrong with being alone." beside "That was a good day."), make the walls recede, and — once, when you aren't looking — move the chair a little. (Only on a later visit does anyone ask who keeps moving it.)
- **Life elsewhere.** Muffled laughter, two people talking in another room, someone humming. These belong mostly to the authored situations below; elsewhere they are used sparingly (never while you are reading, and never the same sound twice within three minutes).
- **Your words.** `T` lets you write a word, sentence or memory. It is written on the wall where you are looking, in its own hand. The room does not answer. Often nothing else happens. Sometimes one thing does — the room goes quiet, or its light shifts in an authored (not sentiment-coloured) way — and sometimes, a minute or three later, related writing surfaces elsewhere, a voice beyond a wall says something that rhymes with it, or two phrases are drawn into relation, as if on their own.
- **Leaving.** "leave the room" in the menu plays the opening backwards: the room's light and the sky go, leaving the chair lit alone for a moment, then the view goes to black with the chair's light still on. The sound goes more slowly. Then it offers one line about the room, chosen by how the visit went ("The chair, from the door.", "It is still warm where you were."). You can go back in: the room has kept everything, and has changed a little. Return visits on the same device (only a visit count is stored) begin differently.

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
                Engagement    what the visitor does, as signals (read, return, tap, approach,
                              kneel, look around, cross the room, pause, write) → depth
                Pacing        rhythm: recovery / chosen quiet / stalled; repetition
                PhaseTracker  arrival → familiar → contradiction → transform, by depth
                OpeningScore  the opening as data: light, image, sound, permissions, events
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
                layout (authored regions + deterministic packing), CameraRig, Post (grade),
                handwriting.ts (the hand's pace; following speech), strokes.ts (stroke order)
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
- **Spoken lines** — 23 phrases have recorded, intelligible performances (38 in the room, plus 6 retired takes kept for comparison), in `public/voices/dialogue/` (see *Recorded voices* below). The room chooses which performance of a line to use from its emotional field, and plays it from a place in the room. Lines without a recording keep the earlier unintelligible textures; captions carry the words either way.
- Where a voice comes from, in order: the recorded performance chosen for this moment → another recorded performance of the same phrase → the browser's own speech, only if the visitor turns that setting on → a recorded texture or synthesis. A recording always wins over browser speech (`src/audio/selection.ts`).
- The optional **browser speech** setting speaks unrecorded lines intelligibly with the system voice. It is off by default and non-spatial.
- Safety: a limiter before the output, all level changes ramped, at most four voices at once, generous headroom (measured peaks for every voice type and the music were between −18 and −35 dBFS in headless Chromium).

To regenerate the recorded textures: `ELEVENLABS_API_KEY=sk_... node scripts/generate-voices.mjs` (the key is read from the environment and never stored). Sound-effect output from ElevenLabs is subject to their terms for your plan.

## Recorded voices

The voices are meant to sound like fragments of somebody's life, not a narrator reading the walls: people who laugh, bristle, get embarrassed, lose the thread, and break. They are generated **offline** with ElevenLabs text-to-speech. The browser never contacts ElevenLabs; it only plays files listed in `public/voices/manifest.json`.

**Why the first takes were flat, and what changed.** The first batch (`eleven_v3`, October 2026) gave each short line one generic tag ("[softly]"). Measured, those takes are short (1.0–1.4 s), unpaused and narrow in pitch (3–6 semitones): technically valid, emotionally inert. The current takes are *directed*:
- **Model:** `eleven_v4` (available on this key; probed with three-character requests).
- **Stability:** 0.2–0.3 rather than 0.5, so delivery is allowed to vary.
- **Tags placed where the voice should change**, not one at the front: `[holding back tears] I wanted you… [voice cracking] to stay.`, `[giggling] I love you. [laughs, pushing him away] Go AWAY.` Ellipses and capitals shape rhythm and emphasis. The authored words never change: validation rejects any input whose words differ from the line, and speech-to-text flags any added word.
- **Unspoken scene context.** v4 accepts `previous_text` / `next_text`. Each take carries the other person's line before and after (`"It's two days. You're being dramatic about this."`), or a line of narration (`He found the photograph in a box he hadn't opened in twenty years…`). It shapes how the words are said, is never heard, and was not billed. A short isolated sentence is hard to perform; context gives it somewhere to come from.

**The lab** (`scripts/voice-lab.json`, `node scripts/generate-dialogue.mjs --lab`, files in `audition/lab/`) varies one thing at a time on the same line and seed: model alone; direction; stability; scene as narration vs as dialogue; another voice; and a spoken lead-in cut away afterwards using Scribe's word timestamps. Its measurements (below) chose the method; only listening can choose the takes. (Strictly, the order should have been lab → listening → batch; the main batch followed the lab without anyone listening in between, so every take is a candidate, not a choice.)

**Readings.** Three clearly different readings of each of the three central lines, in different voices:

| Line | Readings |
|---|---|
| I wanted you to stay. | nearly breaking (Jessica) · frustrated, abandoned (Liam) · affectionate, a quiet request (Sarah) |
| I love you. Go away. | exhausted, overwhelmed (Matilda) · teasing, laughing (Jessica) · angry, hurt underneath (Chris) |
| I think I was happy then. | nostalgic, an unexpected smile (Liam) · unsure, trying to remember (Sarah) · aware of what was lost (Bill) |

…and, across other lines: laughing happiness ("You've got crumbs on you."), joy ("You made me laugh so hard I couldn't breathe."), irritation, embarrassment, confusion, tenderness, grief ("Do you remember me?", at a mother's bedside), and plain happiness ("That was a good day."). Earlier takes of the three re-directed lines are *retired*: kept on disk and in the ledger, out of the room unless someone approves them.

**Choosing a reading.** The Director picks a performance with `rankPerformances` (`src/state/performance.ts`) from the existing EmotionalField, as a weighted mean (so a reading directed for several feelings at once doesn't win just by listing more): warmth → the affectionate request; tension and dissonance → the abandoned one; solitude and exposure → the breaking one. Each of the three readings of each central line wins in some state of the room (tested). A line heard a second time is given the reading furthest from the first.

**Leaner alternatives** (`audition: true`): an external review warned that stacked tags ("[holding back tears] … [voice cracking]", "[angry, jaw tight] … [voice breaking]") and synthetic laughter risk swapping *flat* for *acted*. So the audition sheet also has leaner readings — the unspoken scene doing the work and at most one non-verbal tag — and re-situated ones ("Do you remember me?" as an old school friend at a bus stop rather than a bedside). They stay out of the room unless approved. Five more lines that visitors heard most often in the old v3 voice ("If I come closer, will you stay?", "You understood me once…", "I'm glad you came.", "Please don't come any closer.", "I was afraid you'd leave.") have new v4 readings in the room.

**Playback** (`src/audio/Voices.ts`, `AudioEngine.ts`), after an audio review:
- Recordings are only half-normalised, with an authored `levelDb` per take, so a whispered take stays quieter than a raised one (full normalisation had squeezed a 12 LU spread into 2).
- A 5 ms fade-in and 30 ms fade-out on every recording; four takes whose files ended mid-sound were re-cut or faded (recorded in the ledger as `edit`).
- The output stage is a true safety limiter (it had been a heavy compressor with automatic makeup), with volume after it.
- Through a wall, recordings are muffled gently (2.2 kHz, quieter) instead of at 750 Hz, which had removed the breath and catches that were directed.
- The hush before a voice falls fast enough to be felt and never lifts a deeper silence already under way; it belongs to the voice cue, so it can't happen without the voice.
- Voices from nowhere drift from a random side, and less widely.

**Auditioning.** `npm run audition` builds `audition/index.html`: every take grouped by line, side by side (with "play in turn"), each with its reading, voice, model, input, unspoken scene, transcript, detected laughs and sighs, and measurements; mark each *keep / not this / unsure*, then apply the generated command:
```bash
npm run audition                      # then open /audition/ from `npx vite` (or any static server at the repo root)
node scripts/generate-dialogue.mjs --approve=stay--breaking,love-go-away--teasing --reject=happy-then--unsure
```
`node scripts/audition.mjs --out=<dir>` writes a self-contained copy (page + audio) to share.

**Measurements** (`scripts/voice-analysis.mjs`): pitch range and movement, pauses, loudness range, voicing (breath, whisper, laughter), ending contour. They show that takes *differ*, not that they convince. Median pitch range went from about 6.5 semitones (old takes; nine of them were already above 9) to about 12 (new); most new takes have one or two pauses. Pitch range partly tracks breathiness here (r ≈ −0.6 with voicing), so it is not a clean measure of expressiveness. Speech-to-text detected the directed laugh in most, not all, takes that ask for one (not in `this-bit--fond`), and some directed sounds ([scoffs], [exasperated sigh], [long exhale]) are faint or untagged. With the same seed, stability 0.2 vs 0.5 changed little: the seed dominates, so several seeds per line, chosen by ear, would be the next step. The audition page hides these numbers until asked, so they don't prime the ear.

**Generation** (`scripts/generate-dialogue.mjs`, logic in `scripts/dialogue-lib.mjs`):
```bash
node scripts/generate-dialogue.mjs --dry-run                       # plan and estimated credits, no key needed
ELEVENLABS_API_KEY=… node scripts/generate-dialogue.mjs --budget=900
ELEVENLABS_API_KEY=… node scripts/generate-dialogue.mjs --lab --budget=700
ELEVENLABS_API_KEY=… node scripts/design-voices.mjs --budget=400    # bespoke voice previews (Voice Design)
node scripts/generate-dialogue.mjs --approve=… --reject=…           # after listening
```
- **Idempotent.** A request is identified by voice, model, input, stability, similarity, scene, lead-in and seed (fields absent from older takes leave their hashes unchanged). Identical requests are never repeated; a lab take that matches a performance exactly can be adopted rather than paid for twice.
- **Protected.** Approved recordings are never overwritten without `--regenerate=<id>`.
- **Budget.** Jobs beyond `--budget` stay queued.
- **Failures.** Rate limits are retried with back-off. Invalid voices are recorded and skipped. Quota and permission failures stop the run and leave the remaining jobs queued.
- **Checks.** Every file is checked to be valid MP3 and transcribed (ElevenLabs Scribe, with audio-event tagging). A take whose words don't match, that speaks a tag aloud, or that adds words is marked `needs-review` and kept out of the manifest. (One did: "[quietly, the smile fading]" was spoken aloud; the direction moved into the unspoken scene and the take was regenerated once.)
- **Ledger.** Status, hashes, credits, request ids, transcripts, detected audio events and review decisions go to `scripts/dialogue-ledger.json` (lab: `scripts/voice-lab-ledger.json`).

**Account capabilities, as tested** (October 2026):
- Text-to-speech works with ElevenLabs default voices on `eleven_v4`, `eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2_5` and `eleven_turbo_v2_5`, as do speech-to-text and the dialogue endpoint. `eleven_v4` accepts `previous_text`/`next_text`; `eleven_v3` rejects them.
- Default voices that work: Jessica, Chris, Laura, River, Will, Sarah, Matilda, Alice, Charlie, George, Liam, Callum, Brian, Eric, Bill, Daniel, Roger, Bella, Harry. Library voices (e.g. Aria, Rachel) return `402 paid_plan_required`; Lily returns `404`.
- The key now has full access (October 2026), so both generation scripts read the real balance before every batch and refuse one the account can't cover; without `user_read` they would fall back to the ledger and `--budget`. Costs are also tracked per take from each response's `character-cost` header. The account showed 2,596 credits used after the two Creator-plan rounds, against 1,982 in the ledger for takes, so the voice previews (and speech-to-text checks) came to roughly 600, close to the 520 estimate.
- Credits: first batch 815. Second round: lab 670, main batch 863, one retake 55, alternatives and re-directions 357, availability probes about 70 — about 2,015 in all.

**After the Creator plan** (121k credits a month, 30 custom voice slots, Voice Design):
- *Voice Design works* (`scripts/design-voices.mjs`, `scripts/voice-designs.json`, previews in `audition/design/`): four bespoke voices described by character (an older worn woman, a tired man, a close whisperer, a small shy young-adult voice), three previews each. Nothing is saved to the account until the artist keeps a preview (`--save=<preview>:<key>`), and saving uses a slot, not credits. Voice Design reports no cost; the ledger estimates one credit per character of preview text (about 520). The key still can't read library voices (`voices_read`).
- *The voice library* (readable now that the key has full access): a search for older, worn and whispering voices, and for children's voices, gave a shortlist of 12 (`library` in `scripts/voice-designs.json`; `node scripts/design-voices.mjs --library`), each reading the same text as the designed voices so they can be compared. The library's "children's voices" are mostly bubbly cartoon characters or adults who narrate for children; only two (Kavya, Omar J) are soft enough for the lines in a child's hand, and both are performed or designed voices of unstated age, not real children. The samples were spoken straight from the library, so no voice slots were used: 632 credits by the response headers (the account balance fell by 545).
- *Several seeds per reading*: the earlier measurements showed the seed matters more than stability, so the gap takes and the saddest kept readings have two more seeds each (`variantOf`), grouped on the sheet to pick the best.
- *The whole spoken corpus*: the 14 voiced phrases that had no recording, plus `alone-ok`, have two readings each (mostly whispered or sad, as the artist prefers, with a warm reading where the line allows), each in two seeds — all audition-only until kept.
- *Bitrate* stays at 128 kbps: 192 kbps makes every file half as large again for nothing a phone speaker can show. *Loading* is staged: every sound and the first two takes of each line on arrival (tested ≤ 3 MB), the rest a few at a time when the browser is idle; a take chosen earlier is fetched when needed.
- Round-2 credits: about 1,836 for 89 generations (84 candidate takes; five retakes of lines that repeated or misspoke) plus about 520 (estimated) for voice previews, against a cap of 8,000. No top-ups, overage or plan changes.

**Audition decisions.** The artist's choices on the shared sheet are applied with `--approve`/`--reject`; rejecting now also retires a take from the Director's ranking (`retired`), and approving brings an alternative or retired take back. The first full round kept 29 takes, rejected 20, and adopted six kept lab takes at no cost; eight sadder or whispered takes were then directed for the lines left without a recording.

**What has and hasn't been checked.** Technically, everything above is automated. **Artistically, only what the artist marked *keep* has been approved by ear**; every other take is a candidate, however well it validates. Whether a performance sounds like a real person is exactly what the audition sheet is for.

## Accessibility, comfort and privacy

- Settings (`Esc`): volume, mute, captions (on by default), browser speech fallback, intensity (*gentle* halves light flashes, holds back the darkest extremes, softens voices and music, and makes silences less deep), reduced motion (follows the OS setting by default; removes head-bob, sway and grain animation, shortens transitions), quality.
- Keyboard-only exploration is complete (`Tab` to writing, `F` to approach, `C` for the chair). Touch is supported. The settings dialog traps focus.
- No flashing; all light changes take seconds.
- Privacy: nothing leaves the browser. Contributions exist only in memory for the current tab and vanish when it is closed; "forget what I wrote, and that I was here" removes them immediately and clears the visit count. The microphone is never used. Only preferences and a visit count are stored (localStorage).

## What is incomplete or uses fallback content

- **Spoken lines**: 20 phrases have recordings the artist kept; every voiced phrase now has candidate takes waiting on the audition sheet. Lines without a kept take use unintelligible textures with captions.
- **Recorded textures** were generated, not performed; I could check their duration and levels but not audition them. One clip that came back near-silent was discarded.
- **Visual verification** was done in headless Chromium with software rendering (about 10 fps, so behaviour over time was checked with the engine's fast-forward and the opening on its own wall clock). Real-GPU performance, how the light-up looks on an OLED phone, and whether the handwriting *reads as a hand* at full frame rate still need a human eye.
- **Not yet heard by the artist:** the new switch and graphite sounds (in the opening now), and two music pilots (on the audition sheet only, not in the room). Music is never in the opening or under a voice.
- **Deferred, on purpose:** writing in the air (at most once a visit, after review), the light as a motif later in the visit, and a contact-shadow decal for the chair (see the review).
- **Speech/microphone input** is intentionally not implemented.
- **Remote AI interpretation** exists only as a typed interface plus a strict validator.

## Testing and review

- `npm run opening` watches the opening in real time on an emulated phone, without the autoplay override: the title on black, the chair lit before the walls, the room nearly empty, the first line written over time and left unfinished, the voice's words written as heard, nothing from the Director before the hand-off, audio running after the tap, Skip, and touch afterwards. `tests/opening.test.ts` checks the score's timings, the hold and the hand-off, filling and finishing, speech-following writing on real recordings (each word never before it is heard, and the line ending within a second), stroke order, and the timing data.
- **Specialist reviewers.** Seven reviewer agents (`.claude/agents/`, `docs/agents.md`) reviewed the brief before it was built, the Skeptic challenged them, and the decisions are recorded in `docs/reviews/2026-10-cinematic-opening.md`.
- The unit tests (Vitest) cover pacing (tests/pacing.test.ts: five playtest personas against the targets — something seen or heard in the first 10 s, a perceptible answer within 30 s, a recorded voice within 90 s, no perceptible gap over 25 s in the first 90 s, no more than one development every 7 s, phases that differ by behaviour; engagement signals; rhythm states), and the visitor model (stillness, approach/withdraw hysteresis, reading), the emotional field (non-monotonic closeness, relief after withdrawal, hush), the phrase selector, the scheduler, deterministic and divergent experiences for scripted visitors (still, hesitant, close, wandering, warm), contributions (always written, never answered within a minute, at most one gesture), the interpreter and its validator, the corpus, wall layout, each authored situation (followed and ignored paths, absences, what generic rules must not do while a situation holds a channel), contamination (lines start out of place, migrate gradually beside what belongs, vary between visits; the held line reaching the empty wall), recorded voices (direction matches the corpus; idempotent, budgeted generation; rate-limit, invalid-voice, quota and invalid-audio handling with a simulated API; transcript checks; manifest compatibility; playback priority; context-based performance choice; no credentials anywhere and no API calls from the browser), and encounters (the three meetings with "I wanted you to stay.", what counts as a new meeting, default arcs, variants that depend on the visit, pacing).
- `npm run perf` (`tests/playtest/perf.mjs`) measures, on desktop and an emulated phone:
  - startup (ready to enter, the score running, the hand-off);
  - long tasks;
  - frame intervals in the room and during the memory;
  - shader programs at the threshold, and any compiled later (by key);
  - draw calls and triangles across all post passes;
  - textures, geometries and estimated GPU memory, the composer's targets included;
  - fixed-state frames for before/after comparison.

  Under software GL only counts, memory and ordering mean anything. `tests/memory.test.ts` checks the memory's timing over 30 seeds: the light at 2.5 s of gaze, nothing else before or during it, a touch latched, once a visit, offered again if its line found no room.
- `npm run smoke` drives a full visit in headless Chromium: entering, walking, kneeling, every wall, stillness, a contribution, settings, leaving and returning. It fails on any console error or on any overlapping writing.
- Two separate reviews were run on the finished build. A critical artistic review led to cutting lines that stated the dilemma outright or sounded like therapy, removing a rule that put jokes on a timer, making the chair's responses mostly subtraction, varying stillness per visit, and making contributions unanswered. A QA/accessibility review found 15 bugs, all fixed and re-verified in the browser. They included contributions that could silently fail to appear, still-only writing that never vanished, auto-walk continuing while paused, the inspector log keeping visitors' words, an abrupt dark-to-white return, speech ignoring mute and pause, a quality setting that only half applied, low-contrast controls, the passing-traffic swell never sounding, and the voice limit being exceedable.

## Credits

Fonts (bundled, SIL Open Font License): Reenie Beanie, Caveat, Nothing You Could Do, Cormorant Garamond — via Fontsource. 3D: three.js. All writing in the room is original.
