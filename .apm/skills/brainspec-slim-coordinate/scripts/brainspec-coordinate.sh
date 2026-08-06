#!/usr/bin/env bash
# Thin shim. Driver is co-located in this skill's scripts folder.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRIVER="${SCRIPT_DIR}/brainspec-lifecycle.sh"
if [[ "${1:-}" == "help" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  exec "${DRIVER}" help
fi
exec "${DRIVER}" coordinate --members "${1:-}"
