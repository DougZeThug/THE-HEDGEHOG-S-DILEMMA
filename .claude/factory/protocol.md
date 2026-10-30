# Factory protocol (portable; project specifics live in `.factory/profile.json`)

The **Director** is the main Claude Code session running a `/factory-*` skill. It delegates detail to subagents and owns the task record. Subagents report; the Director decides. Facts (what ran, what passed, how many tries) live in `.factory/tasks/<id>/task.json`, written only through `node .claude/factory/bin/factory.mjs` (`F` below).

## Team (start small; add only when justified)
| Agent | Role | Edits? |
|---|---|---|
| `factory-architect` | investigate, plan, acceptance criteria, task split | no |
| `factory-builder` | implement + tests | yes |
| `factory-ui` | interface work + browser checks at desktop/phone | yes |
| `factory-qa` | independent proof: full checks, real app, screenshots | no |
| `factory-repair` | one bounded fix attempt per failure | yes |
| `factory-reviewer` | challenge plans, review diffs | no |
| profile `domainReviewers` | project specialists (e.g. sound, security) | no |

Right-size: a trivial change (typo, constant, one-line fix) = Director edits, `F verify`, done (risk `trivial`). Small = builder -> verify -> reviewer. Large or risky = architect -> reviewer challenges plan -> build -> QA -> review. Never six agents for a one-line change.

## Pipeline
1. **Intake.** `F status` first (resume anything interrupted; inspect the repo, not memory of it). Read CLAUDE.md, `.factory/profile.json`, `.factory/known-issues.md`. Ask the human only if a missing *product* decision changes the outcome; otherwise state assumptions and proceed.
2. **Plan.** `F new "<title>" --kind <k> --risk <trivial|normal|high>`; get the architect's plan; `F accept <id> "<criterion>" ...`. For large/risky work, `factory-reviewer` challenges the plan before building. Write the approved plan to `.factory/tasks/<id>/plan.md` (<= 40 lines).
3. **Branch.** Work on a feature branch (never a production branch). `F start <id>` (enforces the concurrency ceiling).
4. **Build.** Delegate to builder/ui. Parallel builders only for disjoint files with `isolation: worktree`; shared interfaces change first, sequentially. Merge worktree results yourself and re-verify.
5. **Verify.** `F verify <id> --tier quick` while iterating, `--tier full` before review. For visitor-visible work, `factory-qa` also drives the real app and saves screenshots.
6. **Repair (bounded).** On failure: `F repair-check <id>`. `PROCEED` -> one `factory-repair` attempt (give it the log path and the earlier attempts), then verify again. `ESCALATE` (budget or the same failure twice) -> stop, status `escalated`, report evidence and your best hypothesis. Never retry the same fix; never weaken a check.
7. **Review.** Commit everything first. An agent that did not write the code reviews it (`factory-reviewer`, plus profile domain reviewers when the change is visitor-visible or touches their discipline). Record: `F review <id> --reviewer <agent> --verdict pass|fail --p0 N --p1 N --p2 N`. Fix P0/P1 (back to step 5); re-review on the new commit. Skeptic-style challenge of reviewers' conclusions for large changes.
8. **Ready gate.** `F set <id> ready` refuses unless: the full tier passed on the current commit with a clean tree, an independent review of that commit has no open P0/P1, and acceptance criteria exist. Do not work around a refusal; fix the cause.
9. **Deliver.** Push the feature branch, open a PR (template if present), write `.factory/tasks/<id>/report.md` (see report format), commit it, record usage (`F usage`), `F metrics <id>`. Never merge, deploy, run production migrations or touch live data: say what the human must approve.

## Report format (<= 1 page, plain English, for a non-technical creative director)
Outcome in one sentence; what changed (user-visible terms); evidence (tests: counts, screenshots with paths, what was *observed*); what is NOT verified; decisions needing the human; recommended next action; metrics (interventions, minutes, repairs, runs).

## Rules
- Reuse existing systems; the smallest change that satisfies the request.
- Never claim success you did not observe. "Configured" is not "tested".
- Never weaken, skip or delete tests to get green. Never alter guards (`.claude/hooks`, `.claude/settings*.json`) to get past a block; report the block instead.
- Hard boundaries (enforced by hook + permissions + branch protection): no production-branch pushes or merges, no deploys, no production migrations or live data changes, no credentials in code, no deleting approved assets (profile `protectedPaths`), no paid APIs unless the project's rules say a human approved.
- Record durable lessons: unresolved bugs and limitations -> `F issue "<text>"`; stable project conventions -> the repo's CLAUDE.md (one line, only if it will save future explanation).
- Keep context small: agents get the task id, the criteria and file pointers, not pasted transcripts.
