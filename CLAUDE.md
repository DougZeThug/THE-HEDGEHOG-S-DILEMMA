# The Hedgehog's Dilemma: notes for Claude Code

An interactive audiovisual installation in the browser (TypeScript, Vite, Three.js, Web Audio). A white room, a small wooden chair, writing on every wall. It grew from a childhood diorama. Read `README.md` for the work and `docs/pacing.md` for how the room answers a visitor.

## Commands

- `npx tsc --noEmit` and `npx vitest run`: run both before every commit.
- `npx vite-node scripts/playtest.ts`: engine playtest of five personas (pacing targets in `tests/pacing.test.ts`).
- `npm run build && npx vite preview --port 4173 &`, then `npm run smoke` or `node tests/playtest/browser.mjs` (phone emulation).
- Voices: `node scripts/generate-dialogue.mjs --dry-run`, audition sheet `node scripts/audition.mjs`.

## Rules that always apply

- The browser never calls ElevenLabs. Recordings are generated offline by the scripts in `scripts/`.
- The API key lives only in the environment or a local secret. Never commit it, print it or put it in reports.
- Spending: always `--dry-run` first. Never buy credits, change plans or enable overage. Ask the artist before any new paid generation beyond what they approved. The scripts check the real balance before each batch.
- Never overwrite a recording the artist approved (`review: approved` in the ledger) without `--regenerate`.
- Never claim a recording sounds convincing without the artist having listened. The audition sheet is where they decide.

## Specialist reviewers

Seven read-only reviewer agents live in `.claude/agents/`:
- `creative-director`
- `cinematic-director`
- `sound-designer`
- `technical-artist`
- `interaction-designer`
- `skeptic`
- `qa-accessibility`

They share one protocol, `docs/review-protocol.md`, which sets the evidence rules, the P0/P1/P2 severities and the report format. How to call them is in `docs/agents.md`.

**For significant changes** (anything that changes what a visitor sees, hears or does in a way they'd notice):
1. The relevant specialists review the proposed approach.
2. The `skeptic` challenges their conclusions.
3. The main session reconciles conflicts, decides and records why.
4. The main session implements. Reviewers never edit.
5. `qa-accessibility` tests the result.
6. The relevant artistic specialists evaluate the finished experience.

Keep it proportionate:
- No review for trivial changes.
- One specialist for a change inside their discipline.
- All seven only when the overall experience changes substantially.

Don't run reviews that can't produce actionable findings, and don't ask for approval rituals.

## AI software factory

`/factory-build`, `/factory-fix`, `/factory-review`, `/factory-polish`, `/factory-status`, `/factory-maintain` run a plan, build, verify, review, repair, deliver pipeline. Procedure: `.claude/factory/protocol.md`. This project's commands, protected assets and reviewers: `.factory/profile.json`. Task records and evidence: `.factory/tasks/`. Handbook: `factory/README.md`. The factory is additive: for visitor-visible changes the seven specialist reviewers above still apply (listed in the profile). Guard hook and permissions (`.claude/hooks/factory-guard.mjs`, `.claude/settings.json`) are protected; do not edit them to get past a block.
