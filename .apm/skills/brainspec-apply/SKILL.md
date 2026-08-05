---
name: brainspec-apply
description: Runs only after the user explicitly invokes `/brainspec-apply` through the host skill mechanism. Implements or revises the plan on its existing lifecycle branch and draft pull request, including a plan-only scope revision after a completed Apply, without proposing, archiving, merging, or auto-advancing.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(gh:*)
license: MIT
compatibility: Requires OpenSpec CLI, Git, GitHub CLI authentication, and an existing BrainSpec lifecycle issue.
metadata:
  author: openspec
  version: "2.0-brainspec"
  basedOn: https://github.com/Fission-AI/OpenSpec/blob/6b3623a39e96f49995d38d642738b31f68e92039/skills/openspec-apply-change/SKILL.md
---

Implement tasks from an OpenSpec change.

## Explicit user invocation boundary

- Run this stage only when the current user explicitly invokes `/brainspec-apply` through the host's skill mechanism.
- A completed proposal, `proposed` label, prior-stage handoff, or conversational assent such as “continue,” “go ahead,” “do the next step,” or “implement it” is not authorization to run Apply.
- Never invoke, activate, delegate to, or perform work owned by BrainSpec Explore, Propose, or Archive during this run.
- A reply that directly answers a still-active Apply-owned clarification or recorded Implementation-blocker Question may resume only the already-invoked Apply stage. After Apply completes or stops without such an active question, a new explicit `/brainspec-apply <increment-id>` invocation is required. To revise completed scope before Archive begins, use `/brainspec-apply <increment-id> revise plan only: <scope>`.
- At completion, record the verified `archiving` handoff, report it, and stop. Name `/brainspec-archive <increment-id>` as the required next explicit invocation and the plan-only revision command as the escape hatch for a critical omission, but never execute either stage, ask to archive, or treat a natural-language reply as an invocation.

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`, `view`). Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes and ask the user to select one

   Always announce: "Using change: <name>" and how to override with a new explicit invocation (for example, `/brainspec-apply <other>`).

2. **Check status to understand the schema**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to understand:
   - `schemaName`: The workflow being used (e.g., "spec-driven")
   - `planningHome`, `changeRoot`, and `actionContext`: planning scope and edit constraints
   - Which artifact contains the tasks (typically "tasks" for spec-driven, check status for others)

3. **Get apply instructions**

   ```bash
   openspec instructions apply --change "<name>" --json
   ```

   This returns:
   - `contextFiles`: artifact ID -> array of concrete file paths (varies by schema - could be proposal/specs/design/tasks or spec/tests/implementation/docs)
   - Progress (total, complete, remaining)
   - Task list with status
   - Dynamic instruction based on current state
   - Optional `context`: current required project instruction input from the selected root
   - Optional `operationGuidance`: current advisory guidance for apply

   **Handle states:**
   - If `state: "blocked"` (missing artifacts): report the missing planning artifacts and stop; require a separate explicit `/brainspec-propose <change-name>` invocation to complete or repair the original proposal
   - If `state: "all_done"` and the current invocation explicitly requests `revise plan only: <scope>`: continue only when BrainSpec section 1 proves the pristine post-Apply handoff, even though the old task list is complete
   - If `state: "all_done"` under an Apply-owned `implementing` checkpoint whose planning revision is complete: skip the task loop and proceed to BrainSpec Process Tracking §5, “Verify and hand the same pull request to Archive,” so the revised plan still receives fresh verification and a new Implementation checkpoint
   - If `state: "all_done"` in any other state: report completion and stop; require `/brainspec-archive <change-name>`, while mentioning `/brainspec-apply <change-name> revise plan only: <scope>` only for critical scope discovered before Archive begins
   - Otherwise: proceed to implementation

   Treat `context` as a required prompt-level input. Read and consider it, and
   apply relevant project facts, conventions, and constraints while implementing.
   Treat `operationGuidance` as optional additive advice. Read and consider every
   entry, and follow entries that are applicable and compatible with the built-in
   workflow.

   Keep both fields separate from CLI-returned state, missing artifacts, tasks,
   progress, `contextFiles`, and the built-in `instruction`. They are not
   evidence of task completion, do not replace the built-in instruction, and do
   not permit bypassing a blocked state. If context conflicts with the built-in
   instruction, an explicit user choice, or a CLI-controlled value, report the
   conflict and preserve the controlling value. If guidance is inapplicable or
   conflicts with those controlling inputs, do not follow it and explain why.
   These are prompt-level behavior contracts, not enforceable checks.

4. **Read context files**

   Read every file path listed under `contextFiles` from the apply instructions output.
   The files depend on the schema being used:
   - **spec-driven**: proposal, specs, design, tasks
   - Other schemas: follow the contextFiles from CLI output

   Do not copy `context` or `operationGuidance` verbatim into implementation
   files or planning artifacts unless the user separately asks for that content.

5. **Show current progress**

   Display:
   - Schema being used
   - Progress: "N/M tasks complete"
   - Remaining tasks overview
   - Dynamic instruction from CLI

6. **Implement tasks (loop until done or blocked)**

   For each pending task:
   - Show which task is being worked on
   - Make the code changes required
   - Keep changes minimal and focused
   - Mark task complete in the tasks file: `- [ ]` → `- [x]`
   - Continue to next task

   **Pause if:**
   - Task is unclear → ask for clarification
   - Implementation reveals a design issue → reconcile the affected planning artifacts inside the active Apply invocation; pause only when the required scope decision is unclear
   - Error or blocker encountered → report and wait for guidance
   - User interrupts

7. **On completion or pause, show status**

   Display:
   - Tasks completed this session
   - Overall progress: "N/M tasks complete"
   - If all done: report that `/brainspec-archive <change-name>` is the required next explicit invocation, and that a critical omission discovered before Archive starts can use `/brainspec-apply <change-name> revise plan only: <scope>`, then stop
   - If paused: explain why and wait for guidance

**Output During Implementation**

```
## Implementing: <change-name> (schema: <schema-name>)

