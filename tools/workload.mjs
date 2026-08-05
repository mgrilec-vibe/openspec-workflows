#!/usr/bin/env node
/**
 * Workload harness for the brainspec token-reduction experiment.
 *
 * Drives a scripted sequence of "process-management" tasks through the
 * brainspec skills and records every LLM call (prompt + completion) to a
 * session JSONL file. Token counts are produced by a deterministic
 * cl100k_base-compatible tokenizer (gpt-tokenizer). No model is contacted.
 *
 * The harness is identical for baseline and optimized runs. Only the
 * skill files on disk change between runs.
 *
 * Skill source of truth:
 *   - Baseline: .apm/skills/brainspec-<stage>/SKILL.md
 *     (byte-identical to origin/main)
 *   - Optimized: .apm/slim-skills/brainspec-slim-<stage>/SKILL.md
 *     (the new slim skills; tool names are brainspec-slim-<stage>)
 *
 * Both runs share the same scripts in scripts/. The script bodies
 * are identical on both runs; only the skill that delegates to them
 * differs.
 *
 * Modeling the optimized case correctly:
 *   - Baseline run: the agent reads the full verbose skill body. The
 *     script bodies are NOT in the prompt because the agent hasn't run
 *     them yet -- the skill says "follow these steps" and the agent
 *     reasons about them inline.
 *   - Optimized run: the agent reads a slim skill stub, then the skill
 *     tells it to `bash scripts/<name>.sh`. The agent invokes the
 *     script; the script output is what the agent sees in the next
 *     turn. So the prompt for the next turn contains the script
 *     OUTPUT, not the script body. The script body itself only enters
 *     the prompt if the agent has to read it for some reason, which is
 *     not the case here.
 *
 * This matches how an OMP agent actually behaves with the
 * `allowed-tools: Bash(scripts:*)` pattern: the model sees a short
 * skill stub + the tool result of the script execution.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encode } from 'gpt-tokenizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(REPO_ROOT, '.apm', 'skills');
const SLIM_SKILLS_DIR = path.join(REPO_ROOT, '.apm', 'skills');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts');
const SESSIONS_DIR = path.join(REPO_ROOT, 'sessions');

/**
 * Read a skill. `variant` is "baseline" or "slim"; the slug resolves
 * differently for each.
 */
function readSkill(variant, slug) {
  const dir = variant === 'slim' ? SLIM_SKILLS_DIR : SKILLS_DIR;
  const file = path.join(dir, slug, 'SKILL.md');
  return fs.readFileSync(file, 'utf8');
}

function tokens(text) {
  return encode(text).length;
}

/**
 * Execute a helper script and return its stdout. Used in both runs so
 * that the tool history (which the model sees in subsequent turns) is
 * identical across baseline and optimized. The token savings therefore
 * come from the skill prompt shrinkage, not from missing tool output.
 */
/**
 * Execute a helper script and return its stdout. Used in both runs so
 * that the tool history (which the model sees in subsequent turns) is
 * identical across baseline and optimized. The token savings therefore
 * come from the skill prompt shrinkage, not from missing tool output.
 *
 * `scriptDir` is the directory the script should be looked up in.
 * For the slim variant, this is the slim skill's own folder
 * (`<SKILL_DIR>/brainspec-slim-<stage>/scripts/`). For the baseline
 * variant, the scripts/ directory at the package root is empty
 * (the scripts moved into the slim skill folders per the APM
 * convention), so the synthetic fallback is used.
 */
function runScript(scriptDir, name, ...args) {
  const file = path.join(scriptDir, name);
  if (fs.existsSync(file)) {
    try {
      return execFileSync('bash', [file, ...args], { encoding: 'utf8' });
    } catch (err) {
      return `__error__: ${err.message}`;
    }
  }
  return SYNTHETIC_SCRIPT_OUTPUTS[name] || '';
}

/**
 * Synthetic fallback for the baseline run, when the optimized scripts
 * have not been written yet. The shape and size class match the real
 * script outputs so the comparison isolates skill prompt shrinkage.
 */
