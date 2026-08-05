---
name: brainspec-archive
description: Runs only after the user explicitly invokes `/brainspec-archive` through the host skill mechanism. Syncs specs, moves the completed change, finalizes and merges its existing lifecycle pull request, and records terminal evidence without auto-activating from Apply.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(gh:*)
license: MIT
compatibility: Requires OpenSpec CLI, Git, authenticated GitHub CLI, and a repository-local BrainSpec change.
metadata:
  author: openspec
  version: "2.0-brainspec"
  basedOn: https://github.com/Fission-AI/OpenSpec/blob/fc886af7f93068482bbf2c66fd1eb76b40c6a22f/skills/openspec-archive-change/SKILL.md
---

Archive a completed change in the experimental workflow.

## Explicit user invocation boundary

- Run this stage only when the current user explicitly invokes `/brainspec-archive` through the host's skill mechanism.
- An `archiving` or `review` label, completed Apply checkpoint, prior-stage handoff, or conversational assent such as “continue,” “go ahead,” “do the next step,” or “finish it” is not authorization to run Archive.
- Never invoke, activate, delegate to, or perform work owned by BrainSpec Explore, Propose, or Apply during this run.
- A reply that directly answers a still-active Archive-owned clarification or recorded sync, review, or merge-gate question may resume only the already-invoked Archive stage. After Archive stops without such an active question, a new explicit `/brainspec-archive <increment-id>` invocation is required.
- At completion or a review/merge gate, report the exact Archive state and stop. Never restart Apply or another stage automatically.

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`, `view`). Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes and ask the user to select one

   When prompting, show only active changes (not already archived).
   Include the schema used for each change if available.

   Always announce: "Using change: <name>" and how to override (e.g., `/brainspec-archive <other>`).

   **Load current archive inputs before the existing archive checks:**

   After resolving the selected change and planning root, run:
   ```bash
   openspec instructions archive --change "<name>" --json
   ```
   Keep the same selected-root flags on this command. This lookup is advisory and
   optional: it only supplies extra prompt inputs, so it must never block archiving.
   If it exits non-zero or returns invalid JSON — for example on an older CLI that
   does not support this command yet — continue the archive workflow with no
   context and no operation guidance. Do not report an error and do not stop.

   A successful response may omit both optional fields. Treat `context` as a
   required prompt-level input: read and consider it, and apply relevant project
   facts, conventions, and constraints. Treat `operationGuidance` as optional
   additive advice: read and consider every entry, and follow entries that are
   applicable and compatible with the built-in archive workflow.

   Keep both fields separate from built-in steps, explicit user choices, resolved
   paths, CLI checks, and command contracts. If context conflicts with one of those
   controlling inputs, report the conflict and preserve the controlling value. If
   guidance is inapplicable or conflicts with a controlling input, do not follow it
   and explain why. Do not infer replacement paths, skipped prompts, or flags from
   either field, and do not copy their text verbatim into specs, change artifacts,
   or archive summaries unless the user separately asks for it. These are
   prompt-level behavior contracts, not enforceable checks.

2. **Check artifact completion status**

   Run `openspec status --change "<name>" --json` to check artifact completion.

   Parse the JSON to understand:
   - `schemaName`: The workflow being used
   - `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path and scope context
   - `artifacts`: List of artifacts with their status (`done`, `skipped`, or other)

   **If any artifacts are neither `done` nor `skipped`** (skipped artifacts satisfy the requirement - the change declares skip_specs):
   - Display warning listing incomplete artifacts
   - Ask the user to confirm they want to proceed
   - Proceed if user confirms

3. **Check task completion status**

   Read the tasks file (typically `tasks.md`) to check for incomplete tasks.

   Count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Ask the user to confirm they want to proceed
   - Proceed if user confirms

   **If no tasks file exists:** Proceed without task-related warning.

