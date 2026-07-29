---
name: openspec-propose
description: Create a fully planned OpenSpec change in a sibling Git worktree, then open a GitHub planning issue and pull request. Use when the user wants an isolated proposal branch and reviewable planning artifacts.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(gh:*)
license: MIT
compatibility: Requires Git, GitHub CLI authentication, and the OpenSpec CLI.
metadata:
  author: openspec-workflows
  version: "1.1.0"
---

Create a complete OpenSpec proposal in its own worktree, publish the planning artifacts on a branch named for the change, and open a linked GitHub issue and pull request.

**Input:** A change name in kebab-case or a description of the requested work.

## Workflow

1. **Resolve the change name**
   - If the user supplies a kebab-case name, use it.
   - Otherwise, derive a concise kebab-case name from the request.
   - If the request is unclear, ask the user to clarify before making any Git or GitHub changes.
   - Announce: `Using change: <name>`.

2. **Preflight the source worktree and GitHub access**
   Run these commands from the repository that will receive the proposal:
   ```bash
   repo_root="$(git rev-parse --show-toplevel)"
   repo_name="$(basename "$repo_root")"
   source_branch="$(git branch --show-current)"
   base_branch="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')"
   worktree_path="$(dirname "$repo_root")/${repo_name}-<name>"
   printf 'source_worktree=%s\nsource_branch=%s\n' "$repo_root" "$source_branch"
   git status --short
   gh auth status
   git fetch origin "$base_branch"
   ```

   Before continuing, verify all of the following:
   - `gh auth status` succeeds for the repository's GitHub host.
   - `<name>` does not already exist as a local branch or a branch on `origin`.
   - `worktree_path` does not already exist.
   - The planning home reported by OpenSpec is repository-local; this workflow only commits artifacts inside the new worktree.
   - The source worktree, source branch, and every pre-existing changed path are recorded before creating a worktree.

   **Handling source planning edits:**
   - Never write planning artifacts in the source worktree. The sibling worktree is the only location for proposal artifacts.
   - If it contains changed canonical specs under `openspec/specs/**`, show their diffs and ask whether each belongs to this proposal. Treat all other changed paths as user work and leave them untouched.
   - Transfer is permitted only for individually confirmed **whole files** under `openspec/specs/**`. Record whether every selected path is tracked or untracked, save a binary `git diff --binary HEAD -- <confirmed-paths>` patch outside both worktrees for tracked paths, and record its checksum before creating the sibling.
   - If a source file contains both proposal and unrelated edits, is not confirmed as a whole-file move, or is untracked without explicit deletion approval, stop and ask its owner to separate or resolve it. Do not infer ownership from its path.
   - After creating the sibling worktree, translate each confirmed canonical-spec edit into the new change's delta spec at `openspec/changes/<name>/specs/<capability>/spec.md`. Do **not** copy a canonical spec into `openspec/specs/**` in the sibling: proposal commits stage only `openspec/changes/<name>`.
   - Validate and commit the target's planning artifacts. Then, as the sole permitted return to the source worktree, move each confirmed source file: run `git restore --source=HEAD --staged --worktree -- <confirmed-tracked-paths>` for tracked files, and remove only individually confirmed untracked planning files. Require `git diff --quiet HEAD -- <confirmed-tracked-paths>`, `git diff --cached --quiet -- <confirmed-tracked-paths>`, and absence of each confirmed untracked path afterward. If translation, validation, commit, cleanup, or cleanup verification fails, stop and leave both worktrees intact.
   - If any changed source path is unconfirmed or unrelated, report it but do not stage, move, reset, stash, commit, or delete it.

   If an identity, ownership, or transfer check fails, stop and explain the conflict. Never overwrite a branch or worktree.

3. **Create the isolated branch and worktree**
   From `repo_root`, create both from the remote default branch:
   ```bash
   git worktree add -b "<name>" "$worktree_path" "origin/$base_branch"
   ```

   Immediately verify the target before writing:
   ```bash
   test "$(git -C "$worktree_path" rev-parse --show-toplevel)" = "$worktree_path"
   test "$(git -C "$worktree_path" branch --show-current)" = "<name>"
   git -C "$worktree_path" status --short
   ```

   The branch name MUST exactly equal `<name>`. The sibling directory MUST be `${repo_name}-<name>`. From this point onward, run all OpenSpec artifact creation, validation, commits, and GitHub publication commands from `worktree_path`.

