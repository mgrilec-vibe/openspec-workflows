# Delegating Pre-Scoped Implementation

When a coding change is fully decided and can be executed as an independent slice, delegate it to the project-local `fixer` role when that role is discoverable and the parent session's spawn policy permits it.

Before dispatching, the parent MUST provide:

- the already-made behavioral or API decision;
- exclusive target files or symbols, plus any allowed adjacent files;
- compatibility constraints, explicit non-goals, and concurrent changes that must not be overwritten; and
- an acceptance scenario, exact verification command or smoke-test path, and expected observable result.

Use one batched `task` call for all ready, independent `fixer` slices. Give every child the shared decision and constraints in `context`, then give each item its target, change, boundaries, and acceptance criteria in `task`. Child sessions do not inherit the parent conversation, so do not rely on unstated decisions.

Do not batch dependent slices or slices that can edit the same files. `fixer` is non-blocking: after dispatch, continue parent-side integration preparation or other independent work. Collect and reconcile worker results only at the dependency boundary.

Do not route architecture, external research, UI/UX design, broad review, or unresolved requirements to `fixer`. Do not delegate implementation to `fixer` in plan mode, because plan mode makes subagents read-only.

After results arrive, the parent owns integration, conflict resolution, broader verification, and any follow-on delegation.