4. **Assess delta spec sync state**

   Use `artifactPaths.specs.existingOutputPaths` from status JSON as the only
   delta-spec source. If the `specs` entry is missing or
   `existingOutputPaths` is empty, proceed without a sync prompt and do not infer
   delta specs from other artifacts.

   **If delta specs exist:**
   - Compare each delta spec with its corresponding main spec at `<planningHome.root>/openspec/specs/<capability>/spec.md` (use the store-aware `planningHome.root` from step 2, not a hardcoded repo path)
   - Determine what changes would be applied (adds, modifications, removals, renames)
   - Show a combined summary before prompting

   **Prompt options:**
   - If changes needed: "Sync now (recommended)", "Archive without syncing"
   - If already synced: "Archive now", "Sync anyway", "Cancel"

   Route on the answer:
   - "Cancel" — stop, do not archive
   - "Archive without syncing" or "Archive now" — proceed to archive
   - "Sync now" or "Sync anyway" — sync, then verify (below)
   - Anything else — ask again rather than archiving

   Before a selected sync writes any main spec, run
   `openspec instructions specs --change "<name>" --json` once with the same
   selected-root flags. Require a zero exit status and valid artifact-instruction
   JSON. If the lookup fails or returns invalid JSON, report the error and stop
   before writing any main spec or moving the change. A valid response with omitted
   `rules` is the no-rules case. Apply returned `rules` only to the content and
   form of main specs produced by this merge; do not use them as archive guidance,
   change CLI behavior, or copy the rule text into any output file.

   Then run the `openspec-sync-specs` workflow inline (agent-driven intelligent merge) for change '<name>', passing the delta spec analysis and the fetched specs-rule snapshot from above, and wait for it to finish. The inline sync must reuse that snapshot without fetching `specs` instructions again. Do not delegate it to a background task — step 5 would move `changeRoot` out from under a sync that is still reading it, leaving the change archived and the main specs never updated. If your agent can only run it by delegation, delegate synchronously and wait for the result.

   Then re-run the comparison from the top of this step against every capability that has a delta spec in `artifactPaths.specs.existingOutputPaths` — not only the ones the sync reports it touched. A successful sync leaves nothing left to apply, so each capability must now read as already synced:
   - ADDED requirements present
   - MODIFIED requirements carrying the scenario and description changes named in the delta, with their other scenarios intact
   - REMOVED requirements gone
   - RENAMED requirements present under the new name and absent under the old one

   If the sync failed, or any capability does not match, report what differs and stop — do not archive. Nothing has moved and `changeRoot` is intact, so the user can fix the mismatch or re-run the sync and start the archive again.

5. **Perform the archive**

   Create an `archive` directory under `planningHome.changesDir` if it doesn't exist:
   ```bash
   mkdir -p "<planningHome.changesDir>/archive"
   ```

   Generate the target name: use the change name as-is when it already starts with a `YYYY-MM-DD-` prefix; otherwise prepend the current date as `YYYY-MM-DD-<change-name>`. Never stack a second date (same rule as `openspec archive`).

   **Check if target already exists:**
   - If yes: Fail with error, suggest renaming existing archive or using different date
   - If no: Move `changeRoot` to the archive directory

   ```bash
   mv "<changeRoot>" "<planningHome.changesDir>/archive/<target-name>"
   ```

6. **Display summary**

   Show archive completion summary including:
   - Change name
   - Schema that was used
   - Archive location
   - Whether specs were synced (if applicable)
   - Note about any warnings (incomplete artifacts/tasks)

**Output On Success**

```markdown
## Archive Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** the archive path derived from `planningHome.changesDir`/<target-name>/
**Specs:** <"✓ Synced to main specs" only if the step 4 verification passed; otherwise "No delta specs" or "Sync skipped">

<"All artifacts complete. All tasks complete." — or, if archived with warnings, list them instead (e.g. "Archived with 2 incomplete tasks")>
```

**Guardrails**
- Announce the selected change; prompt for selection when it is ambiguous
- Use artifact graph (openspec status --json) for completion checking
- Don't block archive on warnings - just inform and confirm
- Preserve .openspec.yaml when moving to archive (it moves with the directory)
- Show clear summary of what happened
- If sync is requested, run the `openspec-sync-specs` workflow inline (agent-driven)
- Never archive while a spec sync is still in flight — run the sync inline and verify the main specs before moving `changeRoot`
- If delta specs exist, always run the sync assessment and show the combined summary before prompting
- Apply relevant runtime context and report conflicts; operation guidance remains advisory
- Consider every guidance entry and explain any inapplicable or conflicting advice
- Existing CLI checks, resolved paths, prompts, and command contracts are unchanged
- Artifact rules constrain only the specs being written and are never operation guidance
- Never copy runtime context, operation guidance, or artifact-rule text verbatim into output files

