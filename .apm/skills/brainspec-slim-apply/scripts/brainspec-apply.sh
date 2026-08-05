#!/usr/bin/env bash
# Thin shim. Real driver: scripts/lifecycle/brainspec-lifecycle.sh.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../../" && pwd)"
DRIVER="${REPO_ROOT}/scripts/lifecycle/brainspec-lifecycle.sh"
exec "${DRIVER}" apply-verify --increment "${1:-}"
