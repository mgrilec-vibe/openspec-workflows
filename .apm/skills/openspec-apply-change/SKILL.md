---
name: openspec-apply-change
description: Implement tasks from an OpenSpec change. Use when the user wants to start implementing, continue implementation, or work through tasks.
allowed-tools: Bash(openspec:*), Bash(git:*), Bash(gh:*)
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.6.0"
---

Implement tasks from an OpenSpec change.

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`). Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes and ask the user to select one

   Always announce: "Using change: <name>". To use another change, name it in your request.

   Before reading or editing the change, verify the active worktree:
   ```bash
   worktree_root="$(git rev-parse --show-toplevel)"
   active_branch="$(git branch --show-current)"
   printf 'worktree=%s\nbranch=%s\n' "$worktree_root" "$active_branch"
   git status --short
   ```
   Record this baseline. After Step 2 returns `planningHome`, `changeRoot`, and `actionContext.allowedEditRoots`, resolve each to an absolute path and require it to equal `worktree_root` or begin with `worktree_root/`. If any path resolves outside the current worktree, or if pre-existing changes are not clearly owned by the selected change, stop before editing. Do not switch worktrees, stage, stash, reset, commit, or otherwise absorb unrelated changes.

2. **Check status to understand the schema**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to understand:
   - `schemaName`: The workflow being used (e.g., "spec-driven")
   - `planningHome`, `changeRoot`, and `actionContext`: planning scope and edit constraints
   - Which artifact contains the tasks (typically "tasks" for spec-driven, check status for others)
   - Apply the same absolute-path containment check to `planningHome.root`, `changeRoot`, and every `actionContext.allowedEditRoot`. Require the active branch to be non-default and the current worktree not to be the unique primary worktree identified from the common Git directory. If any condition fails, stop before editing; do not use the primary default-branch worktree to apply a change.

3. **Get apply instructions**

   ```bash
   openspec instructions apply --change "<name>" --json
   ```

   This returns:
   - `contextFiles`: artifact ID -> array of concrete file paths (varies by schema - could be proposal/specs/design/tasks or spec/tests/implementation/docs)
   - Progress (total, complete, remaining)
   - Task list with status
   - Dynamic instruction based on current state

   **Handle states:**
   - If `state: "blocked"` (missing artifacts): show message, suggest using openspec-continue-change
   - If `state: "all_done"`: congratulate, suggest archive
   - Otherwise: proceed to implementation

4. **Read context files**

   Read every file path listed under `contextFiles` from the apply instructions output.
   The files depend on the schema being used:
   - **spec-driven**: proposal, specs, design, tasks
   - Other schemas: follow the contextFiles from CLI output

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
   - After each rounded work chunk—one coherent, independently reviewable implementation unit, normally a completed task or tightly coupled adjacent tasks—run the focused verification that covers it.
   - Stage only files from that chunk, including the task checklist when it changed. Run `git diff --cached --check`, commit with a meaningful message such as `feat(<change>): <chunk summary>`, then push the commit before beginning the next chunk. Never include unrelated changes or force-push. If the branch has no upstream, use `git push --set-upstream origin "$(git branch --show-current)"`.
   - If verification, commit, or push fails, pause and report the failure; do not begin another chunk.
   - Continue to next task

   **Pause if:**
   - Task is unclear → ask for clarification
   - Implementation reveals a design issue → suggest updating artifacts
   - Error or blocker encountered → report and wait for guidance
   - User interrupts

7. **Publish implementation context**

   After all tasks are complete, read `<changeRoot>/github-issue.json`. It must be a JSON object with an `issue` field containing a GitHub issue URL or `owner/repo#number`. If it is absent or malformed, report that the GitHub follow-up cannot be completed; do not guess an issue.

   - Locate the current branch's pull request with `gh pr view --json number,url,headRefOid`. If one exists, review the full changed diff and post separate inline code-review comments on every critical implementation surface. Anchor each comment to its relevant changed line with `POST /repos/{owner}/{repo}/pulls/{pull_number}/comments` through `gh api`, using the PR head SHA as `commit_id`, the repository-relative `path`, the changed `line`, and `side=RIGHT`.
   - Critical surfaces include public API or configuration contracts; data/state transitions and migrations; authorization, validation, error, retry, concurrency, or performance boundaries; compatibility behavior; and tests that prove a non-obvious invariant. For a non-trivial PR with three or more critical changed locations, post at least three distinct comments. For a smaller PR, comment every critical location. Never manufacture comments merely to meet a count.
   - Each comment MUST explain the implementation fact, its behavioral or operational consequence, and—when applicable—why the chosen approach is safer than the plausible alternative or which verification proves it. NEVER use `gh pr comment`, PR conversation comments, or a generic completion summary. If no changed code line warrants an explanatory comment, report that no PR code comment was posted. The separate required issue reports may be regular issue comments because they are not code review comments.
   - Format every PR code-review body as concise GitHub Markdown: lead with the implementation fact, use inline code for identifiers, and use short labeled paragraphs such as `**Why:**`, `**Risk:**`, or `**Verification:**` only when they add context. For multi-line bodies, pass actual newline characters (for Bash, `body=$'First paragraph\n\n**Why:** context'`); NEVER place literal `\n` text inside an ordinarily quoted `--body` or `-f body` value.
   - Keep the proposal-time planning issue body unchanged. After all tasks complete, post one regular Markdown **Implementation update** comment that records what actually shipped with this structure:
     ```markdown
     ## Implementation update: <change-name>
     ### Context
     ### Delivered behavior
     ### Design decisions and trade-offs
     ### Verification
     ### Traceability
     ### Observed problems and improvements
     ```
     Build it from the proposal, specifications, design, completed tasks, implementation, and focused verification. Under **Context**, identify the planning issue and any departure from the plan. Under **Traceability**, include the PR URL and relevant commit references. Omit **Observed problems and improvements** when none exist; never invent or use placeholders.
   - Write the rendered Markdown to a temporary file outside the worktree, submit it with `gh issue comment <issue-reference> --body-file <file>`, then delete the file.
   - If the branch has no pull request, report that no PR code comment could be posted; do not create a PR automatically. If GitHub authentication or a comment command fails, report the exact failure and leave the already-pushed implementation intact.

8. **On completion or pause, show status**

   Display:
   - Tasks completed this session
   - Overall progress: "N/M tasks complete"
   - If all done: suggest archive
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

All tasks complete! Ready to archive this change.
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
- Keep going through tasks until done or blocked.
- Before every edit, validation, commit, or push, confirm the current worktree root and branch are still the selected change's worktree and inspect `git status --short`.
- If pre-existing changed paths are not clearly owned by the selected change, stop before staging or editing them. Never clean up, commit, rebase, reset, stash, or push unrelated work.
- Commit and push every rounded work chunk before starting the next one; stage only that chunk's files.
- Use `github-issue.json` only to resolve the already-created issue; never create or guess issues or PRs during apply.
- Always read context files before starting (from the apply instructions output).
- If task is ambiguous, pause and ask before implementing.
- If implementation reveals issues, pause and suggest artifact updates.
- Keep code changes minimal and scoped to each task.
- Update task checkbox immediately after completing each task.
- Pause on errors, blockers, or unclear requirements - don't guess.
- Use contextFiles from CLI output, don't assume specific file names.

**Fluid Workflow Integration**

This skill supports the "actions on a change" model:

- **Can be invoked anytime**: Before all artifacts are done (if tasks exist), after partial implementation, interleaved with other actions
- **Allows artifact updates**: If implementation reveals design issues, suggest updating artifacts - not phase-locked, work fluidly