---

## BrainSpec Process Tracking

The upstream archive checks and spec-sync algorithm remain authoritative, but BrainSpec overrides upstream permission to archive incomplete artifacts/tasks and overrides its immediate post-move success output. For one-PR BrainSpec, every artifact and task must be complete, and success is reported only after the lifecycle PR merges and the terminal issue checkpoint reads back. BrainSpec runs inside the existing lifecycle branch, worktree, and draft pull request and opens no identity outside it.

### 1. Resolve the Archive-owned lifecycle

Search open and closed issues for the full literal marker:

```md
<!-- brainspec:increment-id=<increment-id> -->
```

The lifecycle-label set is `explore`, `needs-human`, `proposed`, `implementing`, `archiving`, `review`, and `fixing`.

Fresh finalization requires exactly one open issue with exactly `archiving`, one Proposal checkpoint, one complete Implementation checkpoint, no archive boundary, and exactly one open draft lifecycle pull request. Recovery may also admit:

- `archiving` with a verified partial spec sync, move, archive commit, or any owned PR-transition combination of `Refs|Closes` and `draft|ready`;
- `review` with the same open non-draft pull request at a verified archive head;
- `review` with an owned partial return to draft/`Refs` for concrete requested changes;
- `fixing` only for the exact Archive-owned active-root restoration handoff; and
- a closed `review` issue only when the same lifecycle pull request is verified merged and the archive issue block is missing or stale.

Any other label, open/closed mismatch, duplicate marker, multiple pull requests, merged-before-archive state, foreign blocker, malformed boundary, or ambiguous path stops unchanged. Archive never creates a sibling issue or pull request and never repairs an earlier stage by guessing.

### 2. Verify metadata and immutable checkpoints

Read the active or archived `github-issue.json` and require exactly:

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

Cross-check issue, PR, branch, increment, and Base against the marker, fully qualified repository, Proposal checkpoint, Implementation checkpoint, live pull request, and Git history. Verify the historical worktree against the Proposal checkpoint; current ownership comes from the latest bounded issue checkpoint and registration. The metadata file must be byte-identical to its Proposal-commit version and must move unchanged with the archive.

A metadata file without `schemaVersion: 2` identifies a legacy three-PR increment. Do not reinterpret its separate planning, implementation, or archive pull requests as the one lifecycle PR. Preserve it and stop for the legacy workflow or an explicit migration.

Require Proposal commit and Implementation head to be ancestors of the pull-request head. Verify their recorded change-root subtree OIDs at those immutable commits. Require concrete passed acceptance and smoke evidence, completed tasks, documentation evidence, completed-or-none review fixes, and strict validation tied to Implementation head.

The lifecycle pull request must still use the metadata branch and repository default base. Before archive publication it remains open and draft. No other PR candidate may match its issue, branch, metadata, or change paths.

Before merge, treat every worktree except the one ownership-proven current lifecycle worktree as protected. Prefer the historical path; if unavailable, recreate exactly one deterministic current-host sibling worktree from the ownership-proven PR head and record its path in the Archive boundary without editing metadata. Never create `archive/<increment-id>`, another sibling worktree, or another pull request.

For closed-`review` terminal repair after a verified merge, do not require a surviving branch or worktree. Read metadata and the archive manifest from the immutable PR head/merge tree and fresh default-branch tree, verify the recorded head and merge through GitHub, and repair only the missing/stale terminal issue block. Normal deletion of the merged head branch is not a failure.

### 3. Integrate safe default-branch advances

Fetch the remote default branch before finalization. Never rebase or force-push because Proposal and Implementation checkpoint SHAs are immutable.

