#!/usr/bin/env bash
# brainspec-archive.sh
#
# Procedure script for /brainspec-archive. Owns the metadata
# cross-checks, the spec-sync algorithm, the move-once
# classification, the PR-readiness transition order, and the merge
# gate.

set -euo pipefail

INC="${1:-}"
if [[ -z "$INC" ]]; then
  echo "state: error: missing increment-id" >&2
  exit 2
fi

ARCHIVE_DATE="$(date -u +%F)"
SOURCE_PATH="openspec/changes/${INC}"
ARCHIVE_PATH="openspec/changes/archive/${ARCHIVE_DATE}-${INC}"

# Unquoted heredoc: ${INC} interpolates.
cat <<EOF
state: prepared
marker: <!-- brainspec:increment-id=${INC} -->
archive-boundary-template: |
  <!-- brainspec:archive:start -->
  ## Archive checkpoint
  - Status: archiving - transfer to archive finalization
  - Lifecycle PR: <url> - open draft until transition step
  - Implementation head: <pushed sha>
  - Spec sync: <applied|skipped|skipped-by-schema>
  - Archive target: ${ARCHIVE_PATH}/
  - Move classification: <class>
  - Manifest: <path/mode/blob-identity summary>
  <!-- brainspec:archive:end -->
pr-readiness-transition:
  - step 1: gh pr edit "<pr-url>" --base <default> --body-file <archive-summary-with-Closes>
    readback: isDraft=true (gh pr edit does NOT undraft), body contains "Closes #<n>"
  - step 2: gh pr ready "<pr-url>"
    readback: state=ready, body still contains "Closes #<n>"
spec-sync-rules:
  - source: artifactPaths.specs.existingOutputPaths
  - apply only declared ADDED, MODIFIED, REMOVED, RENAMED
  - preserve every unrelated requirement and scenario
  - verify each capability after sync: ADDED present, MODIFIED carries scenario and description, REMOVED gone, RENAMED present
  - rules apply only to specs being written; not archive guidance
merge-gate:
  - all tasks checked
  - openspec validate "${INC}" --type change --strict passed
  - acceptance + smoke passed
  - spec sync either succeeded or was explicitly skipped with zero canonical-spec diff
  - PR body carries "Closes #<n>" and is in ready state
  - Proposal commit and Implementation head are ancestors of Archive head
commands:
  - run: openspec status --change "${INC}" --json
    readback: planningHome, changeRoot, artifactPaths, actionContext, artifacts
  - run: openspec instructions archive --change "${INC}" --json
    readback: optional context, optional operationGuidance
  - run: openspec instructions specs --change "${INC}" --json
    readback: rules (apply only to specs being written)
  - run: openspec validate "${INC}" --type change --strict
    readback: exit 0
  - run: git -C "<lifecycle-worktree>" ls-files --stage -- "${SOURCE_PATH}"
    readback: save the complete source path/mode/blob-identity manifest; it is nonempty
  - run: mkdir -p "<lifecycle-worktree>/openspec/changes/archive"
  - run: mv "<lifecycle-worktree>/${SOURCE_PATH}" "<lifecycle-worktree>/${ARCHIVE_PATH}"
    readback: source absent, target present, working-tree manifest equals the saved source manifest with only the path prefix changed
  - run: git -C "<lifecycle-worktree>" add -A -- "${SOURCE_PATH}" "${ARCHIVE_PATH}"
  - run: git -C "<lifecycle-worktree>" diff --cached --name-status --find-renames=100% -- "${SOURCE_PATH}" "${ARCHIVE_PATH}"
    readback: every saved source path is staged as deleted or as the source of an R100 rename, and every corresponding archive path is staged as added or as the target of that R100 rename; no other path appears
  - run: git -C "<lifecycle-worktree>" ls-files --stage -- "${ARCHIVE_PATH}"
    readback: staged archive path/mode/blob-identity manifest exactly equals the saved source manifest with only the path prefix changed
  - run: git -C "<lifecycle-worktree>" commit -m "docs(openspec): archive ${INC}"
  - run: git -C "<lifecycle-worktree>" push origin "${INC}" --no-force
  - run: cd "<lifecycle-worktree>" && gh pr edit "<pr-url>" --base <default> --body-file <archive-summary-with-Closes>
    readback: isDraft=true (body updated; gh pr edit does not undraft), body contains "Closes #<n>"
  - run: cd "<lifecycle-worktree>" && gh pr ready "<pr-url>"
    readback: state=ready, body still contains "Closes #<n>"
  - run: cd "<lifecycle-worktree>" && gh pr merge "<pr-url>" --squash --delete-branch=false
    readback: merged=true, terminal issue block recorded
hard-stops:
  - PR not the lifecycle PR, not at the verified head, or already merged
  - spec sync left delta requirements not applied to the canonical spec
  - second PR, another branch/worktree, or forced rewrite of the archive commit
  - move produced a duplicate target or a nonmatching manifest
  - treating gh pr edit as if it undrafts the PR
EOF
