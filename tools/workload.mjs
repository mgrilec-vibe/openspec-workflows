#!/usr/bin/env node
/**
 * Run the canonical BrainSpec process-management workload through a real OMP
 * model session. Each case is isolated, read-only, and tool-disabled: the
 * model receives the activated skill text plus, for slim skills, the actual
 * output of the co-located procedure helper. Native OMP JSONL records are
 * concatenated into the requested session file without rewriting usage.
 *
 * Usage:
 *   node tools/workload.mjs <output.jsonl> baseline
 *   node tools/workload.mjs <output.jsonl> slim
 *
 * Environment:
 *   BRAINSPEC_WORKLOAD_MODEL  OMP model selector (default: minimax-code/MiniMax-M3)
 *   OMP_BIN                   OMP executable (default: omp)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(REPO_ROOT, '.apm', 'skills');
const OMP_BIN = process.env.OMP_BIN || 'omp';
const MODEL = process.env.BRAINSPEC_WORKLOAD_MODEL || 'minimax-code/MiniMax-M3';
const SYSTEM_PROMPT = [
  'You are a deterministic BrainSpec process-workflow renderer.',
  'The attached workload case contains the activated skill and fixture state.',
  'Produce only the requested issue, pull-request, command-plan, or lifecycle text.',
  'This is a read-only fixture: never access tools, mutate repositories, or claim observed external state.',
  'Hard output cap: 500 tokens. Prioritize exact markers, linkage, ordered commands, and required checkpoint fields; omit explanation.',
].join(' ');

const CASES = [
  {
    id: 'open-exploration-issue',
    type: 'manage-issue',
    stage: 'explore',
    helperArgs: ['add session replay', 'ready'],
    request: 'Render the canonical ready exploration issue body and the exact issue lookup/create plan for increment add-session-replay.',
  },
  {
    id: 'open-draft-pull-request',
    type: 'open-pr',
    stage: 'propose',
    helperArgs: ['add-session-replay'],
    request: 'Render the exact fresh-state command plan and draft pull-request body for add-session-replay, using Refs #41.',
  },
  {
    id: 'transition-implementation-issue',
    type: 'manage-issue',
    stage: 'apply',
    helperArgs: ['add-session-replay'],
    request: 'Render the implementing issue checkpoint and the required PR/verification readback plan for add-session-replay.',
  },
  {
    id: 'finalize-lifecycle-pull-request',
    type: 'manage-pr',
    stage: 'archive',
    helperArgs: ['add-session-replay'],
    request: 'Render the archive, PR-ready, and merge command plan for add-session-replay, with an archive body containing Closes #41.',
  },
  {
    id: 'coordinate-related-issues',
    type: 'manage-issue',
    stage: 'coordinate',
    helperArgs: ['mgrilec-vibe/openspec-workflows#41,mgrilec-vibe/openspec-workflows#42'],
    request: 'Render a two-wave coordination issue for issues #41 and #42, where #42 requires #41.',
  },
  {
    id: 'generate-proposal-pr-body',
    type: 'generate-pr-text',
    stage: 'propose',
    helperArgs: ['add-session-replay'],
    request: 'Generate only the draft proposal pull-request body for add-session-replay. It must use Refs #41 and preserve the Proposal checkpoint fields.',
  },
  {
    id: 'generate-blocked-issue-text',
    type: 'generate-issue-text',
    stage: 'explore',
    helperArgs: ['add session replay', 'blocked'],
    request: 'Generate only the blocked exploration issue body for add-session-replay, including needs-human and the unresolved-question handoff.',
  },
  {
    id: 'generate-archive-summary',
    type: 'generate-pr-text',
    stage: 'archive',
    helperArgs: ['add-session-replay'],
    request: 'Generate only the final archive pull-request body and terminal issue checkpoint for add-session-replay, using Closes #41.',
  },
];

function fail(message) {
  process.stderr.write(`[workload] ${message}\n`);
  process.exit(1);
}

function skillName(stage, variant) {
  return variant === 'slim' ? `brainspec-slim-${stage}` : `brainspec-${stage}`;
}

function helperOutput(stage, args) {
  const helper = path.join(
    SKILLS_DIR,
    `brainspec-slim-${stage}`,
    'scripts',
    `brainspec-${stage}.sh`,
  );
  return execFileSync('bash', [helper, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}

function promptFor(workloadCase, variant) {
  const name = skillName(workloadCase.stage, variant);
  const skillPath = path.join(SKILLS_DIR, name, 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const delegated = variant === 'slim'
    ? `\n\n# Delegated procedure output\n\`\`\`text\n${helperOutput(workloadCase.stage, workloadCase.helperArgs)}\n\`\`\``
    : '';

  return [
    '# Canonical BrainSpec workload case',
    `case-id: ${workloadCase.id}`,
    `task-type: ${workloadCase.type}`,
    `activated-skill: /${name}`,
    'fixture-repository: mgrilec-vibe/openspec-workflows',
    'fixture-issue: https://github.com/mgrilec-vibe/openspec-workflows/issues/41',
    'fixture-pull-request: https://github.com/mgrilec-vibe/openspec-workflows/pull/99',
    '',
    '# Activated skill',
    '```markdown',
    skill.trimEnd(),
    '```',
    delegated,
    '',
    '# Explicit invocation',
    `/${name} ${workloadCase.helperArgs.join(' ')}`,
    '',
    '# Requested read-only fixture output',
    workloadCase.request,
  ].join('\n');
}

function findNativeSession(callDir) {
  const files = fs.readdirSync(callDir)
    .filter((name) => name.endsWith('.jsonl'))
    .sort();
  if (files.length !== 1) {
    fail(`expected one native session in ${callDir}, found ${files.length}`);
  }
  return path.join(callDir, files[0]);
}

function runCase(workloadCase, variant, tempRoot) {
  const callDir = path.join(tempRoot, workloadCase.id);
  fs.mkdirSync(callDir, { recursive: true });
  const promptPath = path.join(tempRoot, `${workloadCase.id}.md`);
  fs.writeFileSync(promptPath, promptFor(workloadCase, variant));

  execFileSync(OMP_BIN, [
    '-p',
    '--model', MODEL,
    '--thinking', 'off',
    '--system-prompt', SYSTEM_PROMPT,
    '--session-dir', callDir,
    '--max-time', '5m',
    '--no-tools',
    '--no-skills',
    '--no-rules',
    '--no-lsp',
    '--no-extensions',
    '--no-title',
    `@${promptPath}`,
    'Render this canonical process-management case now.',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const nativePath = findNativeSession(callDir);
  const native = fs.readFileSync(nativePath, 'utf8').trimEnd();
  return [
    JSON.stringify({
      type: 'workload_case',
      version: 1,
      caseId: workloadCase.id,
      taskType: workloadCase.type,
      stage: workloadCase.stage,
      variant,
      skill: skillName(workloadCase.stage, variant),
      model: MODEL,
      processManagement: true,
    }),
    native,
  ].join('\n');
}

function main() {
  const [outputArg, variant] = process.argv.slice(2);
  if (!outputArg || !['baseline', 'slim'].includes(variant)) {
    fail('usage: node tools/workload.mjs <output.jsonl> <baseline|slim>');
  }

  const output = path.resolve(REPO_ROOT, outputArg);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `brainspec-${variant}-`));
  try {
    const chunks = CASES.map((workloadCase, index) => {
      process.stdout.write(`[workload] ${index + 1}/${CASES.length} ${workloadCase.id}\n`);
      return runCase(workloadCase, variant, tempRoot);
    });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${chunks.join('\n')}\n`);
    process.stdout.write(`[workload] wrote ${CASES.length} actual OMP calls to ${output}\n`);
    process.stdout.write(`[workload] model: ${MODEL}; variant: ${variant}\n`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
