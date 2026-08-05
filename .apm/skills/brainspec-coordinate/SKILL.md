---
name: brainspec-coordinate
description: Orders proposed BrainSpec issues, identifies safe parallel work and useful predecessors, and optionally persists one advisory GitHub coordination issue. Use for sequencing multiple BrainSpec increments; do not propose, implement, or archive them.
allowed-tools: Bash(git:*), Bash(gh:*)
license: MIT
compatibility: Requires Git, authenticated GitHub CLI, and proposed BrainSpec issues.
metadata:
  author: openspec
  version: "1.0-brainspec"
---

# BrainSpec Coordinate

Create an optional advisory implementation order for a user-selected set of proposed BrainSpec issues.

## Process

1. Resolve only the issues, milestone, or existing coordination plan named by the user.
2. Resolve each member as `<owner>/<repo>#<number>`. Require one BrainSpec marker and Proposal checkpoint, and verify its Proposal commit belongs to the recorded lifecycle PR and contains its planning artifacts.
3. Read each proposal's affected systems, expected paths, shared contracts, dependencies, conflicts, and sequencing benefits from its issue and planning artifacts.
4. Classify evidence-backed relationships:
   - `requires #N`: cannot implement safely before #N merges;
   - `prefer-after #N`: can proceed, but #N first should reduce rework;
   - `serialize-after #N`: must not run concurrently and should follow #N;
   - `parallel-safe #N`: verified safe in the same wave.
5. Treat missing evidence as unknown, not parallel-safe. Ask the user before recording `requires` or `serialize-after`.
6. Reject hard-dependency cycles, then produce waves that satisfy `requires`, separate conflicts, prefer useful predecessors, and group only verified parallel-safe issues.
7. Present the plan without writing anything.
8. Persist only when the user explicitly asks.

## Persistence

Search open and closed issues for the exact repository-qualified coordination marker before creation. Zero matches permits creation, one match is updated or resumed, and multiple matches stop. After any create response, search again and continue only with exactly one issue.

Create or update that issue with a normal `coordination` label and this owned block:

```md
<!-- brainspec:coordination-id=<plan-id> -->
<!-- brainspec:coordination:start -->
# Coordination: <plan-id>

## Members
- <owner>/<repo>#<issue> — proposal `<commit>`; impact `<sha256>`

## Relationships
- #<issue> requires #<issue> — <evidence>
- #<issue> prefer-after #<issue> — <evidence>
- #<issue> serialize-after #<issue> — <evidence>
- #<issue> parallel-safe #<issue> — <evidence>

## Waves
1. #<issue>, #<issue>
2. #<issue>

## Unknowns
- <unresolved relationship>
<!-- brainspec:coordination:end -->
```

The coordination issue is canonical. Do not duplicate relationships into lifecycle issues. Preserve text outside the owned block. Read body, labels, and `updatedAt`, re-read immediately before mutation, abort on change, then write once and read the result back.

## Refresh

Hash each normalized coordination-impact summary and persist the digest beside its Proposal commit. The plan becomes stale when either value changes. Recompute before relying on stale ordering or parallel-safety claims.

## Guardrails

- Advisory only: never block or advance a BrainSpec lifecycle stage.
- Never change lifecycle labels, branches, worktrees, pull requests, or planning artifacts.
- Never infer a hard dependency from file overlap alone.
- Multiple active coordination issues containing the same member are ambiguous; stop and ask.

## Output

Report members, Proposal snapshots, relationships with evidence, implementation waves, unknowns, and the coordination issue URL when persisted.
