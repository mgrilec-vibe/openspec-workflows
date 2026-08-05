---
name: brainspec-explore
description: Runs only after the user explicitly invokes `/brainspec-explore` through the host skill mechanism. Creates or updates one evidence-backed exploration issue without proposing, implementing, archiving, or auto-advancing.
---

# BrainSpec Explore

Turn a rough idea into a durable exploration checkpoint. It never writes, stages, commits, branches, or creates a worktree in the local repository. Its only increment artifact is one GitHub issue carrying exactly one exploration outcome label: `explore` when proposal readiness is `ready`, or `needs-human` when it is `blocked`.

## Explicit user invocation boundary

- Run this stage only when the current user explicitly invokes `/brainspec-explore` through the host's skill mechanism.
- A request to propose, implement, continue, proceed, perform the next step, or archive is not an Explore invocation and MUST NOT activate this skill.
- Readiness, labels, checkpoints, prior-stage completion, and conversational assent such as “go ahead” are context, not authorization for another BrainSpec stage.
- Never invoke, activate, delegate to, or perform work owned by BrainSpec Propose, Apply, or Archive during this run.
- A reply that directly answers a still-active Explore-owned clarification may resume only the already-invoked Explore stage; it never authorizes Propose, Apply, or Archive.
- At completion, report the exploration result and stop. When readiness is `ready`, name `/brainspec-propose <increment-id>` as the required next explicit invocation, but never execute it or ask to continue into it.

## Required input

- A rough implementation idea.
- A fully qualified target repository, inferred from the current checkout unless the user names one.

Do not demand a complete specification. Ask one question only when two plausibly different increments would collapse to the same kebab-case identifier or an existing increment uses the candidate identifier.

## Procedure

1. **Resolve the target and gate identifier ambiguity.** Resolve the repository root and the fully qualified GitHub repository. Stop before investigation or mutation if either cannot be resolved. Derive a concise kebab-case increment ID and use `Explore: <increment-id>` as the title. If the ID is ambiguous as defined above, ask one targeted question and stop. Preserve the original user wording verbatim in the issue body.
2. **Protect local state.** Before investigating, require `HEAD` and record this baseline in temporary files outside the repository:

   ```bash
   git rev-parse --verify HEAD
   snapshot() {
     git status --porcelain=v2 -uall
     git diff --binary HEAD
     git ls-files --others --exclude-standard -z |
       while IFS= read -r -d '' path; do
         printf '%s\t%s\n' "$path" "$(git hash-object -- "$path")"
       done
   }
   snapshot > "$baseline_before"
   ```

   If any baseline command fails, stop before GitHub mutation. This protects tracked and untracked Git worktree state; ignored files are outside this contract. Never create files in the repository, including under `openspec/`, `.apm/`, or `docs/`. Never run `git worktree add`, `git switch`, `git checkout -b`, `openspec new change`, or another Git-state-changing command.
3. **Find the canonical issue.** Set `marker="<!-- brainspec:increment-id=${increment_id} -->"` and search both issue states:

   ```bash
   gh search issues --repo "$repo" --state all --match body "$marker" \
     --limit 1000 --json number,state,url,body
   ```

   Accept a candidate only when its returned `body` contains that exact marker. One open match is the canonical issue to update; one closed match stops; more than one exact match is a collision that stops. Never deduplicate by title alone, reopen a closed issue, or create a sibling issue.
4. **Investigate read-only.** Inspect only relevant repository code, specifications, existing OpenSpec changes, GitHub issues, and pull requests. Record decisions only when current evidence supports them. Capture unknown requirements as unresolved questions with options and missing evidence; do not invent an implementation, acceptance criteria, dependencies, or a proposal.
5. **Prepare and validate the generated block outside the repository.** Use a temporary file outside the checkout. It must contain the marker and exactly one bounded exploration block:

   ```md
   <!-- brainspec:increment-id=<increment-id> -->
   <!-- brainspec:exploration:start -->
   # Exploration: <increment-id>

   ## Rough idea
   <verbatim user request>

   ## Repository evidence
   - <file, symbol, OpenSpec change, issue, PR, or observed command output>

   ## Decisions supported by evidence
   - <decision and rationale>

   ## Unresolved questions
   - <question, options, and missing evidence>

   ## Proposal readiness
   <ready | blocked: reason>

   ## Handoff
   Only a later explicit `/brainspec-propose <increment-id>` invocation may consume this issue when proposal readiness is `ready`.
   <!-- brainspec:exploration:end -->
   ```

   For an existing issue, re-read its body and labels immediately before editing. Continue only if the marker and exactly one start/end pair are present. From the stage-label set `explore`, `needs-human`, `proposed`, `implementing`, `review`, and `fixing`, accept only zero or one exploration outcome label; a later-stage label or multiple stage labels is a hard stop. Replace only the bounded pair in the newly read body; preserve everything outside it. Malformed or repeated boundaries are a hard stop.