Working on task 3/7: <task description>
[...implementation happening...]
✓ Task complete

Working on task 4/7: <task description>
[...implementation happening...]
✓ Task complete
```

**Output On Completion**

```
## Implementation Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 7/7 tasks complete ✓

### Completed This Session
- [x] Task 1
- [x] Task 2
...

All tasks complete. Apply stops here. The user must explicitly invoke `/brainspec-archive <change-name>` to begin Archive. If critical scope was missed and Archive has not started, use `/brainspec-apply <change-name> revise plan only: <scope>`.
```

**Output On Pause (Issue Encountered)**

```
## Implementation Paused

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 4/7 tasks complete

### Issue Encountered
<description of the issue>

**Options:**
1. <option 1>
2. <option 2>
3. Other approach

What would you like to do?
```

**Guardrails**
- Keep going through tasks until done or blocked
- Always read context files before starting (from the apply instructions output)
- If task is ambiguous, pause and ask before implementing
- If implementation reveals a design issue, reconcile every affected existing planning artifact inside the active Apply invocation; pause only when a required scope decision is unclear
- Keep code changes minimal and scoped to each task
- Update task checkbox immediately after completing each task
- Pause on errors, blockers, or unclear requirements - don't guess
- Use contextFiles from CLI output, don't assume specific file names
- Do not use context or operation guidance as proof that a task is complete
- Apply relevant project context; report conflicts with controlling workflow inputs
- Consider every guidance entry; explain any inapplicable or conflicting advice
- Do not copy runtime context or operation guidance into implementation files or planning artifacts
- Preserve CLI-controlled blocked/ready/all-done behavior and completion criteria
- Treat `revise plan only:` as explicit authorization to revise existing planning artifacts and stop before implementation; it is not authorization to create a new proposal or independent product outcome
- After a plan-only revision pauses, require another explicit `/brainspec-apply <change-name>` invocation to implement or reverify the revised plan

**Fluid Workflow Integration**

This skill supports the "actions on a change" model:

- **May be explicitly invoked at Apply-owned checkpoints**: before all tasks are complete, after partial implementation, during an owned fixing recovery, or from the verified pristine post-Apply handoff for a plan-only revision. Each invocation remains confined to Apply.
- **Allows coherent artifact updates**: A `revise plan only:` invocation may update every affected existing planning artifact, add or reopen tasks, validate and publish the revised plan, then pause for a later Apply invocation. Never create a new proposal or perform a Propose checkpoint.

---

## BrainSpec Process Tracking

The upstream task loop remains authoritative. BrainSpec replaces its merged-plan assumption with one open draft lifecycle pull request and reuses the branch, worktree, metadata, and issue established by Propose. Apply never opens, replaces, merges, or closes a pull request.

### 1. Resolve the proposed checkpoint

Search open and closed issues for the full marker:

```md
<!-- brainspec:increment-id=<increment-id> -->
```

The lifecycle-label set is `explore`, `needs-human`, `proposed`, `implementing`, `archiving`, `review`, and `fixing`. Fresh Apply requires exactly one open issue with exactly `proposed`, one ready exploration boundary, one Proposal checkpoint, no archive boundary, and one open draft lifecycle pull request.

A plan-only reentry may start from `archiving` only when the current invocation explicitly requests `revise plan only: <scope>` and proves the untouched handoff produced by Apply: the issue is open with exactly `archiving`; one complete Implementation checkpoint exists; the active change root is present; the lifecycle worktree is clean; the same pull request is open, draft, uses `Refs`, and is exactly at the recorded Implementation head; metadata and Proposal evidence are unchanged; and no Archive boundary, archive target, Archive-authored commit, spec-sync mutation, move, `Closes` transition, or ready-for-review transition exists. The requested revision must complete or make verifiable the existing increment. An independently valuable outcome or reversal of an invariant or non-goal requires a separate change.

Apply-owned recovery may otherwise use `implementing`, `fixing`, or exactly `needs-human` plus one `## Implementation blocked` boundary. A blocker must record `Resume stage: implementing|fixing`, every lifecycle identity, the exact Question, Options, Evidence, and Recommendation. Resume only when the current user explicitly answers that Question; restore the recorded stage and a resolved checkpoint before code. Any foreign blocker, non-pristine `archiving`, terminal `review` without Archive-owned restoration for concrete requested changes, closed issue, merged pull request, archive move, duplicate identity, or malformed boundary stops and hands off without mutation. Apply never undoes Archive-owned work.

