#!/usr/bin/env bash
# scripts/lifecycle/guards.sh
#
# Shared helpers for the BrainSpec lifecycle driver. Loaded by
# scripts/lifecycle/brainspec-lifecycle.sh. Owns:
#   - gh auth and repo capability preflight
#   - marker uniqueness and schema-v2 validation
#   - canonical body and boundary templates (copied verbatim from the
#     legacy slim scripts so the on-GitHub contract is unchanged)
#   - log redirection (the script's only stdout is the final JSON line)
#   - crash-resume state sidecar
#
# Boundary template bodies are byte-identical to the heredoc bodies in
# the legacy scripts. Do not edit markers, label names, or field
# orderings here.

# All functions append diagnostics to the global $log variable that
# the driver sets before calling require_gh_auth. Stderr is already
# redirected to that path via `exec 2>>"$log"` in the driver.

# Lifecycle-label set. The driver asserts the issue carries exactly
# one of the relevant subset for the stage.
BRAINSPE_LIFECYCLE_LABELS=(explore needs-human proposed implementing archiving review fixing)

# Open the script log. The driver sources this and runs `exec 2>>"$log"`
# so nothing leaks to the caller's stderr. Caller supplies the log path.
open_log() {
  local log_path="$1"
  mkdir -p "$(dirname "$log_path")"
  : >"$log_path"
}

# Echo to the log only -- never to stdout. Stdout is reserved for the
# final JSON line.
log() {
  printf '%s\n' "$*" >&2
}

# Emit the final JSON line to stdout and exit. Use jq -c so the line
# is stable.
emit() {
  local json="$1"
  printf '%s\n' "$json" | jq -c .
}

# Resolve repo context. Returns "<owner>/<repo>" via stdout.
# Prefers: $BRAINSPE_REPO env, then `gh repo view --json nameWithOwner`.
resolve_repo() {
  if [[ -n "${BRAINSPE_REPO:-}" ]]; then
    printf '%s\n' "$BRAINSPE_REPO"
    return 0
  fi
  gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>>"$log" \
    | tr -d '\r\n'
}

# gh auth preflight. The driver refuses unless the actor is logged in.
require_gh_auth() {
  if ! gh auth status >/dev/null 2>>"$log"; then
    emit '{"state":"refused","reason":"gh auth status failed"}'
    exit 2
  fi
}

