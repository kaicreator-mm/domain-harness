import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as sdk from '../src/index.js';
import type { AIOperationPort, DomainHarness } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'basic-harness');

const ai: AIOperationPort = {
  async execute(request) {
    assert.equal(request.skillId, 'generate');
    return { text: 'generated' };
  },
};

test('package root creates an embedded Runtime and executes public lifecycle operations', async () => {
  const runtime: DomainHarness = await sdk.createDomainHarness({
    root: fixture,
    sqlitePath: ':memory:',
    ai,
  });

  const started = await runtime.start({ workflowId: 'main', input: { topic: 'v0.1' } });
  assert.equal(started.harnessId, 'basic');
  assert.equal(started.status, 'running');

  const waiting = await runtime.wait(started.runId, { timeoutMs: 1000 });
  assert.equal(waiting.status, 'waiting');
  assert.equal((await runtime.get(started.runId))?.status, 'waiting');
  assert.equal((await runtime.listRuns({ status: 'waiting' })).length, 1);

  const completed = await runtime.send(started.runId, {
    type: 'approve',
    payload: { approvedBy: 'reviewer' },
  });
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.output, { approvedBy: 'reviewer' });
  assert.equal((await runtime.wait(started.runId, { timeoutMs: 1000 })).status, 'completed');
});

test('package root does not expose Runtime implementation modules', () => {
  const exported = new Set(Object.keys(sdk));
  assert.equal(exported.has('createDomainHarness'), true);
  assert.equal(exported.has('DOMAIN_HARNESS_VERSION'), true);
  assert.equal(exported.has('SqliteStore'), false);
  assert.equal(exported.has('RunCoordinator'), false);
  assert.equal(exported.has('RecoveryLifecycle'), false);
  assert.equal(exported.has('createMachine'), false);
});