If the pull-request branch is behind, inspect changes since Base and Implementation head. When default changed the same OpenSpec change root, metadata identity, or an overlapping implementation surface, stop for explicit reconciliation. Prefer repository merge-queue or tested-merge evidence without modifying lifecycle history. When repository rules require an update commit, merge the fetched default branch normally, never rebase, and classify it separately: imported second-parent paths are not stage-authored; any conflict-resolution diff against the first parent must be explicitly allowed. Push, rerun focused checks, acceptance, smoke, documentation verification, and strict validation, and record the integration SHA.

### 4. Run archive checks and decide spec synchronization

Inside the lifecycle worktree, run archive instructions, `openspec status --change "<increment-id>" --json`, artifact completion checks, task completion checks, and:

```bash
openspec validate "<increment-id>" --type change --strict
```

Require repository-local planning home, the exact active change root, contained resolved paths, every required artifact complete or schema-skipped, and every task complete. Any incomplete artifact or task is a hard stop in the one-PR lifecycle; do not use the upstream warning-confirmation escape hatch.

Use only `artifactPaths.specs.existingOutputPaths` for delta discovery. If no delta specs exist or specs are schema-skipped, record that disposition. Otherwise compare each delta with its canonical spec and show one combined summary before requesting:

- sync now; or
- archive without syncing.

For sync, fetch specs instructions once, apply only declared ADDED, MODIFIED, REMOVED, and RENAMED transformations, preserve every unrelated requirement and scenario, and verify each capability afterward. For explicit skip, require zero canonical-spec diff. Any semantic conflict, collateral edit, failed instruction, or mismatch stops before the move.

Snapshot complete text and requirement/scenario inventories for every touched canonical spec. After sync or skip, rerun strict validation and all implementation verification affected by default integration or spec changes.

### 5. Move the active change once

Record a path-, mode-, and blob-identity manifest of the complete active change root, including `.openspec.yaml`, every planning artifact, and `github-issue.json`. Use the change name unchanged if already date-prefixed; otherwise target:

```text
openspec/changes/archive/YYYY-MM-DD-<increment-id>/
```

Classify:

- active source present and target absent: move once;
- source absent and exactly one manifest-identical target present: resume without moving or adding another date;
- both, neither, multiple targets, or nonmatching content: stop without copy, deletion, rename, reset, or recreation.

After the move require source absence, one target, exact manifest equality, unchanged metadata, active-list absence, and a worktree diff limited to the move plus verified canonical-spec paths.

Commit the finalization once as:

```text
docs(openspec): archive <increment-id>
```

Reuse one matching unpushed or pushed archive commit; never create an empty replacement. Push the same lifecycle branch without force and read the same pull request back. The Proposal commit and Implementation head must remain ancestors of Archive head.

### 6. Make the one pull request review-ready

Update the existing lifecycle pull request; never create another. The transition is ordered but crash-resumable:

1. replace `Refs #<issue-number>` with exactly `Closes #<issue-number>` and update the body;
2. read back the draft/`Closes` state;
3. mark the same PR ready; and
4. read back ready/`Closes`.

Under `archiving`, draft/`Refs` is the stable pre-transition state, draft/`Closes` is body-first, ready/`Refs` is readiness-first, and ready/`Closes` is PR-transition complete. After a fresh PR/manifest/metadata read, perform only the missing PR operation once. The final body records:

- Proposal commit/tree and planning artifacts;
- Implementation head/tree, delivered behavior, task completion, acceptance, smoke, documentation, and review-fix evidence;
- archive head, dated path, spec disposition, and exact final file set; and
- a statement that this one pull request contains Propose, Apply, and Archive checkpoints.

Read ready/`Closes` back and require open non-draft state, correct base and head, exact `Closes` link, Archive head, and a final diff equal to the union of:

- planning paths through Proposal commit;
- owned code, tests, docs, and active-change updates through Implementation head; and
- the manifest-preserving archive move plus verified canonical-spec changes through Archive head.

Only ready/`Closes` permits replacing `archiving` with `review` and adding or updating this boundary while preserving the implementation checkpoint. `archiving` plus ready/`Closes` is a recoverable PR-first partial; `review` plus any earlier PR combination is an issue-first partial. After complete revalidation, perform at most the one missing issue or PR repair.

