# The software factory (handbook)

A software team that lives inside Claude Code. You describe what you want; it plans, builds, tests, reviews, repairs and hands you a pull request with a plain-English report. It uses only native Claude Code features (skills, subagents, hooks, permission rules); there is no other orchestration platform.

## Use it

Type one of these in Claude Code, in this repository:

| You type | What happens |
|---|---|
| `/factory-build add a dark-mode toggle to the settings page` | plan, build, verify, independent review, repair, PR + report |
| `/factory-fix the playoff bracket shows team 3 twice in round 2` | reproduce first, root cause, fix + regression test, verify, review |
| `/factory-review PR 12` | read-only review: code, real checks, real app, P0/P1/P2 findings |
| `/factory-polish the character creator on a phone` | before/after screenshots, small fixes, no redesign |
| `/factory-status` | what is active, ready for you, failed or blocked, and what to do next |
| `/factory-maintain deps security` | audit, then one small fix PR per real finding |

You only decide: product questions it cannot answer for itself, and whether to approve the PR. Merging and deploying stay with you.

## What is in it

| Piece | Where |
|---|---|
| Procedure the Director follows | `.claude/factory/protocol.md` |
| 6 skills (the commands above) | `.claude/skills/factory-*/` |
| 6 agents: architect, builder, ui, qa, repair, reviewer | `.claude/agents/factory-*.md` (the 7 art-installation specialists stay and are named in the profile) |
| Facts and gates: tasks, verification runs, repair budget, ready gate | `.claude/factory/bin/factory.mjs` (`node ... status`) |
| Hard boundaries | `.claude/hooks/factory-guard.mjs`, `.claude/settings.json` |
| This project's commands, protected assets, reviewers, limits | `.factory/profile.json` |
| Task records, evidence, reports | `.factory/tasks/<id>/` (`task.json`, `plan.md`, `report.md`, `evidence/`) |
| Known issues | `.factory/known-issues.md` |

## Boundaries and how they are enforced

| Rule | Mechanism |
|---|---|
| No push/merge/commit on a production branch; no force pushes | guard hook + `permissions.deny` + (you must add) GitHub branch protection |
| No deploys, publishes, hosted-database commands, migrations | guard hook + `permissions.deny` (incl. Supabase, Vercel, GitHub merge MCP tools) |
| No credentials committed | guard scans the staged diff on every `git commit` and the content of every Edit/Write; `.env*` unreadable and unwritable |
| No changes to approved assets (`protectedPaths` in the profile) | guard blocks Edit/Write and obvious shell writes |
| Agents cannot loosen the guard | `.claude/hooks/**`, `.claude/settings*.json`, `.claude/factory/bin/**` are deny-listed for Edit |
| No paid generation | profile `forbiddenCommands` + denied ElevenLabs generation tools |
| Incomplete work cannot be marked ready | `factory set <id> ready` refuses without a passing full verification on the current commit, an independent review with no P0/P1, and acceptance criteria |
| Repair loops are bounded | 3 attempts per task, escalate earlier if the same failure repeats (`repair-check`) |
| One active feature at a time | `maxConcurrentTasks` in the profile, enforced by `factory start`; CI queue uses a single concurrency group |

Honest limits: Bash text matching is best-effort (an agent could phrase a write the patterns miss), and it sometimes over-blocks quoted words. Rules in `settings.json` and branch protection are the other layers. To change the guard yourself, edit it outside a Claude session (or with `FACTORY_ALLOW_PROTECTED=1` for path rules).

## Verified vs. not yet verified