6. **Authorize the exact mutation path.** Immediately before GitHub mutation, run `gh auth status` and inspect repository capabilities:

   ```bash
   gh api "repos/$repo" --jq '.permissions | {admin, maintain, push, triage}'
   ```

   Continue only when a reported capability permits issue work. This is a preflight, not proof: the label and issue commands are the final operation-specific authorization checks. If GitHub rejects either, report it and stop. Never infer authorization from the account name.
7. **Recheck local state before mutation.** Capture `snapshot > "$baseline_before_mutation"` and require `cmp -s "$baseline_before" "$baseline_before_mutation"`. If it differs, report the local-state violation and stop before creating a label or issue.
8. **Set one exploration outcome label.** Derive `stage_label` from the completed body: `explore` for proposal readiness `ready`, otherwise `needs-human`. Query that exact label and create it when absent. Before touching an issue, require exactly one matching repository label. A retained label after a later issue-create failure is repository setup state, not an exploration handoff.

   For an existing issue, add `stage_label` and remove `other_stage_label` only when the label preflight found zero or one exploration outcome label and no later-stage label. Do not leave both `explore` and `needs-human` on one issue.
9. **Create or update one canonical issue.**

   - **New increment:** Repeat the exact-marker search from step 3 immediately before `gh issue create --repo "$repo" --title "Explore: $increment_id" --body-file "$issue_body" --label "$stage_label"`. If creation returns an error, repeat the marker search: one open exact match is reported as an indeterminate create and is not edited; zero matches is reported as a failed create; multiple matches is reported as a collision. Never retry by creating a sibling.
   - **Existing open increment:** Use one `gh issue edit` request with the latest reconstructed body, `--add-label "$stage_label"`, and `--remove-label "$other_stage_label"`. If it fails, read the issue back, report any partial mutation, and stop; do not blindly retry.

   GitHub has no transactional uniqueness or conditional body-update operation for this flow. A collision or concurrent human edit detected by the required readback is reported for human resolution, not silently repaired.
10. **Verify and report.** Read back the canonical issue’s URL, title, labels, body, and update time. Require the exact marker, one bounded block, and exactly one label from the exploration-outcome set `{explore, needs-human}` with no `proposed`, `implementing`, `review`, or `fixing` label. Then capture `snapshot > "$baseline_after"` and require it to match `"$baseline_before"`. If the local baseline differs, report the workflow violation and stop without cleanup. Return the canonical issue URL, increment ID, evidence-backed decisions, unresolved questions, proposal-readiness value, and any detected GitHub concurrency risk. A `needs-human` outcome ends the run after that report.

## Hard stops

Stop before issue creation or update when:

- The repository, `HEAD`, baseline, or stable increment identifier cannot be resolved.
- The exact marker occurs on a closed issue or more than one issue.
- An existing body lacks one unambiguous generated block.
- An existing issue carries any later-stage label or multiple stage labels.
- GitHub authentication, capability preflight, label setup, or issue mutation fails.
- The tracked or untracked Git baseline changes before mutation.

An unresolved product or technical question is not a hard stop. Capture it with proposal readiness `blocked`, set `needs-human`, and stop; do not manufacture an answer or modify the repository.

## Completion checks

- One canonical issue with the verified identity marker is observed, or a collision is explicitly reported.
- The issue carries exactly one exploration outcome label: `explore` or `needs-human`.
- The issue contains evidence, decisions, unresolved questions, and readiness.
- No tracked or untracked repository state, branch, worktree, OpenSpec change, commit, or pull request was created or modified.

## Trigger boundaries

Activate only when:

- The current user explicitly invokes `/brainspec-explore` through the host's skill mechanism.

Do not activate merely because:

- The user discusses, researches, or refines an idea without invoking the skill.
- An increment is ready to propose, implement, review, fix, merge, release, or archive.
- The user says “continue,” “go ahead,” “do the next step,” or equivalent.

Those later stages require their own explicit BrainSpec skill invocation.
