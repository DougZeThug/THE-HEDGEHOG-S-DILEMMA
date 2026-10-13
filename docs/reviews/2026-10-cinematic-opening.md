# Review: the cinematic opening and living typography (October 2026)

The first full review with the seven specialist agents (`.claude/agents/`, protocol in `docs/review-protocol.md`).

**Inputs.** The six specialists reviewed the build as it stood and the artist's brief (`docs/brief-cinematic-opening.md`) as the proposed approach. The Skeptic then challenged all six.

**Evidence** (regenerable, gitignored) is in `test-output/review/`:
- frames of the old opening on desktop and phone;
- 90 s real-time phone runs and the engine playtest;
- lighting and framing probes, and a stroke-order prototype;
- QA's invariant checks.

## What the reviewers agreed on

- **The old opening.** It was one event, then nothing. Thirty-seven phrases were on the walls from the first frame. On the phone run the first spoken words came at about 39 s of room time.
- **One opening.** The threshold itself becomes the black title card: one tap, no second title. Then a chair lit alone, the room coming up, writing, and a voice. Nothing from the Director may interrupt any of it.
- **The room starts nearly empty**, makes its writing only when needed, and accumulates.
- **No fluorescent flicker, no spotlight disc, no music in the opening.**
- **Writing follows speech with a slower hand.** It never writes a word before it is heard.

## Disagreements and how they were resolved

| Question | Positions | Decision | Why |
|---|---|---|---|
| What the first 25 s contain | Creative: silent unfinished "I wanted you to", then laughter. Sound: `stay--breaking` voiced, then `closer--held`. Cinematic: one voice, `stay--after-silence`. Skeptic: Creative's structure, moved to the north wall. | **Skeptic / Creative.** "I wanted you to" is written silently and the hand stops. Then `crumbs--laughing`: "You've got crumbs on you." writes itself in crayon on the north wall, following the voice, pausing through the laugh. "stay." is finished later, or never. | Two sad voices in 25 s is the familiar art-game image. The contradiction between an unfinished wish and an ordinary intimacy *is* the dilemma, and it brings joy into the first minute. The brief allows a silent D and a voiced E. On a phone only the north wall is in view, so both lines go there. The fallback (voiced `stay--breaking`, the hand stopping at "you") is kept as a one-line change. |
| Opening length | Interaction and Cinematic: about 24 s. Skeptic: shorter on phones, but something perceptible every 2–4 s. | **About 22 s on a phone, about 25 s on desktop, hard cap 35 s.** Looking around unlocks with the chair; walking unlocks at about 10–12 s. A tap advances the title for everyone. Returning visitors get a visible Skip and a shortened score. | The artist's complaint was empty waiting, not length. Every stage now changes something, and no tap is ignored. |
| How writing follows a voice | Brief: "appear as heard". Creative and Cinematic: the hand trails. QA: a tight window per word. Skeptic: the work-in-progress code was caption-locked. | **Each word starts when it is heard, never earlier. The hand writes at most about 1.3× its own pace and catches up in the voice's pauses. The line ends at most about 1 s after the voice.** QA's sync test was rewritten to check these. | "Appear as heard" read literally gives karaoke. Locking the onset and letting the hand run slower keeps the cause-and-effect without turning the wall into captions. |
| Stroke order | Technical Artist: geodesic per-pixel arrival time, baked once. Skeptic: per-character table instead; stroke order is invisible at phone sizes. | **Technical Artist, with conditions.** It was already built when the Skeptic reported, and the time is continuous and filter-safe, which answers the Skeptic's P0. It allocates nothing when a voice starts (sync only moves a cursor) and defers dots and bars. The condition: bake cost is measured on phone emulation, and if it is too slow, the time inside each letter falls back to a slanted left-to-right ramp in the same texture format. | Both reviewers' failure modes are covered: no corruption, no hitch at the voice. The remaining question, whether stroke order is *visible*, needs the artist standing at a wall. |
| Clock | QA and Sound: the AudioContext clock everywhere. Skeptic: wall time from the tap; anchor voiced lines to their audio start. | **Skeptic.** The score and the hand run on `performance.now()`. A voiced line is anchored to its recording's start time and the output latency. | It does the same job with much less code. Frame clamping no longer affects either. |
| Re-basing the Director at hand-off | Interaction: a checklist of resets. Skeptic: don't tick it. | **Skeptic, nearly.** While held, the Director notices the visitor, but no time passes for it and no rule runs. At hand-off, stillness built up while watching is reset. `ruleOpening` only runs in the legacy mode used by the old tests. | Every Director clock starts at hand-off with nothing owed, so there is no burst. |
| Sound effects | Sound: five sounds (about 1,700–2,500 credits). Creative: few, domestic. Skeptic: two now. | **Two now: a wall switch click and graphite on plaster.** Price checked and budget capped first. The fixture start is the existing hum rising with the light. | Each sound has a job in the opening; the others can wait for the artist's ear. |
| Music | Brief: investigate and use selectively. Sound and Creative: none in the opening; if anything, diegetic piano through a wall. Skeptic: confirm availability, price and licence; at most two pilot fragments. | **Investigate, document, and (if available and affordable) two short pilot fragments for audition only**: an upright piano heard through the wall, one warm and one unresolved. Never in the first two minutes, never under a voice. | The generative music is already restrained. New material has to earn its place on the audition sheet first. |
| Writing in the air | Brief: yes, rarely. Creative and Cinematic: cut. Technical Artist: one at a time. Skeptic: later, once. | **Deferred (P2).** At most one instance per visit, after the opening passes review: a phrase near the chair that fades as the visitor comes close. | It is the dilemma in one gesture, but not in the opening and not without review. |
| Voice level | Sound: about −40 dBFS at the spawn point. Skeptic: confirmed. | **Fixed.** Recordings now carry across the room: reference distance 2.0, rolloff 0.6, about +10 dB at the spawn point. | Verified by calculation; needs a phone speaker and the artist's ear. |