Before issue mutation, read body, complete labels, and `updatedAt` twice, require equality, perform one bounded update, and read back. Permit at most one targeted repair of an exact one-sided owned result after complete revalidation.

### 2. Prove the lifecycle metadata and Proposal checkpoint

Resolve the Proposal checkpoint's issue, pull request, branch, worktree, Base, Proposal commit, Proposal tree, and metadata path. Read `openspec/changes/<increment-id>/github-issue.json` and require exactly:

```json
{
  "schemaVersion": 2,
  "incrementId": "<increment-id>",
  "issue": "<canonical issue URL>",
  "pullRequest": "<lifecycle pull-request URL>",
  "branch": "<lifecycle branch>",
  "worktree": "<historical normalized absolute path used by Propose>",
  "base": "<immutable default-branch SHA>"
}
```

Reject missing, additional, duplicated, malformed, or changed fields. Cross-check issue, PR, branch, increment, and Base against live GitHub and Git history. Treat the worktree field as historical Propose provenance and verify it against the Proposal checkpoint; current local ownership comes from the latest bounded issue checkpoint plus worktree registration. `github-issue.json` is immutable after Propose.

A metadata file without `schemaVersion: 2` is a legacy three-PR increment and is outside this Apply contract. Preserve it and all associated issues, pull requests, branches, and worktrees unchanged; report that it needs the legacy workflow or an explicit migration.

