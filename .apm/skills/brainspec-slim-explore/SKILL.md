---
name: brainspec-slim-explore
description: Runs only after the user explicitly invokes `/brainspec-slim-explore` through the host skill mechanism. Slim variant of `/brainspec-explore` that delegates procedural content to `scripts/brainspec-explore.sh`. Preserves the externally visible BrainSpec lifecycle contract. Use this for token-constrained sessions; use the full `brainspec-explore` skill for the canonical reference.
allowed-tools: Bash(git:*), Bash(gh:*), Bash(scripts:*)
license: MIT
metadata:
  author: openspec
  version: "2.0-brainspec-slim"
---

# BrainSpec Slim Explore

Turn a rough idea into a durable exploration checkpoint. Slim variant:
the procedural content lives in `scripts/brainspec-explore.sh`. The
skill text below carries only the constraints the model must reason
about.

## Invocation boundary (HARD)

- Run only when the user explicitly invokes `/brainspec-slim-explore`
  through the host skill mechanism.
- "propose", "implement", "continue", "proceed", "do the next step",
  "archive" is NOT an Explore invocation.
- Never invoke, activate, delegate to, or perform work owned by
  BrainSpec Propose, Apply, or Archive.
- A reply that directly answers an Explore-owned clarification may
  resume only the already-invoked Explore stage.
- At completion, report the exploration result and stop. When
  readiness is `ready`, name `/brainspec-slim-propose <increment-id>`
  as the required next explicit invocation; never execute it.

## Required input

- A rough implementation idea.
- A fully qualified target repository, inferred from the current
  checkout unless the user names one.
- A readiness decision: `ready` (default) | `blocked` |
  `ambiguous`. The script refuses to publish `ready` unless the
  caller passes it explicitly. Use `blocked` to surface unresolved
  product or technical questions; the script then emits the
  `needs-human` label and a `Proposal readiness: blocked: <reason>`
  line.

Do not demand a complete specification. Ask one question only when
two plausibly different increments would collapse to the same
kebab-case identifier or an existing increment uses the candidate
identifier; in that case the caller passes `ambiguous`.

## Procedure (delegated)

Run the procedure script; it owns the increment-id derivation, the
canonical-issue marker search, the local baseline snapshot, the
exact-marker body template, the label preflight, the
readback-after-mutation rule, and the readiness decision.

```bash
bash scripts/brainspec-explore.sh "<rough-idea>" [readiness]
```

The script prints one of: `state: ready`, `state: blocked: <reason>`,
`state: ambiguous: <details>`, or `state: error: <msg>`. Follow the
imperative lines it prints.

## Hard stops

- The exact `<!-- brainspec:increment-id=<increment-id> -->` marker
  appears on a closed issue or more than one issue.
- The repository, `HEAD`, baseline, or stable increment identifier
  cannot be resolved.
- An existing body lacks one unambiguous generated block.
- An existing issue carries any later-stage label or multiple stage
  labels.
- GitHub authentication, capability preflight, label setup, or issue
  mutation fails.
- The tracked or untracked Git baseline changes before mutation.
- The increment identifier is ambiguous under the rule above.
- The script is asked to publish `ready` while unresolved product or
  technical questions remain.

## Guardrails

- The lifecycle-label set is `explore`, `needs-human`, `proposed`,
  `implementing`, `review`, `fixing`. Accept zero or one exploration
  outcome label.
- Never create files in the repository, including under `openspec/`,
  `.apm/`, or `docs/`.
- Never run `git worktree add`, `git switch`, `git checkout -b`,
  `openspec new change`, or another Git-state-changing command.
- Never deduplicate by title alone, reopen a closed issue, or create
  a sibling issue.
- An unresolved product or technical question is NOT a hard stop.
  Capture it by passing `readiness=blocked`; the script then labels
  the issue `needs-human` and stops.
- An exploration issue must contain the exact increment marker and
  exactly one bounded `<!-- brainspec:exploration:start/end -->` block.

## Output

Report the canonical issue URL, increment ID, evidence-backed
decisions, unresolved questions, proposal-readiness value, and any
detected GitHub concurrency risk. A `needs-human` outcome ends the
run after that report.
