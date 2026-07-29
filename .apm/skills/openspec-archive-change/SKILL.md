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

**Primary-worktree preflight:** Before assessing or synchronizing delta specs, identify the unique primary worktree from `git worktree list --porcelain` and the absolute common Git directory. Require it to be checked out on the default branch and clean. If it is dirty, report every changed path and stop; do not assess specs, merge a PR, close an issue, publish a release, or archive the change.

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
   - If synchronization writes canonical specs, perform it in the verified change worktree, run strict change validation, commit and push only the expected canonical-spec paths, and require that commit to be present in the associated PR head before merging. Recheck mergeability and applicable PR CI for that new head. Never synchronize specs in the primary worktree or leave synchronization as an uncommitted local edit.
   - The canonical-spec sync runs **exactly once, in the change worktree** for this change. The merge to the default branch carries the synced specs forward; do not re-apply, mirror, or copy the same edits into the primary worktree, into a separate release worktree, or into any other working copy. If the change worktree's PR head does not contain the synced-spec commit after push, re-check the push result and the PR head SHA before continuing — never re-edit the synced specs in the primary worktree to compensate.
    - If `openspec validate <change> --type change --strict` fails after a sync, treat the failure as a stopping condition: report the strict-validation errors, do not edit specs in any other worktree, and ask the user whether to fix the delta spec in the change worktree or to cancel the archive. Fallback edits in the primary worktree are not allowed.

