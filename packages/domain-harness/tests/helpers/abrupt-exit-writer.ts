import { SqliteStore } from '../../src/persistence/index.js';

const [dbPath, runId] = process.argv.slice(2);
if (!dbPath || !runId) throw new Error('usage: abrupt-exit-writer.ts <dbPath> <runId>');

const store = new SqliteStore({ path: dbPath, busyTimeoutMs: 1234 });
store.createRun({
  runId,
  harnessId: 'abrupt',
  rootWorkflowId: 'main',
  status: 'running',
  input: { value: 1 },
  definitionHash: 'b'.repeat(64),
  executionEngineMajor: 5,
  controlState: {
    schemaVersion: 1,
    frames: [{
      workflowId: 'main',
      workflowInstanceId: 'root',
      stateId: 'first',
      visits: { first: 1 },
      lastDecisionAt: '2026-09-17T00:00:00.000Z',
    }],
  },
  createdAt: '2026-09-17T00:00:00.000Z',
  updatedAt: '2026-09-17T00:00:00.000Z',
});
store.insertStartedStep({
  runId,
  workflowInstanceId: 'root',
  stateId: 'first',
  visit: 1,
  kind: 'expr',
  attempt: 1,
  startedAt: '2026-09-17T00:00:00.000Z',
  input: { x: 1 },
  idempotencyKey: 'dh:v1:abrupt',
});

process.exit(1);
