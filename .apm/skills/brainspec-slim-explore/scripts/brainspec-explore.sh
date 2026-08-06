#!/usr/bin/env bash
# Thin shim. The driver is co-located in this skill's scripts folder,
# so it travels with the skill when APM installs it. The wrapper
# resolves the driver via a stable relative path and never assumes the
# host's repository layout.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRIVER="${SCRIPT_DIR}/brainspec-lifecycle.sh"
if [[ "${1:-}" == "help" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  exec "${DRIVER}" help
fi
exec "${DRIVER}" explore --idea "${1:-}" --readiness "${2:-}"
