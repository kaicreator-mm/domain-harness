import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

import { createActor } from 'xstate';

import {
  RESEARCH_SCENARIOS,
  assertJsonControlSnapshot,
  assertRestorableControlSnapshot,
  createResearchMachines,
  type ResearchPorts,
  type ResearchScenario,
} from './xstate-child-recovery-machine.js';

const WORKER = fileURLToPath(new URL('./xstate-child-recovery-worker.mts', import.meta.url));

const blockedPorts: ResearchPorts = {
  model: {
    async generate() {
      return new Promise<never>(() => {});
    },
  },
  query: {
    async execute() {
      return { unused: true };
    },
  },
  mutation: {
    async execute() {
      return { unused: true };
    },
  },
};

function jsonClone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

test('control snapshot is JSON-only, preserves the active HarnessMachine child, and fails closed if child state is corrupt', () => {
  const { DomainMachine } = createResearchMachines(blockedPorts);
  const actor = createActor(DomainMachine, {
    input: { requestId: 'snapshot-check', scenario: 'ai-committed' },
  });
  actor.start();
  assert.equal(actor.getSnapshot().value, 'evaluating');

  actor.send({ type: 'FORCE_QUOTE' });
  assert.equal(
    actor.getSnapshot().value,
    'evaluating',
    'parent guard authority must reject a forged terminal transition while the child is active',
  );

  const persisted = actor.getPersistedSnapshot();
  assertJsonControlSnapshot(persisted);
  assertRestorableControlSnapshot(persisted);

  const missingChild = jsonClone(persisted) as { children: Record<string, unknown> };
  delete missingChild.children['reasoning-harness'];
  assert.throws(
    () => assertRestorableControlSnapshot(missingChild),
    /RECOVERY_CONTROL_SNAPSHOT_INVALID|RECOVERY_CHILD_SNAPSHOT_INVALID/,
  );

  const corruptChild = jsonClone(persisted) as {
    children: Record<string, { snapshot: { value: unknown } }>;
  };
  corruptChild.children['reasoning-harness']!.snapshot.value = 'succeeded';
  assert.throws(
    () => assertRestorableControlSnapshot(corruptChild),
    /RECOVERY_CHILD_SNAPSHOT_INVALID/,
  );

  actor.stop();
});

interface WorkerResult {
  scenario: ResearchScenario;
  sqlite: {
    journalMode: string;
    synchronous: number;
    foreignKeys: number;
    runtimeInstanceReopened: boolean;
  };
  restored: {
    parentState: unknown;
    childState: unknown;
  };
  final: {
    parentState: unknown;
    status: string;
    childTerminalState: unknown;
  };
  calls: {
    model1: number;
    model2: number;
    query: number;
    mutationAttempts: number;
    mutationApplications: number;
    mutationRows: number;
  };
  primaryEffectStatus: string | null;
  identityMismatchRejected: boolean;
}

async function crashAtBoundary(
  scenario: ResearchScenario,
  databasePath: string,
  boundaryPath: string,
): Promise<{ signal: NodeJS.Signals | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', WORKER, 'crash', scenario, databasePath, boundaryPath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    let killed = false;
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timed out waiting for crash boundary for ${scenario}; stdout=${stdout}; stderr=${stderr}`));
    }, 20_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (!killed && stdout.includes('BOUNDARY ')) {
        killed = true;
        child.kill('SIGKILL');
      }
    });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (_code, signal) => {
      clearTimeout(timeout);
      if (!killed) {
        reject(new Error(`Worker exited before boundary for ${scenario}; stdout=${stdout}; stderr=${stderr}`));
        return;
      }
      resolve({ signal, stderr });
    });
  });
}

function resume(scenario: ResearchScenario, databasePath: string): WorkerResult {
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', WORKER, 'resume', scenario, databasePath],
    { encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024 },
  );

  assert.equal(
    child.status,
    0,
    `resume worker failed for ${scenario}\nstdout:\n${child.stdout}\nstderr:\n${child.stderr}`,
  );
  const resultLine = child.stdout.split(/\r?\n/u).find((line) => line.startsWith('RESULT '));
  assert.ok(resultLine, `missing RESULT line for ${scenario}: ${child.stdout}`);
  return JSON.parse(resultLine.slice('RESULT '.length)) as WorkerResult;
}

for (const scenario of RESEARCH_SCENARIOS) {
  test(
    `real SQLite + SIGKILL recovery: ${scenario}`,
    { skip: process.platform === 'win32' ? 'SIGKILL evidence runs on the Linux Build Host' : false },
    async () => {
      const directory = mkdtempSync(join(tmpdir(), `domain-harness-195-${scenario}-`));
      const databasePath = join(directory, 'runtime.sqlite');
      const boundaryPath = join(directory, 'boundary.json');

      try {
        const crash = await crashAtBoundary(scenario, databasePath, boundaryPath);
        assert.equal(crash.signal, 'SIGKILL', crash.stderr);
        assert.equal(existsSync(boundaryPath), true);

        const boundary = JSON.parse(readFileSync(boundaryPath, 'utf8')) as {
          scenario: ResearchScenario;
          stage: string;
          effectId: string;
        };
        assert.equal(boundary.scenario, scenario);
        assert.ok(boundary.effectId.startsWith(`research:${scenario}:`));

        const result = resume(scenario, databasePath);
        assert.equal(result.scenario, scenario);
        assert.equal(result.sqlite.journalMode, 'wal');
        assert.equal(result.sqlite.synchronous, 2);
        assert.equal(result.sqlite.foreignKeys, 1);
        assert.equal(result.sqlite.runtimeInstanceReopened, true);

        assert.equal(result.restored.parentState, 'evaluating');
        assert.equal(result.restored.childState, 'model');
        assert.equal(result.final.status, 'done');
        assert.equal(result.final.parentState, 'quoteRequested');
        assert.equal(result.final.childTerminalState, 'succeeded');

        assert.equal(result.identityMismatchRejected, true);
        assert.equal(result.primaryEffectStatus, 'completed');

        if (scenario === 'ai-committed') {
          assert.equal(boundary.stage, 'after-model-commit-before-control-snapshot');
          assert.deepEqual(result.calls, {
            model1: 1,
            model2: 0,
            query: 0,
            mutationAttempts: 0,
            mutationApplications: 0,
            mutationRows: 0,
          });
        }

        if (scenario === 'query-committed') {
          assert.equal(boundary.stage, 'after-query-commit-before-control-snapshot');
          assert.deepEqual(result.calls, {
            model1: 1,
            model2: 1,
            query: 1,
            mutationAttempts: 0,
            mutationApplications: 0,
            mutationRows: 0,
          });
        }

        if (scenario === 'mutation-committed') {
          assert.equal(boundary.stage, 'after-mutation-commit-before-control-snapshot');
          assert.deepEqual(result.calls, {
            model1: 1,
            model2: 0,
            query: 0,
            mutationAttempts: 1,
            mutationApplications: 1,
            mutationRows: 1,
          });
        }

        if (scenario === 'ai-before-commit') {
          assert.equal(boundary.stage, 'after-external-call-before-result-commit');
          assert.deepEqual(result.calls, {
            model1: 2,
            model2: 0,
            query: 0,
            mutationAttempts: 0,
            mutationApplications: 0,
            mutationRows: 0,
          });
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
}
