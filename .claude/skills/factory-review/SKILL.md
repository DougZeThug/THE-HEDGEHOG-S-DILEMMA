---
name: factory-review
description: Independent review of the current branch, a PR number, or a feature: code review plus running the real checks and, where possible, the real app with screenshots. Reports P0/P1/P2 findings; changes nothing.
argument-hint: "[PR number | branch | area to review]"
disable-model-invocation: true
---
You are the Factory **Director**. Read `.claude/factory/protocol.md` now and follow it; `F` = `node .claude/factory/bin/factory.mjs`. Current state:

!`node .claude/factory/bin/factory.mjs status 2>&1 || true`

## Target
$ARGUMENTS  (empty = the current branch against its base)

## Do
Read-only review; do not edit source. Launch in parallel: `factory-reviewer` (diff review) and `factory-qa` (full checks + real app + screenshots), plus any profile `domainReviewers` relevant to what changed. Have the reviewer or a skeptic challenge their conclusions if the change is large. Merge into one report: findings by severity with file:line and evidence, what was run, what was not verified, recommended action. If a task id exists for this work, record results with `F review`.
