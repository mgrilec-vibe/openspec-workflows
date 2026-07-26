---
description: Archive a completed change in the experimental workflow
---

Archive a completed change in the experimental workflow.

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`). Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Input**: Optionally specify a change name after `/opsx-archive` (e.g., `/opsx-archive add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous, use AskUserQuestion to let the user select an active change. Never auto-select one.

**Workflow**

1. Run `openspec status --change "<name>" --json`. Inspect the schema, planning paths, artifact graph, and action context. Warn and ask before continuing if any artifact is incomplete.
2. Read `tasks.md` when present. Count complete and incomplete checkboxes. Warn and ask before continuing if any task is incomplete.
3. Use `artifactPaths.specs.existingOutputPaths` to assess delta-spec synchronization. If deltas exist, compare them with their main specs and summarize additions, modifications, removals, and renames before asking whether to sync. If the user chooses sync, invoke `openspec-sync-specs` for this change; if they cancel, stop.
4. **Publish before archiving.** This is mandatory and failure leaves the change active.
   - Read `<changeRoot>/github-issue.json`. Require a canonical GitHub issue URL; parse and verify its repository, number, and state with `gh issue view`.
   - Resolve the associated PR from a canonical `pullRequest` metadata URL, or only when exactly one open PR body contains a closing reference to the issue. Require the PR base to be the default branch. Do not guess, and do not merge a planning-only PR.
   - Merge an open PR with `gh pr merge --merge --delete-branch`; re-read it and require `MERGED` plus a merge commit. If it was already merged, retain its merge commit. Re-read the issue; if it remains open, close it with `gh issue close`, then require `CLOSED`.
   - In a clean worktree for the default branch, fetch and fast-forward, prove it contains the merge commit, and discover the documented release process and authoritative project version. Run the native version command where available; otherwise apply a patch SemVer bump only when there is one unambiguous version source. Stop and ask if release metadata or the bump type is ambiguous.
   - Run the focused release verification. Commit only version-bump files as `chore(release): v<new-version>`, push to the default branch, and record the resulting `release_commit`. A rejected push stops the workflow before release/archive.
   - Follow existing release-tag convention (or `v<new-version>` if none). Use `gh release list` and require the remote tag command `existing_tag="$(git ls-remote --tags origin "refs/tags/<tag>")"; test -z "$existing_tag"` to show both release and tag are absent, then run `gh release create "<tag>" --target "<release_commit>" --title "<tag>" --generate-notes`. Re-read the release and require its target to equal `release_commit`.
5. Create `<planningHome.changesDir>/archive` if needed. Compute `YYYY-MM-DD-<change-name>`, fail if it already exists, then move `changeRoot` there.
6. Summarize the archive path, spec-sync outcome, merged PR URL, closed issue URL, old/new version, release tag/URL, and release commit. Include any confirmed artifact/task warnings.

**Guardrails**
- GitHub publication must complete before the change moves. Never archive, tag, or release after a failed merge, issue closure, version bump, push, or release verification.
- Preserve `.openspec.yaml` when moving the change.
- Do not bypass protection, overwrite local work, or infer an ambiguous PR/version/release contract.
