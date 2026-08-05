#!/usr/bin/env bash
# openspec shim: every validation succeeds with exit 0.
# The real openspec is not installed in the test environment.
echo "[openspec-shim] $*" >>"${BRAINSPEC_SHIM_LOG:-/dev/null}"
exit 0