4. **Create all OpenSpec planning artifacts in the worktree**
   - Change into `worktree_path`.
   - Follow the artifact-creation workflow for the selected `<name>`; do not create another worktree or branch.
   - Create every artifact required by the active schema for implementation.
   - Re-run `openspec status --change "<name>" --json` until every `applyRequires` artifact has status `done`.
   - Confirm `planningHome.kind` is `repo` and that the reported `changeRoot` is below `worktree_path`. If either check fails, stop before any GitHub operation.
   - The completed `design.md` MUST contain a `## Change Boundaries` section with these four entries:
     - **Provides:** models, APIs, invariants, or behaviors it introduces.
     - **Consumes:** existing contracts it relies on.
     - **Touches:** capability specs and code areas likely to overlap.
     - **Non-goals:** adjacent responsibilities it deliberately does not own.
   - Make each entry concrete for the proposed change. Name repository-relative files or directories under **Touches** when they can be identified during planning; write `None` with a short reason when an entry does not apply. Never omit an entry.
   - Validate the completed plan:
     ```bash
     openspec validate "<name>" --type change --strict
     ```

5. **Create the GitHub planning issue and record its metadata**
   Build an issue body from the completed artifacts. It MUST include:
   - The change name, branch, and worktree path.
   - The proposal's why and what-changes summary.
   - Design decisions and trade-offs, when present.
   - The capabilities/specifications created.
   - The task outline.
   - Planned verification derived from the specification scenarios.
   - The design's complete Provides, Consumes, Touches, and Non-goals boundary summary.

   Create the issue non-interactively and record its canonical URL and number:
   ```bash
   issue_url="$(gh issue create --title "Plan: <name>" --body-file "$issue_body")"
   issue_number="$(gh issue view "$issue_url" --json number --jq '.number')"
   ```

   Write `github-issue.json` inside the change root before committing:
   ```json
   {
     "issue": "<canonical issue URL>"
   }
   ```
   Use a temporary `issue_body` file outside the worktree or remove it before committing. Do not put credentials or unrelated repository content in the issue. If issue creation or metadata writing fails, stop before committing or pushing.

6. **Commit and push only the planning artifacts**
   Stage only the change directory under the worktree's `openspec/changes/` tree, including `github-issue.json`. Do not stage unrelated files.
   ```bash
   git add -- "openspec/changes/<name>"
   git diff --cached --quiet && exit 1
   git commit -m "docs(openspec): propose <name>"
   git push --set-upstream origin "<name>"
   ```

   If the commit or push fails, stop. Leave the worktree and branch in place for recovery; do not create a pull request.

7. **Create the planning pull request**
   Build a PR body that links the issue with `Closes #<issue_number>` and lists every committed planning artifact. Then create the PR against the default branch:
   - The PR body MUST reproduce the design's complete Provides, Consumes, Touches, and Non-goals boundary summary so parallel changes can be compared without opening every artifact.
   ```bash
   gh pr create \
     --base "$base_branch" \
     --head "<name>" \
     --title "docs(openspec): propose <name>" \
     --body-file "$pr_body"
   ```

   Use a temporary `pr_body` file and remove it afterward. If a PR for `<name>` already exists, report its URL instead of creating a duplicate.

8. **Report the handoff**
   Show:
   - Change name and worktree path.
   - Branch and base branch.
   - Created planning artifacts.
   - Issue URL and PR URL.
   - Next step: implement in the retained worktree.

## Guardrails

- Never run this workflow in the original worktree after creating the sibling worktree, except to remove individually confirmed, whole-file source planning edits after the target planning commit succeeds.
- Never write proposal or canonical-spec artifacts in the source worktree. Confirm the target worktree path and branch before every artifact write, validation, commit, or push.
- Never move source canonical specs into the sibling's `openspec/specs/**`; translate confirmed source edits into the change's delta specs and commit only `openspec/changes/<name>`.
- Never create an issue until OpenSpec validation succeeds, or a pull request until the issue metadata, planning-artifact commit, and push all succeed.
- Never include implementation code in the planning commit.
- Never force-push, overwrite an existing branch, or reuse an existing worktree directory.
- If the user cancels, stop immediately and leave any already-created local worktree intact.
- Keep the worktree after PR creation so implementation can continue there.
