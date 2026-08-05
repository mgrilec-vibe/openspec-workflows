#!/usr/bin/env bash
# issue-template.sh
#
# Render a lifecycle issue body for a BrainSpec increment. The script
# owns the body template; the agent does not invent the format.

set -euo pipefail

TPL="${1:-}"
INC="${2:-}"

cat <<EOF
## Issue update (${TPL} for ${INC})
- Removed: <prior label>
- Added: <next label>
- Body updated with the implementation checkpoint boundary.
EOF
