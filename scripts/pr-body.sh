#!/usr/bin/env bash
# pr-body.sh
#
# Render a lifecycle PR body for a BrainSpec increment. The script
# owns the body template; the agent does not invent the format.

set -euo pipefail

INC="${1:-}"
if [[ -z "$INC" ]]; then
  echo "state: error: missing increment-id" >&2
  exit 2
fi

cat <<EOF
## Summary
<Rendered summary for ${INC}>

## Why
<Evidence-backed rationale for ${INC}>

## Test plan
- \`npm test\` exits 0
- \`node tools/measure.mjs sessions/optimized_session.jsonl\` reports reduction

Refs #<issue-number>
EOF
