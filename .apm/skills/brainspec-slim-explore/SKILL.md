---
name: brainspec-slim-explore
description: Runs only after the user explicitly invokes `/brainspec-slim-explore`. Delegates guards, marker search, issue creation, and readback to a single driver script. The script owns the lifecycle contract; this skill carries only the LLM-owned decisions.
allowed-tools: Bash(git:*), Bash(scripts:*)
license: MIT
compatibility: Requires GitHub CLI authentication and a target repository.
metadata:
  author: openspec
  version: "3.0-brainspec-slim-driver"
---

# BrainSpec Slim Explore

Turn a rough idea into a durable exploration checkpoint. The driver script does everything; the LLM only picks readiness.

## Invocation boundary (HARD)

- Run only when the user explicitly invokes `/brainspec-slim-explore`.
- Conversational assent ("continue", "go ahead", "do the next step") is NOT authorization.
- Never invoke Propose, Apply, or Archive; this stage ends with the explore marker published.
- At completion, report the JSON line and stop. Name `/brainspec-slim-propose <id>` as the next explicit invocation.

## Decision the LLM must own

Readiness: `ready` (publish explore label) | `blocked` (publish `needs-human`, surface unresolved questions) | `ambiguous` (publish `needs-human`, surface identifier ambiguity). Pass exactly one; the script refuses otherwise.

## Command

```bash
SKILL_DIR="<absolute path to the activated brainspec-slim-explore skill directory>"
LOG="/tmp/brainspec-explore-<id>.log"
bash "${SKILL_DIR}/scripts/brainspec-explore.sh" \
  --idea "<verbatim rough idea>" \
  --readiness ready|blocked|ambiguous \
  2>"$LOG"
```

The driver script is the only writer of GitHub state for this stage. Do not run `gh` directly.

## Output

One JSON line on stdout:

- `state: prepared` — issue created or updated. `artifact.issue`, `artifact.number`, `artifact.readiness` populated.
- `state: blocked` — `readiness` was `blocked` or `ambiguous`. Issue exists with `needs-human`.
- `state: refused` — hard stop; `reason` names the rule (marker on closed issue, marker on multiple issues, gh auth failure, etc.).

Report the JSON line as-is. Do not re-render the body. Stderr has been redirected to `$LOG`; do not read it.

## Hard stops (script-enforced)

- Marker on a closed issue or more than one issue.
- `gh auth` failure or actor lacks push on the repo.
- Missing `--idea` or `--readiness`.
- Readiness value outside the allowed set.
