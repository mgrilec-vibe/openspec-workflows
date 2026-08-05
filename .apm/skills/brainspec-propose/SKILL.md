---
name: brainspec-propose
description: Runs only after the user explicitly invokes `/brainspec-propose` through the host skill mechanism. Creates the complete OpenSpec plan, lifecycle metadata, and one draft pull request without implementing, archiving, or auto-advancing.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(gh:*)
license: MIT
compatibility: Requires OpenSpec CLI, Git, GitHub CLI authentication, and an open ready BrainSpec exploration issue.
metadata:
  author: openspec
  version: "2.0-brainspec"
  basedOn: https://github.com/Fission-AI/OpenSpec/blob/45cca5db6137ed209117cc70510eb3e057fb981b/skills/openspec-propose/SKILL.md
---

Propose a new change and generate every required planning artifact in one step.

## Explicit user invocation boundary

- Run this stage only when the current user explicitly invokes `/brainspec-propose` through the host's skill mechanism.
- Exploration readiness, an `explore` label, a prior-stage handoff, or conversational assent such as “continue,” “go ahead,” “do the next step,” or “implement it” is not authorization to run Propose.
- Never invoke, activate, delegate to, or perform work owned by BrainSpec Explore, Apply, or Archive during this run.
- A reply that directly answers a still-active Propose-owned clarification or recorded Proposal-blocker Question may resume only the already-invoked Propose stage. After Propose completes or stops without such an active question, a new explicit `/brainspec-propose <increment-id>` invocation is required.
- At completion, report the Proposal checkpoint and stop. Name `/brainspec-apply <increment-id>` as the required next explicit invocation, but never execute it, ask to implement, or treat a natural-language reply as an Apply invocation.

Create the artifacts defined by the selected schema. With the default spec-driven schema:
- `proposal.md` (what and why)
- `specs/<capability>/spec.md` (delta requirements)
- `design.md` (how)
- `tasks.md` (implementation steps)

---

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`, `view`). Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Input**: The user's request should include a change name (kebab-case) OR a description of what they want to build.

**Steps**

1. **If no clear input provided, ask what they want to build**

   Ask the user (open-ended, no preset options):
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" → `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Create the change directory**
   ```bash
   openspec new change "<name>"
   ```
   This creates a scaffolded change in the planning home resolved by the CLI with `.openspec.yaml`.