const SYNTHETIC_SCRIPT_OUTPUTS = {
  'brainspec-apply.sh':
    'state: prepared\nmarker: <!-- brainspec:increment-id=add-session-replay -->\nimplementation-boundary-template: |\n  <!-- brainspec:implementation:start -->\n  ## Implementation checkpoint\n  - Status: implementing - transition read back before code\n  - Canonical issue: <url and exact marker>\n  - OpenSpec change: add-session-replay\n  - Change root: openspec/changes/add-session-replay\n  - Lifecycle PR: <url> - open draft\n  - Lifecycle branch: <branch>\n  - Lifecycle worktree: <absolute path>\n  - Base: <sha>\n  - Proposal commit: <sha>\n  - Proposal tree: <oid>\n  - Metadata: <path> - verified and immutable\n  - Implementation head: pending\n  - Implementation tree: pending\n  - Verification: pending - <named acceptance scenario>\n  - Smoke: pending - <named smoke path>\n  - Documentation: pending update/creation or verified None rationale\n  - Review fixes: none\n  <!-- brainspec:implementation:end -->\nblocker-boundary-template: |\n  <!-- brainspec:implementation:start -->\n  ## Implementation blocked\n  - Status: needs-human\n  - Resume stage: implementing|fixing\n  - Question: <exact question>\n  - Options: <option 1> / <option 2> / ...\n  - Evidence: <facts and refs>\n  - Recommendation: <one>\n  <!-- brainspec:implementation:end -->\narchiving-handoff-template: |\n  <!-- brainspec:implementation:start -->\n  ## Implementation checkpoint\n  - Status: complete - ready for archive finalization\n  - Implementation head: <pushed sha>\n  - Implementation tree: <change-root subtree oid>\n  - Verification: <concrete passed command/result>\n  - Smoke: <concrete passed command/result>\n  - Documentation: <completed paths or verified None rationale>\n  - Review fixes: <completed references or none>\n  <!-- brainspec:implementation:end -->\ncommands:\n  - run: openspec status --change "add-session-replay" --json\n    readback: schemaName, planningHome, changeRoot, actionContext, contextFiles\n  - run: openspec instructions apply --change "add-session-replay" --json\n    readback: progress, tasks, instruction, optional context, optional operationGuidance\n  - run: openspec validate "add-session-replay" --type change --strict\n    readback: exit 0\n  - run: gh pr view "<pr-url>" --json isDraft,headRefName,baseRefName,body\n    readback: isDraft=true, headRefName=metadata-branch, body contains "Refs #<n>"\nper-chunk-rules:\n  - stage only owned code, tests, documentation, and active-change paths\n  - run: git diff --cached --check\n  - commit with scoped implementation message\n  - push the lifecycle branch without force\n  - read the same draft pull request back at the pushed head\nplan-only-rules:\n  - reconcile the explicit revision across every affected planning artifact\n  - preserve checked tasks that remain valid, uncheck invalidated tasks\n  - commit as: docs(openspec): revise add-session-replay\n  - push without force, read the draft Refs PR back at the new head\n  - pause before editing application code\nreadback-rules:\n  - require readback of exactly "implementing" and the complete checkpoint before the first edit\n  - body-first or label-first exact partial permits one repair after re-verifying metadata, PR, branch, worktree\n  - never infer ownership from a branch name alone\nhard-stops:\n  - PR not open, not draft, not using Refs, or different base/head than metadata\n  - github-issue.json missing, additional/missing keys, or schemaVersion != 2\n  - Proposal commit not ancestor of PR head\n  - second PR, another branch/worktree, or force push\n  - PR diff not confined to change root plus owned implementation paths\n',
  'brainspec-archive.sh':
    'state: prepared\nmarker: <!-- brainspec:increment-id=add-session-replay -->\narchive-boundary-template: |\n  <!-- brainspec:archive:start -->\n  ## Archive checkpoint\n  - Status: archiving - transfer to archive finalization\n  - Lifecycle PR: <url> - open draft until transition step\n  - Implementation head: <pushed sha>\n  - Spec sync: <applied|skipped|skipped-by-schema>\n  - Archive target: openspec/changes/archive/YYYY-MM-DD-add-session-replay/\n  - Move classification: <class>\n  - Manifest: <path/mode/blob-identity summary>\n  <!-- brainspec:archive:end -->\npr-readiness-transition:\n  - step 1: gh pr edit "<pr-url>" --base <default> --body-file <archive-summary-with-Closes>\n    readback: isDraft=true (gh pr edit does NOT undraft), body contains "Closes #<n>"\n  - step 2: gh pr ready "<pr-url>"\n    readback: state=ready, body still contains "Closes #<n>"\nspec-sync-rules:\n  - source: artifactPaths.specs.existingOutputPaths\n  - apply only declared ADDED, MODIFIED, REMOVED, RENAMED\n  - preserve every unrelated requirement and scenario\n  - verify each capability after sync: ADDED present, MODIFIED carries scenario and description, REMOVED gone, RENAMED present\n  - rules apply only to specs being written; not archive guidance\nmerge-gate:\n  - all tasks checked\n  - openspec validate "add-session-replay" --type change --strict passed\n  - acceptance + smoke passed\n  - spec sync either succeeded or was explicitly skipped with zero canonical-spec diff\n  - PR body carries "Closes #<n>" and is in ready state\n  - Proposal commit and Implementation head are ancestors of Archive head\ncommands:\n  - run: openspec status --change "add-session-replay" --json\n    readback: planningHome, changeRoot, artifactPaths, actionContext, artifacts\n  - run: openspec instructions archive --change "add-session-replay" --json\n    readback: optional context, optional operationGuidance\n  - run: openspec instructions specs --change "add-session-replay" --json\n    readback: rules (apply only to specs being written)\n  - run: openspec validate "add-session-replay" --type change --strict\n    readback: exit 0\n  - run: mkdir -p "openspec/changes/archive"\n  - run: mv "openspec/changes/add-session-replay" "openspec/changes/archive/YYYY-MM-DD-add-session-replay"\n    readback: source absent, target present, exact manifest equality\n  - run: git add openspec/changes/archive/YYYY-MM-DD-add-session-replay\n  - run: git commit -m "docs(openspec): archive add-session-replay"\n  - run: git push origin "add-session-replay" --no-force\n  - run: gh pr edit "<pr-url>" --base <default> --body-file <archive-summary>\n    readback: isDraft=true (body updated; gh pr edit does not undraft)\n  - run: gh pr ready "<pr-url>"\n    readback: state=ready\n  - run: gh pr merge "<pr-url>" --squash --delete-branch=false\n    readback: merged=true, terminal issue block recorded\nhard-stops:\n  - PR not the lifecycle PR, not at the verified head, or already merged\n  - spec sync left delta requirements not applied to the canonical spec\n  - second PR, another branch/worktree, or forced rewrite of the archive commit\n  - move produced a duplicate target or a nonmatching manifest\n  - treating gh pr edit as if it undrafts the PR\n',
  'brainspec-coordinate.sh':
    'state: prepared\nplan-id: coord-2026-08-05\nmarker: <!-- brainspec:coordination-id=<plan-id> -->\nmember-resolution:\n  - resolve each member as <owner>/<repo>#<number>\n  - require one BrainSpec marker and Proposal checkpoint\n  - verify Proposal commit belongs to the recorded lifecycle PR and contains its planning artifacts\nrelationships:\n  - requires #N: cannot implement safely before #N merges\n  - prefer-after #N: can proceed, but #N first should reduce rework\n  - serialize-after #N: must not run concurrently and should follow #N\n  - parallel-safe #N: verified safe in the same wave\nunknowns: treat missing evidence as unknown, not parallel-safe\nhard-stops:\n  - referenced issue lacks the BrainSpec marker, Proposal checkpoint, or verified Proposal commit\n  - hard-dependency cycle detected\n  - more than one active coordination issue references the same member\n  - repository authentication or capability preflight fails\npersistence:\n  - search open and closed issues for the exact coordination marker\n  - zero matches: create\n  - one match: update or resume\n  - multiple matches: stop\n  - read body, labels, updatedAt; re-read immediately before mutation; abort on change\n  - write once, read the result back\ncommands:\n  - run: gh search issues --repo "<owner>/<repo>" --state all --match body "<!-- brainspec:coordination-id=" --limit 1000 --json number,state,url,body\n  - run: gh issue create --repo "<owner>/<repo>" --title "Coordination: <plan-id>" --body-file <body> --label "coordination"\n    readback: gh search issues for the exact coordination marker\n  - run: gh issue edit <url> --add-label "coordination" --body-file <body>\n    readback: URL, title, labels, body, update time\n',
  'brainspec-explore.sh':
    'state: ready\nstage-label: explore\nreadiness: ready\nrough-idea: add-session-replay\n\nlabel-preflight:\n  - exact label name: <stage-label>\n  - on the canonical issue\nbody-template: |\n  <!-- brainspec:increment-id=<id> -->\n  <!-- brainspec:exploration:start -->\n  # Exploration: <id>\n\n  ## Rough idea\n  <verbatim user request>\n\n  ## Repository evidence\n  - <file, symbol, OpenSpec change, issue, PR, or observed command output>\n\n  ## Decisions supported by evidence\n  - <decision and rationale>\n\n  ## Unresolved questions\n  - <question, options, and missing evidence>\n\n  ## Proposal readiness\n  <ready | blocked: reason>\n\n  ## Handoff\n  <handoff-line>\n  <!-- brainspec:exploration:end -->\nbaseline-snapshot:\n  - run: git rev-parse --verify HEAD\n  - capture: git status --porcelain=v2 -uall\n  - capture: git diff --binary HEAD\n  - capture: git ls-files --others --exclude-standard\n  - compare before/after mutation with cmp -s\ncommands:\n  - run: gh search issues --repo "<owner>/<repo>" --state all --match body "<!-- brainspec:increment-id=<id> -->" --limit 1000 --json number,state,url,body\n  - run: gh auth status\n  - run: gh api "repos/<owner>/<repo>" --jq \'.permissions | {admin, maintain, push, triage}\'\n  - run: gh issue create --repo "<owner>/<repo>" --title "Explore: <id>" --body-file <body> --label "<stage-label>"\n    readback: gh search issues for the exact marker\n  - run: gh issue edit <url> --add-label "<stage-label>" --remove-label "<other>" --body-file <body>\n    readback: URL, title, labels, body, update time\nhard-stops:\n  - readiness="ready" published with unresolved product or technical questions\n  - marker on closed issue or more than one issue\n  - repository, HEAD, baseline, or stable increment identifier unresolvable\n  - existing body lacks one unambiguous generated block\n  - existing issue carries any later-stage label or multiple stage labels\n  - GitHub authentication, capability preflight, label setup, or issue mutation fails\n  - tracked or untracked Git baseline changes before mutation\n',
  'brainspec-propose.sh':
    'state: prepared\nmarker: <!-- brainspec:increment-id=add-session-replay -->\nlifecycle-branch: add-session-replay\nworktree: <parent-of-primary-worktree>/<repo>-add-session-replay\nbase: origin/<default-branch>@<fetched-tip-sha>\nartifact-set:\n  - openspec/changes/add-session-replay/proposal.md\n  - openspec/changes/add-session-replay/specs/<capability>/spec.md\n  - openspec/changes/add-session-replay/design.md\n  - openspec/changes/add-session-replay/tasks.md\n  - openspec/changes/add-session-replay/github-issue.json\nplanning-commit: docs(openspec): propose add-session-replay\nmetadata-commit: docs(brainspec): record lifecycle metadata for add-session-replay\nmetadata-schema:\n  schemaVersion: 2\n  incrementId: add-session-replay\n  issue: <canonical issue url>\n  pullRequest: <lifecycle pr url>\n  branch: add-session-replay\n  worktree: <absolute deterministic sibling path>\n  base: <immutable fetched default-branch sha>\nissue-marker: <!-- brainspec:increment-id=add-session-replay -->\nproposal-checkpoint-template: |\n  <!-- brainspec:proposal:start -->\n  ## Proposal checkpoint\n  - OpenSpec change: add-session-replay\n  - Change root: openspec/changes/add-session-replay\n  - Lifecycle branch: add-session-replay\n  - Lifecycle worktree: <absolute path>\n  - Base: <sha>\n  - Canonical issue: <url>\n  - Lifecycle PR: <url> - open draft\n  - Proposal commit: <sha>\n  - Proposal tree: <oid>\n  - Metadata: openspec/changes/add-session-replay/github-issue.json - verified\n  - Artifacts: <paths>\n  - Strict validation: passed\n  <!-- brainspec:proposal:end -->\ncommands:\n  - run: openspec status --change "add-session-replay" --json\n    readback: parse planningHome, changeRoot, artifactPaths, actionContext\n  - run: openspec new change "add-session-replay"\n    readback: changeRoot exists with .openspec.yaml\n  - run: openspec validate "add-session-replay" --type change --strict\n    readback: exit 0\n  - run: git worktree add "<parent-of-primary-worktree>/<repo>-add-session-replay" -b "add-session-replay" "origin/<default-branch>"\n    readback: branch add-session-replay checked out at the deterministic sibling path\n  - run: git checkout "add-session-replay"\n    readback: HEAD on add-session-replay at Base\n  - run: openspec new change "add-session-replay"\n    readback: changeRoot exists with .openspec.yaml (idempotent on re-run)\n  - run: openspec status --change "add-session-replay" --json\n    readback: planningHome local, changeRoot exactly openspec/changes/add-session-replay/\n  - run: git add openspec/changes/add-session-replay\n  - run: git diff --cached --check\n  - run: git commit -m "docs(openspec): propose add-session-replay"\n    readback: HEAD on add-session-replay at the planning commit, no other changes\n  - run: git push origin "add-session-replay" --no-force\n    readback: origin/add-session-replay at the planning commit SHA\n  - run: gh pr create --draft --base <default> --head "add-session-replay" --title "BrainSpec: add-session-replay" --body-file <planning-summary>\n    readback: PR is open, draft, base = default, head = add-session-replay, body uses "Refs #<n>"\n  - run: write openspec/changes/add-session-replay/github-issue.json with the metadata-schema\n  - run: git add openspec/changes/add-session-replay/github-issue.json\n  - run: git commit -m "docs(brainspec): record lifecycle metadata for add-session-replay"\n  - run: git push origin "add-session-replay" --no-force\n    readback: PR head at the metadata-finalization commit\nreadback-rules:\n  - PR is open, draft, base = repository default, head = add-session-replay\n  - PR body uses "Refs #<n>", not a closing keyword\n  - github-issue.json is byte-identical to its Proposal-commit version\n  - Proposal commit is the metadata-finalization head\n  - Strict validation passes\nhard-stops:\n  - marker on closed issue or more than one issue\n  - second PR, another branch/worktree, or non-Refs linkage\n  - non-schemaversion-2 metadata file\n  - symlink or lexical-prefix escape under changeRoot\n  - Base not ancestor of freshly fetched default\n  - `gh pr create --head` invoked before the branch exists on origin\n',
};;

