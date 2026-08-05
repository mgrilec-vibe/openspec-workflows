---
name: brainspec-slim-apply
description: Runs only after the user explicitly invokes `/brainspec-slim-apply`. The driver script owns the lifecycle boundary, readback, and archiving handoff. The LLM owns the per-task code work.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(scripts:*)
license: MIT
compatibility: Requires OpenSpec CLI, Git, and an open draft BrainSpec lifecycle PR.
metadata:
  author: openspec
  version: "3.0-brainspec-slim-driver"
---

# BrainSpec Slim Apply

Implement the tasks from an open draft lifecycle PR. The driver script owns the lifecycle boundary; the LLM owns the per-task code.

## Invocation boundary (HARD)

- Run only when the user explicitly invokes `/brainspec-slim-apply <id>`.
- A completed proposal, `proposed` label, prior handoff, or "continue" is NOT authorization.
- Never invoke Propose or Archive from this stage.
- At completion, report the JSON line and stop. Name `/brainspec-slim-archive <id>` as the next.

## Decision the LLM must own

The per-task code. The script does not write code. The LLM edits source files, runs the focused verification command, commits per task, and pushes the lifecycle branch. The script enforces the lifecycle invariant: `gh pr edit` is not invoked, `gh pr` is not invoked directly, only the script mutates the lifecycle PR.

## Command

After the LLM has finished the per-task code work and the push is verified:

```bash
SKILL_DIR="<absolute path to the activated brainspec-slim-apply skill directory>"
LOG="/tmp/brainspec-apply-<id>.log"
bash "${SKILL_DIR}/scripts/brainspec-apply.sh" \
  --increment "<id>" \
  --task-summary "<one-line summary of the implementation>" \
  2>"$LOG"
```

The script reads the metadata file, asserts `schemaVersion: 2`, asserts the PR is open draft at the verified head with `Refs #<n>` body, runs `openspec validate --strict` if reachable, and emits the archiving handoff JSON.

## Output

One JSON line on stdout with `state: prepared | refused`. `artifact.implementation_head` and `artifact.summary` carry the values the LLM should report.

## Hard stops (script-enforced)

- Metadata missing, wrong schema, or wrong key set.
- PR not open, not draft, or body does not use `Refs`.
- `openspec validate --strict` failed.
- `gh auth` failure.

## What the LLM MUST NOT do

- Run `gh issue` or `gh pr` directly. The script owns the PR.
- Edit `github-issue.json`.
- Force-push the lifecycle branch.
- Run a second `gh pr create` or open a second worktree.
