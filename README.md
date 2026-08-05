# OpenSpec Workflows

Portable OpenSpec workflow skills, commands, and optional OMP implementation and parent-delegation policies.

## Install the `fixer` OMP role

`fixer` is a project-local, leaf coding worker. It accepts a pre-scoped implementation task, follows local repository conventions, changes only that slice, and verifies the stated acceptance criterion. It does not perform external research, multi-step planning, primary review, or UI/UX design. The parent agent remains responsible for planning, design decisions, and splitting independent work.

To install it into another repository, copy this tracked file to the target project's OMP agent directory:

```text
<target-repository>/.omp/agents/fixer.md
```

An agent performing the installation must:

1. Create `<target-repository>/.omp/agents/` if it does not exist.
2. Copy the current `.omp/agents/fixer.md` from this repository verbatim. Repeat this copy when adopting a newer role contract.
3. Start a new OMP parent session before delegation. Agent execution re-discovers definitions, but the current session's task-tool description may not list an agent added after startup.

The role is intentionally not installed through this package's APM targets; copy the tracked file into each project that should expose it. Project-level OMP agents take precedence over user-level and bundled agents with the same name.

## Install the parent delegation policy

Copy `.omp/APPEND_SYSTEM.md` from this repository to:

```text
<target-repository>/.omp/APPEND_SYSTEM.md
```

This is an append-only OMP system instruction: it preserves the default OMP guidance while teaching the parent agent when and how to route execution-ready slices to `fixer`. Start a new OMP parent session after copying it.

The policy requires the parent to pre-resolve decisions, assign exclusive file ownership, state constraints and acceptance evidence, batch only independent slices, and continue parent-side work while non-blocking `fixer` jobs run. The parent still owns integration, conflict resolution, and broader verification.


## Delegate a coding slice

Use `agent: "fixer"` in a `task` invocation. Give it an independent, fully specified slice:

```json
{
  "context": "# Decision\nAn empty optional value returns `undefined`; it must not throw or become an empty string.\n\n# Constraints\nPreserve the public parser API. Another worker owns `src/parser/lexer.ts`; do not modify it.\n\n# Coordination\nThis is an independent implementation lane. The parent will integrate and run broader verification.",
  "tasks": [
    {
      "name": "FixOptionalParser",
      "agent": "fixer",
      "task": "# Target\n- src/parser/optional.ts: parseOptionalValue\n- test/parser/optional.test.ts\n\n# Change\nImplement the decided empty-value behavior and update only the focused regression test.\n\n# Boundaries\n- Do not change lexer behavior or exported parser signatures.\n- Preserve existing non-empty optional-value behavior.\n\n# Acceptance\n1. Run `npm test -- test/parser/optional.test.ts`.\n2. Confirm an empty optional value returns `undefined`.\n3. Confirm a non-empty optional value retains its existing result."
    }
  ]
}
```

The parent session's spawn policy must allow `fixer`: use `spawns: "*"` or include `fixer` in its allowed-agent list. Otherwise OMP rejects the delegation before the worker starts.

`fixer` cannot spawn child agents. It has only implementation tools and does not autoload skills, keeping its behavior predictable. It returns `## Summary`, `## Changes`, and `## Verification` headings for the parent to reconcile. Do not delegate a real coding task while OMP plan mode is active: plan mode makes subagents read-only.

## BrainSpec token reduction (slim skills)

This branch adds a new `.apm/slim-skills/` directory containing the slim
variants of the BrainSpec lifecycle skills. The slim skills are installed
alongside the original `brainspec-*` skills so both can be tested side by
side; the originals are byte-identical to `origin/main` and unchanged.

### Skill source of truth

| Variant | Directory | Tool names |
| --- | --- | --- |
| Original (verbose) | `.apm/skills/brainspec-<stage>/SKILL.md` | `brainspec-explore`, `brainspec-propose`, `brainspec-apply`, `brainspec-archive`, `brainspec-coordinate` |
| Slim | `.apm/slim-skills/brainspec-slim-<stage>/SKILL.md` | `brainspec-slim-explore`, `brainspec-slim-propose`, `brainspec-slim-apply`, `brainspec-slim-archive`, `brainspec-slim-coordinate` |

Each slim skill delegates its procedural content to a script in
`scripts/brainspec-<stage>.sh`. The stub carries the invocation boundary,
hard stops, guardrails, and every externally visible rule (marker formats,
lifecycle label set, metadata schema, `Refs` / `Closes` linkage,
strict-validation contract). The mechanical procedure lives in the script,
which the agent runs via `Bash(scripts:*)` (added to `allowed-tools`).

### What the slim skills preserve

- The canonical issue marker `<!-- brainspec:increment-id=<id> -->`.
- The bounded boundaries (`proposal:start`, `implementation:start`,
  `archive:start`, `exploration:start`).
- The lifecycle label set (`explore`, `needs-human`, `proposed`,
  `implementing`, `archiving`, `review`, `fixing`).
- The `github-issue.json` schema (`schemaVersion: 2` with exactly seven
  keys).
- The `Refs #` / `Closes #` PR-linkage rule.
- The strict-validation contract and the ordered
  `gh pr edit` -> `gh pr ready` -> `gh pr merge` transition.

### What the slim skills change

- The marker in user tasks is `/brainspec-slim-<stage> <id>` rather than
  `/brainspec-<stage> <id>`. The agent still reports the handoff to the
  next explicit invocation; the next stage is the slim variant when
  running under the slim skill set.
- The procedural content (commit messages, status checks, boundary
  templates, readback rules) is not in the skill prompt; it is emitted
  as a tool result when the agent runs the script.

### Measure

```bash
npm install
npm test
```

`npm test` regenerates the optimized session against the current
`.apm/slim-skills/` state, runs the deterministic measurement against the
committed `sessions/baseline_session.jsonl`, and asserts the reduction is
>= 30%. The script exits 1 if the reduction is below target.

The baseline is captured by `npm run workload:baseline` from a working
tree whose `.apm/skills/brainspec-*/SKILL.md` files are byte-identical to
`origin/main`. The optimized session is captured by
`npm run workload:optimized`.

### What did NOT change

- No externally visible behavior: PR/issue body schema, marker formats,
  labels, commit-message conventions, and the strict-validation contract
  are all preserved.
- The `Bash(openspec:*)`, `Bash(git:*)`, `Bash(gh:*)` tools the agent
  already uses are unchanged; `Bash(scripts:*)` is additive.
- No new network calls or external dependencies beyond the local
  cl100k_base tokenizer (`gpt-tokenizer`) used by the measurement
  harness.
- The original `brainspec-*` skills in `.apm/skills/` are unchanged.
