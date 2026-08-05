#!/usr/bin/env node
/**
 * tools/test-lifecycle.mjs
 *
 * Offline test for the BrainSpec lifecycle driver. Runs each
 * subcommand against a synthetic gh/git/openspec shim and asserts:
 *   - stdout is exactly one JSON line
 *   - stderr, after redirection to a log, contains no Bash-tool
 *     leakage (token-economics guardrail)
 *   - exit codes match the contract (0 ok, 2 refused, 4 missing input)
 *   - hard-stop rules are enforced
 *
 * Run: node tools/test-lifecycle.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DRIVER = path.join(REPO_ROOT, 'scripts', 'lifecycle', 'brainspec-lifecycle.sh');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tools', 'fixtures');

let failures = 0;

function log(name, ok, detail) {
  const tag = ok ? 'PASS' : 'FAIL';
  process.stdout.write(`[${tag}] ${name}${detail ? ' -- ' + detail : ''}\n`);
  if (!ok) failures += 1;
}

function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const shimDir = path.join(dir, 'shim');
  fs.mkdirSync(shimDir, { recursive: true });
  for (const name of ['gh', 'git', 'openspec']) {
    fs.copyFileSync(path.join(FIXTURE_DIR, `${name}-shim.sh`), path.join(shimDir, name));
    fs.chmodSync(path.join(shimDir, name), 0o755);
  }
  return { dir, shimDir };
}

function runDriver(worktree, args) {
  const env = {
    ...process.env,
    PATH: `${worktree.shimDir}:${process.env.PATH}`,
    BRAINSPEC_SHIM_LOG: path.join(worktree.dir, 'shim.log'),
    BRAINSPEC_LOG: path.join(worktree.dir, 'driver.log'),
    BRAINSPE_REPO: 'fixture-org/fixture-repo',
    BRAINSPEC_WORKTREE: REPO_ROOT,
  };
  return spawnSync('bash', [DRIVER, ...args], {
    cwd: worktree.dir,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const checks = {
  artifact_issue_is_url: function (j) { return typeof j.artifact.issue === 'string' && j.artifact.issue.includes('github.com'); },
  readiness_ready:      function (j) { return j.artifact.readiness === 'ready'; },
  readiness_blocked:    function (j) { return j.artifact.readiness === 'blocked'; },
  branch_set:           function (j) { return j.artifact.branch === 'test-id'; },
  pull_request_set:     function (j) { return j.artifact.pullRequest.includes('pull/'); },
  members_two:          function (j) { return Array.isArray(j.artifact.members) && j.artifact.members.length === 2; },
};

function standardAssertions(worktree, name, args, expected) {
  const result = runDriver(worktree, args);
  const stdout = (result.stdout || '').trimEnd();
  const stderr = (result.stderr || '').trimEnd();
  const isOneLine = !stdout.includes('\n');
  let parsed = null;
  try { parsed = isOneLine ? JSON.parse(stdout) : null; } catch { parsed = null; }
  const isValidJson = parsed !== null;
  const matchesExit = expected.exit === undefined || result.status === expected.exit;
  const matchesState = expected.state === undefined || (parsed && parsed.state === expected.state);
  const matchesStage = expected.stage === undefined || (parsed && parsed.stage === expected.stage);
  const ok = (
    matchesExit &&
    matchesState &&
    matchesStage &&
    isOneLine &&
    isValidJson &&
    stderr === ''
  );
  log(name, ok, !ok ? ('exit=' + result.status + ' stdout=' + stdout.slice(0, 80) + ' stderr=' + stderr.slice(0, 80)) : '');
  if (parsed && expected.checks) {
    for (const checkName of expected.checks) {
      const fn = checks[checkName];
      if (!fn) continue;
      const ok2 = fn(parsed);
      log(`${name} :: ${checkName}`, ok2, !ok2 ? 'json field check failed' : '');
    }
  }
}

function test_help() {
  const t = mkTmp('lifecycle-help-');
  const result = runDriver(t, ['help']);
  log('help exits 0', result.status === 0);
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_help_short_circuits() {
  const t = mkTmp('lifecycle-help-short-');
  const env2 = { ...process.env, PATH: '/usr/bin', BRAINSPEC_LOG: path.join(t.dir, 'driver.log') };
  const result = spawnSync('bash', [DRIVER, 'help'], { cwd: t.dir, env: env2, encoding: 'utf8' });
  log('help short-circuits before gh', result.status === 0);
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_explore_ready() {
  const t = mkTmp('lifecycle-explore-');
  standardAssertions(t, 'explore ready', ['explore', '--idea', 'add session replay', '--readiness', 'ready'], {
    exit: 0, state: 'prepared', stage: 'explore',
    checks: ['artifact_issue_is_url', 'readiness_ready'],
  });
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_explore_blocked() {
  const t = mkTmp('lifecycle-explore-blocked-');
  standardAssertions(t, 'explore blocked', ['explore', '--idea', 'x', '--readiness', 'blocked'], {
    exit: 0, state: 'prepared', stage: 'explore',
    checks: ['readiness_blocked'],
  });
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_explore_missing_readiness() {
  const t = mkTmp('lifecycle-explore-missing-');
  standardAssertions(t, 'explore missing readiness', ['explore', '--idea', 'x'], {
    exit: 4, state: 'error',
  });
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_explore_bad_readiness() {
  const t = mkTmp('lifecycle-explore-bad-');
  standardAssertions(t, 'explore bad readiness', ['explore', '--idea', 'x', '--readiness', 'maybe'], {
    exit: 4, state: 'error',
  });
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_propose() {
  const t = mkTmp('lifecycle-propose-');
  standardAssertions(t, 'propose', ['propose', '--increment', 'test-id'], {
    exit: 0, state: 'prepared', stage: 'propose',
    checks: ['branch_set'],
  });
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_apply_verify() {
  const t = mkTmp('lifecycle-apply-');
  const changeDir = path.join(REPO_ROOT, 'openspec', 'changes', 'test-id');
  fs.mkdirSync(changeDir, { recursive: true });
  const metadataPath = path.join(changeDir, 'github-issue.json');
  fs.writeFileSync(metadataPath, JSON.stringify({
    schemaVersion: 2,
    incrementId: 'test-id',
    issue: 'https://github.com/fixture-org/fixture-repo/issues/99',
    pullRequest: 'https://github.com/fixture-org/fixture-repo/pull/1',
    branch: 'test-id',
    worktree: REPO_ROOT,
    base: 'abc123',
  }, null, 2));
  try {
    standardAssertions(t, 'apply-verify', ['apply-verify', '--increment', 'test-id', '--task-summary', 'implemented'], {
      exit: 0, state: 'prepared', stage: 'apply-verify',
      checks: ['pull_request_set'],
    });
  } finally {
    fs.rmSync(path.join(REPO_ROOT, 'openspec', 'changes', 'test-id'), { recursive: true, force: true });
  }
}

function test_apply_verify_bad_schema() {
  const t = mkTmp('lifecycle-apply-bad-');
  const changeDir = path.join(REPO_ROOT, 'openspec', 'changes', 'test-id');
  fs.mkdirSync(changeDir, { recursive: true });
  const metadataPath = path.join(changeDir, 'github-issue.json');
  fs.writeFileSync(metadataPath, JSON.stringify({ schemaVersion: 1, incrementId: 'test-id' }, null, 2));
  try {
    standardAssertions(t, 'apply-verify bad schema', ['apply-verify', '--increment', 'test-id'], {
      exit: 2, state: 'refused',
    });
  } finally {
    fs.rmSync(path.join(REPO_ROOT, 'openspec', 'changes', 'test-id'), { recursive: true, force: true });
  }
}

function test_archive_missing_sync() {
  const t = mkTmp('lifecycle-archive-missing-');
  standardAssertions(t, 'archive missing sync', ['archive', '--increment', 'test-id'], {
    exit: 4, state: 'error',
  });
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_coordinate() {
  const t = mkTmp('lifecycle-coord-');
  standardAssertions(t, 'coordinate', ['coordinate', '--members', 'fixture-org/fixture-repo#1,fixture-org/fixture-repo#2'], {
    exit: 0, state: 'prepared', stage: 'coordinate',
    checks: ['members_two'],
  });
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_coordinate_bad_member() {
  const t = mkTmp('lifecycle-coord-bad-');
  standardAssertions(t, 'coordinate bad member', ['coordinate', '--members', 'not-a-valid-ref'], {
    exit: 2, state: 'refused',
  });
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_no_args() {
  const result = spawnSync('bash', [DRIVER], { encoding: 'utf8' });
  log('no args exits 4', result.status === 4);
}

function test_unknown_stage() {
  const t = mkTmp('lifecycle-unknown-');
  const result = runDriver(t, ['nonexistent']);
  log('unknown stage exits 4', result.status === 4);
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_stderr_leak_guard() {
  // Invoke propose (which calls log "[propose] next: ..."), so the
  // script's internal log must contain that diagnostic. The Bash
  // tool's stderr stream must be empty.
  const t = mkTmp('lifecycle-leak-');
  const logPath = path.join(t.dir, 'script-internal.log');
  const result = spawnSync('bash', [DRIVER, 'propose', '--increment', 'test-id'], {
    cwd: t.dir,
    env: {
      ...process.env,
      PATH: `${t.shimDir}:${process.env.PATH}`,
      BRAINSPE_REPO: 'fixture-org/fixture-repo',
      BRAINSPEC_LOG: logPath,
    },
    encoding: 'utf8',
  });
  const stdout = (result.stdout || '').trimEnd();
  const stderr = (result.stderr || '').trimEnd();
  const internalLog = fs.readFileSync(logPath, 'utf8').toString();
  const isOneLine = !stdout.includes('\n');
  const isValidJson = (() => { try { return !!JSON.parse(stdout); } catch { return false; } })();
  const stderrEmpty = stderr === '';
  const logHasDiagnostic = internalLog.includes('next:') || internalLog.includes('propose');
  const ok = result.status === 0 && isOneLine && isValidJson && stderrEmpty && logHasDiagnostic;
  log('stderr silent when redirected (token-economics guardrail)', ok, !ok ? ('stdout=' + stdout.slice(0, 80) + ' stderr=' + stderr.slice(0, 80) + ' logHasDiagnostic=' + logHasDiagnostic) : '');
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function test_wrapper_explore() {
  const t = mkTmp('lifecycle-wrapper-');
  const wrapper = path.join(REPO_ROOT, '.apm', 'skills', 'brainspec-slim-explore', 'scripts', 'brainspec-explore.sh');
  const result = spawnSync('bash', [wrapper, 'add session replay', 'ready'], {
    cwd: t.dir,
    env: {
      ...process.env,
      PATH: `${t.shimDir}:${process.env.PATH}`,
      BRAINSPE_REPO: 'fixture-org/fixture-repo',
      BRAINSPEC_LOG: path.join(t.dir, 'wrapper.log'),
    },
    encoding: 'utf8',
  });
  const stdout = (result.stdout || '').trimEnd();
  const isOneLine = !stdout.includes('\n');
  let parsed = null;
  try { parsed = isOneLine ? JSON.parse(stdout) : null; } catch { parsed = null; }
  const ok = result.status === 0 && isOneLine && parsed && parsed.state === 'prepared';
  log('slim wrapper resolves to driver and produces JSON', ok, !ok ? ('stdout=' + stdout.slice(0, 80)) : '');
  fs.rmSync(t.dir, { recursive: true, force: true });
}

test_help();
test_help_short_circuits();
test_explore_ready();
test_explore_blocked();
test_explore_missing_readiness();
test_explore_bad_readiness();
test_propose();
test_apply_verify();
test_apply_verify_bad_schema();
test_archive_missing_sync();
test_coordinate();
test_coordinate_bad_member();
test_no_args();
test_unknown_stage();
test_stderr_leak_guard();
test_wrapper_explore();

process.stdout.write(`\n[test-lifecycle] ${failures === 0 ? 'all PASS' : failures + ' FAIL'}\n`);
process.exit(failures === 0 ? 0 : 1);
