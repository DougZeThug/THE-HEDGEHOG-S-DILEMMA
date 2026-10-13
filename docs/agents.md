# Using the specialist reviewers

Seven reviewer agents are defined in `.claude/agents/`. They load automatically in any Claude Code session started in this repository: in the terminal, the desktop app, the IDE extensions or claude.ai/code. Run `/agents` to list them. All are **read-only**. They read code, run tests and the playtest harness, and take screenshots into `test-output/`, but never edit the project or call paid APIs. The main session decides and implements.

| Agent | Ask it about |
|---|---|
| `creative-director` | meaning, emotional truth, restraint, originality, fidelity to the childhood diorama, the writing and voice direction |
| `cinematic-director` | the opening, framing, light, transitions, dramatic rhythm, image and sound together |
| `sound-designer` | voice direction and delivery, music, effects, spatial audio, mix, silence, speech synced with handwriting |
| `technical-artist` | handwriting animation, ink on plaster, materials, the chair, lighting, legibility, GPU and bundle performance |
| `interaction-designer` | mobile and desktop input, discoverability, responsiveness, pacing, unproductive waiting |
| `skeptic` | overengineering, superficial emotion, technical demonstration, and challenging the other reviewers |
| `qa-accessibility` | runtime defects, mobile compatibility, accessibility, audio sync, regressions, the test suite |

Shared rules, severities (P0/P1/P2) and the report format: `docs/review-protocol.md`.

## Calling one reviewer

Say it in plain words in any session:

- "Ask the sound-designer to review the mix after my change to `Voices.ts`."
- "Use the interaction-designer agent to check the first 30 seconds on a phone."
- "Have the skeptic challenge this plan before we build it."
- "Get qa-accessibility to test the branch."

You can also type `@` and pick the agent, where your client supports it.

## A full multidisciplinary review

"Run a full review with all seven specialist agents, then synthesise a P0/P1/P2 plan."

The main session then:
1. gathers shared evidence once (build, browser runs, screenshots, harness numbers) so the reviewers work from the same material;
2. runs the six specialists in parallel, independently;
3. gives their reports to the `skeptic`;
4. reconciles the conflicts and writes one prioritised plan, saying for each disagreement who was followed and why;
5. implements only what it decides to, and asks before any paid regeneration;
6. has `qa-accessibility` verify, and the relevant artistic reviewers look at the result.

## When to use which

- **Trivial change** (a typo, a constant, a test): no review.
- **Inside one discipline** (a voice's level, a hand's stroke speed): that specialist, plus `qa-accessibility` if it touches runtime behaviour.
- **Significant change** (a new phase, a new opening, new interactions, re-casting voices): the relevant specialists, then `skeptic`, then implementation, then `qa-accessibility`, then the specialists on the result.
- **The whole experience**: all seven.

## Changing an agent

Each agent is a Markdown file with YAML frontmatter (`name`, `description`, `tools`). Edit its mission, criteria or the files it reviews as the work changes. The `description` decides when Claude reaches for it automatically, so keep it accurate. Keep `tools` to `Read, Grep, Glob, Bash`: Bash lets a reviewer run tests and capture screenshots, and the protocol forbids it from editing the project.
