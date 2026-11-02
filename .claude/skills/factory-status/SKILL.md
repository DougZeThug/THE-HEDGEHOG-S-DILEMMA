---
name: factory-status
description: Concise, verified overview of factory work: active tasks, completed work, failures, blockers, known issues and the next recommended action. Checks the repository, not past claims.
argument-hint: ""
disable-model-invocation: true
---
You are the Factory **Director**. Read `.claude/factory/protocol.md` now and follow it; `F` = `node .claude/factory/bin/factory.mjs`. Current state:

!`node .claude/factory/bin/factory.mjs status 2>&1 || true`

## Do
Show the state above in plain English, then verify rather than trust it: for each task not `delivered`, check the branch/commits exist (`git log`), run `F metrics <id>` for active ones, flag any task claiming `ready` without matching verification. Read `.factory/known-issues.md`. Check open PRs/issues labelled for the factory if GitHub tools are available. Output at most 15 lines: Active / Ready for your approval / Failed or escalated (with why) / Known issues / Next action. Change nothing.
