#!/usr/bin/env bash
# brainspec-apply.sh
#
# The procedure script for /brainspec-apply. Emits the structured
# directives the agent must follow to implement the plan on the
# existing lifecycle branch and PR, including the plan-only reentry
# branch.
#
# The script owns the canonical implementation-checkpoint boundary,
# the metadata readback rules, the per-chunk commit message, the
# blocker boundary template, and the verification commands.

set -euo pipefail

INC="${1:-}"
if [[ -z "$INC" ]]; then
  echo "state: error: missing increment-id" >&2
  exit 2
fi

# Unquoted heredoc: ${INC} interpolates. The branch placeholder is
# intentionally literal (<branch>) since it is filled in by the agent
# after reading github-issue.json, so we leave it as bare text.
cat <<EOF
state: prepared
marker: <!-- brainspec:increment-id=${INC} -->
implementation-boundary-template: |
  <!-- brainspec:implementation:start -->
  ## Implementation checkpoint
  - Status: implementing - transition read back before code
  - Canonical issue: <url and exact marker>
  - OpenSpec change: ${INC}
  - Change root: openspec/changes/${INC}
  - Lifecycle PR: <url> - open draft
  - Lifecycle branch: <branch>
  - Lifecycle worktree: <absolute path>
  - Base: <sha>
  - Proposal commit: <sha>
  - Proposal tree: <oid>
  - Metadata: <path> - verified and immutable
  - Implementation head: pending
  - Implementation tree: pending
  - Verification: pending - <named acceptance scenario>
  - Smoke: pending - <named smoke path>
  - Documentation: pending update/creation or verified None rationale
  - Review fixes: none
  <!-- brainspec:implementation:end -->
blocker-boundary-template: |
  <!-- brainspec:implementation:start -->
  ## Implementation blocked
  - Status: needs-human
  - Resume stage: implementing|fixing
  - Question: <exact question>
  - Options: <option 1> / <option 2> / ...
  - Evidence: <facts and refs>
  - Recommendation: <one>
  <!-- brainspec:implementation:end -->
archiving-handoff-template: |
  <!-- brainspec:implementation:start -->
  ## Implementation checkpoint
  - Status: complete - ready for archive finalization
  - Implementation head: <pushed sha>
  - Implementation tree: <change-root subtree oid>
  - Verification: <concrete passed command/result>
  - Smoke: <concrete passed command/result>
  - Documentation: <completed paths or verified None rationale>
  - Review fixes: <completed references or none>
  <!-- brainspec:implementation:end -->
commands:
  - run: openspec status --change "${INC}" --json
    readback: schemaName, planningHome, changeRoot, actionContext, contextFiles
  - run: openspec instructions apply --change "${INC}" --json
    readback: progress, tasks, instruction, optional context, optional operationGuidance
  - run: openspec validate "${INC}" --type change --strict
    readback: exit 0
  - run: gh pr view "<pr-url>" --json isDraft,headRefName,baseRefName,body
    readback: isDraft=true, headRefName=metadata-branch, body contains "Refs #<n>"
per-chunk-rules:
  - stage only owned code, tests, documentation, and active-change paths
  - run: git diff --cached --check
  - commit with scoped implementation message
  - push the lifecycle branch without force
  - read the same draft pull request back at the pushed head
plan-only-rules:
  - reconcile the explicit revision across every affected planning artifact
  - preserve checked tasks that remain valid, uncheck invalidated tasks
  - commit as: docs(openspec): revise ${INC}
  - push without force, read the draft Refs PR back at the new head
  - pause before editing application code
readback-rules:
  - require readback of exactly "implementing" and the complete checkpoint before the first edit
  - body-first or label-first exact partial permits one repair after re-verifying metadata, PR, branch, worktree
  - never infer ownership from a branch name alone
hard-stops:
  - PR not open, not draft, not using Refs, or different base/head than metadata
  - github-issue.json missing, additional/missing keys, or schemaVersion != 2
  - Proposal commit not ancestor of PR head
  - second PR, another branch/worktree, or force push
  - PR diff not confined to change root plus owned implementation paths
EOF
