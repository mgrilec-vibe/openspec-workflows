## ADDED Requirements

### Requirement: AI-assisted skill authoring workflow

The package SHALL provide a `writing-agent-skills` skill that directs an AI to create or revise a portable Agent Skill from a real completed task or project-specific artifacts. The workflow MUST extract reusable domain procedures, corrections, inputs, outputs, constraints, and failure handling rather than rely only on generic model knowledge.

#### Scenario: Authoring from existing evidence

- **WHEN** an AI is asked to create a skill and relevant task artifacts or project conventions are available
- **THEN** the skill directs the AI to inspect those sources before drafting instructions
- **AND THEN** the resulting procedure captures the reusable steps, project-specific constraints, and non-obvious failures supported by those sources

### Requirement: Portable package and discovery metadata

The skill SHALL direct authors to create a skill directory containing `SKILL.md` with valid YAML frontmatter. The `name` MUST be 1–64 lowercase alphanumeric or hyphen characters, cannot begin or end with a hyphen, cannot contain consecutive hyphens, and MUST equal the skill directory name. The non-empty `description` MUST state the capability and activation conditions in concise third-person language; it MUST include relevant trigger terms and SHOULD state material boundaries when ambiguity would cause false activation.

#### Scenario: Drafting activation metadata

- **WHEN** the AI drafts a new skill package
- **THEN** it creates `SKILL.md` at the root of a directory named exactly as the frontmatter `name`
- **AND THEN** it supplies a capability-first third-person description that states when the skill applies

### Requirement: Concise, risk-calibrated instructions

The skill SHALL direct authors to write a focused, imperative, numbered workflow with explicit preconditions, inputs, outputs, branching conditions, completion criteria, and actionable failure handling where the task requires them. It MUST retain only task-specific information the agent would not reliably know. It MUST use exact commands or deterministic scripts only when variation is unsafe, repeated, or externally constrained; otherwise it SHOULD permit context-sensitive judgment.

#### Scenario: Selecting instruction specificity

- **WHEN** a drafted workflow includes a fragile, ordered, or repetitive operation
- **THEN** the AI provides an exact validated procedure or focused script with its dependency and error behavior
- **AND THEN** it does not impose that degree of specificity on adaptable operations without evidence that it is necessary

### Requirement: Progressive disclosure and resource layout

The skill SHALL direct authors to keep `SKILL.md` as the activation and core-procedure document. It MUST add `references/`, `assets/`, or `scripts/` only when those files add material value, and MUST link each deferred file directly from `SKILL.md` with an explicit load or run condition using a relative path. It SHOULD move expanded material out of `SKILL.md` before it exceeds the Agent Skills recommended 500-line main-body guidance.

#### Scenario: Deferring a detailed reference

- **WHEN** a skill needs uncommon detailed guidance or a large output template
- **THEN** the AI stores that material in a focused resource file
- **AND THEN** `SKILL.md` names the condition under which to read or use it without introducing a chain of references

### Requirement: Structural and behavioral evaluation

The skill SHALL require validation before delivery. It MUST validate the package structure and frontmatter, using `skills-ref validate <skill-directory>` when the validator is available. It MUST define and exercise representative positive activation prompts, near-miss negative prompts, a normal task, and a boundary, ambiguity, or failure task in clean contexts. For a revised skill, or where feasible for a new skill, it SHOULD compare results with the previous version or no-skill baseline and revise only from observable failures or traces.

#### Scenario: Evaluating a draft

- **WHEN** an AI finishes a draft skill
- **THEN** it checks the package structure and metadata and records any unavailable validation dependency
- **AND THEN** it tests whether the description selects the skill for intended prompts and rejects near misses
- **AND THEN** it validates the workflow against representative task outputs and reports concrete evidence for any pass or failure
