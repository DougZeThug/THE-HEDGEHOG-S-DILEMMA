# Brief: cinematic opening, living typography, audiovisual art direction

*The artist's brief (October 2026), kept here so reviewers and future sessions work from the same text. Condensed only where wording repeated; the requirements are unchanged.*

Evolve the existing installation into a more deliberately authored, cinematic, emotionally engaging audiovisual experience. **Implement it in the existing repository; do not start over.** Preserve:
- the Three.js environment;
- the emotional-state engine;
- the authored phrase corpus;
- visitor memory;
- the interactive situations;
- spatial audio;
- the ElevenLabs dialogue pipeline.

It should feel like an experimental film and a psychological installation, a living piece of art. Not a videogame, not horror, not a tech demo.

## 1. Central concept

The experience begins with nothing: darkness, then a name, then light, then an object, then space, then language, then human voices. The white room is not at first a gallery covered with words. The visitor witnesses it gradually filling with expressions of human experience.

**Words spoken by voices can physically write themselves into the environment.** Memories, feelings and thoughts seem to materialise around the visitor; the room accumulates emotional expression. The chair remains the central object. The walls hold speech, memory and contradiction. Light and darkness reveal what exists and conceal what cannot yet be understood.

## 2. Replace the opening

The current white fade, with substantial writing already visible, is no longer the direction.

- **A — Darkness and title.**
  - Black screen; the title *The Hedgehog's Dilemma* slowly fades in, centred.
  - Elegant, restrained typography: soft white or warm grey, cinematic spacing.
  - No logos, particles or loading-screen aesthetics.
  - It holds briefly, then fades to black, like the title card of an experimental psychological film.
  - Perhaps an extremely subtle sound, nothing melodramatic.
- **B — The first light.**
  - Dark for a moment. A faint electrical or mechanical sound of something switching on.
  - A single overhead light slowly illuminates the chair. **At first only the chair is visible**; the room stays almost hidden.
  - The chair emerges in order: silhouette, then seat and back, then its wood, then a faint shadow on the floor.
  - Important, vulnerable, slightly mysterious. No theatrical spotlight or horror; a physically motivated fixture warming up.
- **C — The room emerges.**
  - The light expands: floor, then walls; the corners stay darker.
  - The walls are almost empty at first. Perhaps a few eraser ghosts, old marks or fragments, but not the full collection of phrases.
  - The emptiness must feel intentional.
- **D — The first writing.**
  - A phrase writes itself onto a wall. Characters emerge over time, as if an invisible hand wrote them; not a finished texture fading in.
  - Suggested phrase: "I wanted you to stay."
  - It may appear silently, or a voice may speak it as it is written.
  - This moment sets the visual and auditory language of the work.
- **E — The room becomes alive.**
  - A voice speaks from within or beyond the room, and its words appear on a wall, perhaps in a different hand.
  - The environment begins responding to attention, and the experience moves naturally into free exploration.

## 3. Duration and mobile pacing

The previous version was too slow, particularly on a phone. Targets (guidelines, not fixed):

| Time | Experience |
|---|---|
| 0–3 s | black screen, title emerges |
| 3–6 s | title holds, then fades |
| 6–11 s | chair emerges from darkness |
| 11–17 s | room gradually becomes visible |
| 17–25 s | first significant writing and voice event |
| 25–35 s | visitor freely exploring a responsive room |

- The first emotionally meaningful moment arrives within about 20–25 s. Nobody is forced to stand around.
- Allow interaction as soon as the room is visible enough. If the visitor moves toward the chair or looks at emerging writing during the opening, respond gracefully.
- Give returning visitors a subtle way to advance or skip the introduction.
- Audio: respect autoplay rules with an unobtrusive first interaction, e.g. a minimal invitation to tap the black screen. The tap starts the title sequence with audio enabled. Late audio initialisation must not desynchronise the scene.

## 4. Language physically appears

A genuine animated writing system, not opacity transitions.

- **Writing onto surfaces.** When a voice speaks, its words progressively become visible on a wall, like handwriting:
  - continuous strokes;
  - natural variation in speed and hesitation between words;
  - pressure variation, irregularity, small imperfections.

  Not a typewriter effect.
