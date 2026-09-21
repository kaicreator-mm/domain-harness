import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  GovernanceBaselineRegistry,
  type DomainActivationBinding,
} from '@kaicreator/domain-harness';
import {
  makeRequest,
  sha256,
  workflowInstanceId,
} from '../../../domain-harness/tests/admission/helpers.js';
import { openHostFixture, pinInstance } from './host-fixture.js';

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-v7-'));
  return directory;
}

/**
 * T-022 V7: the assembled Node host admits turns over the full SQLite stack —
 * the pin-time bound snapshot, the admission effect journal and the automatic
 * decision evidence are all durable and byte-identical across process reopen,
 * with journal order following turn order.
 */
test('T-022 V7: admitted turns persist snapshot, journal order and evidence across reopen', async (t) => {
  const directory = tempDir();
  const path = join(directory, 'host.sqlite');
  const fixture = await openHostFixture(path);
  t.after(() => {
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await pinInstance(fixture);

  const pin = await fixture.assembly.governance.requirePinnedExecution(workflowInstanceId);
  const boundSnapshot = await fixture.store.getGovernanceBoundSnapshot(workflowInstanceId);
  assert.ok(boundSnapshot !== null, 'bound snapshot exists before any turn (V6 gate)');

  const first = await fixture.assembly.admitTurn(makeRequest());
  if (first.status !== 'admitted') assert.fail('expected first turn admitted');
  assert.equal(first.admitted.effects[0]!.disposition, 'executed');
  assert.equal(fixture.tools.calls.length, 1);

  const second = await fixture.assembly.admitTurn(
    makeRequest({ turn: { kind: 'message', sourceMessageId: 'msg:2' } }),
  );
  if (second.status !== 'admitted') assert.fail('expected second turn admitted');
  assert.equal(fixture.tools.calls.length, 2);

  const journal = fixture.authorities.admissionEffectJournal.getRecords();
  assert.equal(journal.length, 2);
  assert.equal(journal[0]!.status, 'completed');
  assert.equal(journal[1]!.status, 'completed');
  assert.equal(journal[0]!.durableControlTurnId, first.admitted.durableControlTurnId);
  assert.equal(journal[1]!.durableControlTurnId, second.admitted.durableControlTurnId);
  assert.ok(
    journal[0]!.effectId < journal[1]!.effectId,
    'journal order follows turn order',
  );

  const evidence = fixture.authorities.evidence.records();
  assert.equal(evidence.length, 2, 'one decision evidence record per admitted turn');
  assert.ok(evidence.every((record) => record.sourceKind === 'decision'));

  fixture.close();

  const reopened = await openHostFixture(path);
  assert.deepEqual(
    await reopened.assembly.governance.requirePinnedExecution(workflowInstanceId),
    pin,
    'pin is byte-identical after reopen',
  );
  assert.deepEqual(
    await reopened.store.getGovernanceBoundSnapshot(workflowInstanceId),
    boundSnapshot,
    'bound snapshot is byte-identical after reopen',
  );
  assert.deepEqual(
    reopened.authorities.admissionEffectJournal.getRecords(),
    journal,
    'journal records are byte-identical after reopen',
  );
  assert.equal(reopened.authorities.evidence.records().length, 2);
  reopened.close();
});

/**
 * T-022 V10: an instance pinned to (P1, B1) keeps executing under B1 while the
 * Domain Activation moves to (P2, B2). The retained B1 body stays resolvable,
 * the pin never rebinds, and new-instance resolution returns the moved binding.
 */
test('T-022 V10: retained pin survives activation movement to a newer baseline', async (t) => {
  const directory = tempDir();
  const path = join(directory, 'host.sqlite');
  const fixture = await openHostFixture(path);
  t.after(() => {
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  });

  fixture.authorities.exactPackageCdi.registerExactPackageCdi({
    domainId: 'orders',
    packageId: fixture.packageId,
    domainIntelligenceContentDigest: 'cdi-orders-b1',
  });
  fixture.authorities.exactPackageCdi.registerExactPackageCdi({
    domainId: 'orders',
    packageId: fixture.packageId,
    domainIntelligenceContentDigest: 'cdi-orders-b2',
  });

  const v1: DomainActivationBinding = {
    domainId: 'orders',
    packageId: fixture.packageId,
    domainIntelligenceContentDigest: 'cdi-orders-b1',
    governanceBaseline: fixture.b1.identity,
  };
  const v2: DomainActivationBinding = {
    domainId: 'orders',
    packageId: fixture.packageId,
    domainIntelligenceContentDigest: 'cdi-orders-b2',
    governanceBaseline: fixture.b2.identity,
  };
  await fixture.assembly.activation.publish(v1);
  await pinInstance(fixture);

  const registry = new GovernanceBaselineRegistry(fixture.authorities.baselines, sha256);
  await registry.retain({
    referenceId: `retain:${workflowInstanceId}`,
    reason: 'active-execution',
    baseline: fixture.b1.identity,
    authorityBinding: {
      domainId: 'orders',
      packageId: fixture.packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: fixture.b1.identity,
    },
  });

  const pinBefore = await fixture.assembly.governance.requirePinnedExecution(workflowInstanceId);
  const first = await fixture.assembly.admitTurn(makeRequest());
  if (first.status !== 'admitted') assert.fail('expected first turn admitted');

  // Activation moves to the newer baseline; the pinned instance must not move.
  await fixture.assembly.activation.publish(v2);
  assert.deepEqual(await fixture.assembly.activation.resolveForNewInstance('orders'), v2);
  assert.deepEqual(
    await fixture.assembly.governance.requirePinnedExecution(workflowInstanceId),
    pinBefore,
    'the execution pin is bind-once immutable under activation movement',
  );

  const second = await fixture.assembly.admitTurn(
    makeRequest({ turn: { kind: 'message', sourceMessageId: 'msg:2' } }),
  );
  if (second.status !== 'admitted') assert.fail('pinned instance still admits under B1');

  const evidence = fixture.authorities.evidence.records();
  assert.equal(evidence.length, 2);
  for (const record of evidence) {
    assert.deepEqual(
      record.provenance.governanceBaseline,
      fixture.b1.identity,
      'every turn on the pinned instance executes under the retained B1 authority',
    );
  }

  assert.deepEqual(
    await registry.resolveExact(fixture.b1.identity),
    fixture.b1,
    'retained B1 body stays exactly resolvable while the reference is live',
  );
  await assert.rejects(
    () => registry.collect(fixture.b1.identity),
    (error: unknown) =>
      error instanceof Error
      && error.name === 'GovernanceContractError'
      && (error as { code?: string }).code === 'GOVERNANCE_BASELINE_RETAINED',
    'B1 cannot be collected while the pinned instance retains it',
  );
});
