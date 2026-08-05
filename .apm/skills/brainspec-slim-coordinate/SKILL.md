---
name: brainspec-slim-coordinate
description: Slim variant of `/brainspec-coordinate` that delegates procedural content to `scripts/brainspec-coordinate.sh` in this skill's directory. Preserves the externally visible BrainSpec lifecycle contract. Use this for token-constrained sessions; use the full `brainspec-coordinate` skill for the canonical reference.
allowed-tools: Bash(git:*), Bash(gh:*), Bash(scripts:*)
license: MIT
compatibility: Requires Git, authenticated GitHub CLI, and proposed BrainSpec issues.
metadata:
  author: openspec
  version: "1.0-brainspec-slim"
---

# BrainSpec Slim Coordinate

Create an optional advisory implementation order for a user-selected
set of proposed BrainSpec issues. Slim variant: the procedural
content lives in `scripts/brainspec-coordinate.sh`.

## Procedure (delegated)

Run the procedure script; it owns the candidate resolution
(`<owner>/<repo>#<number>`), the per-member Proposal verification
(checkpoint, commit, planning paths), the relationship
classification rules, the cycle rejection logic, the wave
construction, and the optional coordination-issue persistence.

Resolve the activated skill's directory to an absolute path, then run
its co-located procedure script:

```bash
SKILL_DIR="<resolved-absolute-path-to-activated-brainspec-slim-coordinate-skill>"
bash "$SKILL_DIR/scripts/brainspec-coordinate.sh" "<issue-list-or-milestone>"
```

The script prints a waves summary, the classified relationships, the
unknowns, and (when persistence is requested) the coordination issue
URL. Do not invent relationship classifications from memory.

## Hard stops

- A referenced issue lacks the BrainSpec marker, the Proposal
  checkpoint, or the verified Proposal commit.
- A hard-dependency cycle is detected.
- More than one active coordination issue references the same
  member.
- Repository authentication or capability preflight fails.

## Guardrails

- Treat missing evidence as unknown, not parallel-safe. Ask the user
  before recording `requires` or `serialize-after`.
- The plan is advisory only. Never block or advance a BrainSpec
  lifecycle stage.
- Never change lifecycle labels, branches, worktrees, pull requests,
  or planning artifacts.
- Never infer a hard dependency from file overlap alone.
- The coordination issue is canonical. Do not duplicate
  relationships into lifecycle issues. Preserve text outside the
  owned block.

## Output

Report members, Proposal snapshots, relationships with evidence,
implementation waves, unknowns, and the coordination issue URL when
persisted.