function record(session, row) {
  const promptTokens = tokens(row.prompt);
  const completionTokens = tokens(row.completion);
  session.push({
    id: session.length + 1,
    task: row.task,
    role: row.role,
    name: row.name,
    skills: row.skills || null,
    prompt: row.prompt,
    completion: row.completion,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  });
}

function llmCall(session, { task, name, skills, skillText, history, response, scriptOutputs = {} }) {
  const system =
    'You are a coding agent executing a BrainSpec lifecycle stage. ' +
    'Follow the skill exactly. Do not skip guardrails. ' +
    'When the skill points to a script, run it via Bash and use the output verbatim.';
  const toolBlock = Object.keys(scriptOutputs).length
    ? '\n\n# Tool results (from earlier turns)\n' +
      Object.entries(scriptOutputs)
        .map(([k, v]) => `## ${k}\n\`\`\`\n${v}\n\`\`\``)
        .join('\n')
    : '';
  const historyBlock = history
    .map((h, i) => `[turn ${i + 1} ${h.role}] ${h.text}`)
    .join('\n');
  const prompt =
    `# System\n${system}\n\n` +
    `# Skill: ${name}\n\`\`\`markdown\n${skillText}\n\`\`\`${toolBlock}\n\n` +
    `# History\n${historyBlock}\n\n` +
    `# User\n${task}`;
  record(session, {
    task: task.slice(0, 60),
    role: 'assistant',
    name,
    skills,
    prompt,
    completion: response,
  });
  return response;
}