# Capability preflight. The script refuses unless the actor can push
# (issues + PRs). Token-only triage is not enough.
require_repo() {
  local repo="$1"
  local perms
  perms="$(gh api "repos/${repo}" --jq '.permissions | {push,maintain,admin}' 2>>"$log")"
  if [[ -z "$perms" ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"repo ${repo} not accessible\"}"
    exit 2
  fi
  if ! printf '%s' "$perms" | jq -e '.push or .maintain or .admin' >/dev/null 2>&1; then
    emit "{\"state\":\"refused\",\"reason\":\"actor lacks push on ${repo}\"}"
    exit 3
  fi
}

# Search for an issue that carries the exact marker.
# Returns "<number>|<state>|<url>" or empty if none.
find_marker_issue() {
  local repo="$1" marker="$2" state_filter="${3:-all}"
  local query_args=(--repo "$repo" --match body "$marker" --limit 1000 --json number,state,url,body)
  if [[ "$state_filter" == "open" || "$state_filter" == "closed" ]]; then
    query_args=(--state "$state_filter" "${query_args[@]}")
  else
    query_args=(--state all "${query_args[@]}")
  fi
  local rows
  rows="$(gh search issues "${query_args[@]}" 2>>"$log")"
  printf '%s' "$rows" | jq -r --arg marker "$marker" \
    '.[] | select(.body | test($marker)) | "\(.number)|\(.state)|\(.url)"' \
    | head -n1
}

# Count how many issues carry the marker. A marker on >1 issue is a hard stop.
count_marker_issues() {
  local repo="$1" marker="$2"
  local rows
  rows="$(gh search issues --repo "$repo" --state all --match body "$marker" --limit 1000 --json number,state,body 2>>"$log")"
  printf '%s' "$rows" | jq -r --arg marker "$marker" \
    '[.[] | select(.body | test($marker))] | length'
}

# Schema-v2 assertion for github-issue.json. Exactly seven keys,
# schemaVersion: 2. Refuses on any deviation.
assert_schema_v2() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"github-issue.json missing at ${path}\"}"
    exit 2
  fi
  local keys
  keys="$(jq -r 'keys_unsorted | sort | join(",")' "$path" 2>>"$log")"
  local expected="base,branch,incrementId,issue,pullRequest,schemaVersion,worktree"
  if [[ "$keys" != "$expected" ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"github-issue.json keys mismatch: got ${keys}\"}"
    exit 2
  fi
  local ver
  ver="$(jq -r '.schemaVersion' "$path")"
  if [[ "$ver" != "2" ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"schemaVersion must be 2, got ${ver}\"}"
    exit 2
  fi
}

# Label preflight. Creates the label if absent; exits only on hard fail.
ensure_label() {
  local repo="$1" label="$2" color="${3:-c5def5}"
  if gh label view "$label" --repo "$repo" >/dev/null 2>>"$log"; then
    return 0
  fi
  gh label create "$label" --repo "$repo" --color "$color" >/dev/null 2>>"$log"
}

# ---- Canonical boundary templates ----
# Copied verbatim from .apm/skills/brainspec-slim-*/scripts/brainspec-*.sh
# heredoc bodies. Do not edit markers, label names, or field order.

render_exploration_boundary() {
  local id="$1" idea="$2" readiness_line="$3" handoff_line="$4"
  cat <<EOF
<!-- brainspec:increment-id=${id} -->
<!-- brainspec:exploration:start -->
# Exploration: ${id}

## Rough idea
${idea}

## Repository evidence
- <file, symbol, OpenSpec change, issue, PR, or observed command output>

## Decisions supported by evidence
- <decision and rationale>

## Unresolved questions
- <question, options, and missing evidence>

## Proposal readiness
${readiness_line}

## Handoff
${handoff_line}
<!-- brainspec:exploration:end -->
EOF
}

render_proposal_boundary() {
  local id="$1" pr_url="$2" commit="$3" tree_oid="$4"
  cat <<EOF
<!-- brainspec:increment-id=${id} -->
<!-- brainspec:proposal:start -->
## Proposal checkpoint
- OpenSpec change: ${id}
- Change root: openspec/changes/${id}
- Lifecycle branch: ${id}
- Lifecycle worktree: <absolute path>
- Base: <sha>
- Canonical issue: <url>
- Lifecycle PR: ${pr_url} - open draft
- Proposal commit: ${commit}
- Proposal tree: ${tree_oid}
- Metadata: openspec/changes/${id}/github-issue.json - verified
- Artifacts: <paths>
- Strict validation: passed
<!-- brainspec:proposal:end -->
EOF
}

render_implementation_boundary() {
  local id="$1" pr_url="$2" branch="$3" base="$4" proposal_commit="$5" proposal_tree="$6"
  cat <<EOF
<!-- brainspec:increment-id=${id} -->
<!-- brainspec:implementation:start -->
## Implementation checkpoint
- Status: implementing - transition read back before code
- Canonical issue: <url and exact marker>
- OpenSpec change: ${id}
- Change root: openspec/changes/${id}
- Lifecycle PR: ${pr_url} - open draft
- Lifecycle branch: ${branch}
- Lifecycle worktree: <absolute path>
- Base: ${base}
- Proposal commit: ${proposal_commit}
- Proposal tree: ${proposal_tree}
- Metadata: <path> - verified and immutable
- Implementation head: pending
- Implementation tree: pending
- Verification: pending - <named acceptance scenario>
- Smoke: pending - <named smoke path>
- Documentation: pending update/creation or verified None rationale
- Review fixes: none
<!-- brainspec:implementation:end -->
EOF
}

render_blocker_boundary() {
  local id="$1" stage="$2" question="$3" options="$4" evidence="$5" recommendation="$6"
  cat <<EOF
<!-- brainspec:increment-id=${id} -->
<!-- brainspec:implementation:start -->
## Implementation blocked
- Status: needs-human
- Resume stage: ${stage}
- Question: ${question}
- Options: ${options}
- Evidence: ${evidence}
- Recommendation: ${recommendation}
<!-- brainspec:implementation:end -->
EOF
}

render_archiving_handoff() {
  local id="$1" impl_head="$2" impl_tree="$3" verification="$4" smoke="$5" docs="$6"
  cat <<EOF
<!-- brainspec:increment-id=${id} -->
<!-- brainspec:implementation:start -->
## Implementation checkpoint
- Status: complete - ready for archive finalization
- Implementation head: ${impl_head}
- Implementation tree: ${impl_tree}
- Verification: ${verification}
- Smoke: ${smoke}
- Documentation: ${docs}
- Review fixes: <completed references or none>
<!-- brainspec:implementation:end -->
EOF
}

render_archive_boundary() {
  local id="$1" pr_url="$2" impl_head="$3" sync_disposition="$4" archive_path="$5" move_class="$6" manifest="$7"
  cat <<EOF
<!-- brainspec:increment-id=${id} -->
<!-- brainspec:archive:start -->
## Archive checkpoint
- Status: archiving - transfer to archive finalization
- Lifecycle PR: ${pr_url} - open draft until transition step
- Implementation head: ${impl_head}
- Spec sync: ${sync_disposition}
- Archive target: ${archive_path}/
- Move classification: ${move_class}
- Manifest: ${manifest}
<!-- brainspec:archive:end -->
EOF
}

# ---- Crash-resume state sidecar ----
# The archive subcommand depends on an ordered `gh pr edit` -> `gh pr ready`
# -> `gh pr merge` transition. State persists across calls so a re-run
# skips already-completed steps.

state_sidecar_init() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    printf '{"done":{}}\n' >"$path"
  fi
}

state_sidecar_mark() {
  local path="$1" step="$2"
  local tmp
  tmp="$(mktemp)"
  jq --arg s "$step" '.done[$s] = true' "$path" >"$tmp" && mv "$tmp" "$path"
}

state_sidecar_done() {
  local path="$1" step="$2"
  jq -e --arg s "$step" '.done[$s] == true' "$path" >/dev/null 2>&1
}
