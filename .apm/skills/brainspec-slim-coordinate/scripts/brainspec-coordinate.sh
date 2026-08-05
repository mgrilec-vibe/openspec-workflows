#!/usr/bin/env bash
# brainspec-coordinate.sh
#
# Procedure script for /brainspec-coordinate. Owns the candidate
# resolution, the per-member Proposal verification, the
# relationship classification, the cycle rejection, the wave
# construction, and the optional coordination-issue persistence.

set -euo pipefail

MEMBERS="${1:-}"
if [[ -z "$MEMBERS" ]]; then
  echo "state: error: missing member list" >&2
  exit 2
fi

cat <<EOF
state: prepared
plan-id: coord-$(date -u +%Y-%m-%d)
marker: <!-- brainspec:coordination-id=<plan-id> -->
member-resolution:
  - resolve each member as <owner>/<repo>#<number>
  - require one BrainSpec marker and Proposal checkpoint
  - verify Proposal commit belongs to the recorded lifecycle PR and contains its planning artifacts
relationships:
  - requires #N: cannot implement safely before #N merges
  - prefer-after #N: can proceed, but #N first should reduce rework
  - serialize-after #N: must not run concurrently and should follow #N
  - parallel-safe #N: verified safe in the same wave
unknowns: treat missing evidence as unknown, not parallel-safe
hard-stops:
  - referenced issue lacks the BrainSpec marker, Proposal checkpoint, or verified Proposal commit
  - hard-dependency cycle detected
  - more than one active coordination issue references the same member
  - repository authentication or capability preflight fails
persistence:
  - search open and closed issues for the exact coordination marker
  - zero matches: create
  - one match: update or resume
  - multiple matches: stop
  - read body, labels, updatedAt; re-read immediately before mutation; abort on change
  - write once, read the result back
commands:
  - run: gh search issues --repo "<owner>/<repo>" --state all --match body "<!-- brainspec:coordination-id=" --limit 1000 --json number,state,url,body
  - run: gh issue create --repo "<owner>/<repo>" --title "Coordination: <plan-id>" --body-file <body> --label "coordination"
    readback: gh search issues for the exact coordination marker
  - run: gh issue edit <url> --add-label "coordination" --body-file <body>
    readback: URL, title, labels, body, update time
EOF