Require:

- the pull request is open, draft, targets the repository default branch, uses `Refs #<issue-number>`, and uses no closing keyword;
- its head branch equals metadata and is checked out at exactly one ownership-proven lifecycle worktree;
- Proposal commit is an ancestor of the pull-request head and its change-root subtree equals Proposal tree;
- Proposal commit contains the complete strictly validated planning set and exact metadata;
- every path from Base through Proposal commit is beneath `openspec/changes/<increment-id>/**`; and
- Base remains an ancestor of freshly fetched default and of the lifecycle branch, with no conflicting default-branch change at the same change root.

Treat the invocation, primary, and every other worktree as protected. Prefer the historical metadata path when it is registered correctly. If it is unavailable, require the deterministic sibling path on the current host to be free, recreate exactly one worktree there from the ownership-proven remote PR head, and record that current path in the Implementation checkpoint before code. Never edit historical metadata merely to relocate. Dirt is accepted only when every path belongs to this increment and matches a classified Apply recovery checkpoint.

### 3. Establish Apply ownership before code

For fresh `proposed`, replace or add only this implementation boundary and change `proposed` to `implementing` in one update:

```md
<!-- brainspec:implementation:start -->
## Implementation checkpoint

- Status: implementing — transition read back before code
- Canonical issue: <url and exact marker>
- OpenSpec change: <increment-id>
- Change root: openspec/changes/<increment-id>
- Lifecycle PR: <url> — open draft
- Lifecycle branch: <branch>
- Lifecycle worktree: <absolute path>
- Base: <sha>
- Proposal commit: <sha>
- Proposal tree: <oid>
- Metadata: <path> — verified and immutable
- Implementation head: pending
- Implementation tree: pending
- Verification: pending — <named acceptance scenario>
- Smoke: pending — <named smoke path>
- Documentation: pending update/creation or verified None rationale
- Review fixes: none
<!-- brainspec:implementation:end -->
```

Require readback of exactly `implementing` and the complete checkpoint before the first implementation edit. A body-first or label-first exact partial permits one repair after re-verifying metadata, PR, branch, worktree, Proposal commit/tree, Base ancestry, and protected peers. Never infer ownership from a branch name alone.

For a verified plan-only reentry, replace the complete implementation boundary and change `archiving` to `implementing` in one bounded update before any planning edit:

```md
<!-- brainspec:implementation:start -->
## Implementation checkpoint

- Status: revising plan — implementation pending
- Canonical issue: <url and exact marker>
- OpenSpec change: <increment-id>
- Change root: openspec/changes/<increment-id>
- Lifecycle PR: <url> — open draft
- Lifecycle branch: <branch>
- Lifecycle worktree: <absolute path>
- Base: <sha>
- Proposal commit: <sha>
- Proposal tree: <oid>
- Metadata: <path> — verified and immutable
- Revision request: <explicit user-requested omission>
- Previous implementation head: <verified pushed sha>
- Previous implementation tree: <verified change-root subtree oid>
- Planning revision head: pending
- Planning revision tree: pending
- Implementation head: pending
- Implementation tree: pending
- Verification: pending — <revised named acceptance scenario>
- Smoke: pending — <revised smoke path>
- Documentation: pending update/creation or verified None rationale
- Review fixes: <preserved references or none>
<!-- brainspec:implementation:end -->
```

Read back exactly `implementing` and every field before editing. The previous Implementation head remains immutable and must be an ancestor of every later planning and implementation commit. A body-first or label-first exact partial permits the same one-repair rule as fresh ownership.

Concrete draft-review feedback may move `implementing` to `fixing` only after recording the review references in this boundary and reading back. A fixing cycle reuses the same branch, worktree, and draft pull request, then returns to `implementing` until the complete handoff in section 5.

