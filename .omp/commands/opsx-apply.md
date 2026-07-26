---
description: Implement tasks from an OpenSpec change (Experimental)
---

Implement tasks from an OpenSpec change.

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`). Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Input**: Optionally specify a change name (e.g., `/opsx-apply add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.
**Provided arguments**: $@

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes and use the **AskUserQuestion tool** to let the user select

   Always announce: "Using change: <name>" and how to override (e.g., `/opsx-apply <other>`).

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
   - `contextFiles`: artifact ID -> array of concrete file paths (varies by schema)
   - Progress (total, complete, remaining)
   - Task list with status
   - Dynamic instruction based on current state

   **Handle states:**
   - If `state: "blocked"` (missing artifacts): show message, suggest using `/opsx-continue`
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

   - Locate the current branch's pull request with `gh pr view --json number,url,headRefOid`. If one exists, post only inline code-review comments, each anchored to a relevant changed code line with `POST /repos/{owner}/{repo}/pulls/{pull_number}/comments` through `gh api`. Include the PR head SHA as `commit_id`, the repository-relative `path`, the changed `line`, and `side=RIGHT`. Each comment MUST clarify a non-obvious implementation decision, behavioral consequence, operational concern, or verification result at that exact code location.
   - NEVER use `gh pr comment`, PR conversation comments, or a generic completion summary. If no changed code line warrants an explanatory comment, report that no PR code comment was posted. The separate required issue reports may be regular issue comments because they are not code review comments.
   - On the referenced issue, comment on every observed problem and improvement opportunity. State the observation, its effect or evidence, and the recommended next action. Do not invent observations or post placeholder comments when none were found.
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

All tasks complete! You can archive this change with `/opsx-archive`.
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
- Commit and push every rounded work chunk before starting the next one; stage only that chunk's files.
- Use `github-issue.json` only to resolve the already-created issue; never create or guess issues or PRs during apply.
- Keep going through tasks until done or blocked
- Always read context files before starting (from the apply instructions output)
- If task is ambiguous, pause and ask before implementing
- If implementation reveals issues, pause and suggest artifact updates
- Keep code changes minimal and scoped to each task
- Update task checkbox immediately after completing each task
- Pause on errors, blockers, or unclear requirements - don't guess
- Use contextFiles from CLI output, don't assume specific file names

**Fluid Workflow Integration**

This skill supports the "actions on a change" model:

- **Can be invoked anytime**: Before all artifacts are done (if tasks exist), after partial implementation, interleaved with other actions
- **Allows artifact updates**: If implementation reveals design issues, suggest updating artifacts - not phase-locked, work fluidly
