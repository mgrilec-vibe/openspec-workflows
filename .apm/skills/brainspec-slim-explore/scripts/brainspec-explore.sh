#!/usr/bin/env bash
# Thin shim. Real driver: scripts/lifecycle/brainspec-lifecycle.sh.
# Translates legacy positional args to the driver flags.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../../" && pwd)"
DRIVER="${REPO_ROOT}/scripts/lifecycle/brainspec-lifecycle.sh"
exec "${DRIVER}" explore --idea "${1:-}" --readiness "${2:-}"
