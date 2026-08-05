#!/usr/bin/env bash
# brainspec-propose.sh
#
# The procedure script for /brainspec-propose. Emits the structured
# directives an OMP agent must follow to create the planning set,
# metadata, and one draft lifecycle pull request. The agent runs
# these via Bash(openspec:*), Bash(git:*), Bash(gh:*) and reads the
# result back.
#
# This script does not mutate Git or GitHub. It prints the canonical
# state and the imperative commands; the agent executes them. The
# full marker templates, the proposal-checkpoint boundary, the
# metadata schema, and the strict-validation rules live here so the
# skill prompt can stay small.

set -euo pipefail

INC="${1:-}"
if [[ -z "$INC" ]]; then
  echo "state: error: missing increment-id" >&2
  exit 2
fi

# Unquoted heredoc: ${INC} interpolates; only the literal ${branch}
# placeholder is escaped.
cat <<EOF
state: prepared
marker: <!-- brainspec:increment-id=${INC} -->
lifecycle-branch: ${INC}
worktree: <parent-of-primary-worktree>/<repo>-${INC}
base: origin/<default-branch>@<fetched-tip-sha>
artifact-set:
  - openspec/changes/${INC}/proposal.md
  - openspec/changes/${INC}/specs/<capability>/spec.md
  - openspec/changes/${INC}/design.md
  - openspec/changes/${INC}/tasks.md
  - openspec/changes/${INC}/github-issue.json
planning-commit: docs(openspec): propose ${INC}
metadata-commit: docs(brainspec): record lifecycle metadata for ${INC}
metadata-schema:
  schemaVersion: 2
  incrementId: ${INC}
  issue: <canonical issue url>
  pullRequest: <lifecycle pr url>
  branch: ${INC}
  worktree: <absolute deterministic sibling path>
  base: <immutable fetched default-branch sha>
issue-marker: <!-- brainspec:increment-id=${INC} -->
proposal-checkpoint-template: |
  <!-- brainspec:proposal:start -->
  ## Proposal checkpoint
  - OpenSpec change: ${INC}
  - Change root: openspec/changes/${INC}
  - Lifecycle branch: ${INC}
  - Lifecycle worktree: <absolute path>
  - Base: <sha>
  - Canonical issue: <url>
  - Lifecycle PR: <url> - open draft
  - Proposal commit: <sha>
  - Proposal tree: <oid>
  - Metadata: openspec/changes/${INC}/github-issue.json - verified
  - Artifacts: <paths>
  - Strict validation: passed
  <!-- brainspec:proposal:end -->
commands:
  - run: git -C "<primary-worktree>" worktree add "<lifecycle-worktree>" -b "${INC}" "origin/<default-branch>"
    readback: branch ${INC} checked out at the deterministic sibling lifecycle-worktree path
  - run: openspec new change "${INC}"
    cwd: "<lifecycle-worktree>"
    readback: changeRoot exists with .openspec.yaml
  - run: openspec status --change "${INC}" --json
    cwd: "<lifecycle-worktree>"
    readback: planningHome local, changeRoot exactly openspec/changes/${INC}/, artifactPaths and actionContext parsed
  - run: openspec validate "${INC}" --type change --strict
    cwd: "<lifecycle-worktree>"
    readback: exit 0
  - run: git -C "<lifecycle-worktree>" add openspec/changes/${INC}
  - run: git -C "<lifecycle-worktree>" diff --cached --check
  - run: git -C "<lifecycle-worktree>" commit -m "docs(openspec): propose ${INC}"
    readback: HEAD on ${INC} at the planning commit, no other changes
  - run: git -C "<lifecycle-worktree>" push origin "${INC}" --no-force
    readback: origin/${INC} at the planning commit SHA
  - run: gh pr create --draft --base <default> --head "${INC}" --title "BrainSpec: ${INC}" --body-file <planning-summary>
    cwd: "<lifecycle-worktree>"
    readback: PR is open, draft, base = default, head = ${INC}, body uses "Refs #<n>"
  - file-operation: write openspec/changes/${INC}/github-issue.json with the metadata-schema
    cwd: "<lifecycle-worktree>"
  - run: git -C "<lifecycle-worktree>" add openspec/changes/${INC}/github-issue.json
  - run: git -C "<lifecycle-worktree>" commit -m "docs(brainspec): record lifecycle metadata for ${INC}"
  - run: git -C "<lifecycle-worktree>" push origin "${INC}" --no-force
    readback: PR head at the metadata-finalization commit
readback-rules:
  - PR is open, draft, base = repository default, head = ${INC}
  - PR body uses "Refs #<n>", not a closing keyword
  - github-issue.json is byte-identical to its Proposal-commit version
  - Proposal commit is the metadata-finalization head
  - Strict validation passes
hard-stops:
  - marker on closed issue or more than one issue
  - second PR, another branch/worktree, or non-Refs linkage
  - non-schemaversion-2 metadata file
  - symlink or lexical-prefix escape under changeRoot
  - Base not ancestor of freshly fetched default
  - \`gh pr create --head\` invoked before the branch exists on origin
EOF
