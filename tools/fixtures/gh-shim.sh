#!/usr/bin/env bash
# Synthetic gh shim for tools/test-lifecycle.mjs. Canned responses.
# Honors --jq and --match body "<marker>" for the canonical search.
set -euo pipefail
echo "[gh-shim] $*" >>"${BRAINSPEC_SHIM_LOG:-/dev/null}"

# Extract --jq and --match pairs.
JQ_EXPR=""
MATCH_BODY=""
FULL_ARGS=("$@")
i=0
while [[ $i -lt $# ]]; do
  arg="${FULL_ARGS[$i]}"
  case "$arg" in
    --jq)     JQ_EXPR="${FULL_ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
    --match)  i=$((i+1)); next="${FULL_ARGS[$i]:-}"
              if [[ "$next" == "body" ]]; then
                MATCH_BODY="${FULL_ARGS[$((i+1))]:-}"
                i=$((i+2))
              else
                i=$((i+1))
              fi
              ;;
    *)        i=$((i+1)) ;;
  esac
done

emit() {
  local body="$1"
  if [[ -n "$JQ_EXPR" ]]; then
    printf '%s' "$body" | jq -c "$JQ_EXPR"
  else
    printf '%s\n' "$body"
  fi
}

case "$1" in
  auth)
    echo "Logged in to github.com as fixture-user"
    exit 0
    ;;
  repo)
    if [[ "$2" == "view" ]]; then
      emit '{"nameWithOwner":"fixture-org/fixture-repo"}'
    fi
    exit 0
    ;;
  api)
    if [[ "$2" == "repos/fixture-org/fixture-repo" ]]; then
      emit '{"permissions":{"push":true,"maintain":true,"admin":true}}'
      exit 0
    fi
    case "$2" in
      repos/*/issues)
        emit '{"number":99,"state":"OPEN","url":"https://github.com/fixture-org/fixture-repo/issues/99"}'
        exit 0
        ;;
      repos/*/permissions)
        emit '{"permissions":{"push":true,"maintain":true,"admin":true}}'
        exit 0
        ;;
      repos/*/issues/*)
        emit '{"number":99,"state":"OPEN","url":"https://github.com/fixture-org/fixture-repo/issues/99","body":"<!-- brainspec:increment-id=test-id -->\nbrain content"}'
        exit 0
        ;;
    esac
    ;;
  issue)
    case "$2" in
      create)
        echo "https://github.com/fixture-org/fixture-repo/issues/99"
        exit 0
        ;;
      edit|view|close)
        exit 0
        ;;
    esac
    ;;
  pr)
    case "$2" in
      view)
        emit '{"state":"OPEN","isDraft":true,"headRefName":"test-id","baseRefName":"main","headRefOid":"abc123","body":"Refs #1\n"}'
        exit 0
        ;;
      edit|ready|merge)
        exit 0
        ;;
    esac
    ;;
  search)
    # If a marker is specified, return an issue carrying it.
    if [[ -n "$MATCH_BODY" ]]; then
      cat <<EOF
[{"number":99,"state":"OPEN","url":"https://github.com/fixture-org/fixture-repo/issues/99","body":"${MATCH_BODY}\nbrain content"}]
EOF
    else
      emit '[]'
    fi
    exit 0
    ;;
  label)
    exit 0
    ;;
esac
exit 0
