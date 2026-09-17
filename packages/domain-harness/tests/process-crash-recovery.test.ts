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
  | 'after-completed';

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
      { cwd: packageRoot, encoding: 'utf8', timeout: 10_000 },
    );
    assert.equal(crash.status, null, `crash worker unexpectedly exited normally: ${crash.stderr}`);
    assert.equal(crash.signal, 'SIGKILL', `expected SIGKILL, got ${crash.signal}: ${crash.stderr}`);

    const resume = spawnSync(
      process.execPath,
      ['--import', 'tsx', worker, 'resume', scenario, dbPath, markerPath, resultPath],
      { cwd: packageRoot, encoding: 'utf8', timeout: 10_000 },
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
