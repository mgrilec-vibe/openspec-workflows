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
  - Archive target: openspec/changes/archive/YYYY-MM-DD-${INC}/
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
  - run: mkdir -p "openspec/changes/archive"
  - run: mv "openspec/changes/${INC}" "openspec/changes/archive/YYYY-MM-DD-${INC}"
    readback: source absent, target present, exact manifest equality
  - run: git add openspec/changes/archive/YYYY-MM-DD-${INC}
  - run: git commit -m "docs(openspec): archive ${INC}"
  - run: git push origin "${INC}" --no-force
  - run: gh pr edit "<pr-url>" --base <default> --body-file <archive-summary>
    readback: isDraft=true (body updated; gh pr edit does not undraft)
  - run: gh pr ready "<pr-url>"
    readback: state=ready
  - run: gh pr merge "<pr-url>" --squash --delete-branch=false
    readback: merged=true, terminal issue block recorded
hard-stops:
  - PR not the lifecycle PR, not at the verified head, or already merged
  - spec sync left delta requirements not applied to the canonical spec
  - second PR, another branch/worktree, or forced rewrite of the archive commit
  - move produced a duplicate target or a nonmatching manifest
  - treating gh pr edit as if it undrafts the PR
EOF
