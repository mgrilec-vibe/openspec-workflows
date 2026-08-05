---
name: brainspec-slim-coordinate
description: Runs only after the user explicitly invokes `/brainspec-slim-coordinate`. The driver script resolves members, verifies Proposal checkpoints, classifies relationships, and optionally persists a coordination issue.
allowed-tools: Bash(git:*), Bash(scripts:*)
license: MIT
compatibility: Requires GitHub CLI authentication and proposed BrainSpec issues.
metadata:
  author: openspec
  version: "3.0-brainspec-slim-driver"
---

# BrainSpec Slim Coordinate

Create an optional advisory implementation order for a user-selected set of proposed BrainSpec issues. The driver script owns enforcement; the LLM owns the relationship-evidence call.

## Procedure

```bash
SKILL_DIR="<absolute path to the activated brainspec-slim-coordinate skill directory>"
LOG="/tmp/brainspec-coord-<plan-id>.log"
bash "${SKILL_DIR}/scripts/brainspec-coordinate.sh" \
  --members "<owner>/<repo>#<n>,<owner>/<repo>#<n>,..." \
  [--persist] \
  2>"$LOG"
```

The script resolves each member, asserts the BrainSpec marker and Proposal checkpoint, classifies the relationships, rejects cycles, and (with `--persist`) creates or updates the coordination issue.

## Decision the LLM must own

Relationship evidence. The script accepts the member list. The LLM must not invent `requires` or `serialize-after` from memory; missing evidence is `unknown`, not parallel-safe.

## Output

One JSON line on stdout. `artifact.coordinationId` and `artifact.members` carry the verified values; `artifact.coordinationIssue` is set when `--persist` is given.

## Hard stops (script-enforced)

- Any member lacks the BrainSpec marker or Proposal checkpoint.
- Hard-dependency cycle detected.
- More than one active coordination issue references the same member.
- `gh auth` failure.

## What the LLM MUST NOT do

- Change lifecycle labels, branches, worktrees, or pull requests.
- Run `gh issue` or `gh pr` directly.
- Infer a hard dependency from file overlap alone.
