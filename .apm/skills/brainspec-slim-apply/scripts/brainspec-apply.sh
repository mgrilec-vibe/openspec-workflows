#!/usr/bin/env bash
# brainspec-apply.sh
#
# Deterministically emits the structured directives the agent must
# execute to implement the plan on the existing lifecycle branch and
# PR, including the plan-only reentry branch. It does not execute
# lifecycle commands, parse OpenSpec task output, run checks, or observe
# statuses.
#
# The script owns the canonical implementation-checkpoint boundary,
# the metadata readback rules, the per-chunk commit message, the
# blocker boundary template, and the required verification directives.

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
emitter-contract:
  - directives only; no command below has been executed by this helper
  - do not treat this output as parsed tasks or an observed check status
execution-context:
  cwd: <verified-absolute-lifecycle-worktree>
  rule: use this explicit cwd for every command and lifecycle mutation; never assume process cwd
preflight-directives:
  - step: 1
    run: openspec status --change "${INC}" --json
    cwd: <verified-absolute-lifecycle-worktree>
    readback: caller observes schemaName, planningHome, changeRoot, actionContext, contextFiles
  - step: 2
    run: openspec instructions apply --change "${INC}" --json
    cwd: <verified-absolute-lifecycle-worktree>
    readback: caller observes progress, tasks, instruction, optional context, optional operationGuidance; pending tasks come from this output
  - step: 3
    run: gh pr view "<pr-url>" --json state,isDraft,headRefName,baseRefName,body
    cwd: <verified-absolute-lifecycle-worktree>
    readback: caller observes state=OPEN, isDraft=true, headRefName=metadata-branch, body contains "Refs #<n>"
per-chunk-rules:
  - run: git -C "<verified-absolute-lifecycle-worktree>" add -- <owned-code-test-documentation-and-active-change-paths>
    readback: only owned paths are staged
  - run: git -C "<verified-absolute-lifecycle-worktree>" diff --cached --check
    readback: caller observes exit 0
  - run: git -C "<verified-absolute-lifecycle-worktree>" commit -m "<scoped-implementation-message>"
    readback: caller observes the created implementation commit
  - run: git -C "<verified-absolute-lifecycle-worktree>" push origin "<lifecycle-branch>"
    readback: caller observes a non-force push of the lifecycle branch
  - run: gh pr view "<pr-url>" --json state,isDraft,headRefName,baseRefName,body,headRefOid
    cwd: <verified-absolute-lifecycle-worktree>
    readback: caller observes the same open draft Refs pull request at the pushed head
plan-only-rules:
  - reconcile the explicit revision across every affected planning artifact
  - preserve checked tasks that remain valid, uncheck invalidated tasks
  - run strict validation from the explicit lifecycle-worktree cwd and observe exit 0
  - commit as: docs(openspec): revise ${INC}
  - push without force, read the draft Refs PR back at the new head
  - pause before editing application code
completion-verification-directives:
  - step: 1
    run: openspec instructions apply --change "${INC}" --json
    cwd: <verified-absolute-lifecycle-worktree>
    readback: caller observes progress and tasks with no pending task
  - step: 2
    run: openspec validate "${INC}" --type change --strict
    cwd: <verified-absolute-lifecycle-worktree>
    readback: caller observes command output and exit 0
  - step: 3
    run: <named-acceptance-command-from-verified-plan>
    cwd: <verified-absolute-lifecycle-worktree>
    readback: caller observes the named acceptance result, command output, and exit 0
  - step: 4
    run: <named-relevant-application-smoke-command-from-verified-plan>
    cwd: <verified-absolute-lifecycle-worktree>
    readback: caller observes the named smoke result, command output, and exit 0
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