## The plan

**P0: broken, or a major artistic failure**
1. The opening as one declarative score (`src/state/OpeningScore.ts`): black title card, chair-first light, the room coming up, the silent unfinished line, the voiced line written as heard, then the hand-off. The Director is held and nothing interrupts.
2. Handwriting written stroke by stroke from a baked arrival-time texture. Each piece of writing is made lazily, the first time it is needed. The room starts with only the floor writing by the chair, plus the plaster's old erased marks.
3. Voice-synced writing anchored to the recording's actual start time, using the forced-alignment timings in `src/content/voice-timings.json`. No per-voice re-bake.
4. A skip that always works: a tap advances, Esc or the Skip button ends the score, and a watchdog ends it by 35–40 s.

**P1: emotional impact, quality, usability**
1. Accumulation (`ruleAccumulate`): ordinary lines first. At least 3 readable lines by about hand-off + 10 s, 5–6 by 60 s.
2. Voice levels across the room, and the opening voice only lightly muffled.
3. Two sound effects (switch click, graphite) via `generate-voices.mjs`, with a recorded cost.
4. Captions readable on black. After entering, focus on a labelled element, not inside `aria-hidden`. The OS reduced-motion setting respected even after other settings change.
5. Hints shown only after the hand-off, and only if the visitor hasn't moved.
6. One browser run without the autoplay override, to check the audio unlock.
7. Some voiced lines (about 1 in 3) write themselves as heard. Most leave nothing.

**P2: polish and options**
- Writing in the air (one per visit).
- Light as a motif: the held silence dims the room back to the chair, and the departure plays the opening in reverse.
- Contact-shadow decal and wood tone, if the artist finds the chair weak in the new light.
- Music pilots on the audition sheet.
- Pacing tests asserted on every seed (QA found that taking the median hid failures), and personas that vary with the seed.
- Removing the synthetic speech code, as its own change.
- A shadow map updated only when something moves, on the low tier.

## Not built, on purpose

- Per-stage look clamps.
- Compressing the stages when the chair is tapped.
- Lock/background replay logic: a hidden tab skips to the end of the score instead.
- The ballast-buzz synthesis.
- A manual-clock test harness.
- A second opening voice.
- A door at 27 s.
- Per-speaker handwriting: one hand, varied by implement.

## After implementation: QA and the artistic evaluation

These are workflow steps 5 and 6. `qa-accessibility` tested the build; `cinematic-director` and `creative-director` evaluated the finished opening on real-time phone frames.

**QA found and verified, all fixed:**
- **The voiced line was baked in the frame its voice started.** On slow hardware that delayed the voice past the fixed hand-off. The line is now made in the dark, and the hand-off waits for the voice and its writing (the watchdog still ends the opening by 40 s).
- **Skip was unreadable once the room was lit** (about 1.5:1). It now has dark ink on a soft backdrop.
- **Esc inside settings during the opening** skipped the opening and left focus outside the dialog.
- **Reduced motion never reached the handwriting.**
- **Keys acted in the dark.**
- **A focus ring sat in the frame on phones.**

**The artistic evaluation found the meaning thrown away. Fixed:**
- **The stop was never held.** The laugh began while the hand was still writing "to". Now the writing starts earlier, and the laugh waits until 2 s after the hand has actually stopped. The room draws breath just before it.
- **The room answered the unfinished line at once,** with "I'm not going anywhere.", a faint "stay", and "alone". While "I wanted you to" is unfinished, nothing answers it: no echoes, nothing that contradicts it, no other lines about going or staying. The first three ordinary lines are written on the wall the visitor faces ("We ate cereal for dinner and it was perfect.").
- **Chair-first read as a stage spotlight, and the fixture upstaged the chair.**
  - The cone is wide from the first light (0.7).
  - The panel stays dim (≤ 0.12) until the room arrives.
  - There is no "falter" (it was flicker by another name).
  - In the lit room the pool dissolves (cone 1.0, key × 0.85).
- **The spoken line was written under the cornice and cropped on a phone.** It now has a fixed place to the right of the chair at eye height, in frame.
- **Finishing the line rewarded arriving, not staying, and was talked over.** Coming to the chair is no longer enough: the visitor has to be still there for a while, facing the line. The voice comes from the line itself, and the room then holds 15 s of quiet.
- **Subtitles gave the line away before the wall wrote it.** The caption now follows the writing.
- **Hints came under the spoken line.** They now wait.
- **"[a chair, someone getting up]" explained too much.** It is now "[a chair creaks]".
- **The first writing was in the most assertive hand.** "I wanted you to" is now in pen, not marker. The crayon is grainier.

**Also fixed along the way:**
- The answer to reading picked withheld lines.
- Gestures answering a visitor's words were lost when the room wrote the same line first. Contributions now have their own random stream.
- Accumulation pauses while someone is settled at the chair.

**Not done; for the artist or a later round:**
- A rounder, waxier crayon letterform.
- The portrait pitch is −0.30, as suggested. The ceiling still takes about a sixth of the frame.
- Dashed artefacts at the room's junctions in software-rendered frames. They are probably SwiftShader's soft shadows; check on a device.
- Whether a 2 s held stop and a 23 s phone opening feel right. That needs a person, on a phone, with sound.
