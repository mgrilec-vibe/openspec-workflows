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
