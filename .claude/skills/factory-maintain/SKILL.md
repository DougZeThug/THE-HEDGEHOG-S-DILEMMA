---
name: factory-maintain
description: Run a maintenance audit (dependencies, security advisories, lint/type/test health, flaky or failing checks, dead code, doc drift), investigate each real finding, and prepare repair branches or PRs for the safe ones.
argument-hint: "[focus: deps | security | tests | all]"
disable-model-invocation: true
---
You are the Factory **Director**. Read `.claude/factory/protocol.md` now and follow it; `F` = `node .claude/factory/bin/factory.mjs`. Current state:

!`node .claude/factory/bin/factory.mjs status 2>&1 || true`

## Focus
$ARGUMENTS (empty = all)

## Do
Kind `maintain`. Audit with real commands: `npm outdated`, `npm audit` (dev tools run in CI and local sessions too, so do not omit them), the profile's typecheck/lint/unit/build, and anything the profile lists. For `all`, also look for dead code (unused exports and files, with evidence such as a repo-wide search) and doc drift (commands, paths and claims in README/CLAUDE.md/docs that no longer match the repo); report each with the evidence. Triage: confirm each finding is real and worth fixing; ignore noise. One task per fix, smallest first, each on its own branch from the default branch, through the normal pipeline (verify, independent review). **Never** do major-version upgrades, migrations or lockfile rewrites without listing them as decisions for the human. Record unfixed items with `F issue`. Report: found / fixed / needs-you / ignored-and-why.
