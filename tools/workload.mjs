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
function runScript(name, ...args) {
  const file = path.join(SCRIPTS_DIR, name);
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
  'brainspec-explore.sh':
    'state: ready\n' +
    'stage-label: explore\n' +
    'readiness: ready\n' +
    'rough-idea: <rough-idea>\n' +
    'label-preflight: explore OR needs-human on canonical issue\n' +
    'baseline-snapshot: HEAD, status, diff, ls-files\n' +
    'commands: gh search issues, gh auth status, gh api, gh issue create --label <stage-label>\n' +
    'readback: URL, title, labels, body, update time\n' +
    'hard-stops: marker on closed/duplicate, label preflight fail, baseline drift, readiness=ready with unresolved questions',
  'brainspec-propose.sh':
    'state: prepared\n' +
    'marker: <!-- brainspec:increment-id=<id> -->\n' +
    'lifecycle-branch: <id>\n' +
    'worktree: <parent-of-primary-worktree>/<repo>-<id>\n' +
    'base: origin/<default-branch>@<fetched-tip-sha>\n' +
    'artifact-set: proposal.md, specs/<capability>/spec.md, design.md, tasks.md, github-issue.json\n' +
    'planning-commit: docs(openspec): propose <id>\n' +
    'metadata-commit: docs(brainspec): record lifecycle metadata for <id>\n' +
    'metadata-schema: schemaVersion=2, incrementId, issue, pullRequest, branch, worktree, base\n' +
    'proposal-checkpoint-template: <!-- brainspec:proposal:start --> ## Proposal checkpoint ... <!-- brainspec:proposal:end -->\n' +
    'commands: openspec status, openspec new change, openspec validate, git worktree add, git checkout, openspec new change (idempotent), git add, git diff --cached --check, git commit, git push (no-force), gh pr create --draft --body-file, write github-issue.json, git add, git commit, git push (no-force)\n' +
    'readback-rules: PR open/draft/base=default, Refs, byte-identical metadata, strict validation passed, branch exists on origin before pr create',
  'brainspec-apply.sh':
    'state: prepared\n' +
    'marker: <!-- brainspec:increment-id=<id> -->\n' +
    'implementation-boundary-template: <!-- brainspec:implementation:start --> ## Implementation checkpoint ... <!-- brainspec:implementation:end -->\n' +
    'blocker-boundary-template: <!-- brainspec:implementation:start --> ## Implementation blocked ... <!-- brainspec:implementation:end -->\n' +
    'archiving-handoff-template: <!-- brainspec:implementation:start --> ## Implementation checkpoint (complete) ... <!-- brainspec:implementation:end -->\n' +
    'commands: openspec status, openspec instructions apply, openspec validate, gh pr view (isDraft, headRefName, baseRefName, body)\n' +
    'per-chunk-rules: stage only owned paths, git diff --cached --check, commit with scoped message, push no force, read PR back\n' +
    'plan-only-rules: reconcile across affected artifacts, preserve checked tasks, commit docs(openspec): revise, pause before code\n' +
    'readback-rules: readback of exactly implementing before first edit, body/label-first partial permits one repair, never infer from branch name\n' +
    'hard-stops: PR not open/draft, Refs, base/head mismatch, metadata missing, second PR, force push, PR diff not confined',
  'brainspec-archive.sh':
    'state: prepared\n' +
    'marker: <!-- brainspec:increment-id=<id> -->\n' +
    'archive-boundary-template: <!-- brainspec:archive:start --> ## Archive checkpoint ... <!-- brainspec:archive:end -->\n' +
    'pr-readiness-transition: step 1 gh pr edit (readback isDraft=true, body has Closes), step 2 gh pr ready (readback state=ready)\n' +
    'spec-sync-rules: source artifactPaths.specs.existingOutputPaths, apply only declared ADDED/MODIFIED/REMOVED/RENAMED\n' +
    'merge-gate: all tasks checked, strict validation passed, acceptance+smoke passed, sync done or zero diff, Closes ready, ancestors\n' +
    'commands: openspec status, openspec instructions archive, openspec instructions specs, openspec validate, mkdir archive, mv change, commit, push, gh pr edit (readback isDraft=true), gh pr ready, gh pr merge\n' +
    'hard-stops: PR not lifecycle/head/merged, sync left delta unapplied, second PR, duplicate target or nonmatching manifest, treating gh pr edit as undraft',
  'brainspec-coordinate.sh':
    'state: prepared\n' +
    'plan-id: coord-<date>\n' +
    'marker: <!-- brainspec:coordination-id=<plan-id> -->\n' +
    'member-resolution: <owner>/<repo>#<n>, marker, Proposal checkpoint, verified commit\n' +
    'relationships: requires/prefer-after/serialize-after/parallel-safe\n' +
    'unknowns: missing evidence treated as unknown\n' +
    'persistence: search, create-or-update, read-back\n' +
    'commands: gh search issues, gh issue create, gh issue edit (readback)',
  'pr-body.sh':
    '## Summary\n<Rendered summary for <id>>\n## Why\n<Evidence-backed rationale for <id>>\n## Test plan\n- npm test exits 0\n- node tools/measure.mjs reports reduction\n\nRefs #<issue-number>',
  'issue-template.sh':
    '## Issue update (<tpl> for <id>)\n- Removed: <prior label>\n- Added: <next label>\n- Body updated with the implementation checkpoint boundary.',
};

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
        coord:   'brainspec-slim-coordinate',
      }
    : {
        explore: 'brainspec-explore',
        propose: 'brainspec-propose',
        apply:   'brainspec-apply',
        archive: 'brainspec-archive',
        coord:   'brainspec-coordinate',
      };
  const TASK = {
    explore: `/${TOOL.explore} add-session-replay`,
    propose: `/${TOOL.propose} add-session-replay`,
    apply:   `/${TOOL.apply} add-session-replay`,
    archive: `/${TOOL.archive} add-session-replay`,
  };
  const skillsLabel = variant;

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
      'brainspec-explore.sh': runScript('brainspec-explore.sh', 'add-session-replay'),
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
      'pr-body.sh': runScript('pr-body.sh', 'add-session-replay'),
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
      'brainspec-propose.sh': runScript('brainspec-propose.sh', 'add-session-replay'),
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
      'issue-template.sh': runScript('issue-template.sh', 'label-transition'),
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
      'brainspec-apply.sh': runScript('brainspec-apply.sh', 'add-session-replay'),
    },
  });
  const t3b = llmCall(session, {
    task: 'Coordinate proposed issues 41, 42, 43',
    name: TOOL.coord,
    skills: skillsLabel,
    skillText: coordinateSkill,
    history: [
      { role: 'user', text: 'Order these proposed increments.' },
      { role: 'assistant', text: t3a },
    ],
    response: coordResponse(),
    scriptOutputs: {
      'brainspec-coordinate.sh': runScript('brainspec-coordinate.sh', '41,42,43'),
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
      'issue-template.sh': runScript('issue-template.sh', 'blocker'),
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
