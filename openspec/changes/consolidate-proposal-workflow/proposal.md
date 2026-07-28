## Why

Two proposal skills expose materially different repository behavior for the same request. The broad `openspec-propose` skill can activate instead of the worktree workflow, leaving planning artifacts in the primary worktree without a reviewable planning pull request.

## What Changes

- Replace the generic `openspec-propose` behavior with the existing validated sibling-worktree, planning-issue, and planning-PR workflow.
- Remove the separate `openspec-propose-worktree` skill and `opsx-propose-worktree` prompt.
- Remove the legacy `.omp/` and `.agents/` workflow mirrors so `.apm/` is the sole package source.
- Keep `opsx-propose` as the single explicit command adapter for the canonical proposal skill.
- Update proposal-workflow references so follow-on guidance names only the canonical entrypoint.

## Capabilities

### New Capabilities

- `proposal-workflow-consolidation`: Provides one unambiguous OpenSpec proposal entrypoint that always produces reviewable planning artifacts in an isolated worktree.

### Modified Capabilities

- None.

## Impact

- Modifies `.apm/skills/openspec-propose/SKILL.md` and `.apm/prompts/opsx-propose.prompt.md`.
- Removes the worktree-specific source skill and prompt, plus the legacy `.omp/` and `.agents/` workflow mirrors.
- Leaves the `.apm/` prompt adapters in place as explicit command entrypoints; they do not duplicate the workflow implementation.
- Uses APM packaging from `.apm/` rather than hand-maintained compatibility copies.