3. **Get the artifact build order**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to get:
   - `applyRequires`: array of artifact IDs needed before implementation (e.g., `["tasks"]`)
   - `artifacts`: list of all artifacts, each with its `status` and its `requires` edges (the artifact IDs it directly depends on)
   - `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path and scope context. Use these instead of assuming repo-local paths.

4. **Create every artifact in the required set**

   Use a todo list to track progress through the artifacts.

   Loop through artifacts in dependency order (artifacts with no pending dependencies first):

   a. **For each artifact that is `ready` (dependencies satisfied)**:
      - Get instructions:
        ```bash
        openspec instructions <artifact-id> --change "<name>" --json
        ```
      - The instructions JSON includes:
        - `context`: Project background (constraints for you - do NOT include in output)
        - `rules`: Artifact-specific rules (constraints for you - do NOT include in output)
        - `template`: The structure to use for your output file
        - `instruction`: Schema-specific guidance for this artifact type
        - `skipped`/`warning`: present when the change declares skip_specs and this artifact must NOT be created - stop and pick another artifact
        - `resolvedOutputPath`: Resolved path or pattern to write the artifact
        - `dependencies`: Completed artifacts to read for context
      - Read any completed dependency files for context - always re-read them from disk, even if you saw them earlier in the conversation (the user may have edited them)
      - If the `instruction` field delegates creation to a specific skill or command, invoke it to produce the artifact instead of writing the file yourself, then verify the artifact file exists at `resolvedOutputPath`
      - Otherwise create the artifact file using `template` as the structure and write it to `resolvedOutputPath`. If `resolvedOutputPath` is a glob, follow `instruction` to choose the concrete file path
      - Apply `context` and `rules` as constraints - but do NOT copy them into the file
      - Show brief progress: "Created <artifact-id>"

   b. **Continue until every artifact in the required set exists (not just `apply.requires`)**
      - After creating each artifact, re-run `openspec status --change "<name>" --json`
      - The required set is `applyRequires` plus every artifact reachable from those by following the `requires` edges in `status --json` - walk them transitively (spec-driven closes over proposal, specs, design, tasks). Leave artifacts outside that set alone
      - `status` is file-existence only, so an `applyRequires` artifact reading `done` does NOT mean its dependencies exist - writing `tasks.md` early marks `tasks` done while `specs` was never written. Use each artifact's `requires` edges, not its `status`, to build the required set: a `done` artifact still lists what it depends on
      - An artifact already reading `status: "skipped"` is satisfied: the change declares `skip_specs` in `.openspec.yaml`, so its files must NOT exist. Never try to create one
      - Create every artifact in the required set that is missing, then re-check - creating one can unblock others
      - Skip one only when `status` already reports it `skipped`, or when its own `instruction` says it is conditional: run `openspec instructions <artifact-id> --change "<name>" --json` and skip only if its `instruction` field marks it optional (e.g. "create only if..."). Spec-driven's `design.md` qualifies; `specs` qualifies only via the `skipped` status above, never by your own judgment. Tell the user, and do not reconsider it
      - Dependencies are enablers, not gates: if a required artifact is still `blocked` only because you skipped a conditional dependency, write it anyway
      - Stop when every artifact in the required set is `done`, `skipped`, or was deliberately skipped

   c. **If an artifact requires user input** (unclear context):
      - Ask the user to clarify
      - Then continue with creation

5. **Show final status**
   ```bash
   openspec status --change "<name>"
   ```

**Output**

After completing all artifacts, summarize:
- Change name and location
- List of artifacts created with brief descriptions, plus any conditional artifact you skipped and why
- What's ready: "All artifacts needed for implementation are ready."
- Required next invocation: "`/brainspec-apply <increment-id>`". State that Apply will not start until the user explicitly invokes it.

**Artifact Creation Guidelines**

- Follow the `instruction` field from `openspec instructions` for each artifact type - it is the authoritative guidance, even for familiar artifact names
- If the `instruction` field directs you to use a specific skill or command to create the artifact, invoke it instead of writing the artifact directly
- The schema defines what each artifact should contain - follow it
- Read dependency artifacts for context before creating new ones
- Use `template` as the structure for your output file - fill in its sections
- **IMPORTANT**: `context` and `rules` are constraints for YOU, not content for the file
  - Do NOT copy `<context>`, `<rules>`, `<project_context>` blocks into the artifact
  - These guide what you write, but should never appear in the output

**Guardrails**
- Create every artifact the apply phase transitively depends on, not just the ids listed in `apply.requires`
- Always read dependency artifacts before creating a new one - re-read from disk, not from conversation memory (files may have changed since you last saw them)
- If context is critically unclear, ask the user - but prefer making reasonable decisions to keep momentum
- If a change with that name already exists, ask if user wants to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to next

---

## BrainSpec Process Tracking

The upstream artifact workflow remains authoritative. BrainSpec wraps it with one canonical issue, one lifecycle branch and worktree, one committed metadata file, and one draft pull request reused by Propose, Apply, and Archive.

BrainSpec supports only a repository-local planning home. A standalone store is read-only discovery and stops before any write.

### 1. Accept one ready lifecycle issue

Search open and closed issue bodies for the full literal marker:

```md
<!-- brainspec:increment-id=<increment-id> -->
```

The lifecycle-label set is `explore`, `needs-human`, `proposed`, `implementing`, `archiving`, `review`, and `fixing`. Start fresh only when exactly one matching issue is open, has one ready exploration boundary, has exactly `explore`, and has no conflicting proposal, implementation, archive, branch, worktree, change, metadata, commit, push, or pull request.

A Propose-owned blocker is exactly `needs-human` plus one `## Proposal blocked` boundary containing the issue, increment, branch, absolute worktree, base, Question, Options, Evidence, and Recommendation. Resume only after the current user explicitly answers that Question. Replace it with `## Proposal resumed`, preserve all fields, add Resolution provenance, restore `explore`, read back, and then continue. Any foreign blocker, later-stage evidence, duplicate marker, malformed boundary, closed issue, or ambiguous identity stops unchanged.

Before every issue mutation, read body, complete labels, and `updatedAt` twice; require equality, make one bounded update, and read back. Permit at most one targeted repair of an exact one-sided owned result after fresh reads and full ownership revalidation.

### 2. Prepare or recover the one lifecycle target

Use the identities recorded by Explore when present; otherwise use:

```text
branch:   <increment-id>
worktree: <parent-of-primary-worktree>/<repository-name>-<increment-id>
```

