---
name: brainspec-slim-apply
description: Runs only after the user explicitly invokes `/brainspec-slim-apply` through the host skill mechanism. Slim variant of `/brainspec-apply` that delegates procedural content to `scripts/brainspec-apply.sh` in this skill's directory. Preserves the externally visible BrainSpec lifecycle contract. Use this for token-constrained sessions; use the full `brainspec-apply` skill for the canonical reference.
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
state readback rules, the metadata cross-checks, and the ordered
execution and verification directives. It is a deterministic directive
emitter: it does not execute commands, parse task output, run checks, or
observe statuses. Do not invent its directives from memory. The script
interpolates the supplied increment id; commands like
`openspec status --change "${INC}"` and the marker
`<!-- brainspec:increment-id=${INC} -->` are emitted as the resolved
identity, not the literal `${INC}`.

Resolve the activated skill's directory to an absolute path, then run
its co-located procedure script:

```bash
SKILL_DIR="<resolved-absolute-path-to-activated-brainspec-slim-apply-skill>"
bash "$SKILL_DIR/scripts/brainspec-apply.sh" "<increment-id>"
```

Execute every emitted command with the verified absolute lifecycle
worktree as the explicit working directory; never assume the process
working directory. First execute and read back `openspec status`, then
execute `openspec instructions apply --change "<increment-id>" --json`.
Read `progress`, `tasks`, `instruction`, optional `context`, and optional
`operationGuidance` from that executed command's output. The pending
tasks come only from this caller-observed OpenSpec output, not from the
directive emitter.

Then for each pending task in that output:

1. Make the minimal code change required.
2. Mark the task complete in `tasks.md`.
3. Run a focused verification command derived from the task and verified
   plan, and observe its command, output, and exit status.
4. Stage only owned paths, run `git diff --cached --check`, commit
   with the scoped message directed by the script, and push without force.
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

After all tasks are complete, execute the helper's completion directives
in order from the verified absolute lifecycle worktree:

1. Re-run `openspec instructions apply --change "<increment-id>" --json`
   and read back that its `tasks` and `progress` report no pending task.
2. Run `openspec validate "<increment-id>" --type change --strict`.
3. Run the named acceptance command from the verified plan.
4. Run the named relevant application smoke command from the verified
   plan.

The caller must observe and record the command, output, and exit status
for strict validation, named acceptance, and smoke. The helper only emits
these required directives; it never runs checks or prints observed
statuses. Do not complete or hand off while any required result is
missing or failed.

## Output

Report the verified Implementation head SHA, Implementation tree OID,
verification status, smoke status, documentation outcome, and the
`archiving` handoff. Then stop with `/brainspec-slim-archive
<increment-id>` as the required next explicit invocation.
