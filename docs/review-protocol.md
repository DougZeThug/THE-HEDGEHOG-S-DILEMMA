# Review protocol for the specialist agents

Every reviewer in `.claude/agents/` follows this protocol. The main Claude Code session coordinates the reviewers, reconciles what they say, implements changes and runs the tests. Reviewers advise; they never edit the project.

## Ground rules

- **Read-only.** Do not edit, create, move or delete project files. Do not commit. Commands that write may write only to `test-output/` (gitignored) or the session scratchpad: screenshots, logs, measurements.
- **No paid calls.** Never call ElevenLabs or any other paid API. Use the recordings, the ledgers (`scripts/dialogue-ledger.json`, `scripts/voice-design-ledger.json`) and the offline analysis scripts.
- **No credentials.** Never print, copy or ask for API keys.
- **Challenge rather than approve.** The implementation is not presumed right. If something is weak, say so and say what you would do instead. A review that only agrees has failed. Don't restate what works unless doing so protects it from a bad change.
- **Evidence before verdict.** Every finding cites evidence: a file and line, a screenshot path, a measured number, a test or harness output, a transcript, or a quoted line of authored content. Label each finding with a confidence:
  - **verified**: reproduced or measured;
  - **likely**: strong inference from code or data;
  - **speculative**: a judgement or hypothesis that needs a person or a real device.
- **Know your limits.** Agents cannot hear audio, and software rendering here runs at about 10 fps. Say what you could not assess and who could (the artist listening, a real phone).
- **Stay in scope.** Review your own discipline. Name anything another reviewer should look at, rather than reviewing it shallowly yourself.
- **Be proportionate.** Only actionable findings. No ceremonial approval, no padding, no repeating the brief back.

## Severity

| | Meaning |
|---|---|
| **P0** | Broken functionality, a crash, data or credential risk, an accessibility blocker, or a major artistic failure: the work fails at what it is for in a way most visitors would meet. |
| **P1** | A significant improvement to emotional impact, experience quality, usability or robustness. |
| **P2** | Polish and optional enhancements. |

## Useful evidence tools (all offline)

- `npx vitest run`: unit tests. `npx tsc --noEmit`: typecheck.
- `npx vite-node scripts/playtest.ts`: five scripted personas through the real Director; reports first response, gaps, density and voices at 15/30/60/90/180 s. Personas are in `tests/playtest/personas.ts`.
- `npm run build && npx vite preview --port <free port> &`, then:
  - `BASE=http://localhost:<port>/ node tests/smoke.mjs`: full desktop visit with screenshots in `test-output/`;
  - `BASE=… PERSONA=still|phone SECONDS=60 node tests/playtest/browser.mjs`: a real-time run with a phone viewport and touch.

  Use a port other than 4173 if another reviewer may be running one. Stop your server when done.
- `?debug&seed=N` in the URL shows the inspector. `window.__hedgehog` is the App instance, for read-only inspection from Playwright.
- `node -e "import('./scripts/voice-analysis.mjs').then(m => console.log(m.analyse('public/voices/dialogue/<file>.mp3', <words>)))"` measures pitch range, pauses, voicing, dynamics and ending contour. These show that takes *differ*, not that they convince.
- `docs/pacing.md`, `docs/playtest/*.md`, `README.md`: the design intent and the before/after measurements.
- The audition sheet's decisions (the artist's ears) are in the ledgers' `review` fields: `approved` means the artist kept the take.

## Report format

Return exactly this structure (Markdown):

```
## <Role> review: <scope reviewed>

**Verdict.** Two or three sentences: does this part of the work succeed, and the single most important thing to change.

**Findings**
1. [P0|P1|P2] [verified|likely|speculative] <title>
   - Where: <file:line, screen, moment in the visit>
   - Evidence: <what you saw or measured>
   - Why it matters: <effect on the visitor or the work>
   - Recommendation: <a concrete change; name the files; estimate the effort S/M/L>
2. …

**Remove or simplify.** Systems, features or effects that should go or shrink, and why.

**Could not assess.** What needs a human ear, eye or a real device, and how to check it.

**For other reviewers.** Questions or conflicts to hand to a named specialist (or to the Skeptic).
```

Keep it to the most important 4–10 findings, ranked.

## The workflow for significant changes

1. The relevant specialists review the proposed approach before implementation.
2. The Skeptic challenges their conclusions.
3. The main session reconciles conflicts and decides, recording why.
4. The main session implements.
5. QA / Accessibility tests the result.
6. The relevant artistic specialists evaluate the finished experience.

A trivial change gets no review, or one specialist. Run all seven only when the overall experience changes substantially.
