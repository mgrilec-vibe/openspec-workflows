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

2. **Preflight the repository and GitHub access**
   Run these commands from the repository that will receive the proposal:
   ```bash
   repo_root="$(git rev-parse --show-toplevel)"
   repo_name="$(basename "$repo_root")"
   base_branch="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')"
   worktree_path="$(dirname "$repo_root")/${repo_name}-<name>"
   gh auth status
   git fetch origin "$base_branch"
   ```

   Before continuing, verify all of the following:
   - `gh auth status` succeeds for the repository's GitHub host.
   - `<name>` does not already exist as a local branch or a branch on `origin`.
   - `worktree_path` does not already exist.
   - The planning home reported by OpenSpec is repository-local; this workflow only commits artifacts inside the new worktree.

   If any check fails, stop and explain the conflict. Never overwrite a branch or worktree.

3. **Create the isolated branch and worktree**
   From `repo_root`, create both from the remote default branch:
   ```bash
   git worktree add -b "<name>" "$worktree_path" "origin/$base_branch"
   ```

   The branch name MUST exactly equal `<name>`. The sibling directory MUST be `${repo_name}-<name>`.

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

- Never run this workflow in the original worktree after creating the sibling worktree.
- Never create an issue until OpenSpec validation succeeds, or a pull request until the issue metadata, planning-artifact commit, and push all succeed.
- Never include implementation code in the planning commit.
- Never force-push, overwrite an existing branch, or reuse an existing worktree directory.
- If the user cancels, stop immediately and leave any already-created local worktree intact.
- Keep the worktree after PR creation so implementation can continue there.
