import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const WORKER = join(HERE, 'process-kill-worker.mts');

type Scenario = 'durable-ack' | 'effect-journal' | 'poison-recovery';

interface ScenarioResult {
  scenario: Scenario;
  control: {
    stage: string;
    effectId?: string;
    messageId?: string;
  };
  before: {
    lifecycle: string;
    stateRevision: number;
    disposition: string;
    failureCode?: string | null;
    failureSourceMessageId?: string | null;
  };
  duplicate?: {
    status: string;
    targetSequence: number;
  };
  after?: {
    lifecycle: string;
    stateRevision: number;
    disposition: string;
  };
  effect: null | {
    status: string;
    attempt: number;
    sourceMessageId: string;
    output?: unknown;
  };
  rejectedCode?: string;
  toolTraceCount: number;
}

for (const scenario of ['durable-ack', 'effect-journal', 'poison-recovery'] as const) {
  test(`T-018 real process kill/restart: ${scenario}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), `domain-harness-t018-${scenario}-`));
    const databasePath = join(directory, 'runtime.sqlite');
    const tracePath = join(directory, 'tool-trace.jsonl');
    const controlPath = join(directory, 'boundary.json');

    try {
      const killed = await killAtDurableBoundary(scenario, databasePath, tracePath, controlPath);
      if (process.platform === 'win32') {
        assert.notEqual(killed.code, 0, `crash worker exited successfully instead of being terminated: ${killed.stderr}`);
      } else {
        assert.equal(killed.signal, 'SIGKILL', `expected SIGKILL at durable boundary: ${killed.stderr}`);
      }

      const result = resumeScenario(scenario, databasePath, tracePath, controlPath);
      assert.equal(result.scenario, scenario);

      if (scenario === 'durable-ack') {
        assert.equal(result.control.stage, 'after-accepted-ack-before-processing');
        assert.equal(result.before.lifecycle, 'waiting');
        assert.equal(result.before.stateId, 'draft');
        assert.equal(result.before.stateRevision, 0);
        assert.equal(result.before.disposition, 'accepted');
        assert.equal(result.duplicate?.status, 'duplicate');
        assert.equal(result.duplicate?.targetSequence, 1);
        assert.equal(result.after?.lifecycle, 'waiting');
        assert.equal(result.after?.stateId, 'quoted');
        assert.equal(result.after?.stateRevision, 1);
        assert.equal(result.after?.disposition, 'processed');
        assert.equal(result.toolTraceCount, 1, 'accepted message must execute exactly one semantic Tool invocation');
        assert.equal(result.effect, null, 'effect did not exist before the crash boundary');
        return;
      }

      if (scenario === 'effect-journal') {
        assert.equal(result.control.stage, 'after-effect-and-message-commit');
        assert.equal(result.before.lifecycle, 'waiting');
        assert.equal(result.before.stateId, 'quoted');
        assert.equal(result.before.stateRevision, 1);
        assert.equal(result.before.disposition, 'processed');
        assert.equal(result.duplicate?.status, 'duplicate');
        assert.equal(result.duplicate?.targetSequence, 1);
        assert.equal(result.after?.stateRevision, 1, 'duplicate delivery after restart must not fabricate a transition');
        assert.equal(result.after?.stateId, 'quoted');
        assert.equal(result.after?.disposition, 'processed');
        assert.equal(result.effect?.status, 'completed');
        assert.equal(result.effect?.attempt, 1);
        assert.equal(result.effect?.sourceMessageId, 'msg-effect-kill');
        assert.deepEqual(result.effect?.output, { total: 42 });
        assert.equal(result.toolTraceCount, 1, 'completed effect journal must prevent duplicate external execution');
        return;
      }

      assert.equal(result.control.stage, 'after-recovery-required-commit');
      assert.equal(result.before.lifecycle, 'recovery_required');
      assert.equal(
        result.before.stateId,
        'draft',
        'poison message must not commit a semantic state transition',
      );
      assert.equal(
        result.before.stateRevision,
        1,
        'the recovery_required commit consumes exactly one durable row revision; the G30 semantic revision reduction is documented in docs/validation/v0.2/node/',
      );
      assert.equal(result.before.disposition, 'failed');
      assert.equal(result.before.failureSourceMessageId, 'msg-poison-kill');
      assert.equal(result.rejectedCode, 'target_not_accepting');
      assert.equal(result.effect?.status, 'started', 'failed idempotent Tool attempt remains a durable started fact');
      assert.equal(result.effect?.attempt, 1);
      assert.equal(result.effect?.sourceMessageId, 'msg-poison-kill');
      assert.equal(result.toolTraceCount, 1, 'restart/query/rejection must not fabricate another Tool execution');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

async function killAtDurableBoundary(
  scenario: Scenario,
  databasePath: string,
  tracePath: string,
  controlPath: string,
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }> {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', WORKER, 'crash', scenario, databasePath, tracePath, controlPath],
    {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  );

  let stdout = '';
  let stderr = '';
  let boundarySeen = false;
  let settled = false;

  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      rejectPromise(new Error(
        `T-018 crash worker did not reach a durable boundary for ${scenario}. stdout=${stdout} stderr=${stderr}`,
      ));
    }, 20_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (!boundarySeen && stdout.includes('BOUNDARY ')) {
        boundarySeen = true;
        child.kill('SIGKILL');
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!boundarySeen) {
        rejectPromise(new Error(
          `T-018 crash worker exited before durable boundary for ${scenario}. code=${code} signal=${signal} stdout=${stdout} stderr=${stderr}`,
        ));
        return;
      }
      resolvePromise({ code, signal, stderr });
    });
  });
}

function resumeScenario(
  scenario: Scenario,
  databasePath: string,
  tracePath: string,
  controlPath: string,
): ScenarioResult {
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', WORKER, 'resume', scenario, databasePath, tracePath, controlPath],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 20_000,
      env: process.env,
    },
  );

  assert.equal(child.status, 0, `resume worker failed for ${scenario}: ${child.stderr}`);
  const resultLine = child.stdout
    .split('\n')
    .find((line) => line.startsWith('RESULT '));
  assert.ok(resultLine, `resume worker emitted no RESULT for ${scenario}: ${child.stdout}`);
  return JSON.parse(resultLine.slice('RESULT '.length)) as ScenarioResult;
}