- **Sync with speech.** Words appear as they are heard; pauses in speech influence the animation; important words complete as they are delivered.
  - For ElevenLabs recordings, use timestamps or forced alignment where supported.
  - If no reliable word timing exists, use a punctuation- and duration-aware approximation, not uniform characters per second.
  - Store timings alongside approved recordings, so sync is reproducible without runtime API calls.
- **Real handwriting reveal.** Inspect the current canvas text rendering and add:
  - progressive glyph strokes, with path-based stroke reveal where feasible, or animated masks that follow believable writing paths;
  - textured pencil or ink deposits;
  - different handwriting styles.

  Don't replace the typography system unnecessarily. No crude rectangular mask sweeping across whole lines. If precise strokes are impractical, use a convincing approximation with stable, deterministic timing.
- **Writing into the air.** A separate, restrained spatial typography. Rare and meaningful; wall writing stays dominant. No dialogue boxes or holographic HUD. Possibilities:
  - a spoken word briefly hanging between viewer and chair;
  - a phrase near a voice's source;
  - letters that fade before completion;
  - a fragment drifting to a wall and joining it;
  - a phrase that disappears as the visitor approaches.

## 5. Language as accumulated memory

The room starts sparse and writing accumulates; different voices leave different traces. Affection might be soft pencil, frustration firmer, uncertain memories faint or incomplete. No simplistic rules (no "anger is red"); associations are subtle, varied, sometimes contradictory.

Support:
- a spoken line written onto an empty wall;
- an existing phrase spoken again in another tone;
- a second statement beside an earlier one;
- writing erased or overwritten;
- words remaining after their voice has gone;
- a phrase spoken but leaving no writing;
- writing with nobody speaking;
- the visitor's own words integrated into the room.

Control text density and composition so the room never fills until unreadable; keep negative space around the chair.

## 6. ElevenLabs: speech, effects, music

Inspect the existing pipeline:
- `scripts/generate-voices.mjs`, `scripts/generate-dialogue.mjs`, `scripts/dialogue-lib.mjs`;
- `src/content/dialogue.json`, `public/voices/manifest.json`;
- `src/audio/Voices.ts`, `AudioEngine.ts`, `Music.ts`, `Ambience.ts`.

Also check the key's permissions, the models, the capabilities and the costs. Use approved recordings that work; don't regenerate them without reason.

- **A. Expressive speech.** Real people with genuine, sometimes contradictory emotions:
  - hesitation, strain, spontaneous laughter, warmth, frustration, tenderness, vulnerability, joy, anger, nostalgia, uncertainty, conversational imperfection;
  - not monotone narration, not exaggerated acting, not constant whispering;
  - distinct personalities per voice, and several performances of important phrases;
  - a human review workflow to approve the best.

  Successful generation is not artistic success.
- **B. Sound effects API.** Original, specific, meaningful sounds, each with an artistic function, with variants where useful:
  - the room: a light switching on, fixture hum, ventilation, electrical resonance, structural creaks, distant footsteps, a light clicking off;
  - human presence: close breathing, a nervous inhale, a relieved exhale, a laugh from another room, muffled conversation, humming, fabric, a distant sigh;
  - objects and memories: chair creak, pencil on paper, graphite on a surface, an eraser, a door elsewhere, a cup set down, rain on an unseen window, everyday domestic sounds.

  Not every letter needs a scratch; a chair creak may mean more after minutes of silence.
- **C. Music API.** Check actual availability, permissions, durations, pricing and licensing. If available, make a small collection of fragments:
  - influences: psychological cinema, sparse ambient, minimalist piano, unresolved harmony, gentle analogue synths, quiet dissonance, nostalgic fragments, sudden absence of resolution;
  - avoid: trailer music, meditation music, orchestral swells, constant melancholy piano, obvious loops, songs with vocals, music that tells you what to feel;
  - include genuine beauty and happiness. Contrasting material: warm and intimate, nostalgic and fragile, unresolved, barely audible, comforting, contradictory;
  - prefer short fragments, stems and motifs, responsive to the emotional engine without dominating.

  If there is no access, improve the generative music; don't block on paid capabilities.
