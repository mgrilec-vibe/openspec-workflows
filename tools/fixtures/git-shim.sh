#!/usr/bin/env bash
echo "[git-shim] $*" >>"${BRAINSPEC_SHIM_LOG:-/dev/null}"
case "$1" in
  --version|version) echo "git version 2.0.0-shim" ;;
  *) exit 0 ;;
esac