```md
<!-- brainspec:archive:start -->
## Archive prepared

- OpenSpec change: <increment-id>
- Lifecycle PR: <url> — open, ready, Closes #<issue>
- Proposal commit: <sha>
- Implementation head: <sha>
- Archive head: <sha>
- Integration head: <sha or None>
- Archived to: <repository-relative dated path>
- Metadata: <dated path>/github-issue.json — verified unchanged
- Specs: <synced and verified | no delta specs | skip_specs | sync skipped by explicit choice>
- Archive validation: passed
<!-- brainspec:archive:end -->
```

Before issue mutation, read body, complete labels, state, and `updatedAt` twice and require equality. Make one bounded body-and-label update, preserve all non-lifecycle labels, and read back. Permit at most one targeted repair of an exact body-first or label-first result after re-verifying PR head, archive manifest, metadata, checks, and protected worktrees.

### 7. Handle review feedback without creating another PR

While the issue is open `review`, ordinary approval or pending checks requires no mutation. Concrete requested changes move to `fixing`.

If the active root has already moved, Archive—not Apply—must first:

1. verify the unique archive target against the recorded pre-move manifest;
2. verify canonical-spec sync state and preserve it;
3. change the same PR back to draft and replace `Closes #<issue-number>` with `Refs #<issue-number>`, with readback after each operation;
4. move that exact target back to `openspec/changes/<increment-id>/`;
5. verify `github-issue.json` remains unchanged;
6. commit and push the restoration on the same branch;
7. change the issue to `fixing` with an exact restoration checkpoint; and
8. hand the same branch, current worktree, draft/`Refs` PR, active root, and review references to Apply.

The return-to-fixing sequence admits and repairs only its owned intermediate combinations: `review` with ready/`Closes`, draft/`Closes`, draft/`Refs`, restored-uncommitted, or restored-committed state, followed by `fixing` with draft/`Refs`. Apply performs the fixes and returns to `archiving`; Archive repeats spec assessment and finalization. If review feedback changes delta-spec semantics after a prior sync, compare against the recorded pre-sync inventory and stop on ambiguity. Never copy the tree, retain both active and archived roots, or create another PR.

### 8. Merge and record terminal evidence

Under `review`, inspect actual required checks, mergeability, approvals, and repository rules at Archive head. Missing, pending, failed, cancelled, or stale evidence blocks merge. Merge through the repository's normal permitted method only after all gates pass.

Read the same pull request back as merged. Fetch the default branch and verify:

- its merge commit is reachable;
- the active source is absent;
- exactly one dated archive target exists with the proved manifest and unchanged metadata;
- the final code, tests, docs, and canonical specs equal the verified PR-head tree; and
- Proposal, Implementation, and Archive evidence corresponds to that merged pull request.

A merge commit that preserves branch commits is preferred. For squash merge, require the merged tree to equal the verified Archive-head tree and retain stage SHAs through the pull request and issue checkpoints; do not claim those SHAs are default-branch ancestors.

The `Closes` reference must close the canonical issue. Require the closed issue to retain exactly `review` and preserve its complete label set. Replace only the archive boundary with:

```md
<!-- brainspec:archive:start -->
## Archive checkpoint

- OpenSpec change: <increment-id>
- Lifecycle PR: <url> — merged at <commit>
- Proposal commit: <sha>
- Implementation head: <sha>
- Implementation verification: <named scenario and passed evidence>
- Archive head: <sha>
- Archived to: <repository-relative dated path>
- Metadata: <dated path>/github-issue.json — verified unchanged
- Specs: <disposition>
- Archive validation: passed
<!-- brainspec:archive:end -->
```

Use the same double-read, bounded body-only update, mandatory readback, and one-repair limit. Archive never reopens the issue, changes labels after closure, or adds an `archived` label.

### Completion checks

- One canonical issue, branch, worktree, metadata file, and lifecycle pull request represent the complete increment.
- No stage opened a second pull request.
- Proposal commit, Implementation head, Archive head, and final merge tree are verified.
- The default branch contains the implementation, exact dated archive tree, unchanged `github-issue.json`, and only declared canonical-spec transformations.
- The lifecycle pull request's merge closed the issue, which remains closed with exactly `review`.
- The issue contains one terminal Archive checkpoint.
- Every partial state remains intact and recoverable without destructive cleanup or duplicate publication.