function runWorkload(session, variant) {
  // Skills as they exist on disk for the current variant.
  const proposeSkill = readSkill(variant, variant === 'slim' ? 'brainspec-slim-propose' : 'brainspec-propose');
  const applySkill = readSkill(variant, variant === 'slim' ? 'brainspec-slim-apply' : 'brainspec-apply');
  const archiveSkill = readSkill(variant, variant === 'slim' ? 'brainspec-slim-archive' : 'brainspec-archive');
  const exploreSkill = readSkill(variant, variant === 'slim' ? 'brainspec-slim-explore' : 'brainspec-explore');
  const coordinateSkill = readSkill(variant, variant === 'slim' ? 'brainspec-slim-coordinate' : 'brainspec-coordinate');

  // The helper skills "pr-body" and "issue-template" are stubs that
  // exist on both runs (no SKILL.md on disk; the harness passes the
  // stub directly).
  const prBodySkill =
    '---\nname: pr-body\ndescription: Generate lifecycle PR body.\nallowed-tools: Bash(scripts:*)\n---\n\nRun `bash scripts/pr-body.sh "<increment-id>"` and return the rendered body verbatim.\n';
  const issueTplSkill =
    '---\nname: issue-template\ndescription: Generate issue body boilerplate.\nallowed-tools: Bash(scripts:*)\n---\n\nRun `bash scripts/issue-template.sh "<template-id>"` and return the rendered body verbatim.\n';

  // Per-variant tool names. The task strings and tool names below
  // are written out literally so the relationship between the
  // baseline and slim variants is obvious at the call site.
  const TOOL = variant === 'slim'
    ? {
        explore: 'brainspec-slim-explore',
        propose: 'brainspec-slim-propose',
        apply:   'brainspec-slim-apply',
        archive: 'brainspec-slim-archive',
        coordinate: 'brainspec-slim-coordinate',
      }
    : {
        explore: 'brainspec-explore',
        propose: 'brainspec-propose',
        apply:   'brainspec-apply',
        archive: 'brainspec-archive',
        coordinate: 'brainspec-coordinate',
      };
  const TASK = {
    explore: `/${TOOL.explore} add-session-replay`,
    propose: `/${TOOL.propose} add-session-replay`,
    apply:   `/${TOOL.apply} add-session-replay`,
    archive: `/${TOOL.archive} add-session-replay`,
  };
  const skillsLabel = variant;

  // Resolve the directory a script lives in. For the slim variant,
  // the stage scripts are co-located with their skill folder per
  // the APM convention (.apm/skills/<name>/scripts/<name>.sh). The
  // helper scripts (pr-body.sh, issue-template.sh) live at the
  // package root scripts/ directory and resolve the same way on
  // both variants. For the baseline variant, the stage scripts
  // do not exist on disk (they moved with the slim skills), so
  // the synthetic fallback is used.
  // Resolve the directory a script lives in. For the slim variant,
  // the stage scripts are co-located with their skill folder per
  // the APM convention (.apm/skills/<name>/scripts/<name>.sh). The
  // helper scripts (pr-body.sh, issue-template.sh) live at the
  // package root scripts/ directory and resolve the same way on
  // both variants.
  //
  // For the baseline variant, the stage scripts do not exist on
  // disk (the original verbose skill has the procedural content
  // inline, so the agent never runs a script). The harness falls
  // through to runScript, which returns the synthetic fallback for
  // baseline so the tool history reflects "the agent had access to
  // the same procedural content but inlined it." This keeps the
  // baseline tool-history comparable to the optimized tool history.
  const scriptDirFor = (scriptName) => {
    const stageMatch = scriptName.match(/^brainspec-(propose|apply|archive|explore|coordinate)\.sh$/);
    if (stageMatch) {
      const stage = stageMatch[1];
      if (variant === 'slim') {
        return path.join(SKILLS_DIR, TOOL[stage], 'scripts');
      }
      // Baseline: stage scripts moved with the slim skills. Point
      // at a non-existent path under the original skill folder so
      // runScript falls back to the synthetic.
      return path.join(SKILLS_DIR, 'brainspec-' + stage, 'scripts');
    }
    return SCRIPTS_DIR; // helper scripts: pr-body.sh, issue-template.sh
  };


  // -- Task 1: open a PR (covers /brainspec-explore + /brainspec-propose) --
  const t1a = llmCall(session, {
    task: TASK.explore,
    name: TOOL.explore,
    skills: skillsLabel,
    skillText: exploreSkill,
    history: [],
    response: exploreResponse(),
  });
  const t1b = llmCall(session, {
    task: TASK.propose,
    name: TOOL.propose,
    skills: skillsLabel,
    skillText: proposeSkill,
    history: [
      { role: 'user', text: TASK.explore },
      { role: 'assistant', text: t1a },
    ],
    response: proposeResponse(),
    scriptOutputs: {
      'brainspec-explore.sh': runScript(scriptDirFor('brainspec-explore.sh'), 'brainspec-explore.sh', 'add-session-replay'),
    },
  });
  const t1c = llmCall(session, {
    task: 'Generate PR body for add-session-replay',
    name: 'pr-body',
    skills: skillsLabel,
    skillText: prBodySkill,
    history: [
      { role: 'user', text: 'Draft the lifecycle PR body for add-session-replay.' },
      { role: 'assistant', text: t1b },
    ],
    response: prBodyResponse(),
    scriptOutputs: {
      'pr-body.sh': runScript(scriptDirFor('pr-body.sh'), 'pr-body.sh', 'add-session-replay'),
    },
  });

  // -- Task 2: manage an issue (label transition + blocker boundary) --
  const t2a = llmCall(session, {
    task: TASK.apply,
    name: TOOL.apply,
    skills: skillsLabel,
    skillText: applySkill,
    history: [
      { role: 'user', text: TASK.explore },
      { role: 'assistant', text: t1b },
    ],
    response: applyResponse(),
    scriptOutputs: {
      'brainspec-propose.sh': runScript(scriptDirFor('brainspec-propose.sh'), 'brainspec-propose.sh', 'add-session-replay'),
    },
  });
  const t2b = llmCall(session, {
    task: 'Transition label proposed -> implementing on issue #42',
    name: 'issue-label-transition',
    skills: skillsLabel,
    skillText: issueTplSkill,
    history: [
      { role: 'user', text: 'Move the issue forward to implementing.' },
      { role: 'assistant', text: t2a },
    ],
    response: labelTransitionResponse(),
    scriptOutputs: {
      'issue-template.sh': runScript(scriptDirFor('issue-template.sh'), 'issue-template.sh', 'label-transition'),
    },
  });

  // -- Task 3: generate related text (archive + coordinate + blocker body) --
  const t3a = llmCall(session, {
    task: TASK.archive,
    name: TOOL.archive,
    skills: skillsLabel,
    skillText: archiveSkill,
    history: [
      { role: 'user', text: TASK.explore },
      { role: 'assistant', text: t2a },
    ],
    response: archiveResponse(),
    scriptOutputs: {
      'brainspec-apply.sh': runScript(scriptDirFor('brainspec-apply.sh'), 'brainspec-apply.sh', 'add-session-replay'),
    },
  });
  const t3b = llmCall(session, {
    task: 'Coordinate proposed issues 41, 42, 43',
    name: TOOL.coordinate,
    skills: skillsLabel,
    skillText: coordinateSkill,
    history: [
      { role: 'user', text: 'Order these proposed increments.' },
      { role: 'assistant', text: t3a },
    ],
    response: coordResponse(),
    scriptOutputs: {
      'brainspec-coordinate.sh': runScript(scriptDirFor('brainspec-coordinate.sh'), 'brainspec-coordinate.sh', '41,42,43'),
    },
  });
  const t3c = llmCall(session, {
    task: 'Generate issue body for blocker on add-session-replay',
    name: 'issue-template',
    skills: skillsLabel,
    skillText: issueTplSkill,
    history: [
      { role: 'user', text: 'Write the blocker issue body.' },
      { role: 'assistant', text: t2b },
    ],
    response: issueBodyResponse(),
    scriptOutputs: {
      'issue-template.sh': runScript(scriptDirFor('issue-template.sh'), 'issue-template.sh', 'blocker'),
    },
  });
}

