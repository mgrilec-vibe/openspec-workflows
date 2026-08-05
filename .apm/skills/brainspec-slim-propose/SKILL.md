---
name: brainspec-slim-propose
description: Runs only after the user explicitly invokes `/brainspec-slim-propose` through the host skill mechanism. Slim variant of `/brainspec-propose` that delegates procedural content to `scripts/brainspec-propose.sh` in this skill's directory. Preserves the externally visible BrainSpec lifecycle contract (marker, checkpoint boundary, label set, PR linkage, metadata schema, strict validation). Use this for token-constrained sessions; use the full `brainspec-propose` skill for the canonical reference.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(gh:*), Bash(scripts:*)
license: MIT
compatibility: Requires OpenSpec CLI, Git, GitHub CLI authentication, and an open ready BrainSpec exploration issue.
metadata:
  author: openspec
  version: "2.0-brainspec-slim"
  basedOn: https://github.com/Fission-AI/OpenSpec/blob/45cca5db6137ed209117cc70510eb3e057fb981b/skills/openspec-propose/SKILL.md
---

# BrainSpec Slim Propose

Propose a new change and generate every required planning artifact in one step. This is the slim variant: the procedural content lives in `scripts/brainspec-propose.sh` (relative to this skill's directory) and is emitted as a tool result. The skill text below carries only the constraints the model must reason about.

## Invocation boundary (HARD)

- Run only when the user explicitly invokes `/brainspec-slim-propose` through the host skill mechanism.
- Exploration readiness, an `explore` label, a prior-stage handoff, or "continue", "go ahead", "implement it" is NOT authorization.
- Never invoke, activate, delegate to, or perform work owned by BrainSpec Explore, Apply, or Archive.
- A reply that directly answers a Propose-owned clarification or recorded Proposal-blocker Question may resume the already-invoked Propose stage.
- At completion, report the Proposal checkpoint and stop. Name `/brainspec-slim-apply <increment-id>` as the required next explicit invocation.

## Procedure (delegated)

Run the procedure script; it is the authoritative reference for the canonical
issue marker, the lifecycle target schema, the artifact set, the planning
commit, the metadata schema, the proposal checkpoint template, and the
ordered commands (branch create, worktree attach, change scaffold, planning
commit, push, draft PR, metadata commit, metadata push).

```bash
bash ./scripts/brainspec-propose.sh "<increment-id>"
```

The script prints `state: prepared` followed by the imperative command
sequence. Execute them in order using `Bash(openspec:*)`, `Bash(git:*)`,
`Bash(gh:*)`. Do NOT use `gh pr create --head` before the branch exists
on origin -- the script's `git push` step must complete first.

Then:

1. If the script printed `state: blocked`, report the missing planning
   artifacts and stop. Require a separate explicit
   `/brainspec-slim-propose <change-name>` invocation to repair the
   original proposal.
2. If the script printed `state: prepared`, follow the imperative lines
   it printed (create branch, worktree, change, run status, plan, commit,
   push, draft PR, write metadata, commit metadata, push metadata).
3. When the draft pull request is open and the metadata commit is
   pushed, replace the proposal boundary in the issue with the
   `Proposal checkpoint` template the script printed, change the issue
   label from `explore` to `proposed`, and read back.

## Hard stops

- The exact `<!-- brainspec:increment-id=<increment-id> -->` marker
  appears on a closed issue or more than one issue.
- The repository is not local, or `gh auth status` fails for issue work.
- Strict validation (`openspec validate --type change --strict`) fails.
- A second pull request, another branch/worktree, or non-`Refs` linkage
  is proposed.
- The change root is not exactly `openspec/changes/<increment-id>/` or
  contains a symlink / lexical-prefix escape.
- `gh pr create --head` is invoked before the lifecycle branch exists
  on origin (i.e. before the script's `git push` step).

## Guardrails

- The lifecycle-label set is `explore`, `needs-human`, `proposed`,
  `implementing`, `archiving`, `review`, `fixing`. Accept zero or one
  exploration outcome label.
- A `Proposal blocked` boundary may only carry the question, options,
  evidence, and recommendation fields. Resume only from the recorded
  Question.
- The PR uses `Refs #<issue-number>`, never a closing keyword at this
  stage. The head branch equals metadata. Base is the immutable
  default-branch SHA.
- `github-issue.json` schema is `2` with exactly seven keys; reject
  any deviation.
- The Proposal commit, the PR head, and the `github-issue.json`
  metadata are immutable after publication.

## Output

Report the canonical issue URL, increment ID, branch, worktree path,
lifecycle PR URL, Proposal commit, Proposal tree OID, and the
`state` printed by the script. Then stop with the required next
explicit invocation.