### 4. Implement the plan

Run all `openspec status`, `openspec instructions apply`, context reads, edits, task updates, and verification in the lifecycle worktree. Before every edit, stage, commit, or push, reconfirm the root, branch, pull-request head, metadata identity, and owned status.

Follow pending tasks in order unless dependencies require another sequence. Keep changes minimal and within the explicit current scope. Mark each completed checkbox immediately. Update every affected existing planning artifact reported by the artifact graph when implementation discoveries or an authorized plan-only revision alter the verified plan; never silently widen outcome, invariants, or non-goals. Do not edit `github-issue.json`.

For `revise plan only:` mode, complete these steps before application-code edits:

1. Re-run status and artifact instructions, then reread every existing planning artifact and apply context file from disk.
2. Reconcile the explicit revision across all affected artifacts in every dependency direction. The invocation authorizes the stated revision without a second per-artifact confirmation; ask only when a critical decision remains ambiguous.
3. Preserve checked tasks that remain valid, uncheck tasks invalidated by the revision, and add unchecked implementation and verification tasks required by the revised plan. Do not create a second change or edit `github-issue.json`.
4. Run `openspec validate "<increment-id>" --type change --strict`.
5. Stage only owned active-change paths, run `git diff --cached --check`, and commit the coherent planning revision as `docs(openspec): revise <increment-id>`.
6. Push without force, read the same draft `Refs` pull request at the new head, record that commit and its change-root subtree OID as the Planning revision head/tree in the implementation boundary, and read the issue back.
7. Stop without editing application code, tests, build configuration, canonical specs, or repository documentation. Report `/brainspec-apply <increment-id>` as the required next explicit invocation.

If interrupted during steps 5–6, accept only one ownership-proven `docs(openspec): revise <increment-id>` commit whose parent is the Previous implementation head and whose diff is confined to owned active-change paths. If it is local-only, reuse and push it without force. If it is already the pull-request head while the Planning revision head/tree remain pending, perform only the bounded issue update after full revalidation. Any other commit, parent, diff, head, or partial state stops without mutation. Never create a second planning-revision commit.
After recovering the planning revision, obey the active invocation: finish a `revise plan only:` invocation by reporting `/brainspec-apply <increment-id>` and stopping; a later normal Apply invocation may continue only after the completed Planning revision head/tree read back.

On the next explicit Apply invocation, verify the same `implementing` checkpoint and exact Planning revision head/tree, reread the revised artifacts and apply instructions, then implement pending tasks normally. If the revised plan legitimately has no pending implementation task, continue to BrainSpec Process Tracking §5, “Verify and hand the same pull request to Archive,” instead of treating `all_done` as the old completion.

For each coherent implementation chunk:

1. Run focused verification that could fail for the plausible defect.
2. Stage only owned code, tests, documentation, and active change paths.
3. Run `git diff --cached --check`.
4. Commit with a scoped implementation message.
5. Push the lifecycle branch without force.
6. Read the same draft pull request back at the pushed head.

The pull request remains draft and keeps `Refs #<issue-number>` throughout Apply. Its body may be updated with delivered behavior, task progress, acceptance and smoke commands, documentation outcome, and review fixes, but its repository, base, head branch, lifecycle identity, and issue linkage are immutable.

Stage-scope validation uses stage-authored first-parent diffs plus the final pull-request diff:

- Base through Proposal commit may contain only `openspec/changes/<increment-id>/**`;
- each Apply-authored commit after Proposal may contain only owned implementation, tests, documentation, and active-change paths;
- an Archive-owned restoration commit and any recorded default-integration merge are classified separately and excluded from Apply-authored paths; imported second-parent content is not attributed to Apply, while any conflict-resolution diff against the first parent must be explicitly allowed; and
- the complete pull-request diff must equal the union of those allowed sets.