- **D. Implementation.**
  - Generate offline; load locally at runtime through the existing Web Audio system.
  - Keep HRTF positioning, dynamic reverb and filtering, the safety limiter and master volume. Headphones are central.
  - Voices come from meaningful places. Music may be non-positional. Sounds move only when motivated.
  - Proper gain staging and smooth transitions. No credentials in client code.

## 7. A cohesive audiovisual score

The opening is one coordinated composition, not isolated systems running at once. An authored opening score controls:
- darkness and title opacity;
- lighting intensity, chair visibility and room illumination;
- the first text, spoken-line playback and writing sync;
- environmental sound;
- camera and movement permissions;
- the hand-off to the interactive experience.

It must be **declarative, inspectable and testable**, and work with the Director rather than against it. No unrelated Director events overlap the introduction. Afterwards, a smooth transition: no sudden change of appearance, no burst of queued sounds.

## 8. Preserve interactivity

After the opening the room stays responsive to:
- proximity and repeated approach or withdrawal;
- reading and revisiting;
- gaze, stillness, kneeling and movement;
- the visitor's own writing.

Voice-to-writing becomes one of the Director's tools. Not every event writes and not every sentence is voiced, but meaningful events come often enough that the room feels alive. Nobody waits minutes for language, light and sound to relate.

## 9. Visual art direction

A minimal, emotionally charged physical installation with cinematic lighting, tactile materials and strong psychological presence.

- Keep: off-white plaster, subtle imperfections, varied whites, restrained shadows, the handmade chair, grounded light, negative space.
- Improve the transition from darkness. The chair must be compelling as the only visible object; refine shadows, roughness, reflections and exposure.
- No extra furniture, horror props, fantasy effects or spectacle.

## 10. Mobile first-class

The artist found the build-up too slow on a phone. The opening must run smoothly on modern mobile browsers. Optimise:
- lighting transitions and text animation;
- GPU memory, audio decoding and preloading;
- startup time, touch responsiveness, frame pacing and readability.

No expensive per-frame canvas updates or needless texture allocations; precompute or cache handwriting data. Quality reductions keep the composition and readability. No standing still or complex touch controls needed to witness the first events. Test touch exploration after the opening.

## 11. Agent review

Specialist reviewers: Creative Director, Cinematic Director, Sound Designer, Typography / Technical Art, Interaction Designer, Skeptic, QA. **The Skeptic challenges the opening before it is declared complete.**

## 12. Stages and tests

Stages:
1. inspect;
2. black title and lighting sequence;
3. a nearly empty initial room;
4. progressive handwriting;
5. speech-to-writing sync;
6. sound-effects library;
7. music (selectively);
8. Director integration;
9. phone optimisation;
10. tests and critical artistic review.

Build and validate; don't stop at a plan.

Real-time browser test of the first 35 s, verifying that:
- the title appears and fades;
- the chair is visible before the walls;
- the room starts sparsely written;
- the first text is actually written, not revealed instantly;
- speech and writing are perceptually synchronised;
- environmental sounds play at the right moments;
- no unrelated events interrupt the opening;
- audio works after activation;
- touch works after the transition;
- the introduction can't trap anyone;
- the hand-off to the Director is smooth.

Use Playwright screenshots or video, including a real mobile viewport and touch. Never claim sound or animation quality is artistically verified unless reviewed; provide samples for human audition. Respect credit budgets: no uncontrolled API calls or purchases.

## 13. Acceptance

- A cinematic black title card.
- The chair revealed alone in darkness, then the room gradually lit.
- Very little writing at first.
- Words visibly written into existence.
- Spoken dialogue generating synchronised writing.
- Voices used with more artistic direction, and sound effects that matter.
- Original music if available and affordable.
- A compelling emotional moment in the first 20–25 s, then responsive exploration without losing atmosphere.
- Phone visitors not left waiting.
- The authored language, emotional memory and Director all still working.

## Mandate

The visitor witnesses an empty room gradually filling with human expression. The room seems to remember things. A sentence might exist because someone once said it; another might disappear because nobody could bring themselves to finish it. One voice leaves a permanent mark, another nothing at all. The chair remains, silently witnessing. **A room being constructed out of things people have felt, remembered, spoken and left unsaid.** Preserve the intimacy and ambiguity of the childhood diorama. Put artistic coherence, voice performance and audiovisual sync before technical complexity.
