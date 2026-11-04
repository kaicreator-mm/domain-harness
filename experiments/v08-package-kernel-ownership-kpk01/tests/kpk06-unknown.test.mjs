/**
 * KPK-06 — non-idempotent UNKNOWN
 * ===============================
 * Injected physical resource crash/timeout after uncertain dispatch yields
 * the actual v0.7 UNKNOWN paths and forbids blind retry:
 *   (a) resource times out after dispatch → effect durably FAILED → retry is
 *       ADMISSION_EFFECT_FAILED ("operator recovery owns any retry");
 *   (b) journal completion physically faults after a successful dispatch →
 *       started-not-committed non-idempotent effect → retry is
 *       ADMISSION_EFFECT_AMBIGUOUS (re-execution forbidden).
 * The physical resource is called EXACTLY once in both cases.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { openedApprovalRuntime, quoteIntent, EFFECT_ID } from './helpers.mjs';
import { writeEvidence } from './evidence.mjs';

test('KPK-06a: resource timeout after dispatch → durable failure → retry forbidden (no blind retry)', async () => {
  const { runtime, host } = await openedApprovalRuntime();
  host.resources.failNextCall('ledger');

  await assert.rejects(
    () => runtime.send(quoteIntent({ amount: 42 })),
    (error) => error.name === 'CentralAdmissionError' && error.code === 'ADMISSION_EFFECT_FAILED',
  );
  assert.equal(host.resources.callCount(), 1, 'physical dispatch happened exactly once');

  let journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, 'failed');
  assert.equal(journal[0].effectId, EFFECT_ID);

  // A new attempt of the SAME occurrence must NOT re-execute the effect.
  await assert.rejects(
    () => runtime.send(quoteIntent({ amount: 42 })),
    (error) => error.name === 'CentralAdmissionError' && error.code === 'ADMISSION_EFFECT_FAILED',
  );
  assert.equal(host.resources.callCount(), 1, 'no blind retry of a durably failed effect');
  journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 1);

  const instance = await runtime.query({ kind: 'instance', target: { workflowId: 'order-quote', instanceKey: 'instance:42' } });
  assert.equal(instance.state.stateKey, 'review', 'no state commit for an uncertain outcome');

  await writeEvidence('kpk06-unknown-timeout', {
    falsifier: 'KPK-06a',
    verdict: 'PASS (migrated v0.7 failed-effect path)',
    dispatches: host.resources.callCount(),
    journalRowStatus: 'failed',
    retryErrorCode: 'ADMISSION_EFFECT_FAILED',
  });
});

test('KPK-06b: journal-complete physical fault after successful dispatch → AMBIGUOUS, never re-executed', async () => {
  const { runtime, host } = await openedApprovalRuntime();
  // The physical resource SUCCEEDS, then the Host storage faults at exactly
  // the journal completion write: outcome genuinely unknown.
  host.docs.failNextPutMatching('kpk01:effect-journal', { skip: 1 });

  await assert.rejects(
    () => runtime.send(quoteIntent({ amount: 42 })),
    (error) => error.name === 'CentralAdmissionError' && error.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT',
  );
  assert.equal(host.resources.callCount(), 1);

  let journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, 'started', 'begun but never committed — uncertain durable outcome');

  // Re-attempting the same non-idempotent occurrence is forbidden.
  await assert.rejects(
    () => runtime.send(quoteIntent({ amount: 42 })),
    (error) => error.name === 'CentralAdmissionError' && error.code === 'ADMISSION_EFFECT_AMBIGUOUS',
  );
  assert.equal(host.resources.callCount(), 1, 'the uncertain effect is never re-executed');
  journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, 'started');

  await writeEvidence('kpk06-unknown-ambiguous', {
    falsifier: 'KPK-06b',
    verdict: 'PASS (migrated v0.7 ambiguous non-idempotent path)',
    dispatches: host.resources.callCount(),
    journalRowStatus: 'started',
    retryErrorCode: 'ADMISSION_EFFECT_AMBIGUOUS',
  });
});

test('KPK-06c: an idempotent-effect domain (parts) DOES deterministically re-execute under recovery semantics', async () => {
  // The parts business declares effect:reserve-stock as IDEMPOTENT: a
  // started-but-uncommitted effect may re-execute under the same identity —
  // this is the v0.7 recovery matrix, not a blind retry.
  const { load, buildPackageRoot, createMemoryHost } = await import('../index.mjs');
  const host = createMemoryHost({ now: () => '2026-09-21T07:00:00.000Z' });
  const pkg = await buildPackageRoot({
    rootPackageId: 'app:parts-sale@1.0.0',
    businessModule: 'business-parts.mjs',
  });
  const runtime = await load(pkg, { hostPorts: host });
  const target = { workflowId: 'parts-sale', instanceKey: 'instance:7' };
  await runtime.openInstance({ target });

  host.docs.failNextPutMatching('kpk01:effect-journal', { skip: 1 });
  await assert.rejects(
    () => runtime.send({
      kind: 'kpk01/intent', intentType: 'requestParts', target,
      messageId: 'msg:p1', input: { qty: 5, partNo: 'P-42' }, caller: { role: 'clerk' },
    }),
    (error) => error.name === 'CentralAdmissionError' && error.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT',
  );

  const receipt = await runtime.send({
    kind: 'kpk01/intent', intentType: 'requestParts', target,
    messageId: 'msg:p1', input: { qty: 5, partNo: 'P-42' }, caller: { role: 'clerk' },
  });
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.transitionKey, 'reserve');
  assert.equal(receipt.admitted.effects[0].effectType, 'effect:reserve-stock');
  assert.equal(receipt.admitted.effects[0].disposition, 'executed', 'idempotent semantics permit re-execution under the same identity');
  assert.equal(host.resources.callCount(), 2, 'dispatched once per attempt under explicit idempotent semantics');

  await writeEvidence('kpk06-idempotent-recovery', {
    falsifier: 'KPK-06c',
    verdict: 'PASS (v0.7 recovery matrix: idempotent re-execution is not a blind retry)',
    dispatches: host.resources.callCount(),
    effectSemantics: 'idempotent',
  });
});
