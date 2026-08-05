---
name: brainspec-slim-propose
description: Runs only after the user explicitly invokes `/brainspec-slim-propose`. The driver script validates the explore marker, the proposal commit, and the lifecycle PR. Marker, PR linkage, schema, and strict validation are script-enforced.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(scripts:*)
license: MIT
compatibility: Requires OpenSpec CLI, Git, GitHub CLI authentication, and an open ready BrainSpec exploration issue.
metadata:
  author: openspec
  version: "3.0-brainspec-slim-driver"
---

# BrainSpec Slim Propose

Propose a new change and generate every required planning artifact. The driver script owns the lifecycle contract; this skill carries only the LLM-owned commands.

## Invocation boundary (HARD)

- Run only when the user explicitly invokes `/brainspec-slim-propose <id>`.
- Exploration readiness, an `explore` label, prior handoff, or "continue" is NOT authorization.
- Never invoke Apply or Archive from this stage.
- At completion, report the JSON line and stop. Name `/brainspec-slim-apply <id>` as the next.

## Decision the LLM must own

None. The increment id is supplied by the user; the script derives the marker from it. The LLM runs the imperative commands the script logs to its log file.

## Command

```bash
SKILL_DIR="<absolute path to the activated brainspec-slim-propose skill directory>"
LOG="/tmp/brainspec-propose-<id>.log"
bash "${SKILL_DIR}/scripts/brainspec-propose.sh" \
  --increment "<id>" \
  2>"$LOG"
```

The driver signals `state: prepared` once the exploration issue is verified. The LLM then executes the imperative command sequence the script logs to `$LOG` (worktree add, openspec new change, validate, commit, push, gh pr create --draft, write github-issue.json, commit metadata, push). Use `Bash(openspec:*)`, `Bash(git:*)`, `Bash(gh:*)` for those steps only.

## Output

One JSON line on stdout with `state: prepared | refused`. On `refused`, halt and report the reason.

## Hard stops (script-enforced)

- No open exploration issue with the marker.
- Marker on multiple issues.
- `gh auth` failure or actor lacks push.
- Missing `--increment`.

The shape of the GitHub change (branch = `<id>`, marker = `<!-- brainspec:increment-id=<id> -->`, PR uses `Refs #<n>`, metadata schema v2) is the script's concern, not the LLM's.
