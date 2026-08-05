---
name: brainspec-slim-apply
description: Runs only after the user explicitly invokes `/brainspec-slim-apply` through the host skill mechanism. Slim variant of `/brainspec-apply` that delegates procedural content to `scripts/brainspec-apply.sh`. Preserves the externally visible BrainSpec lifecycle contract. Use this for token-constrained sessions; use the full `brainspec-apply` skill for the canonical reference.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(gh:*), Bash(scripts:*)
license: MIT
compatibility: Requires OpenSpec CLI, Git, GitHub CLI authentication, and an existing BrainSpec lifecycle issue.
metadata:
  author: openspec
  version: "2.0-brainspec-slim"
  basedOn: https://github.com/Fission-AI/OpenSpec/blob/6b3623a39e96f49995d38d642738b31f68e92039/skills/openspec-apply-change/SKILL.md
---

# BrainSpec Slim Apply

Implement tasks from an OpenSpec change. Slim variant: the procedural
content lives in `scripts/brainspec-apply.sh`. The skill text below
carries only the constraints the model must reason about.

## Invocation boundary (HARD)

- Run only when the user explicitly invokes `/brainspec-slim-apply`
  through the host skill mechanism.
- A completed proposal, `proposed` label, prior-stage handoff, or
  conversational assent such as "continue", "go ahead", "do the next
  step", or "implement it" is NOT authorization.
- Never invoke, activate, delegate to, or perform work owned by
  BrainSpec Explore, Propose, or Archive.
- After Apply completes or stops without an active question, a new
  explicit `/brainspec-slim-apply <increment-id>` invocation is
  required. Use `/brainspec-slim-apply <increment-id> revise plan only:
  <scope>` to revise completed scope before Archive begins.
- At completion, record the verified `archiving` handoff, report it,
  and stop. Name `/brainspec-slim-archive <increment-id>` as the
  required next explicit invocation.

## Procedure (delegated)

Run the procedure script; it owns the canonical
`<!-- brainspec:implementation:start -->` boundary template, the
state readback rules, the metadata cross-checks, and the verification
commands. Do not invent these from memory; they live in the script.
The script interpolates the supplied increment id; commands like
`openspec status --change "${INC}"` and the marker
`<!-- brainspec:increment-id=${INC} -->` are emitted as the resolved
identity, not the literal `${INC}`.

```bash
bash scripts/brainspec-apply.sh "<increment-id>"
```

Then for each pending task reported by the script:

1. Make the minimal code change required.
2. Mark the task complete in `tasks.md`.
3. Run the focused verification command the script printed.
4. Stage only owned paths, run `git diff --cached --check`, commit
   with the scoped message the script printed, and push without force.
5. Read the same draft `Refs` pull request back at the pushed head.

For `revise plan only:` mode, follow the script's plan-only branch
exactly: reconcile every affected planning artifact, run strict
validation, commit as `docs(openspec): revise <increment-id>`, push,
then pause.

## Hard stops

- The exact `<!-- brainspec:increment-id=<increment-id> -->` marker
  appears on a closed issue, more than one issue, or with a malformed
  bounded block.
- The PR is not open, not draft, does not use `Refs`, or has a
  different base/head than metadata.
- `github-issue.json` is missing, has additional or missing keys, or
  has a different `schemaVersion` than `2`.
- The Proposal commit is not an ancestor of the PR head, or Base is
  not an ancestor of the freshly fetched default branch.
- A second pull request, another branch/worktree, or a force push is
  attempted.
- The PR diff is not confined to the change root plus owned
  implementation paths.

## Guardrails

- The lifecycle-label set is `explore`, `needs-human`, `proposed`,
  `implementing`, `archiving`, `review`, `fixing`. A label other than
  `proposed`, `implementing`, `fixing`, or `needs-human` at the start
  of Apply is a hard stop.
- Before the first implementation edit, require readback of exactly
  `implementing` and the complete Implementation checkpoint.
- Keep changes minimal and within the explicit current scope. Update
  every affected existing planning artifact when implementation
  discoveries alter the verified plan; never silently widen outcome.
- Do not edit `github-issue.json`.
- A `## Implementation blocked` boundary must record `Resume stage:
  implementing|fixing`, the exact Question, Options, Evidence, and
  Recommendation, and every lifecycle identity. Resume only from the
  recorded stage after the current user's explicit answer.
- Concrete draft-review feedback moves `implementing` to `fixing`
  only after recording the review references; the fix cycle reuses
  the same branch, worktree, and draft pull request, then returns to
  `implementing`.

## Verification (delegated)

At completion the script runs:

- `openspec validate "<increment-id>" --type change --strict`
- the named acceptance scenario
- the relevant application smoke path

and prints the per-check status. Read the result back; do not skip
checks the script reported failed.

## Output

Report the verified Implementation head SHA, Implementation tree OID,
verification status, smoke status, documentation outcome, and the
`archiving` handoff. Then stop with `/brainspec-slim-archive
<increment-id>` as the required next explicit invocation.