5. **Publish the change before archiving**

   Publication is a hard precondition. Do not move `changeRoot` until the pull request is merged, the issue is closed, the default branch contains a version-bump commit, and a GitHub release points at that commit. If any step fails, report its exact state and leave the change active; never create a release from an unmerged PR or archive a partially published change.
   Before resolving traceability or changing GitHub state, identify the unique primary worktree from `git worktree list --porcelain` and the absolute common Git directory. Require it to be on the default branch and clean. A dirty primary worktree blocks PR merge, issue closure, release publication, and archive; report changed paths and stop without touching them.

   a. **Resolve GitHub traceability**

   - Read `<changeRoot>/github-issue.json`. It MUST be a JSON object with a canonical GitHub `issue` URL. Parse its `owner/repo` and issue number from that URL, then verify it with `gh issue view <issue-url> --repo <owner/repo> --json url,number,state`.
   - Resolve the associated pull request. If metadata contains a canonical `pullRequest` URL, verify that it belongs to the same repository. Otherwise, inspect open PRs for that repository and accept exactly one whose body contains a closing reference to the issue (`Closes`, `Fixes`, or `Resolves #<issue-number>` or the canonical issue URL). If none or more than one match, stop and report the candidates; do not guess or merge a planning-only PR.
   - Verify the resolved PR with `gh pr view <pr-url> --repo <owner/repo> --json url,number,state,mergeCommit,baseRefName`. Its base branch MUST equal the repository default branch. If it is already merged, retain its merge commit. Any state other than `OPEN` or `MERGED` is a failure.
   - Before closing or merging an `OPEN` PR, inspect mergeability and any project-defined PR CI:
     - Query the PR's current `mergeable`, `mergeStateStatus`, and `statusCheckRollup` with `gh pr view`. Inspect the repository's PR CI configuration, including workflows triggered by `pull_request` or `pull_request_target` and any required status checks or rulesets. If the project defines applicable PR CI, require evidence that each applicable workflow ran for this PR head and that every resulting check completed successfully. A workflow or expected check with no result is missing and blocks the archive, whether or not it is a required status check; pending, failed, cancelled, or timed-out results also block it. Only when no applicable PR CI is defined may the agent record that fact and proceed.
     - If GitHub returns `UNKNOWN` mergeability, re-query until it resolves. An unresolved mergeability result blocks the archive; do not infer that no conflicts exist.
     - If the PR has merge conflicts (`mergeable` is `CONFLICTING` or `mergeStateStatus` is `DIRTY`), inspect the conflicting files and changes. Resolve and push only clearly mechanical conflicts, such as generated artifacts, lockfiles, routine version updates, or an exact non-semantic reconciliation. Re-query mergeability and rerun or recheck applicable CI after the push.
     - If resolving a conflict would require a product, behavioral, security, migration, API, data, or other non-mechanical decision, stop execution and report the conflicted files and decision required. Do not choose a side, merge the PR, close the issue, publish a release, or archive the change.
   - **Conflict classification is a hard stop.** After enumerating the conflicted files, classify **each** path as `mechanical` or `non-mechanical` *before* any read of conflict markers or any edit/write on the file. A conflict is `mechanical` only when the resolution is a deterministic textual reconciliation (generated artifacts, lockfiles, version-only updates, exact line-by-line markers with no semantic choice). Anything else — including a class definition, an exported function signature, a state-machine branch, a render loop, a JSON key reused in changed regions, or any file where the agent cannot state the resolution in one sentence without hedging — is `non-mechanical`. Present the per-file classification with the question "*File X is mechanical (one-line rationale) / non-mechanical (the decision required).*"; on the user's `non-mechanical` answer, stop without resolving any conflicted file, do not run `git checkout --theirs` or `--ours`, and do not merge, publish, or archive.
   - **No fast-discard paths.** Even on a `mechanical` classification, do not resolve a conflict by discarding one side wholesale. Forbidden forms include `git checkout --theirs <file>`, `git checkout --ours <file>`, `git checkout origin/<base> -- <file>`, `git restore --source=<base> <file>`, or any reapply-then-overwrite that throws away the conflicting branch's edits in favor of a clean base. Mechanical resolution means editing the conflict markers in place: read the markers, write the resolved lines, and remove the markers. The branch's edits remain in the result.
   - For an `OPEN` PR that passes the mergeability and CI gate, persist an **Implementation Summary** section in the PR description immediately after the existing design summary. Compose it from the implemented code on the PR head (e.g. `gh pr diff <pr-url> --repo <owner/repo>` and the merged worktree), and include:
     - What shipped, in 1–3 short paragraphs describing the actual change rather than restating the plan.
     - The design's complete Provides, Consumes, Touches, and Non-goals boundary summary, with each **Touches** entry confirmed or updated against the files that actually changed.
     - Any deltas from the original plan (renamed files, split PRs, scope additions or removals) and their rationale.
     - The canonical issue URL and `Release: pending publication`.
   - Use `gh pr edit <pr-url> --repo <owner/repo> --body-file "<summary-body>"` to update the description. Read it back with `gh pr view <pr-url> --repo <owner/repo> --json body --jq .body` and confirm the new section is present before proceeding to merge.
   - If the PR description cannot be updated, stop and report the failure; do not merge without a persisted implementation summary.
   - After the Implementation Summary has been read back successfully, merge the `OPEN` PR using the repository's normal merge method: `gh pr merge <pr-url> --merge --delete-branch`. Re-read it and require `state` to be `MERGED` with a merge commit before continuing.
   - Re-read the issue. If it remains open after the PR merge, close it with `gh issue close <issue-url> --repo <owner/repo>` and re-read it. Require `state` to be `CLOSED`; do not assume that the PR's closing reference closed it.

   b. **Bump and publish the project version**

   - Discover the repository's default branch with `gh repo view <owner/repo> --json defaultBranchRef` and use a clean worktree checked out at that branch. Fetch and fast-forward it, then verify that it contains the PR merge commit. Do not overwrite local work or bypass branch protection.
  - **Release process precondition.** Before any version bump, find the project's documented release process in this priority order: (1) a release workflow file under `.github/workflows/` that publishes semver tags on push, (2) a `release` or `version` script in `package.json`, (3) a `release-please` / `semantic-release` config (`release-please-config.json`, `.releaserc`, `release.config.js`), (4) a documented release section in `README.md` / `CONTRIBUTING.md` / `docs/`. Use `git grep -nIE 'release|version|npm version|chore\(release\)' -- 'README.md' 'CONTRIBUTING.md' 'docs/**' 2>/dev/null` (Markdown-only, case-insensitive) and read every match. Probe `package.json` separately with `node -e "const p=require('./package.json');console.log('scripts:',p.scripts||{},'version:',p.version)"` so scripts and the authoritative version are visible without filtering JSON out of the wider grep. If at least one of the four sources resolves to a concrete procedure (script name, config file, or documented tag format), treat the project as `release-enabled` and proceed with the steps below. If none resolves, treat the project as `release-absent` and **stop**: do not bump `package.json`, do not push a version commit, do not run `gh release create`. Present the user with the AskUserQuestion tool: the **recommended** option is `Skip release and continue with merge + archive only` (the merge and archive steps still proceed without a release), with alternatives to `Describe the release process in one of the four locations and retry` and `Cancel archive`. Never invent a release process from grep hints alone.
  - With the release process identified, locate the single authoritative version source and use the project's native version command when one exists so every derived version file remains consistent. Otherwise, update the single authoritative SemVer version with a patch increment. If the version source, release command, or bump type is ambiguous, stop and ask the user rather than guessing.
   - Run the focused version/release verification specified by the project. Commit only the version-bump files with `chore(release): v<new-version>` and push the commit to the default branch. Re-read the remote default branch and record the pushed commit SHA as `release_commit`. If the branch rejects the push, stop without creating a release or archiving.
   - Inspect existing releases with `gh release list --repo <owner/repo>`. Follow the established tag convention; if none exists, use `v<new-version>`. Require that neither the release nor remote tag exists: `existing_tag="$(git ls-remote --tags origin "refs/tags/<tag>")"; test -z "$existing_tag"`. Create the release with generated notes, targeting `release_commit`:
     ```bash
     gh release create "<tag>" --repo "<owner/repo>" --target "<release_commit>" --title "<tag>" --generate-notes
     ```
     Re-read it with `gh release view "<tag>" --repo "<owner/repo>" --json url,tagName,targetCommitish` and require its target to be `release_commit`.
   - Ensure the persisted Implementation Summary links to the now-closed issue and verified version-bump release, replacing `Release: pending publication` when present. If an already merged PR has no Implementation Summary, add the same section from the implemented code and include all fields above. Read it back and require the summary plus both links before archiving. If this update fails, stop and leave the published change active; do not archive it.

   c. **Synchronize the primary main worktree**

   - Use `git worktree list --porcelain` to enumerate attached worktrees. Compute the absolute common Git directory with `git rev-parse --path-format=absolute --git-common-dir`, then identify the one worktree whose `git -C "<path>" rev-parse --path-format=absolute --git-dir` equals it. That is the primary repository; never identify it from its branch alone or substitute a temporary detached release worktree. If no unique primary worktree exists, stop and report the worktree list.
   - Require that primary worktree to be checked out on `<default-branch>` and clean with `git -C "<primary-worktree>" status --porcelain`. If it is dirty, stop. Report every changed path as unrelated until its owning change is independently established. Never stage, commit, rebase, reset, stash, delete, or push primary-worktree changes as archive cleanup.
   - Then pull the latest default-branch changes with `git -C "<primary-worktree>" pull --ff-only origin "<default-branch>"`. Do not switch branches, stash, reset, overwrite local work, or bypass a non-fast-forward update.
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
- Always prompt for change selection if not provided.
- Use artifact graph for completion checking.
- Don't block archive on artifact/task warnings, but do require publication to succeed.
- Preserve `.openspec.yaml` when moving the directory.
- Never guess an associated PR, version source, release command, or version bump type.
- Never archive, tag, or create a release after a failed PR merge, issue closure, version bump, push, or release verification.
- Never move the change until the primary main worktree has cleanly fast-forwarded to the latest default branch.
- A dirty primary worktree is a hard stop. Never preserve, publish, or absorb unrelated edits by committing, rebasing, resetting, stashing, deleting, or pushing them.
- Never merge an implementation PR without first persisting the Implementation Summary section in its description.
- Never merge an implementation PR before inspecting its conflicts and, when defined, all applicable PR CI; resolve only mechanical conflicts and stop for any conflict requiring a decision.
- If delta specs exist, always assess sync state and show the combined summary before prompting.
