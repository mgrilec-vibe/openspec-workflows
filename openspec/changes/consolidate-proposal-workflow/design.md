## Context

The package currently exposes a generic proposal skill, a worktree-specific proposal skill, matching prompt adapters, and legacy `.omp/` and `.agents/` mirrors. The generic and worktree skills overlap in request matching but differ in their Git and GitHub side effects. `.apm/` is the package source for the configured APM targets.

## Goals / Non-Goals

**Goals:**

- Provide one `openspec-propose` skill whose workflow always creates a sibling worktree, validated plan, planning issue, and planning pull request.
- Provide one `opsx-propose` prompt that routes explicit command users to that skill.
- Remove all worktree-specific and legacy mirrored proposal entrypoints.

**Non-Goals:**

- Removing prompt adapters for the other OpenSpec workflows.
- Changing OpenSpec artifact formats, GitHub issue content, or worktree lifecycle semantics.
- Regenerating client outputs without a repository-supported generation command.

## Decisions

- Fold the worktree workflow into `openspec-propose` rather than retaining an alias. A single skill eliminates automatic-selection ambiguity and makes the safe, reviewable behavior the default.
- Retain `opsx-propose` as a thin adapter. It provides an explicit slash-command interface without duplicating workflow instructions.
- Remove `openspec-propose-worktree` and `opsx-propose-worktree` rather than preserving compatibility shims. The old name creates another selectable path and defeats the clean cutover.
- Remove the legacy `.omp/` and `.agents/` mirror trees rather than synchronizing them. APM packages the `.apm/` source directly, while `apm pack` only generates plugin manifests and does not maintain those copies.
- Update references to `/opsx-propose` to make the canonical path discoverable.

## Risks / Trade-offs

- The canonical proposal flow now requires Git and GitHub CLI access; callers that only wanted local artifacts must use a different workflow rather than receiving an implicit local fallback.
- Clients that read the deleted legacy `.omp/` or `.agents/` paths directly must migrate to the `.apm/` package source. Keeping those copies would leave independently selectable, stale workflows in the repository.