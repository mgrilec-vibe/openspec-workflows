---
name: openspec-archive-change
description: Finalize a completed change by merging its GitHub pull request, closing its issue, publishing a versioned release, and archiving its OpenSpec artifacts.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(gh:*)
license: MIT
compatibility: Requires Git, authenticated GitHub CLI, and OpenSpec CLI.
metadata:
  author: openspec-workflows
  version: "1.1.0"
  generatedBy: "1.6.0"
---

Archive a completed change in the experimental workflow.

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`). Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **If no change name provided, prompt for selection**

   Run `openspec list --json` to get available changes. Use the **AskUserQuestion tool** to let the user select.

   Show only active changes (not already archived).
   Include the schema used for each change if available.

   **IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

2. **Check artifact completion status**

   Run `openspec status --change "<name>" --json` to check artifact completion.

   Parse the JSON to understand:
   - `schemaName`: The workflow being used
   - `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path and scope context
   - `artifacts`: List of artifacts with their status (`done` or other)

   **If any artifacts are not `done`:**
   - Display warning listing incomplete artifacts
   - Use **AskUserQuestion tool** to confirm user wants to proceed
   - Proceed if user confirms

3. **Check task completion status**

   Read the tasks file (typically `tasks.md`) to check for incomplete tasks.

   Count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Use **AskUserQuestion tool** to confirm user wants to proceed
   - Proceed if user confirms

   **If no tasks file exists:** Proceed without task-related warning.

4. **Assess delta spec sync state**

   Use `artifactPaths.specs.existingOutputPaths` from status JSON to check for delta specs. If none exist, proceed without sync prompt.

   **If delta specs exist:**
   - Compare each delta spec with its corresponding main spec at `openspec/specs/<capability>/spec.md`
   - Determine what changes would be applied (adds, modifications, removals, renames)
   - Show a combined summary before prompting

   **Prompt options:**
   - If changes needed: "Sync now (recommended)", "Archive without syncing"
   - If already synced: "Archive now", "Sync anyway", "Cancel"

   If the user chooses "Cancel", stop without archiving. If the user chooses sync, follow the `openspec-sync-specs` workflow for the change and include the delta-spec analysis; archive only after it completes. Otherwise, archive without syncing.