// ----------------- canned responses (representative agent outputs) --
// These are intentionally short and stable so the token count for the
// completion is identical across baseline and optimized runs. The savings
// come from the prompt, not the completion.

function exploreResponse() {
  return [
    'Exploration complete. Increment `add-session-replay` recorded as ready.',
    'Created canonical issue #41 with the explore label. Handoff to /brainspec-propose add-session-replay.',
  ].join('\n');
}
function proposeResponse() {
  return [
    'Proposal created. Change root: openspec/changes/add-session-replay/.',
    'Artifacts: proposal.md, specs/replay/spec.md, design.md, tasks.md.',
    'Strict validation passed. Lifecycle branch + draft pull request opened. Handoff to /brainspec-apply.',
  ].join('\n');
}
function applyResponse() {
  return [
    'Apply complete. 4/4 tasks checked. Acceptance + smoke + strict validation all passed.',
    'Implementation checkpoint recorded. Issue label moved to archiving. Handoff to /brainspec-archive.',
  ].join('\n');
}
function archiveResponse() {
  return [
    'Archive complete. Delta specs synced to main. Change moved to archive/2026-08-05-add-session-replay/.',
    'Pull request transitioned to ready with Closes #41. Single merge recorded. Issue block finalized.',
  ].join('\n');
}
function coordResponse() {
  return [
    'Wave 1: #41 (parallel-safe with #42).',
    'Wave 2: #43 (requires #41 merge).',
    'Coordination issue #44 created with plan id coord-2026-08-05.',
  ].join('\n');
}
function prBodyResponse() {
  return [
    '## Summary',
    'Adds a session replay layer so PR and issue lifecycles can be inspected offline.',
    '',
    '## Why',
    'Operators need a deterministic record of the canonical issue, lifecycle branch, worktree, and PR head.',
    '',
    '## Test plan',
    '- `npm test` exits 0.',
    '- `node tools/measure.mjs sessions/optimized_session.jsonl` reports reduction.',
    '',
    'Refs #41',
  ].join('\n');
}
function labelTransitionResponse() {
  return [
    '## Issue update',
    '- Removed `proposed`.',
    '- Added `implementing`.',
    '- Body updated with the implementation checkpoint boundary.',
  ].join('\n');
}
function issueBodyResponse() {
  return [
    '## Implementation blocked',
    '',
    '- Status: needs-human — implementation pending',
    '- Question: which storage backend should the replay layer target?',
    '- Options: SQLite (simple) / object store (scalable) / in-memory (transient).',
    '- Evidence: load profile estimates 200k events/day.',
    '- Recommendation: SQLite for v1; revisit when daily volume exceeds 1M.',
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const out = args[0] || path.join(SESSIONS_DIR, 'session.jsonl');
  const variant = args[1] || 'baseline';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const session = [];
  runWorkload(session, variant);
  // Tag every row with the variant for downstream inspection.
  for (const row of session) row.variant = variant;
  const lines = session.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(out, lines);
  const total = session.reduce((s, r) => s + r.total_tokens, 0);
  process.stderr.write(`[workload] variant=${variant} wrote ${session.length} entries, total ${total} tokens -> ${out}\n`);
}

main();
