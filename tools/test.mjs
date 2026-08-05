#!/usr/bin/env node
/**
 * Repository test: validate the two committed native OMP session captures and
 * run the deterministic arithmetic comparison. Workload capture is explicit
 * (`npm run workload:*`) because tests must not require model credentials.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(REPO_ROOT, 'sessions', 'baseline_session.jsonl');
const OPTIMIZED = path.join(REPO_ROOT, 'sessions', 'optimized_session.jsonl');

function fail(message) {
  process.stderr.write(`[test] ${message}\n`);
  process.exit(1);
}

for (const session of [BASELINE, OPTIMIZED]) {
  if (!fs.existsSync(session) || fs.statSync(session).size === 0) {
    fail(`missing committed session capture: ${session}`);
  }
}

const result = spawnSync(
  process.execPath,
  ['tools/measure.mjs', BASELINE, OPTIMIZED],
  { cwd: REPO_ROOT, encoding: 'utf8' },
);
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');

if (![0, 2].includes(result.status)) {
  fail(`measurement failed with exit ${result.status}`);
}
if (!/matched_entries:\s+8/g.test(result.stdout)) {
  fail('measurement did not report the expected actual LLM calls');
}
const match = result.stdout.match(/reduction:\s+(-?[\d.]+)%\s+\((PASS|BELOW TARGET)/);
if (!match) {
  fail('measurement did not report the deterministic reduction comparison');
}

const reduction = Number.parseFloat(match[1]);
const verdict = match[2];
process.stdout.write(`[test] valid actual-session comparison: ${reduction.toFixed(2)}% (${verdict})\n`);