Fetch the remote default branch after read-only classification. When Explore recorded a reservation, preserve its Base and require it to be an ancestor of the fetched tip; never substitute the newer tip. Without a reservation, record the fetched tip as immutable Base. Before creating a branch, worktree, OpenSpec change, commit, push, or pull request, write and read back this issue boundary while retaining `explore`:

```md
<!-- brainspec:proposal:start -->
## Proposal prepared

- OpenSpec change: <increment-id>
- Lifecycle branch: <increment-id>
- Lifecycle worktree: <absolute deterministic sibling path>
- Base: origin/<default-branch>@<sha>
- Canonical issue: <issue URL>
- Lifecycle PR: pending
- Status: prepared
<!-- brainspec:proposal:end -->
```

The prepared checkpoint admits only these recovery states; perform only the named next transition:

- **absent:** no branch, path, change, commit, remote branch, or PR; create the recorded branch/worktree at Base;
- **branch only:** the local branch equals Base, is checked out nowhere, and path/remote/PR are absent; attach it at the recorded path;
- **clean worktree:** exact branch/path/Base, no change or remote; run `openspec new change` once;
- **pristine scaffold:** only the CLI-created `.openspec.yaml` and empty directories exist; create planning artifacts;
- **planning dirt:** every path is under the change root and the full artifact set validates; commit once;
- **planning commit unpushed:** HEAD is the unique validated planning commit and remote branch is absent or behind; push once;
- **planning commit pushed, no PR:** rebuild the all-state candidate union and create only from an empty set;
- **draft PR open, metadata absent:** verify the singleton PR and write metadata;
- **metadata-only dirt:** parse and verify the exact version-2 file, then commit it;
- **metadata commit unpushed:** reuse that exact commit and push once; and
- **metadata pushed, issue still `explore`:** reverify PR, metadata, Proposal head/tree, and repair only the Proposal issue checkpoint.

Any mixed, duplicate, unrelated, divergent, or more advanced state stops intact.

Treat the invocation, primary, and every other registered worktree as protected. The selected lifecycle worktree alone is writable. Require the recorded Base to remain an ancestor of freshly fetched default and stop if default introduced the same change root or another matching increment identity. Never replace Base, rebase, force-push, reset, clean, delete, suffix, or adopt an unrecorded target.

Run `openspec new change "<increment-id>"` once only from the exact clean-worktree state. On every retry, classify the existing scaffold and continue without rerunning creation.

### 3. Create and validate the planning set

Run `openspec status --change "<increment-id>" --json` and require:

- repository-local `planningHome`;
- `changeRoot` exactly `<lifecycle-worktree>/openspec/changes/<increment-id>`;
- every artifact, dependency, and output path contained by that root; and
- no symlink or lexical-prefix escape.

Build the required artifact set from `applyRequires` plus all transitive `requires` dependencies. For each ready artifact:

1. Run `openspec instructions <artifact-id> --change "<increment-id>" --json`.
2. Re-read completed dependency files from disk.
3. Follow the returned template, instruction, context, and artifact-specific rules.
4. Re-run status and continue until the complete required set is done, skipped by schema, or deliberately skipped by its own conditional instruction.

Carry the exploration's outcome, invariants, non-goals, named acceptance scenario, plausible defect, documentation decision, and material delivery concerns into the appropriate planning artifacts. Do not write application code, tests, build configuration, repository documentation, or canonical `openspec/specs/**`.

Run:

```bash
openspec validate "<increment-id>" --type change --strict
```

Strict validation must pass before publication.

### 4. Open the one draft lifecycle pull request

At this point `github-issue.json` must still be absent because the pull-request URL does not yet exist. Require every changed path to be beneath the exact change root. Commit the validated planning set once as:

```text
docs(openspec): propose <increment-id>
```

Push the deterministic lifecycle branch without force. Build a pull-request candidate union across all states from the expected head branch, canonical issue reference, recorded URL, and exact change-root path. Create a pull request only from an empty candidate set; otherwise reuse exactly one valid open draft candidate. Whether creation reports success or failure, rebuild the complete union and continue only with exactly one valid draft candidate. This handles a lost create response or a concurrently visible candidate without duplication. A closed-unmerged, merged-before-finalization, mismatched, or duplicate candidate stops for reconciliation.

The single pull request:

- targets the remote default branch;
- is draft;
- uses `Refs #<issue-number>`, never a closing keyword at this stage;
- identifies itself as the BrainSpec lifecycle pull request;
- summarizes the proposal, boundaries, named acceptance scenario, documentation decision, and planning paths; and
- states that Apply and Archive will add commits to this same branch and no second pull request will be opened.

