---
name: brainspec-slim-archive
description: Runs only after the user explicitly invokes `/brainspec-slim-archive`. The driver script owns the merge gate, the ordered PR-ready transition, and the archive move.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(scripts:*)
license: MIT
compatibility: Requires OpenSpec CLI, Git, GitHub CLI authentication, and a verified BrainSpec lifecycle PR.
metadata:
  author: openspec
  version: "3.0-brainspec-slim-driver"
---

# BrainSpec Slim Archive

Archive a completed change in the experimental workflow. The driver script owns the merge gate; the LLM owns the spec-sync decision.

## Invocation boundary (HARD)

- Run only when the user explicitly invokes `/brainspec-slim-archive <id>`.
- An `archiving` label, completed Apply checkpoint, prior handoff, or "continue" is NOT authorization.
- Never invoke Apply from this stage.
- At completion, report the JSON line and stop. The script performs the merge.

## Decision the LLM must own

Spec sync: pass `--sync yes` to apply canonical-spec diffs from the change, or `--sync no` to archive without rewriting the canonical spec. The script refuses if the decision is missing.

## Command

```bash
SKILL_DIR="<absolute path to the activated brainspec-slim-archive skill directory>"
LOG="/tmp/brainspec-archive-<id>.log"
bash "${SKILL_DIR}/scripts/brainspec-archive.sh" \
  --increment "<id>" \
  --sync yes|no \
  2>"$LOG"
```

The script performs the ordered transition in a crash-resumable sequence (state sidecar in `.brainspec/<id>.state`):

1. `gh pr edit --body-file` with `Closes #<n>` (does NOT undraft).
2. `gh pr ready`.
3. Move the change once, commit, push.
4. `gh pr merge --squash --delete-branch=false`.

The LLM must not run any of these steps directly. If the script returns `state: refused`, halt and report the reason.

## Output

One JSON line on stdout with `state: merged | refused`. `artifact.pullRequest`, `artifact.archivePath`, `artifact.specSync` carry the verified values.

## Hard stops (script-enforced)

- Metadata missing or wrong schema.
- PR is already merged, not at the verified head, or not the lifecycle PR.
- Marker not on an open issue.
- `gh auth` failure.
- Spec sync indicated `yes` but canonical-spec diff is non-empty after sync.

## What the LLM MUST NOT do

- Run `gh pr edit`, `gh pr ready`, `gh pr merge` directly.
- Force-push the archive commit.
- Open a second branch or worktree.
