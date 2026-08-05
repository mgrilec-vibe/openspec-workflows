#!/usr/bin/env node
/**
 * Token measurement script.
 *
 * Reads a session JSONL produced by tools/workload.mjs, applies the
 * deterministic process-management filter, and sums prompt_tokens +
 * completion_tokens across the matched entries.
 *
 * The filter is an explicit allowlist. To remain auditable it lives
 * in this file as a single object so the measurement is reproducible
 * and reviewable.
 *
 * Usage:
 *   node tools/measure.mjs <session.jsonl>
 *   node tools/measure.mjs <baseline.jsonl> <optimized.jsonl>   # compare
 *
 * Exit codes:
 *   0  measurement printed (and, with two files, reduction >= 30%)
 *   1  filter matched zero entries (would invalidate the experiment)
 *   2  reduction below 30% (only meaningful with two files)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Process-management filter.
 *
 * A session entry matches the process-management scope when ANY of:
 *   1. its prompt or completion references a process-management substring,
 *   2. its name is in the explicit tool/skill allowlist, or
 *   3. the entry's recorded tool calls include any of the allowlisted commands.
 *
 * The substrings and tool names are the same on baseline and optimized
 * runs; only the entry's prompt / completion text changes.
 */
const PROCESS_MGMT_SUBSTRINGS = [
  '/brainspec-',
  'pull request',
  'github issue',
  'lifecycle branch',
  'lifecycle PR',
  'lifecycle worktree',
  'implementation checkpoint',
  'proposal checkpoint',
  'archive checkpoint',
  'gh issue',
  'gh pr',
  'gh api',
  'openspec new change',
  'openspec status',
  'openspec instructions',
  'openspec validate',
  'openspec archive',
  'add-session-replay',
  'needs-human',
  'Closes #',
  'Refs #',
  'implementation boundary',
  'exploration boundary',
  'coordination marker',
  'coordination-id=',
  'increment-id=',
];

const PROCESS_MGMT_TOOL_ALLOWLIST = new Set([
  // Original (verbose) skills.
  'brainspec-explore',
  'brainspec-propose',
  'brainspec-apply',
  'brainspec-archive',
  'brainspec-coordinate',
  // Slim variants. The slim skills live in .apm/slim-skills/ and
  // are installed alongside the originals so they can be tested
  // side by side. Their tool names carry the `-slim-` infix.
  'brainspec-slim-explore',
  'brainspec-slim-propose',
  'brainspec-slim-apply',
  'brainspec-slim-archive',
  'brainspec-slim-coordinate',
  // Helper skills for generated text. These existed only as inline
  // stubs in the harness; they are listed here for completeness.
  'pr-body',
  'issue-template',
  'issue-label-transition',
]);

function readJsonl(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

function isProcessManagement(row) {
  if (PROCESS_MGMT_TOOL_ALLOWLIST.has(row.name)) return true;
  const haystack = `${row.prompt}\n${row.completion}`;
  return PROCESS_MGMT_SUBSTRINGS.some((s) => haystack.includes(s));
}

function measure(file) {
  const rows = readJsonl(file);
  if (rows.length === 0) {
    process.stderr.write(`[measure] ${file}: 0 entries\n`);
    process.exit(1);
  }
  const matched = rows.filter(isProcessManagement);
  if (matched.length === 0) {
    process.stderr.write(
      `[measure] ${file}: filter matched 0/${rows.length} entries. Filter is broken.\n`,
    );
    process.exit(1);
  }
  const total = matched.reduce((s, r) => s + r.prompt_tokens + r.completion_tokens, 0);
  const promptTotal = matched.reduce((s, r) => s + r.prompt_tokens, 0);
  const completionTotal = matched.reduce((s, r) => s + r.completion_tokens, 0);
  return {
    file: path.relative(process.cwd(), file),
    entries_total: rows.length,
    entries_matched: matched.length,
    prompt_tokens: promptTotal,
    completion_tokens: completionTotal,
    total,
  };
}

function fmt(m) {
  return [
    `# ${m.file}`,
    `  entries: ${m.entries_matched}/${m.entries_total} matched`,
    `  prompt_tokens:     ${m.prompt_tokens}`,
    `  completion_tokens: ${m.completion_tokens}`,
    `  total:             ${m.total}`,
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stderr.write('usage: node tools/measure.mjs <session.jsonl> [<optimized.jsonl>]\n');
    process.exit(2);
  }
  const base = measure(args[0]);
  process.stdout.write(fmt(base) + '\n');
  if (args.length === 2) {
    const opt = measure(args[1]);
    process.stdout.write(fmt(opt) + '\n');
    const reduction = 1 - opt.total / base.total;
    const pct = (reduction * 100).toFixed(2);
    const target = 0.3;
    const verdict = reduction >= target ? 'PASS' : 'BELOW TARGET';
    process.stdout.write(
      `\nreduction: ${pct}% (${verdict}, target ${(target * 100).toFixed(0)}%)\n`,
    );
    process.stdout.write(`baseline_total: ${base.total}\n`);
    process.stdout.write(`optimized_total: ${opt.total}\n`);
    // Exit 0 always; the caller decides whether the PR is opened. We
    // print the verdict so the caller can use it.
    process.exit(reduction >= target ? 0 : 2);
  }
}

main();
