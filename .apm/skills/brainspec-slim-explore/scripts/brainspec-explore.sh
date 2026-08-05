#!/usr/bin/env bash
# brainspec-explore.sh
#
# Procedure script for /brainspec-explore. Owns the increment-id
# derivation, the canonical-issue marker search, the local baseline
# snapshot, the exact-marker body template, the label preflight, and
# the readback-after-mutation rule.
#
# Usage: brainspec-explore.sh "<rough-idea>" "<readiness>"
#   readiness: "ready" | "blocked" | "ambiguous" (required)
# The script refuses to proceed unless the caller explicitly supplies
# a readiness decision. To surface unresolved questions, pass
# readiness="blocked".
#
# The output is emitted as a single-quoted heredoc so that the
# template is byte-stable; substitutions the agent must reason about
# are made in the body and noted explicitly. The agent fills in the
# <id> placeholder after id derivation.

set -euo pipefail

IDEA="${1:-}"
READINESS="${2:-}"

if [[ -z "$IDEA" ]]; then
  echo "state: error: missing rough-idea" >&2
  exit 2
fi
if [[ -z "$READINESS" ]]; then
  echo "state: error: missing readiness (expected ready|blocked|ambiguous)" >&2
  exit 2
fi

case "${READINESS}" in
  ready)     STAGE_LABEL="explore";     READINESS_LINE="ready" ;;
  blocked)   STAGE_LABEL="needs-human"; READINESS_LINE="blocked: unresolved product/technical questions" ;;
  ambiguous) STAGE_LABEL="needs-human"; READINESS_LINE="blocked: increment identifier is ambiguous" ;;
  *)
    echo "state: error: readiness must be one of ready|blocked|ambiguous" >&2
    exit 2
    ;;
esac

# Header lines (not part of the template body) interpolate ${IDEA}
# and ${READINESS} via parameter expansion before the heredoc is
# printed; the heredoc itself is single-quoted so the body is
# byte-stable and the agent substitutes the <id> and <handoff-line>
# placeholders.
echo "state: ${READINESS_LINE}"
echo "stage-label: ${STAGE_LABEL}"
echo "readiness: ${READINESS}"
echo "rough-idea: ${IDEA}"
echo
cat <<'BRAINSPE_EOF'
label-preflight:
  - exact label name: <stage-label>
  - on the canonical issue
body-template: |
  <!-- brainspec:increment-id=<id> -->
  <!-- brainspec:exploration:start -->
  # Exploration: <id>

  ## Rough idea
  <verbatim user request>

  ## Repository evidence
  - <file, symbol, OpenSpec change, issue, PR, or observed command output>

  ## Decisions supported by evidence
  - <decision and rationale>

  ## Unresolved questions
  - <question, options, and missing evidence>

  ## Proposal readiness
  <ready | blocked: reason>

  ## Handoff
  <handoff-line>
  <!-- brainspec:exploration:end -->
baseline-snapshot:
  - run: git rev-parse --verify HEAD
  - capture: git status --porcelain=v2 -uall
  - capture: git diff --binary HEAD
  - capture: git ls-files --others --exclude-standard
  - compare before/after mutation with cmp -s
commands:
  - run: gh search issues --repo "<owner>/<repo>" --state open --match body "<!-- brainspec:increment-id=<id> -->" --limit 1000 --json number,state,url,body
  - run: gh search issues --repo "<owner>/<repo>" --state closed --match body "<!-- brainspec:increment-id=<id> -->" --limit 1000 --json number,state,url,body
  - run: gh auth status
  - run: gh api "repos/<owner>/<repo>" --jq '.permissions | {admin, maintain, push, triage}'
  - run: gh issue create --repo "<owner>/<repo>" --title "Explore: <id>" --body-file <body> --label "<stage-label>"
    readback: gh search issues for the exact marker
  - run: gh issue edit <url> --add-label "<stage-label>" --remove-label "<other>" --body-file <body>
    readback: URL, title, labels, body, update time
hard-stops:
  - readiness="ready" published with unresolved product or technical questions
  - marker on closed issue or more than one issue
  - repository, HEAD, baseline, or stable increment identifier unresolvable
  - existing body lacks one unambiguous generated block
  - existing issue carries any later-stage label or multiple stage labels
  - GitHub authentication, capability preflight, label setup, or issue mutation fails
  - tracked or untracked Git baseline changes before mutation
BRAINSPE_EOF
