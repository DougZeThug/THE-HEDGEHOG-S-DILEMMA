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

## What the room does

All of this is implemented and running; none of it is shown to the visitor as numbers or goals.

- **Arrival.** The screen opens from white; the light-fitting hum arrives before the words. About 50 pieces of writing are on the walls, composed in authored regions with deliberate emptiness directly behind the chair and on most of the wall behind you.
- **Proximity.** Coming close to the chair can be met with breath, with a child's voice ("It used to fit me." is written on the floor beside it), with warmth in the light — or, if you are restless or have retreated before, with exposure: harder, cooler light and an affectionate line spoken flatly from behind you. Settling near the chair turns exposure into company. Stepping away releases what built up as relief; staying far away becomes solitude.
- **Hesitation.** Approaching and retreating repeatedly forms a motif: "Come back. Don't." is written beside "I wanted you to stay.", a voice asks "If I come closer, will you stay?", and the chair's shadow begins to drift away from where the light says it should fall.
- **Stillness.** After ~9 s of stillness the room thins and writing that only exists while you are still surfaces ("How long have I been standing here?"); it dissolves the moment you move. Longer, a whisper drifts in from a far corner toward the chair; longer still, the room goes almost silent; then, sometimes, a few piano notes.
- **Attention.** Holding a phrase in view darkens it slightly; after a few seconds its relations come forward — an echo revealed elsewhere, a faint pencil line connecting two phrases, or an answer written beside it in another hand, sometimes with the original struck through. Some phrases ("Look at me.", "Don't look at me.") are shy: legible only in peripheral vision. Small and faint writing needs you to come close.
- **Memory.** The visit forms motifs (hesitation, closeness, distance, stillness, warmth, wandering, reading, contributing) that bias what the room offers later. Warm memories you lingered on resurface, in faded cyan, when you are far from everything.
- **Contradiction and transformation.** The visit opens in phases gated by time *and* engagement (never forced). Later phases admit contradicting writing, re-write phrases you have read beside something that changes them ("There's nothing wrong with being alone." beside "That was a good day."), make the walls recede, and — once, when you aren't looking — move the chair a little.
- **Life elsewhere.** Muffled laughter, two people talking in another room, someone humming: chosen by the room's state, placed beyond a wall.
- **Your words.** `T` lets you write a word, sentence or memory. It is written on the wall where you are looking, in its own hand. The room does not answer. It quiets, reveals related writing, may let a distant voice speak something nearby, shifts its light in authored (not sentiment-coloured) ways, and may set two existing phrases against each other.
- **Leaving.** "leave the room" in the menu dims everything to near-black, removes the sound, and offers one line drawn from how the visit went ("You were very quiet. So was I.", "You almost did."). You can go back in: the room has kept everything, and has changed a little. Return visits on the same device (only a visit count is stored) begin differently.

## Architecture

```
src/
  content/      phrases.ts (118 authored phrases), relations.ts (re-contextualisations,
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
- **Interpretation is structured and validated.** A contribution becomes an `Interpretation` (dimensions, related/contradicting phrase ids, a whitelisted set of gestures). `validateInterpretation` drops unknown ids, unknown gestures and any extra fields. A future model-backed interpreter (`RemoteInterpreterStub` marks the slot; it is deliberately not wired) could only ever return this shape — never code, styles or audio commands.

## Sound and voices

- Everything in the ambience and music is synthesised live with the Web Audio API.
- Positional sound uses HRTF panners: the hum comes from the ceiling panel, ventilation from a high corner, voices from the chair, from a wall, from behind you, from beyond a wall (muffled), or from nowhere (drifting, unpositioned).
- `public/voices/` holds **recorded textures** (laughter through a wall, breathing, humming, murmured conversation, whispers) generated once, offline, with the ElevenLabs sound-effects API via `scripts/generate-voices.mjs`. They are loudness-normalised at load time. The app makes no network calls to any service at runtime.
- Spoken *lines* are not recorded yet. They are carried by synthesised voice textures shaped by each line's syllables (deliberately not intelligible) plus captions. To add recorded performances, drop files in `public/voices/` and list them in `manifest.json` under `phrase:<phrase-id>`; they take precedence automatically.
- An optional **browser speech** setting speaks lines intelligibly with the system voice. It is off by default, non-spatial, and labelled as a fallback, not the intended voice of the piece.
- Safety: a limiter before the output, all level changes ramped, at most four voices at once, generous headroom (measured peaks during busy moments are around −18 to −22 dBFS).

To regenerate the recorded textures: `ELEVENLABS_API_KEY=sk_... node scripts/generate-voices.mjs` (the key is read from the environment and never stored). Sound-effect output from ElevenLabs is subject to their terms for your plan.

## Accessibility, comfort and privacy

- Settings (`Esc`): volume, mute, captions (on by default), browser speech fallback, intensity (*gentle* halves light flashes, holds back the darkest extremes, softens voices and music, and makes silences less deep), reduced motion (follows the OS setting by default; removes head-bob, sway and grain animation, shortens transitions), quality.
- Keyboard-only exploration is complete (`Tab` to writing, `F` to approach, `C` for the chair). Touch is supported. The settings dialog traps focus.
- No flashing; all light changes take seconds.
- Privacy: nothing leaves the browser. Contributions exist only in memory for the current tab and vanish when it is closed; "forget what I wrote, and that I was here" removes them immediately and clears the visit count. The microphone is never used. Only preferences and a visit count are stored (localStorage).

## What is incomplete or uses fallback content

- **Spoken lines** use synthesised, unintelligible voice textures with captions (or optional browser speech). Recorded performances of the lines are the main missing artistic asset.
- **Recorded textures** were generated, not performed; I could check their duration and levels but not audition them. One clip that came back near-silent was discarded.
- **Visual verification** was done in headless Chromium with software rendering (slow, so behaviour over time was checked with the engine's fast-forward). Real-GPU performance and look on varied hardware still need a human eye.
- **Speech/microphone input** is intentionally not implemented.
- **Remote AI interpretation** exists only as a typed, validated interface.

## Credits

Fonts (bundled, SIL Open Font License): Reenie Beanie, Caveat, Nothing You Could Do, Cormorant Garamond — via Fontsource. 3D: three.js. All writing in the room is original.
