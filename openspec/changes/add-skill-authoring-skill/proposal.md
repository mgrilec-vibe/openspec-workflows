## Why

The package provides OpenSpec workflow skills but no reusable process for authoring portable, high-signal Agent Skills. A dedicated skill should turn evidence from real tasks into a discoverable, concise, validated skill rather than generic AI-generated instructions.

## What Changes

- Add a `writing-agent-skills` skill to the package source under `.apm/skills/`.
- Guide an AI through scope definition, source-grounded instruction extraction, standards-compliant metadata, progressive disclosure, and risk-calibrated workflows.
- Require structural validation and behavioral evaluation with positive and negative activation prompts, representative execution cases, and observable assertions.
- Capture the portable Agent Skills format while distinguishing specification requirements from platform guidance and community techniques.

## Capabilities

### New Capabilities

- `skill-authoring`: Creates and revises portable Agent Skills through an AI-assisted, evidence-driven workflow.

### Modified Capabilities

- None.

## Impact

- Adds one packaged skill at `.apm/skills/writing-agent-skills/SKILL.md`.
- Does not modify existing OpenSpec workflow skills or commands.
- Validation uses the Agent Skills reference validator when available and direct behavioral checks for the drafted skill.