A second pull request, another branch/worktree, unrelated path, force push, rewritten Proposal commit, or changed metadata is a hard stop.

### 5. Verify and hand the same pull request to Archive

Before completion:

- require every task checked;
- reread apply instructions and current artifacts;
- run focused checks for every changed surface;
- run the named acceptance scenario exactly as planned;
- run the relevant application smoke path;
- complete the planned documentation or reverify the evidence-backed None rationale;
- run `openspec validate "<increment-id>" --type change --strict`;
- commit and push all task, design, test, verification, and documentation updates; and
- read the same draft pull request back at the verified head.

When the checkpoint contains plan-reentry provenance, preserve its Revision request, Previous implementation head/tree, and Planning revision head/tree unchanged while updating the final mutable fields below.
Record the change-root subtree OID at the verified Implementation head. Update only the mutable fields in the implementation boundary, then change `implementing` or `fixing` to `archiving` in one bounded update:

```md
<!-- brainspec:implementation:start -->
## Implementation checkpoint

- Status: complete — ready for archive finalization
- Canonical issue: <url and marker>
- OpenSpec change: <increment-id>
- Change root: openspec/changes/<increment-id>
- Lifecycle PR: <url> — open draft
- Lifecycle branch: <branch>
- Lifecycle worktree: <absolute path>
- Base: <sha>
- Proposal commit: <sha>
- Proposal tree: <oid>
- Metadata: <path> — verified and immutable
- Revision request: <recorded request or none>
- Previous implementation head: <recorded sha or none>
- Previous implementation tree: <recorded oid or none>
- Planning revision head: <recorded sha or none>
- Planning revision tree: <recorded oid or none>
- Implementation head: <pushed sha>
- Implementation tree: <change-root subtree oid>
- Verification: <concrete passed command/result>
- Smoke: <concrete passed command/result>
- Documentation: <completed paths or verified None rationale>
- Review fixes: <completed references or none>
<!-- brainspec:implementation:end -->
```

Read back exactly `archiving`, the complete checkpoint, unchanged metadata, and the same open draft pull request at Implementation head. `archiving` transfers ownership to BrainSpec Archive; Apply performs no archive move, final PR readiness transition, merge, or issue closure.

### 6. Persist an Apply-owned blocker

When a critical product, architecture, ownership, cross-increment, or recovery decision remains unresolved, replace the implementation boundary with `## Implementation blocked`. Preserve every established field, add `Resume stage: implementing|fixing`, Question, Options, Evidence, and Recommendation, replace only the current Apply-owned label with `needs-human`, and read back. Never use a blocker for pending CI, ordinary review wait, or an unmerged draft PR. Resume only from the exact recorded stage after the current user's explicit answer.

### 7. Review-fix boundary after archive preparation

Apply does not edit a moved archive tree on its own. If concrete code changes are requested after Archive has moved the active change, Archive must first prove the archive manifest, restore that exact tree to the active path in the same lifecycle worktree, change `review` to `fixing`, and record the restoration checkpoint. Apply then reuses this workflow, updates tasks and code, reruns verification, and returns to `archiving`; Archive repeats finalization. Never copy the tree, create a second archive target, or open another pull request.

### Completion checks

- Apply reused the exact issue, metadata, branch, worktree, and draft lifecycle pull request created by Propose.
- Proposal commit/tree and `github-issue.json` remained immutable and ownership-proven.
- All tasks, verification, smoke, documentation, and strict validation completed at the pushed Implementation head.
- The issue has exactly `archiving` and one complete Implementation checkpoint.
- A plan-only reentry began only from the pristine post-Apply handoff, preserved the previous Implementation evidence, committed a strictly validated planning revision, and paused before implementation.
- The pull request remains open draft with `Refs`; no second PR, branch, worktree, merge, or issue closure occurred.
- Partial state and blockers remain intact and deterministically recoverable without destructive cleanup.