| Capability | State | Evidence |
|---|---|---|
| Guard blocks protected pushes, deploys, migrations, secrets, protected paths; allows normal work | **Verified** | 10 automated tests; live in this session it blocked a staged fake key, a settings edit and an out-of-repo write |
| Task state machine, concurrency ceiling, failing verify, repair budget/escalation, ready gate | **Verified** | tests + real run `T20261030-guard-the-agent-definitions-with` (gate refused before review, passed after) |
| Skills are discovered; agents load and obey their tool limits | **Verified** (headless, `claude -p`) | skill resolved and refuses model self-invocation by design; reviewer agent described its role and tools correctly |
| End-to-end run: architect, builder, QA checks, reviewer FAIL, repair, reviewer PASS | **Verified** (agents run as separate headless processes) | `.factory/tasks/T20261030-*/` |
| Installer into another repo | **Verified** on a scratch repo (merges existing settings, idempotent, its tests pass there) | – |
| `git worktree` isolation for parallel builders | **Verified** (mechanism only) | worktree created, CLI works in it, main checkout untouched; no parallel build run yet |
| Slash commands run interactively (`/factory-build` etc.) | **Not tested**: this session cannot hot-load new skills/agents; start a fresh session and try `/factory-status` first |
| Subagent `isolation: worktree` frontmatter | Documented, **not tested** |
| Guard hook firing for subagent tool calls | **Not tested** (hook payload carries `agent_id` per docs) |
| GitHub issue queue, CI repair, weekly maintenance workflows | **Written, inert, untested** (`factory/templates/github/`) |
| Browser/screenshot QA through `factory-ui`/`factory-qa` | **Not exercised** (the proof task had no visual change); Playwright is present and the repo's smoke scripts exist |
| Agent teams | Experimental and off by default; **not used** |

## Unattended operation (opt-in, nothing is switched on)

1. **Issue queue**: copy `factory/templates/github/factory-issue.yml` (or `node factory/install.mjs . --with-github`) to `.github/workflows/`. Then three steps only you can do: install the Claude GitHub App on the repo, add the secret `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`), and set repository variable `FACTORY_ENABLED=true`. Label an issue `factory` and one run starts (queue of one); it opens a PR and comments the summary. Test with a throwaway issue first.
2. **CI repair**: `factory-ci-repair.yml`, variable `FACTORY_CI_REPAIR=true`. In claude.ai/code sessions, subscribing the session to the PR does the same natively.
3. **Weekly maintenance**: `factory-maintain.yml` (variable `FACTORY_MAINTAIN=true`) or a claude.ai scheduled task running `/factory-maintain deps security`. Recurring paid work; I did not create any schedule.
4. **Branch protection (do this first)**: GitHub, Settings, Branches: require a pull request and the `check` CI job on your default branch. This is the real lock on "no merging without me".
5. Headless runs need the workspace trusted once (open Claude Code in the repo and accept the prompt); otherwise project allow rules are ignored.

## Cost

Measured, proof task (small test-only change): **about $0.58** of headless agent usage across 7 agent runs (2 of them stalled on permissions and cost little), roughly 510k tokens, 10 minutes, 0 human interventions, 1 repair. The Director session on top is billed to your plan. Estimates: small fix $0.50-2, normal feature $2-8, large $8-25. Workflows cap spending with `--max-budget-usd` (10/5/6). Subscription use through the app counts against plan limits instead of API dollars.

## Install in another app

```bash
node factory/install.mjs /path/to/FloorForge --profile floorforge --with-github
```

Copies agents, skills, hook, protocol, CLI and tests; merges (never overwrites) `.claude/settings.json`; writes `.factory/profile.json` from `factory/templates/profiles/` unless one exists; adds a short pointer to CLAUDE.md. Profiles for `floorforge`, `717rec`, `nothing-strange-here` and `generic` are starting points with **assumed** paths: have the factory check them (`/factory-review the factory profile`) and fix commands, `protectedPaths` and `productionBranches`. Then `node --test .claude/factory/test/`.

Rule of thumb: anything generic lives in `.claude/` (copied as is); anything about one app lives only in `.factory/profile.json`, its CLAUDE.md and its own agents.

## Next big step for autonomy

Per-app **visual and data safety nets**, built by the factory itself on first use: FloorForge layer-alignment and screenshot baselines, 717REC standings/bracket fixtures, Nothing Strange Here NPC-navigation simulation. With those, QA can prove more without you looking. After that, the issue queue.
