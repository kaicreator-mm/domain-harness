import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as sdk from '../src/legacy-v1/index.js';
import type { AIOperationPort, DomainHarness } from '../src/legacy-v1/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'basic-harness');

const ai: AIOperationPort = {
  async execute(request) {
    assert.equal(request.skillId, 'generate');
    return { text: 'generated' };
  },
};

test('frozen v0.1 legacy regression surface creates an embedded Runtime and executes lifecycle operations', async () => {
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

test('frozen v0.1 legacy regression surface does not expose implementation modules', () => {
  const exported = new Set(Object.keys(sdk));
  assert.equal(exported.has('createDomainHarness'), true);
  assert.equal(exported.has('DOMAIN_HARNESS_VERSION'), true);
  assert.equal(exported.has('SqliteStore'), false);
  assert.equal(exported.has('RunCoordinator'), false);
  assert.equal(exported.has('RecoveryLifecycle'), false);
  assert.equal(exported.has('createMachine'), false);
});

test('invalid Harness loading rejects before creating or migrating the SQLite file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-sdk-invalid-'));
  const sqlitePath = join(dir, 'must-not-exist.sqlite');
  try {
    await assert.rejects(
      sdk.createDomainHarness({ root: join(dir, 'missing-harness'), sqlitePath, ai }),
      /ENOENT/,
    );
    await assert.rejects(
      sdk.createDomainHarness({ root: fixture, sqlitePath: '', ai }),
      TypeError,
    );
    assert.equal(existsSync(sqlitePath), false, 'no SQLite file may be created by a failed startup');
    assert.equal(existsSync(`${sqlitePath}-wal`), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a Workflow Tool reference must be provided through the tools mapping', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-sdk-tools-'));
  const root = join(dir, 'harness');
  const sqlitePath = join(dir, 'runtime.sqlite');
  try {
    await mkdir(join(root, 'workflows'), { recursive: true });
    await writeFile(join(root, 'harness.yaml'), 'schemaVersion: "0.1"\nid: tools-required\nlimits:\n  maxSteps: 10\n', 'utf8');
    await writeFile(
      join(root, 'workflows', 'main.yaml'),
      'initial: work\nstates:\n  work:\n    invoke:\n      tool: host-tool\n    on:\n      done:\n        - target: ok\n  ok:\n    final: true\n  failed:\n    final: true\n',
      'utf8',
    );

    await assert.rejects(
      sdk.createDomainHarness({ root, sqlitePath, ai }),
      (error: unknown) => error instanceof Error && /referenced Tool 'host-tool' is not registered/.test(error.message),
    );
    assert.equal(existsSync(sqlitePath), false, 'definition validation must precede persistence setup');

    const runtime = await sdk.createDomainHarness({
      root,
      sqlitePath: ':memory:',
      ai,
      tools: { 'host-tool': { effect: 'none', async execute() { return { ok: true }; } } },
    });
    const completed = await runtime.start({ workflowId: 'main', input: {} })
      .then((run) => runtime.wait(run.runId, { timeoutMs: 2000 }));
    assert.equal(completed.status, 'completed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
