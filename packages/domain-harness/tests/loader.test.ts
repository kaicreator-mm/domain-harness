import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { loadHarness } from '../src/loader/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'basic-harness');

test('loads the frozen v0.1 subset and produces a stable definition hash', async () => {
  const first = await loadHarness({ root: fixture, registeredTools: new Set() });
  const second = await loadHarness({ root: fixture, registeredTools: new Set() });

  assert.equal(first.manifest.schemaVersion, '0.1');
  assert.equal(first.workflows.size, 1);
  assert.equal(first.skills.size, 1);
  assert.match(first.definitionHash, /^[a-f0-9]{64}$/);
  assert.equal(first.definitionHash, second.definitionHash);
});

test('normalizes waiting-event schema and default error route', async () => {
  const harness = await loadHarness({ root: fixture, registeredTools: new Set() });
  const workflow = harness.workflows.get('main');
  assert.ok(workflow);
  assert.equal(workflow.states.generate?.error[0]?.target, 'failed');
  assert.ok(workflow.states.await_approval?.events.approve?.schema);
});
