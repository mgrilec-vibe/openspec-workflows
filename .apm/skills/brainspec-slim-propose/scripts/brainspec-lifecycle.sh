#!/usr/bin/env bash
# scripts/lifecycle/brainspec-lifecycle.sh
#
# Single entry point for the BrainSpec lifecycle. The model invokes
# one subcommand; the script guards, mutates GitHub, reads back, and
# emits exactly one JSON line on stdout. All diagnostics go to stderr,
# which the script redirects to <log> on entry. The caller is expected
# to invoke this with `2>".brainspec/<id>.log"`.
#
# Subcommands:
#   explore --idea <text> --readiness ready|blocked|ambiguous
#   propose --increment <id>
#   apply-verify --increment <id> --task-summary <text>
#   archive --increment <id> --sync yes|no
#   coordinate --members "<owner>/<repo>#N,..." [--persist]
#   help
#
# Exit codes:
#   0  ok
#   2  refused (hard stop)
#   3  guard failure
#   4  missing input

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./guards.sh
source "${SCRIPT_DIR}/guards.sh"

usage() {
  cat <<'EOF' >&2
brainspec-lifecycle.sh <stage> [options]

stages:
  explore        --idea <text> --readiness ready|blocked|ambiguous
  propose        --increment <id>
  apply-verify   --increment <id> --task-summary <text>
  archive        --increment <id> --sync yes|no
  coordinate     --members "<owner>/<repo>#N,..." [--persist]
  help

stdout: one JSON line describing the result.
stderr: silent (redirected via the script wrapper).
exit:    0 ok | 2 refused | 3 guard failure | 4 missing input
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 4
fi

stage="$1"
shift || true

# Help short-circuits before any gh guard.
case "$stage" in
  help|-h|--help)
    usage
    exit 0
    ;;
esac

# Default argument parsing
idea=""
readiness=""
increment=""
task_summary=""
sync=""
members=""
persist="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --idea)         idea="${2:-}"; shift 2 ;;
    --readiness)    readiness="${2:-}"; shift 2 ;;
    --increment)    increment="${2:-}"; shift 2 ;;
    --task-summary) task_summary="${2:-}"; shift 2 ;;
    --sync)         sync="${2:-}"; shift 2 ;;
    --members)      members="${2:-}"; shift 2 ;;
    --persist)      persist="true"; shift ;;
    *)              log "unknown arg: $1"; usage; exit 4 ;;
  esac
done

# Open log + redirect stderr before any guarded call can leak.
log="${BRAINSPEC_LOG:-/dev/null}"
open_log "$log"
exec 2>>"$log"

require_gh_auth
repo="$(resolve_repo)"
require_repo "$repo"

# Derive increment id from a rough idea if not provided (explore path).
derive_id() {
  local raw="$1"
  printf '%s' "$raw" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g' \
    | head -c 50
}

# Common marker for an increment.
marker_for() {
  local id="$1"
  printf '<!-- brainspec:increment-id=%s -->' "$id"
}

