#!/usr/bin/env node
/**
 * Measure process-management token usage from native OMP session JSONL.
 * The file must contain workload_case markers followed by unmodified OMP
 * session rows. Only actual assistant messages with provider usage count.
 *
 * Usage:
 *   node tools/measure.mjs <session.jsonl>
 *   node tools/measure.mjs <baseline.jsonl> <optimized.jsonl>
 */

import fs from 'node:fs';
import path from 'node:path';

const FILTER = Object.freeze({
  caseIds: new Set([
    'open-exploration-issue',
    'open-draft-pull-request',
    'transition-implementation-issue',
    'finalize-lifecycle-pull-request',
    'coordinate-related-issues',
    'generate-proposal-pr-body',
    'generate-blocked-issue-text',
    'generate-archive-summary',
  ]),
  taskTypes: new Set([
    'open-pr',
    'manage-pr',
    'manage-issue',
    'generate-pr-text',
    'generate-issue-text',
  ]),
  promptSubstrings: [
    'pull-request',
    'pull request',
    'issue',
    'gh pr',
    'gh issue',
    'proposal checkpoint',
    'implementation checkpoint',
    'archive checkpoint',
    'coordination',
  ],
});

function fail(message, code = 1) {
  process.stderr.write(`[measure] ${message}\n`);
  process.exit(code);
}

function textContent(message) {
  if (!message || !Array.isArray(message.content)) return '';
  return message.content
    .filter((part) => part && ['text', 'thinking'].includes(part.type))
    .map((part) => part.text || part.thinking || '')
    .join('\n');
}

function usageTokens(usage) {
  if (!usage || !Number.isFinite(usage.input) || !Number.isFinite(usage.output)) {
    return null;
  }
  const cacheRead = Number.isFinite(usage.cacheRead) ? usage.cacheRead : 0;
  const cacheWrite = Number.isFinite(usage.cacheWrite) ? usage.cacheWrite : 0;
  const promptTokens = usage.input + cacheRead + cacheWrite;
  const completionTokens = usage.output;
  return {
    promptTokens,
    completionTokens,
    total: promptTokens + completionTokens,
  };
}

function measure(fileArg) {
  const file = path.resolve(fileArg);
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  let activeCase = null;
  let lastUserText = '';
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    let row;
    try {
      row = JSON.parse(lines[index]);
    } catch (error) {
      fail(`${file}:${index + 1}: invalid JSON: ${error.message}`);
    }

    if (row.type === 'workload_case') {
      activeCase = row;
      lastUserText = '';
      continue;
    }

    if (row.type !== 'message' || !row.message) continue;
    if (row.message.role === 'user') {
      lastUserText = textContent(row.message).toLowerCase();
      continue;
    }
    if (row.message.role !== 'assistant') continue;

    const usage = usageTokens(row.message.usage);
    if (!usage || !activeCase) continue;
    const markerAllowed = activeCase.processManagement === true
      && FILTER.caseIds.has(activeCase.caseId)
      && FILTER.taskTypes.has(activeCase.taskType);
    const promptAllowed = FILTER.promptSubstrings.some((term) => lastUserText.includes(term));
    if (!markerAllowed || !promptAllowed) continue;

    entries.push({
      caseId: activeCase.caseId,
      taskType: activeCase.taskType,
      skill: activeCase.skill,
      model: row.message.model,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total: usage.total,
    });
  }

  if (entries.length === 0) {
    fail(`${file}: deterministic process-management filter matched zero actual LLM calls`);
  }
  if (entries.length !== FILTER.caseIds.size) {
    fail(`${file}: expected ${FILTER.caseIds.size} matched calls, found ${entries.length}`);
  }
  const matchedCaseIds = new Set(entries.map((entry) => entry.caseId));
  if (matchedCaseIds.size !== FILTER.caseIds.size) {
    fail(`${file}: matched calls do not cover every allowlisted workload case exactly once`);
  }
  const models = new Set(entries.map((entry) => entry.model));
  if (models.size !== 1) {
    fail(`${file}: expected one model across all calls, found ${[...models].join(', ')}`);
  }

  return {
    file,
    matchedEntries: entries.length,
    model: entries[0].model,
    promptTokens: entries.reduce((sum, entry) => sum + entry.prompt_tokens, 0),
    completionTokens: entries.reduce((sum, entry) => sum + entry.completion_tokens, 0),
    total: entries.reduce((sum, entry) => sum + entry.total, 0),
    entries,
  };
}

function printMeasurement(result) {
  process.stdout.write(`${path.basename(result.file)}\n`);
  process.stdout.write(`  matched_entries: ${result.matchedEntries}\n`);
  process.stdout.write(`  model: ${result.model}\n`);
  process.stdout.write(`  prompt_tokens: ${result.promptTokens}\n`);
  process.stdout.write(`  completion_tokens: ${result.completionTokens}\n`);
  process.stdout.write(`  total: ${result.total}\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2) {
    fail('usage: node tools/measure.mjs <session.jsonl> [optimized-session.jsonl]');
  }

  const baseline = measure(args[0]);
  printMeasurement(baseline);
  if (args.length === 1) return;

  const optimized = measure(args[1]);
  printMeasurement(optimized);
  if (baseline.model !== optimized.model) {
    fail(`model mismatch: baseline used ${baseline.model}, optimized used ${optimized.model}`);
  }
  const reduction = 1 - optimized.total / baseline.total;
  const percentage = reduction * 100;
  const target = 30;
  const verdict = percentage >= target ? 'PASS' : 'BELOW TARGET';
  process.stdout.write(`\nreduction: ${percentage.toFixed(2)}% (${verdict}, target ${target}%)\n`);
  process.stdout.write(`baseline_total: ${baseline.total}\n`);
  process.stdout.write(`optimized_total: ${optimized.total}\n`);
  process.exitCode = percentage >= target ? 0 : 2;
}

main();