5. **Publish the change before archiving**

   Publication is a hard precondition. Do not move `changeRoot` until the pull request is merged, the issue is closed, the default branch contains a version-bump commit, and a GitHub release points at that commit. If any step fails, report its exact state and leave the change active; never create a release from an unmerged PR or archive a partially published change.

   a. **Resolve GitHub traceability**

   - Read `<changeRoot>/github-issue.json`. It MUST be a JSON object with a canonical GitHub `issue` URL. Parse its `owner/repo` and issue number from that URL, then verify it with `gh issue view <issue-url> --repo <owner/repo> --json url,number,state`.
   - Resolve the associated pull request. If metadata contains a canonical `pullRequest` URL, verify that it belongs to the same repository. Otherwise, inspect open PRs for that repository and accept exactly one whose body contains a closing reference to the issue (`Closes`, `Fixes`, or `Resolves #<issue-number>` or the canonical issue URL). If none or more than one match, stop and report the candidates; do not guess or merge a planning-only PR.
   - Verify the resolved PR with `gh pr view <pr-url> --repo <owner/repo> --json url,number,state,mergeCommit,baseRefName`. Its base branch MUST equal the repository default branch. If it is open, merge it with the repository's normal merge method using `gh pr merge <pr-url> --merge --delete-branch`; then re-read it and require `state` to be `MERGED` with a merge commit. If it is already merged, retain that merge commit. Any other state is a failure.
   - Re-read the issue. If it remains open after the PR merge, close it with `gh issue close <issue-url> --repo <owner/repo>` and re-read it. Require `state` to be `CLOSED`; do not assume that the PR's closing reference closed it.
   - Once the implementation PR is verified but BEFORE running `gh pr merge`, persist an **Implementation Summary** section in the PR description immediately after the existing design summary. Compose it from the implemented code on the PR head (e.g. `gh pr diff <pr-url> --repo <owner/repo>` and the merged worktree), and include:
     - What shipped, in 1–3 short paragraphs describing the actual change rather than restating the plan.
     - The design's complete Provides, Consumes, Touches, and Non-goals boundary summary, with each **Touches** entry confirmed or updated against the files that actually changed.
     - Any deltas from the original plan (renamed files, split PRs, scope additions or removals) and their rationale.
     - A link to the closed issue and the version-bump release.
   - Use `gh pr edit <pr-url> --repo <owner/repo> --body-file "<summary-body>"` to update the description. Read it back with `gh pr view <pr-url> --repo <owner/repo> --json body --jq .body` and confirm the new section is present before proceeding to merge.
   - If the PR description cannot be updated, stop and report the failure; do not merge without a persisted implementation summary.

   b. **Bump and publish the project version**

   - Discover the repository's default branch with `gh repo view <owner/repo> --json defaultBranchRef` and use a clean worktree checked out at that branch. Fetch and fast-forward it, then verify that it contains the PR merge commit. Do not overwrite local work or bypass branch protection.
   - Read the project's documented release process and identify its single authoritative version source. Use the project's native version command when one exists so every derived version file remains consistent. Otherwise, update the single authoritative SemVer version with a patch increment. If the version source, release command, or bump type is ambiguous, stop and ask the user rather than guessing.
   - Run the focused version/release verification specified by the project. Commit only the version-bump files with `chore(release): v<new-version>` and push the commit to the default branch. Re-read the remote default branch and record the pushed commit SHA as `release_commit`. If the branch rejects the push, stop without creating a release or archiving.
   - Inspect existing releases with `gh release list --repo <owner/repo>`. Follow the established tag convention; if none exists, use `v<new-version>`. Require that neither the release nor remote tag exists: `existing_tag="$(git ls-remote --tags origin "refs/tags/<tag>")"; test -z "$existing_tag"`. Create the release with generated notes, targeting `release_commit`:
     ```bash
     gh release create "<tag>" --repo "<owner/repo>" --target "<release_commit>" --title "<tag>" --generate-notes
     ```
     Re-read it with `gh release view "<tag>" --repo "<owner/repo>" --json url,tagName,targetCommitish` and require its target to be `release_commit`.

   c. **Synchronize the primary main worktree**

   - Use `git worktree list --porcelain` to enumerate attached worktrees. Compute the absolute common Git directory with `git rev-parse --path-format=absolute --git-common-dir`, then identify the one worktree whose `git -C "<path>" rev-parse --path-format=absolute --git-dir` equals it. That is the primary repository; never identify it from its branch alone or substitute a temporary detached release worktree. If no unique primary worktree exists, stop and report the worktree list.
   - Require that primary worktree to be checked out on `<default-branch>` and clean with `git -C "<primary-worktree>" status --porcelain`. Then pull the latest default-branch changes with `git -C "<primary-worktree>" pull --ff-only origin "<default-branch>"`. Do not switch branches, stash, reset, overwrite local work, or bypass a non-fast-forward update.
   - Verify that its `HEAD` equals `origin/<default-branch>` and that `release_commit` is an ancestor of `HEAD`. Record the primary-worktree path and resulting `HEAD`. This synchronization is a hard precondition for moving `changeRoot`; if it fails, leave the change active.

6. **Perform the archive**

   Create an `archive` directory under `planningHome.changesDir` if it doesn't exist:
   ```bash
   mkdir -p "<planningHome.changesDir>/archive"
   ```

   Generate target name using current date: `YYYY-MM-DD-<change-name>`

   **Check if target already exists:**
   - If yes: Fail with error, suggest renaming existing archive or using different date
   - If no: Move `changeRoot` to the archive directory

   ```bash
   mv "<changeRoot>" "<planningHome.changesDir>/archive/YYYY-MM-DD-<name>"
   ```

7. **Display summary**

   Show archive completion summary including:
   - Change name and schema
   - Merged PR URL and closed issue URL
   - Bumped version, release tag, release URL, and release commit
   - Primary main worktree path and synchronized HEAD
   - Archive location and spec-sync status
   - Any confirmed warnings (incomplete artifacts/tasks)

**Output On Success**

```
## Archive Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Pull request:** <merged-pr-url>
**Issue:** <closed-issue-url>
**Release:** <tag> — <release-url>
**Version:** <old-version> → <new-version> at <release-commit>
**Primary worktree:** <primary-worktree> synchronized at <primary-worktree-head>
**Archived to:** <planningHome.changesDir>/archive/YYYY-MM-DD-<name>/
**Specs:** ✓ Synced to main specs (or "No delta specs" or "Sync skipped")

All publication checks passed. All artifacts and tasks are complete.
```

**Guardrails**
- Always prompt for change selection if not provided
- Use artifact graph for completion checking
- Don't block archive on artifact/task warnings, but do require publication to succeed
- Preserve `.openspec.yaml` when moving the directory
- Never guess an associated PR, version source, release command, or version bump type
- Never archive, tag, or create a release after a failed PR merge, issue closure, version bump, push, or release verification
- Never move the change until the primary main worktree has cleanly fast-forwarded to the latest default branch
- Never merge an implementation PR without first persisting the Implementation Summary section in its description
- If delta specs exist, always assess sync state and show the combined summary before prompting