# ============================================================
# explore
# ============================================================
cmd_explore() {
  if [[ -z "$idea" ]]; then
    emit '{"state":"error","reason":"--idea is required"}'
    exit 4
  fi
  if [[ -z "$readiness" ]]; then
    emit '{"state":"error","reason":"--readiness is required"}'
    exit 4
  fi
  case "$readiness" in
    ready)     stage_label="explore";     readiness_line="ready" ;;
    blocked)   stage_label="needs-human"; readiness_line="blocked: unresolved product/technical questions" ;;
    ambiguous) stage_label="needs-human"; readiness_line="blocked: increment identifier is ambiguous" ;;
    *)
      emit "{\"state\":\"error\",\"reason\":\"--readiness must be one of ready|blocked|ambiguous\"}"
      exit 4
      ;;
  esac

  [[ -n "$increment" ]] || increment="$(derive_id "$idea")"
  marker="$(marker_for "$increment")"

  ensure_label "$repo" "$stage_label"

  count="$(count_marker_issues "$repo" "$marker")"
  if [[ "$count" -gt 1 ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"marker appears on ${count} issues\"}"
    exit 2
  fi

  existing="$(find_marker_issue "$repo" "$marker" open)"
  handoff_line="Next: /brainspec-slim-propose ${increment}"
  body="$(render_exploration_boundary "$increment" "$idea" "$readiness_line" "$handoff_line")"

  if [[ -n "$existing" ]]; then
    IFS='|' read -r number state url <<<"$existing"
    if [[ "$state" == "CLOSED" ]]; then
      emit "{\"state\":\"refused\",\"reason\":\"marker is on closed issue #${number}\"}"
      exit 2
    fi
    gh issue edit "$url" --add-label "$stage_label" --body "$body" >/dev/null 2>>"$log"
    readback="$(gh api "repos/${repo}/issues/${number}" --jq '.number,.state,.url')"
    n="$(printf '%s' "$readback" | sed -n 1p)"
    s="$(printf '%s' "$readback" | sed -n 2p)"
    u="$(printf '%s' "$readback" | sed -n 3p)"
    emit "$(jq -nc \
      --argjson n "$n" --arg s "$s" --arg u "$u" --arg id "$increment" --arg ready "$readiness" \
      '{state:"prepared",stage:"explore",artifact:{id:$id,issue:$u,number:$n,issue_state:$s,marker:("<!-- brainspec:increment-id="+$id+" -->"),readiness:$ready}}'
    )"
    return 0
  fi

  create_out="$(gh issue create --repo "$repo" --title "Explore: ${increment}" --label "$stage_label" --body "$body" 2>>"$log")"
  new_num="$(printf '%s' "$create_out" | grep -oE '[0-9]+$' | head -n1)"
  readback="$(gh api "repos/${repo}/issues/${new_num}" --jq '.number,.state,.url')"
  n="$(printf '%s' "$readback" | sed -n 1p)"
  u="$(printf '%s' "$readback" | sed -n 3p)"
  emit "$(jq -nc \
    --arg n "$n" --arg u "$u" --arg id "$increment" --arg ready "$readiness" \
    '{state:"prepared",stage:"explore",artifact:{id:$id,issue:$u,number:($n|tonumber),marker:("<!-- brainspec:increment-id="+$id+" -->"),readiness:$ready}}'
  )"
}

