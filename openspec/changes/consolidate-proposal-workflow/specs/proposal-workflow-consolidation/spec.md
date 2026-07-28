## ADDED Requirements

### Requirement: Canonical proposal workflow
The package SHALL expose exactly one source proposal skill named `openspec-propose`. When invoked for a new change, the skill SHALL create the planning artifacts in a sibling Git worktree, validate the change, create and record a planning issue, commit and push only the planning artifacts, and open a planning pull request.

#### Scenario: A proposal request activates the canonical skill
- **WHEN** an agent selects `openspec-propose` for a request to plan a new OpenSpec change
- **THEN** the workflow creates and retains a sibling worktree and produces a validated, reviewable planning pull request

### Requirement: Canonical explicit command
The package SHALL expose `opsx-propose` as the sole source prompt adapter for proposing an OpenSpec change. The prompt SHALL delegate to `openspec-propose`.

#### Scenario: A user invokes the proposal command
- **WHEN** a user invokes `opsx-propose` with a change request
- **THEN** the prompt directs the agent to follow the canonical `openspec-propose` workflow

### Requirement: Removed competing proposal entrypoints
The package SHALL NOT retain the `openspec-propose-worktree` source skill or the `opsx-propose-worktree` source prompt.

#### Scenario: Source workflow inventory is inspected
- **WHEN** the package's source skills and prompts are enumerated
- **THEN** no worktree-specific proposal skill or prompt is present

### Requirement: Authoritative package source
The package SHALL keep OpenSpec workflow skills and prompt adapters only in `.apm/`. The package SHALL NOT retain legacy `.omp/` or `.agents/` workflow mirrors.

#### Scenario: Package workflow paths are inspected
- **WHEN** a package consumer or maintainer inspects the repository workflow sources
- **THEN** `.apm/` is the sole source location and no legacy mirror paths can activate a stale proposal workflow