Read it back and require the repository, base, head branch and SHA, draft state, issue reference, and planning-only file set.

### 5. Write committed lifecycle metadata beside the plan

After the pull request exists, create exactly:

```text
<changeRoot>/github-issue.json
```

with this schema:

```json
{
  "schemaVersion": 2,
  "incrementId": "<increment-id>",
  "issue": "<fully-qualified canonical issue URL>",
  "pullRequest": "<fully-qualified lifecycle pull-request URL>",
  "branch": "<lifecycle branch>",
  "worktree": "<historical normalized absolute path used by Propose>",
  "base": "<immutable fetched default-branch SHA>"
}
```

All seven keys are required exactly once; no additional keys are allowed in schema version 2. The issue and pull request must belong to the same fully qualified repository. The issue body must contain the exact increment marker. At creation, branch, worktree, and Base must equal the prepared checkpoint and verified Git state. The worktree value is historical provenance, not a permanent host lock; later stages may recover at a new deterministic path only after recording the relocation on the issue and proving the same repository, branch, PR head, and Git common directory. The file is committed planning metadata, lives alongside `proposal.md`, `design.md`, `tasks.md`, and delta specs, and moves unchanged with the change during Archive.

This deliberately expands the existing `github-issue.json` artifact instead of introducing a second metadata filename.

A pre-existing `github-issue.json` without `schemaVersion: 2` is legacy three-PR evidence. Never overwrite or silently upgrade it. Stop before publication and report that the increment requires its legacy workflow or an explicit, separately planned migration. New one-PR Propose may create version 2 only when the file was absent at bootstrap.

Read the file back, parse it as JSON, compare every field to live issue, pull-request, branch, worktree, and Git evidence, and rerun status plus strict validation. Stage only `github-issue.json`, run `git diff --cached --check`, commit once as:

```text
docs(brainspec): record lifecycle metadata for <increment-id>
```

Push without force. Read the pull request back at the new head and require its complete diff remains planning-only under `openspec/changes/<increment-id>/**`. This metadata-finalization commit is the immutable Proposal checkpoint head. After this checkpoint, no stage may edit `github-issue.json`; issue, PR, branch, increment, or Base drift is a hard stop. A worktree relocation uses the bounded issue-record procedure above and leaves historical metadata unchanged.

### 6. Record the Proposal checkpoint

Only after the draft pull request and metadata commit verify, replace the proposal boundary and change `explore` to `proposed` in one bounded update:

```md
<!-- brainspec:proposal:start -->
## Proposal checkpoint

- OpenSpec change: <increment-id>
- Change root: openspec/changes/<increment-id>
- Lifecycle branch: <branch>
- Lifecycle worktree: <absolute path>
- Base: <sha>
- Canonical issue: <url>
- Lifecycle PR: <url> — open draft
- Proposal commit: <metadata-finalization head sha>
- Proposal tree: <change-root subtree oid>
- Metadata: openspec/changes/<increment-id>/github-issue.json — verified
- Artifacts: <paths>
- Strict validation: passed
- Named verification: <scenario>
- Documentation: <planned path or evidence-backed None>
<!-- brainspec:proposal:end -->
```

Read back exactly `proposed`, one matching boundary, the unchanged exploration section, and all non-lifecycle labels. A body-first or label-first exact result permits one targeted repair after re-verifying the same PR, metadata, commit, tree, and protected worktrees. A `proposed` recovery is read-only unless one of those exact final-transition repairs is required.

### 7. Persist a blocker safely

If planning exposes a critical unresolved decision, write `## Proposal blocked` inside the same proposal boundary with the prepared identities, current checkpoint, Question, Options, Evidence, and Recommendation; replace only `explore` with `needs-human`; read back; and stop. Do not create or update the pull request while unresolved. Resume only through section 1 and reuse the same issue, worktree, branch, change, commits, and singleton pull request.

### Completion checks

- Exactly one canonical issue, lifecycle branch, lifecycle worktree, and open draft lifecycle pull request represent the increment.
- Every required planning artifact exists and strict validation passes.
- `github-issue.json` records the verified issue, pull request, branch, worktree, increment, and Base and is committed at the Proposal checkpoint head.
- The pull request uses `Refs`, remains draft, and contains only the change root at Propose completion.
- The issue is open with exactly `proposed` and one matching Proposal checkpoint.
- No application code, second pull request, second branch, or second worktree was created.
- Every partial state remains intact and deterministically resumable without destructive cleanup.