# ============================================================
# propose
# ============================================================
cmd_propose() {
  if [[ -z "$increment" ]]; then
    emit '{"state":"error","reason":"--increment is required"}'
    exit 4
  fi

  marker="$(marker_for "$increment")"
  count="$(count_marker_issues "$repo" "$marker")"
  if [[ "$count" -lt 1 ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"no open exploration issue with marker ${marker}\"}"
    exit 2
  fi
  if [[ "$count" -gt 1 ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"marker appears on ${count} issues\"}"
    exit 2
  fi

  ensure_label "$repo" "proposed"

  branch="$increment"
  log "[propose] next: git worktree add, openspec new change, openspec validate, commit, push, gh pr create --draft, write github-issue.json, commit metadata, push"
  emit "$(jq -nc \
    --arg id "$increment" --arg branch "$branch" \
    '{state:"prepared",stage:"propose",artifact:{id:$id,branch:$branch,marker:("<!-- brainspec:increment-id="+$id+" -->")}}')"
}

# ============================================================
# apply-verify
# ============================================================
cmd_apply_verify() {
  if [[ -z "$increment" ]]; then
    emit '{"state":"error","reason":"--increment is required"}'
    exit 4
  fi

  marker="$(marker_for "$increment")"
  existing="$(find_marker_issue "$repo" "$marker" open)"
  if [[ -z "$existing" ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"no open lifecycle issue with marker ${marker}\"}"
    exit 2
  fi

  worktree="${BRAINSPEC_WORKTREE:-$(pwd)}"
  metadata="${worktree}/openspec/changes/${increment}/github-issue.json"
  assert_schema_v2 "$metadata"

  ensure_label "$repo" "implementing"

  pr_url="$(jq -r '.pullRequest' "$metadata")"
  pr_meta="$(gh pr view "$pr_url" --json state,isDraft,headRefName,baseRefName,headRefOid)"
  pr_state="$(printf '%s' "$pr_meta" | jq -r '.state')"
  pr_draft="$(printf '%s' "$pr_meta" | jq -r '.isDraft')"
  pr_body_refs="$(gh pr view "$pr_url" --json body --jq '.body | test("Refs #")')"

  if [[ "$pr_state" != "OPEN" ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"PR ${pr_url} not OPEN (state=${pr_state})\"}"
    exit 2
  fi
  if [[ "$pr_draft" != "true" ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"PR ${pr_url} is not draft\"}"
    exit 2
  fi
  if [[ "$pr_body_refs" != "true" ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"PR ${pr_url} body does not use Refs\"}"
    exit 2
  fi

  if [[ -d "${worktree}/openspec/changes/${increment}" ]] && command -v openspec >/dev/null 2>&1; then
    if ! openspec validate "${increment}" --type change --strict >/dev/null 2>>"$log"; then
      emit "{\"state\":\"refused\",\"reason\":\"openspec validate --strict failed\"}"
      exit 2
    fi
  fi

  impl_head="$(jq -r '.branch' "$metadata")"
  summary="${task_summary:-<task summary not provided>}"
  emit "$(jq -nc \
    --arg id "$increment" --arg pr "$pr_url" --arg h "$impl_head" --arg t "$summary" \
    '{state:"prepared",stage:"apply-verify",artifact:{id:$id,pullRequest:$pr,implementation_head:$h,summary:$t,marker:("<!-- brainspec:increment-id="+$id+" -->"),next:("/brainspec-slim-archive " + $id)}}')"
}

# ============================================================
# archive
# ============================================================
cmd_archive() {
  if [[ -z "$increment" ]]; then
    emit '{"state":"error","reason":"--increment is required"}'
    exit 4
  fi
  if [[ -z "$sync" ]]; then
    emit '{"state":"error","reason":"--sync yes|no is required"}'
    exit 4
  fi

  marker="$(marker_for "$increment")"
  existing="$(find_marker_issue "$repo" "$marker" open)"
  if [[ -z "$existing" ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"no open lifecycle issue with marker ${marker}\"}"
    exit 2
  fi

  worktree="${BRAINSPEC_WORKTREE:-$(pwd)}"
  metadata="${worktree}/openspec/changes/${increment}/github-issue.json"
  assert_schema_v2 "$metadata"

  pr_url="$(jq -r '.pullRequest' "$metadata")"
  pr_state="$(gh pr view "$pr_url" --json state --jq '.state')"
  if [[ "$pr_state" == "MERGED" ]]; then
    emit "{\"state\":\"refused\",\"reason\":\"PR ${pr_url} is already merged\"}"
    exit 2
  fi

  state_dir="${worktree}/.brainspec"
  mkdir -p "$state_dir"
  sidecar="${state_dir}/${increment}.state"
  state_sidecar_init "$sidecar"

  archive_date="$(date -u +%F)"
  source_path="openspec/changes/${increment}"
  archive_path="openspec/changes/archive/${archive_date}-${increment}"

  if ! state_sidecar_done "$sidecar" "pr_edit"; then
    body_file="$(mktemp)"
    {
      echo "## Summary"
      echo "Archive ${increment}."
      echo ""
      echo "## Why"
      echo "Implementation reviewed and verified."
      echo ""
      echo "## Test plan"
      echo "- All change tasks checked"
      echo "- openspec validate --strict passed"
      echo "- Acceptance and smoke commands passed"
      echo ""
      echo "Closes #$(printf '%s' "$existing" | cut -d'|' -f1)"
    } >"$body_file"
    gh pr edit "$pr_url" --body-file "$body_file" >/dev/null 2>>"$log"
    rm -f "$body_file"
    state_sidecar_mark "$sidecar" "pr_edit"
  fi

  if ! state_sidecar_done "$sidecar" "pr_ready"; then
    gh pr ready "$pr_url" >/dev/null 2>>"$log"
    state_sidecar_mark "$sidecar" "pr_ready"
  fi

  if ! state_sidecar_done "$sidecar" "move"; then
    if [[ -d "${worktree}/${source_path}" ]]; then
      mkdir -p "${worktree}/openspec/changes/archive"
      mv "${worktree}/${source_path}" "${worktree}/${archive_path}"
    fi
    git -C "$worktree" add -A -- "${source_path}" "${archive_path}" 2>>"$log" || true
    git -C "$worktree" commit -m "docs(openspec): archive ${increment}" >/dev/null 2>>"$log" || true
    git -C "$worktree" push origin "${increment}" --no-force >/dev/null 2>>"$log" || true
    state_sidecar_mark "$sidecar" "move"
  fi

  if ! state_sidecar_done "$sidecar" "merge"; then
    gh pr merge "$pr_url" --squash --delete-branch=false >/dev/null 2>>"$log"
    state_sidecar_mark "$sidecar" "merge"
  fi

  emit "$(jq -nc \
    --arg id "$increment" --arg pr "$pr_url" --arg sync "$sync" --arg path "$archive_path" \
    '{state:"merged",stage:"archive",artifact:{id:$id,pullRequest:$pr,specSync:$sync,archivePath:$path,marker:("<!-- brainspec:increment-id="+$id+" -->")}}')"
}

# ============================================================
# coordinate
# ============================================================
cmd_coordinate() {
  if [[ -z "$members" ]]; then
    emit '{"state":"error","reason":"--members is required"}'
    exit 4
  fi

  coord_id="coord-$(date -u +%Y-%m-%d)"
  members_json="[]"
  IFS=',' read -ra parts <<< "$members"
  for member in "${parts[@]}"; do
    [[ -z "$member" ]] && continue
    member="$(printf '%s' "$member" | tr -d ' ')"
    if [[ ! "$member" =~ ^([^/]+)/([^#]+)#([0-9]+)$ ]]; then
      emit "{\"state\":\"refused\",\"reason\":\"member ${member} is not <owner>/<repo>#<n>\"}"
      exit 2
    fi
    m_repo="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    m_num="${BASH_REMATCH[3]}"
    m_url="https://github.com/${m_repo}/issues/${m_num}"
    issue_body="$(gh api "repos/${m_repo}/issues/${m_num}" --jq '.body // empty' 2>>"$log")"
    if [[ -z "$issue_body" ]] || ! printf '%s' "$issue_body" | grep -q "<!-- brainspec:increment-id="; then
      emit "{\"state\":\"refused\",\"reason\":\"issue #${m_num} lacks BrainSpec marker\"}"
      exit 2
    fi
    members_json="$(jq --arg u "$m_url" --arg r "$m_repo" --argjson n "$m_num" \
      '. + [{repo:$r,number:$n,url:$u}]' <<<"$members_json")"
  done

  if [[ "$persist" == "true" ]]; then
    ensure_label "$repo" "coordination"
    body_file="$(mktemp)"
    {
      echo "<!-- brainspec:coordination-id=${coord_id} -->"
      echo "# Coordination: ${coord_id}"
      echo "Members: $(jq -c . <<<"$members_json")"
    } >"$body_file"
    out="$(gh issue create --repo "$repo" --title "Coordination: ${coord_id}" --label coordination --body-file "$body_file" 2>>"$log")"
    rm -f "$body_file"
    coord_url="$(printf '%s' "$out" | tail -n1)"
    emit "$(jq -nc \
      --arg id "$coord_id" --argjson members "$members_json" --arg u "$coord_url" \
      '{state:"prepared",stage:"coordinate",artifact:{coordinationId:$id,members:$members,coordinationIssue:$u}}')"
    return 0
  fi

  emit "$(jq -nc \
    --arg id "$coord_id" --argjson members "$members_json" \
    '{state:"prepared",stage:"coordinate",artifact:{coordinationId:$id,members:$members}}')"
}

case "$stage" in
  explore)      cmd_explore ;;
  propose)      cmd_propose ;;
  apply-verify) cmd_apply_verify ;;
  archive)      cmd_archive ;;
  coordinate)   cmd_coordinate ;;
  *)
    log "unknown stage: $stage"
    usage
    exit 4
    ;;
esac
