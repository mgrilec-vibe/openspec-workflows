---
name: brainspec-slim-archive
description: Runs only after the user explicitly invokes `/brainspec-slim-archive` through the host skill mechanism. Slim variant of `/brainspec-archive` that delegates procedural content to `scripts/brainspec-archive.sh` in this skill's directory. Preserves the externally visible BrainSpec lifecycle contract. Use this for token-constrained sessions; use the full `brainspec-archive` skill for the canonical reference.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(gh:*), Bash(scripts:*)
license: MIT
compatibility: Requires OpenSpec CLI, Git, authenticated GitHub CLI, and a repository-local BrainSpec change.
metadata:
  author: openspec
  version: "2.0-brainspec-slim"
  basedOn: https://github.com/Fission-AI/OpenSpec/blob/fc886af7f93068482bbf2c66fd1eb76b40c6a22f/skills/openspec-archive-change/SKILL.md
---

# BrainSpec Slim Archive

Archive a completed change in the experimental workflow. Slim variant:
the procedural content lives in `scripts/brainspec-archive.sh` (relative to this skill's directory). The
skill text below carries only the constraints the model must reason
about.

## Invocation boundary (HARD)

- Run only when the user explicitly invokes `/brainspec-slim-archive`
  through the host skill mechanism.
- An `archiving` or `review` label, completed Apply checkpoint,
  prior-stage handoff, or "continue", "go ahead", "finish it" is NOT
  authorization.
- Never invoke, activate, delegate to, or perform work owned by
  BrainSpec Explore, Propose, or Apply.
- A reply that directly answers an Archive-owned clarification or
  recorded sync, review, or merge-gate question may resume the
  already-invoked Archive stage.
- At completion or a review/merge gate, report the exact Archive
  state and stop. Never restart Apply or another stage automatically.

## Procedure (delegated)

Run the procedure script; it owns the canonical
`<!-- brainspec:archive:start -->` boundary template, the metadata
schema cross-checks, the spec-sync algorithm, the move-once
classification, the ordered PR-readiness transition, and the merge
gate. The script interpolates the supplied increment id.

```bash
bash ./scripts/brainspec-archive.sh "<increment-id>"
```

Then follow the script's per-step directives:

1. Resolve the Archive-owned lifecycle; the script prints the issue,
   PR, and Proposal/Implementation heads. Cross-check them against
   `github-issue.json`.
2. Fetch the remote default branch and integrate safe default-branch
   advances via the script's classification rules. Never rebase or
   force-push.
3. Run the archive checks, decide spec sync, and either sync now
   (delegated to the inline `openspec-sync-specs` workflow) or
   archive without syncing.
4. Move the active change once using the path/mode/blob-identity
   manifest the script printed. Reject duplicates and mismatches.
5. Commit finalization as `docs(openspec): archive <increment-id>`.
   Push the same lifecycle branch without force and read the PR back.
6. PR-readiness transition (ordered, crash-resumable):
   1. `gh pr edit --base <default> --body-file <archive-summary-with-Closes>`
      - readback: `isDraft=true` (body updated; `gh pr edit` does NOT
        undraft), body contains `Closes #<n>`.
   2. `gh pr ready` - readback: `state=ready`, body still contains
      `Closes #<n>`.
   3. Then merge using the script's merge-gate procedure.

## Hard stops

- The exact `<!-- brainspec:increment-id=<increment-id> -->` marker
  appears on a closed issue, more than one issue, or with a
  malformed bounded block.
- `github-issue.json` is missing, has additional or missing keys, or
  has a different `schemaVersion` than `2`.
- The PR is not the lifecycle PR, is not at the verified head, or is
  already merged.
- A second pull request, another branch/worktree, or a forced
  rewrite of the archive commit is attempted.
- A spec sync left delta requirements not applied to the canonical
  spec, or modified a requirement that the delta did not declare.
- The move produced a duplicate target or a nonmatching manifest.
- Treating `gh pr edit` as if it undrafts the PR.

## Guardrails

- The lifecycle-label set is `explore`, `needs-human`, `proposed`,
  `implementing`, `archiving`, `review`, `fixing`. Accept only the
  Archive-owned states.
- A legacy `github-issue.json` without `schemaVersion: 2` is a
  three-PR increment. Preserve it and stop for the legacy workflow
  or an explicit migration.
- Spec-sync rules apply only to the specs being written. Do not use
  them as archive guidance, CLI behavior, or copy them into output
  files.
- The Proposal commit and Implementation head must remain ancestors
  of the Archive head.
- One-PR BrainSpec requires every artifact and task complete before
  merge; the upstream warning-confirmation escape hatch is disabled.
- The `gh pr edit` -> `gh pr ready` transition is ordered but
  crash-resumable: never combine the steps, and never assume
  `gh pr edit` flips `isDraft` to `false`.

## Merge gate (delegated)

The script drives the merge. It refuses to merge unless:

- all tasks checked
- strict validation passed at the verified head
- acceptance + smoke passed
- spec sync either succeeded or was explicitly skipped with zero
  canonical-spec diff
- the PR body carries `Closes #<issue-number>` and is in `ready`
  state
- the merge commit / merge tree matches the script's expected
  identity

## Output

Report the change name, schema, archive location, sync disposition,
warnings (if any), the merged PR URL, and the terminal issue
checkpoint. Then stop.
