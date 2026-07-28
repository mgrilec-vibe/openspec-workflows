## Context

The package is authored in `.apm/skills/` and targets several agent hosts. Agent Skills use progressive disclosure: metadata governs discovery, the full `SKILL.md` loads when selected, and linked resources load only when needed. Research is grounded in the Agent Skills specification, OpenAI Codex guidance, Anthropic authoring guidance, and the community `mgechev/skills-best-practices` repository.

## Goals / Non-Goals

**Goals:**

- Provide one portable skill that helps an AI author or revise Agent Skills from real domain evidence.
- Preserve precise activation through standards-compliant, third-person, bounded metadata.
- Make structural and behavioral validation integral to authoring, including a no-skill or prior-version baseline when evaluating behavior.
- Keep the added `SKILL.md` concise and self-contained unless a deferred resource materially improves an infrequent path.

**Non-Goals:**

- Build a runtime, evaluator, or plugin-distribution system.
- Add generic domain instructions, bundled libraries, or a second source of truth for the Agent Skills specification.
- Guarantee a host-specific discovery location, tool availability, or evaluation runner.

## Decisions

### Add one instruction-only, portable skill

The capability belongs in `.apm/skills/writing-agent-skills/SKILL.md`, matching the package's existing source layout. The initial skill does not include scripts or large references: the authoring procedure is adaptable, and adding resources without demonstrated need would spend context and duplicate external standards. If a future real workflow repeatedly needs deterministic validation or reusable templates, the skill directs authors to add a focused script or asset with an explicit load/run condition.

### Separate normative constraints from guidance

The workflow treats Agent Skills format constraints as mandatory: a skill directory contains `SKILL.md`; frontmatter has a valid `name` matching the directory and a non-empty bounded `description`. It presents OpenAI and Anthropic advice as operating guidance, while community AI-critique prompts remain optional techniques. This avoids asserting that recommendations such as line limits are hard parser failures.

### Use an evidence-to-evaluation workflow

The skill starts by inspecting a completed real task or project artifacts, extracting decisions, corrections, inputs, outputs, constraints, and failures. It then drafts a narrow procedure; performs structural validation; and evaluates discovery, execution, and boundary behavior in clean contexts. Evaluation compares a no-skill or previous-skill baseline where possible and drives only evidence-backed revisions.

### Calibrate instruction freedom per operation

The skill asks authors to use direct imperative steps for adaptable judgment, templates or parameterized procedures for common patterns, and exact commands or deterministic scripts only for fragile, repeatable, or order-sensitive operations. This avoids both vague generic prose and over-constraining safe work.

## Risks / Trade-offs

- A source-grounded skill can still false-trigger or fail on a target model; the required trigger and representative-task evaluations mitigate this but do not guarantee performance.
- `skills-ref` validates metadata but may not be installed or suitable for every production environment. The skill uses it when available and retains direct structural checks and behavioral evaluations.
- Testing every model and complete baseline comparison can be expensive. The workflow requires representative positive, negative, normal, and boundary cases, then scales coverage to the intended deployment surface.
