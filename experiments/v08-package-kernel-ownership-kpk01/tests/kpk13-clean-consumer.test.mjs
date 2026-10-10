/**
 * KPK-13 — clean Node public consumer
 * ===================================
 * An actual outside-package consumer runs `DomainHarness.load(package)` on
 * STOCK Node (no tsx, no loader flags, no runtime raw compilation) with a
 * stable contract: typed UX intent → send/query/observe round trip. There is
 * no `compiledApp` parameter anywhere in the public API.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { writeEvidence } from './evidence.mjs';

const EXPERIMENT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('KPK-13: the stock-Node public consumer performs a full typed UX round trip', async () => {
  const demo = path.join(EXPERIMENT_ROOT, 'consumer', 'demo-consumer.mjs');
  const result = spawnSync(process.execPath, [demo], {
    encoding: 'utf8',
    cwd: EXPERIMENT_ROOT,
  });
  assert.equal(result.status, 0, `consumer failed:\n${result.stderr}`);

  const output = JSON.parse(result.stdout);
  assert.equal(output.consumer.includes('stock-node'), true);
  assert.equal(output.loadedKernel, 'kernel-vnext@1.1.0');
  assert.match(output.kernelModuleSha256, /^[0-9a-f]{64}$/);
  assert.equal(output.decision.status, 'admitted');
  assert.equal(output.decision.transition, 'approve');
  assert.equal(output.decision.effect, 'executed');
  // [Controller 090 repair] the dynamic intent round trip: per-request data
  // reaches the effect port through the kernel-resolved binding.
  assert.equal(output.dynamicDecision.status, 'admitted');
  assert.equal(output.dynamicDecision.effectIdempotencyKey, 'reserve:quote:DEMO-R1');
  assert.deepEqual(output.dynamicDecision.ledgerPayload.amount, 27);
  assert.deepEqual(output.dynamicDecision.ledgerPayload.requestId, 'DEMO-R1');
  assert.equal(output.journalRows, 2);
  assert.equal(output.observedReceipts, 2);
  assert.equal(output.instanceState.stateKey, 'approved');

  // The public API surface contains no compiledApp parameter and no compile step.
  const indexSource = await readFile(path.join(EXPERIMENT_ROOT, 'index.mjs'), 'utf8');
  const loadSource = await readFile(path.join(EXPERIMENT_ROOT, 'src', 'microkernel', 'load.mjs'), 'utf8');
  const stripped = loadSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/load\s*\(\s*compiledApp/.test(`${indexSource}
${stripped}`), 'no compiledApp parameter exists in the public API');
  assert.ok(!/compil/.test(stripped), 'no runtime raw compilation exists in the loader');

  await writeEvidence('kpk13-clean-consumer', {
    falsifier: 'KPK-13',
    consumerCommand: `node ${path.relative(EXPERIMENT_ROOT, demo)}`,
    nodeVersion: process.version,
    roundTrip: output,
  });
});
