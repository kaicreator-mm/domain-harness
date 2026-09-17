import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const testsDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testsDir, '..');
const worker = join(testsDir, 'fixtures', 'crash-recovery-worker.ts');

type Scenario =
  | 'after-started-idempotent'
  | 'after-started-non-idempotent'
  | 'after-completed'
  | 'after-child-frame-push'
  | 'after-child-step-completed'
  | 'terminal-child-frame'
  | 'after-event-accepted'
  | 'cancel-while-executing';

interface ResumeResult {
  run: {
    status: string;
    output?: unknown;
    error?: { code?: string };
  };
  step: {
    status: string;
    attempt: number;
    idempotencyKey: string;
    output?: unknown;
    error?: { code?: string };
  } | null;
  resumeError?: string;
  atomicitySnapshot?: {
    status?: string;
    stepExists?: boolean;
  };
}

function executeScenario(scenario: Scenario): {
  result: ResumeResult;
  markerLines: string[];
} {
  const dir = mkdtempSync(join(tmpdir(), 'domain-harness-crash-'));
  const dbPath = join(dir, 'run.sqlite');
  const markerPath = join(dir, 'tool.log');
  const resultPath = join(dir, 'result.json');
  try {
    const crash = spawnSync(
      process.execPath,
      ['--import', 'tsx', worker, 'crash', scenario, dbPath, markerPath, resultPath],
      { cwd: packageRoot, encoding: 'utf8', timeout: 20_000 },
    );
    // The worker self-terminates via process.kill(pid, 'SIGKILL'): POSIX reports
    // status null + SIGKILL; Windows terminates via TerminateProcess with exit
    // code 1 and no signal. start() drives in the background, so resultPath may
    // exist before the crash point fires; only the exit shape is asserted here.
    if (process.platform === 'win32') {
      assert.equal(crash.signal, null, `unexpected signal on Windows: ${crash.signal}`);
      assert.equal(crash.status, 1, `crash worker unexpectedly exited normally: ${crash.stderr}`);
    } else {
      assert.equal(crash.status, null, `crash worker unexpectedly exited normally: ${crash.stderr}`);
      assert.equal(crash.signal, 'SIGKILL', `expected SIGKILL, got ${crash.signal}: ${crash.stderr}`);
    }

    const resume = spawnSync(
      process.execPath,
      ['--import', 'tsx', worker, 'resume', scenario, dbPath, markerPath, resultPath],
      { cwd: packageRoot, encoding: 'utf8', timeout: 20_000 },
    );
    assert.equal(resume.status, 0, `resume worker failed: ${resume.stderr}`);
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as ResumeResult;
    const markerLines = existsSync(markerPath)
      ? readFileSync(markerPath, 'utf8').trim().split('\n').filter(Boolean)
      : [];
    return { result, markerLines };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('SIGKILL after idempotent Tool started replays once with attempt 2', () => {
  const { result, markerLines } = executeScenario('after-started-idempotent');
  assert.equal(result.run.status, 'completed');
  assert.equal(result.step?.status, 'completed');
  assert.equal(result.step?.attempt, 2);
  assert.equal(markerLines.length, 1);
  assert.match(markerLines[0]!, /^2:/);
});

test('SIGKILL after non-idempotent Tool started materializes interrupted without replay', () => {
  const { result, markerLines } = executeScenario('after-started-non-idempotent');
  assert.equal(result.run.status, 'failed');
  assert.equal(result.run.error?.code, 'interrupted');
  assert.equal(result.step?.status, 'failed');
  assert.equal(result.step?.attempt, 1);
  assert.equal(result.step?.error?.code, 'interrupted');
  assert.equal(markerLines.length, 0);
});

test('SIGKILL after Step completion commit reuses journal output without Tool rerun', () => {
  const { result, markerLines } = executeScenario('after-completed');
  assert.equal(result.run.status, 'completed');
  assert.deepEqual(result.run.output, { attempt: 1 });
  assert.equal(result.step?.status, 'completed');
  assert.equal(result.step?.attempt, 1);
  assert.deepEqual(result.step?.output, { attempt: 1 });
  assert.equal(markerLines.length, 1);
  assert.match(markerLines[0]!, /^1:/);
});

test('SIGKILL after child frame push resumes the pushed child exactly once', () => {
  const { result, markerLines } = executeScenario('after-child-frame-push');
  assert.equal(result.run.status, 'completed');
  assert.deepEqual(result.run.output, { attempt: 1 });
  assert.equal(result.step?.status, 'completed');
  assert.equal(result.step?.attempt, 1);
  assert.equal(markerLines.length, 1);
  assert.match(markerLines[0]!, /^1:/);
});

test('SIGKILL after child internal Step commit reuses child journal without rerun', () => {
  const { result, markerLines } = executeScenario('after-child-step-completed');
  assert.equal(result.run.status, 'completed');
  assert.deepEqual(result.run.output, { attempt: 1 });
  assert.equal(result.step?.status, 'completed');
  assert.equal(result.step?.attempt, 1);
  assert.deepEqual(result.step?.output, { attempt: 1 });
  assert.equal(markerLines.length, 1);
  assert.match(markerLines[0]!, /^1:/);
});

test('SIGKILL with a terminal child frame reconciles the parent without re-entering the child', () => {
  const { result, markerLines } = executeScenario('terminal-child-frame');
  assert.equal(result.run.status, 'completed');
  assert.deepEqual(result.run.output, { attempt: 1 });
  assert.equal(result.step?.status, 'completed');
  assert.equal(result.step?.attempt, 1);
  assert.equal(markerLines.length, 1);
  assert.match(markerLines[0]!, /^1:/);
});

test('SIGKILL inside event acceptance rolls back to pre-event waiting, then re-accepts cleanly', () => {
  const { result, markerLines } = executeScenario('after-event-accepted');
  assert.equal(result.atomicitySnapshot?.status, 'waiting', 'crash must leave the pre-event waiting state');
  assert.equal(result.atomicitySnapshot?.stepExists, false, 'event journal must roll back with the transaction');
  assert.equal(result.run.status, 'completed');
  assert.deepEqual(result.run.output, { accepted: true });
  assert.equal(result.step?.status, 'completed');
  assert.deepEqual(result.step?.output, { accepted: true });
  assert.equal(markerLines.length, 1, 'pre-waiting Tool Step must not rerun');
  assert.match(markerLines[0]!, /^1:/);
});

test('SIGKILL after cancellation persists while the executor holds a late result', () => {
  const { result, markerLines } = executeScenario('cancel-while-executing');
  assert.equal(result.run.status, 'cancelled');
  assert.equal(result.run.error?.code, 'cancelled');
  assert.match(result.resumeError ?? '', /RecoveryContinuationError/);
  assert.equal(result.step?.status, 'started');
  assert.equal(result.step?.output, undefined);
  assert.equal(markerLines.length, 1);
  assert.match(markerLines[0]!, /^1:/);
});
