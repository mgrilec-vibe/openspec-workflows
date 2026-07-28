---
name: writing-agent-skills
description: Creates and revises portable Agent Skills from real task and project evidence. Use when designing a new SKILL.md, improving a skill's instructions or activation metadata, packaging skill resources, or evaluating skill discovery and behavior. Do not use for a one-off prompt that does not need a reusable workflow.
license: MIT
metadata:
  author: openspec
  version: "1.0"
---

# Writing Agent Skills

Create a reusable procedure from evidence, then prove it improves the target task. Do not turn generic model knowledge or a one-off answer into a skill.

## Workflow

1. **Gather evidence.** Inspect the completed task, project conventions, runbooks, specifications, incident fixes, and feedback relevant to the proposed capability. Extract the successful sequence, inputs, outputs, constraints, corrections, failure modes, and non-obvious gotchas. If no evidence shows a repeatable gap, explain why a skill is not yet justified.
2. **Define one coherent job.** State the outcome, intended agent hosts/models, required tools and dependencies, and non-goals. List realistic prompts that should activate the skill and near-miss prompts that must not. Prefer a narrow capability that completes one workflow over a broad collection of unrelated instructions.
3. **Design evaluations before expanding instructions.** Create representative cases for normal use, an ambiguity or missing-input case, and a boundary or failure case. Define observable success criteria. For a revision, snapshot the prior skill; otherwise use a no-skill baseline when feasible.
4. **Create the package.** Make `<skill-name>/SKILL.md`. Use only a `SKILL.md` first; add resources only when a repeated or infrequent path materially needs them.
5. **Write valid discovery metadata.** The frontmatter `name` MUST match the directory; be 1–64 lowercase letters, numbers, or single hyphens; and not start or end with a hyphen. The non-empty `description` MUST be concise, third person, capability-first, and state when the skill applies. Front-load likely trigger words. Include material exclusions when they prevent false activation.
6. **Write the core procedure.** Use concise, numbered imperative steps. Include only knowledge the agent would otherwise lack: project conventions, exact interfaces, meaningful defaults, decision branches, output contract, non-obvious gotchas, and completion checks. State required inputs and preconditions. Do not explain common concepts or restate general agent behavior.
7. **Match control to risk.** Use adaptable guidance where context determines the right choice. Use a template or parameterized procedure for a preferred pattern. Use an exact command or focused deterministic script only when the operation is fragile, ordered, repetitive, or externally constrained. Give a default and a narrow escape hatch; do not present an equal-options menu.
8. **Apply progressive disclosure.** Keep the activation path and core procedure in `SKILL.md`; move detailed, conditional material into `references/`, output templates into `assets/`, and only deterministic helpers into `scripts/`. Link every deferred file directly from `SKILL.md` with a path relative to the skill root and the condition for reading or running it. Do not create reference chains. Keep the main body below the recommended 500 lines; add a contents list to long reference files.
9. **Make scripts agent-safe.** Add a script only after observing repeated, error-prone work. Document its dependency, input, output, and invocation in `SKILL.md`. Give it a small non-interactive CLI, safe defaults, meaningful exit status, and actionable diagnostics. Do not bundle library code or assume unverified credentials, network access, or installed packages.
10. **Validate the draft.** Run `skills-ref validate <skill-directory>` when `skills-ref` is available. Otherwise manually verify the directory/name match, frontmatter constraints, YAML parsing, relative paths, declared dependencies, and that every referenced file exists. Record an unavailable validator; never claim it passed.
11. **Evaluate in clean contexts.** Test at least three should-trigger prompts and three near-miss prompts against the description. Run the normal, ambiguity, and boundary cases with the skill in isolated contexts. Compare each to the prior-version or no-skill baseline when feasible. Check assertions against concrete output evidence, not labels or confidence.
12. **Use an AI review pass, then refine.** Ask a fresh AI instance to critique trigger boundaries, simulate the activated workflow, and raise edge cases that force guesses. Treat the critique as hypotheses. Simplify or correct the skill only for observed failures, task evidence, or a verified missing constraint; rerun affected evaluations after every change.

## Delivery checklist

Before delivering, report:

- Skill directory and `SKILL.md` location.
- Capability, trigger boundary, and material non-triggers.
- Evidence used to derive task-specific instructions and gotchas.
- Added resources, why each exists, and when it is loaded or run.
- Structural validation result, including any unavailable validator.
- Discovery and behavior evaluation cases, baseline comparison if run, concrete results, and remaining risks.

Do not deliver placeholders, untested scripts, broad routing metadata, duplicated documentation, or claims that a skill works on a host or model that was not exercised.
